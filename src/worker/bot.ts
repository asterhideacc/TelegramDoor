import { reactionEmoji } from '../shared/types';
import type { Person } from '../shared/types';
import type { BotContext, Callback, Env, Link, Message, Update } from './types';
import { isBanned, messageKind, now, validUserId } from './security';
import {
  changeUser,
  findLink,
  getSettings,
  getUser,
  logEvent,
  setValue,
  takeRate,
  touchUser,
} from './store';
import { issueChallenge, nativeVerify } from './verification';
import { sendText, telegram, TelegramError } from './telegram';

const help = `TelegramDoor 使用说明\n\n引用机器人转发给你的访客消息，输入回复，即可发给对应访客。未引用访客消息的普通消息会被静默忽略；命令照常处理。\n\n/ban [用户ID] [1h/1d/7d] [原因] — 封禁（可回复消息）\n/unban [用户ID] — 解封\n/trust [用户ID] — 加入白名单\n/untrust [用户ID] — 移出白名单\n/reset [用户ID] — 要求重新验证\n/who [用户ID] — 查看用户\n/react 👍 — 回复消息添加回应\n/react clear — 撤销回应\n/stats — 最近24小时统计\n/pause — 暂停接收\n/resume — 恢复接收\n\n双方都可引用消息发送 /react 表情。私聊长按产生的原生表情事件不会推送给机器人，无法自动同步。`;

function counterpart(link: Link, chat: string): { chat: string; message: number } {
  return link.source_chat === chat
    ? { chat: link.target_chat, message: link.target_message }
    : { chat: link.source_chat, message: link.source_message };
}
export function filterContent(ctx: BotContext, user: Person, message: Message): string | null {
  if (isBanned(user)) return 'banned';
  if (ctx.settings.paused) return 'paused';
  if (user.trusted) return null;
  if (user.cooldown_until > now()) return 'cooldown';
  if (user.verified_until <= now()) return 'unverified';
  const text = `${message.text || ''}\n${message.caption || ''}`;
  const entities = [...(message.entities || []), ...(message.caption_entities || [])];
  if (
    ctx.settings.blockLinks &&
    (/(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|(?:[a-z0-9-]+\.)+(?:com|net|org|io|xyz|cn|top)\b)/i.test(
      text,
    ) ||
      entities.some((e) => e.type === 'url' || e.type === 'text_link'))
  )
    return 'links';
  const hiddenUrls = entities
    .filter((e) => e.type === 'text_link')
    .map((e) => String(e.url || ''))
    .join('\n');
  const normalized = `${text}\n${hiddenUrls}`.normalize('NFKC').toLocaleLowerCase();
  if (
    ctx.settings.keywords.some((word) =>
      normalized.includes(word.normalize('NFKC').toLocaleLowerCase()),
    )
  )
    return 'keyword';
  return null;
}
async function blocked(
  ctx: BotContext,
  user: Person,
  message: Message,
  reason: string,
  updateId: number,
) {
  await logEvent(ctx.env, {
    id: `update:${updateId}:blocked`,
    user: user.id,
    direction: 'in',
    status: 'blocked',
    reason,
    message,
    storeContent: ctx.settings.storeContent,
  });
  if (reason === 'unverified') await issueChallenge(ctx, user);
  else if (reason !== 'banned' && (await takeRate(ctx.env, `blocked-notice:${user.id}`, 1, 60))) {
    const notices: Record<string, string> = {
      paused: '主人暂时停止接收留言，请稍后再来。',
      rate_limit: '消息发送太快了，请稍后再试。',
      links: '当前不接受包含链接的留言。',
      keyword: '这条留言未通过过滤，请调整内容后重试。',
      cooldown: '验证尝试过多，请稍后重新验证。',
    };
    await sendText(ctx.env, user.id, notices[reason] || '这条留言暂时无法送达。');
  }
}
async function react(ctx: BotContext, chat: string, link: Link, emoji: string): Promise<void> {
  const user = await getUser(ctx.env, link.user_id);
  if (!user || isBanned(user)) throw new TelegramError(400, '用户已封禁，无法发送回应');
  const target = counterpart(link, chat);
  await telegram(ctx.env, 'setMessageReaction', {
    chat_id: target.chat,
    message_id: target.message,
    reaction: emoji ? [{ type: 'emoji', emoji }] : [],
  });
  await logEvent(ctx.env, {
    user: link.user_id,
    status: 'action',
    reason: 'reaction',
    detail: emoji || '撤销',
    direction: chat === ctx.env.OWNER_ID ? 'out' : 'in',
  });
}
async function reactionCommand(ctx: BotContext, message: Message, args: string[]): Promise<void> {
  const chat = String(message.chat.id);
  const link = message.reply_to_message
    ? await findLink(ctx.env, chat, message.reply_to_message.message_id)
    : null;
  const value = args[0];
  const emoji = value === 'clear' ? '' : value?.replace(/\uFE0F/g, '');
  // Validate the shape, then let Telegram decide which emoji the target supports.
  // Keep the old six-button list only for callbacks on messages sent before this version.
  const singleEmoji =
    value &&
    value.length <= 64 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value) &&
    [...new Intl.Segmenter().segment(value)].length === 1 &&
    !message.entities?.some((entity) => entity.type === 'custom_emoji');
  if (
    !link ||
    (chat !== ctx.env.OWNER_ID && link.user_id !== chat) ||
    args.length !== 1 ||
    (emoji !== '' && !singleEmoji)
  ) {
    await sendText(
      ctx.env,
      chat,
      '请引用一条对话消息，发送 /react 👍（一个普通表情），或 /react clear。',
    );
    return;
  }
  try {
    await react(ctx, chat, link, emoji!);
    await sendText(ctx.env, chat, emoji ? `已回应 ${emoji}` : '已撤销回应');
  } catch (error) {
    if (!(error instanceof TelegramError) || error.code >= 500 || error.code === 429) throw error;
    await sendText(
      ctx.env,
      chat,
      /REACTION_INVALID|REACTIONS_TOO_MANY|reactions? (?:are |is )?not (?:allowed|available|supported)/i.test(
        error.description,
      )
        ? '这个表情或这条消息不支持回应，未发送给对方。'
        : `未能回应：${error.description}`,
    );
  }
}
async function describeUser(env: Env, id: string): Promise<string> {
  const user = await getUser(env, id);
  if (!user) return '没有找到这个用户。';
  const state = isBanned(user)
    ? `已封禁${user.banned_until === -1 ? '（永久）' : `（至 ${new Date(user.banned_until * 1000).toISOString()}）`}`
    : user.trusted
      ? '白名单'
      : user.verified_until > now()
        ? '已验证'
        : '未验证';
  return `用户：${user.name}\nID：${user.id}\n用户名：${user.username ? `@${user.username}` : '未设置'}\n状态：${state}${user.ban_reason ? `\n封禁原因：${user.ban_reason}` : ''}`;
}
async function ownerCommand(ctx: BotContext, message: Message): Promise<boolean> {
  const text = message.text || '';
  if (!text.startsWith('/')) return false;
  const [raw, ...args] = text.trim().split(/\s+/),
    command = raw.split('@')[0].toLowerCase();
  const { env } = ctx;
  if (command === '/start' || command === '/help') {
    await sendText(env, env.OWNER_ID, help);
    return true;
  }
  if (command === '/pause' || command === '/resume') {
    ctx.settings.paused = command === '/pause';
    await setValue(env, 'config', JSON.stringify(ctx.settings));
    await logEvent(env, {
      status: 'action',
      reason: 'settings',
      detail: ctx.settings.paused ? '暂停接收' : '恢复接收',
    });
    await sendText(
      env,
      env.OWNER_ID,
      ctx.settings.paused ? '已暂停接收。发送 /resume 恢复。' : '已恢复接收留言。',
    );
    return true;
  }
  if (command === '/stats') {
    const rows = await env.DB.prepare(
      'SELECT status,COUNT(*) AS n FROM events WHERE created_at>=? GROUP BY status',
    )
      .bind(now() - 86400)
      .all<{ status: string; n: number }>();
    await sendText(
      env,
      env.OWNER_ID,
      `最近 24 小时\n${rows.results.map((r) => `${({ delivered: '送达', blocked: '拦截', error: '失败', verified: '验证', action: '操作' } as Record<string, string>)[r.status] || r.status}：${r.n}`).join('\n') || '暂无记录'}`,
    );
    return true;
  }
  if (command === '/react') {
    await reactionCommand(ctx, message, args);
    return true;
  }
  const link = message.reply_to_message
    ? await findLink(env, env.OWNER_ID, message.reply_to_message.message_id)
    : null;
  const actions = ['/ban', '/unban', '/trust', '/untrust', '/reset', '/who'];
  if (!actions.includes(command)) {
    await sendText(
      env,
      env.OWNER_ID,
      '未知命令，发送 /help 查看。需要发送以 / 开头的原文时，请使用后台回复。',
    );
    return true;
  }
  const explicitId = args[0] && validUserId(args[0]) ? args.shift() : undefined;
  const id = explicitId || link?.user_id;
  if (!id) {
    await sendText(env, env.OWNER_ID, '请回复目标用户的一条消息，或在命令后填写数字用户 ID。');
    return true;
  }
  if (command === '/who') {
    await sendText(env, env.OWNER_ID, await describeUser(env, id));
    return true;
  }
  let duration = 0;
  if (command === '/ban' && args[0] && /^\d+[mhd]$/.test(args[0])) {
    const value = args.shift()!,
      units: Record<string, number> = { m: 60, h: 3600, d: 86400 };
    duration = Math.min(365 * 86400, Number.parseInt(value) * units[value.slice(-1)]);
    if (duration < 60) {
      await sendText(env, env.OWNER_ID, '临时封禁时长至少 1 分钟。');
      return true;
    }
  }
  const action = command.slice(1) as 'ban' | 'unban' | 'trust' | 'untrust' | 'reset';
  const success = await changeUser(env, id, action, args.join(' '), duration);
  await sendText(
    env,
    env.OWNER_ID,
    success ? await describeUser(env, id) : '操作未执行：用户不存在或目标是管理员。',
  );
  return true;
}
async function callback(ctx: BotContext, query: Callback): Promise<void> {
  const { env } = ctx,
    userId = String(query.from.id),
    chatId = String(query.message?.chat.id || '');
  if (chatId !== userId || query.message?.chat.type !== 'private') return;
  let response = '操作已失效';
  try {
    if (!(await takeRate(env, `callback:${userId}`, 20, 60))) {
      response = '操作过于频繁';
      return;
    }
    const data = (query.data || '').split(':');
    if (data[0] === 'v') response = await nativeVerify(ctx, userId, data[1] || '', data[2] || '');
    else if (data[0] === 'r') {
      const link = await env.DB.prepare('SELECT * FROM message_links WHERE id=?')
        .bind(data[1] || '')
        .first<Link>();
      const index = Number(data[2]),
        emoji = data[2] === 'clear' ? '' : reactionEmoji[index];
      if (
        !link ||
        link.target_chat !== chatId ||
        link.target_message !== query.message?.message_id ||
        emoji === undefined ||
        (userId !== env.OWNER_ID && userId !== link.user_id)
      )
        return;
      await react(ctx, chatId, link, emoji);
      response = emoji ? `已回应 ${emoji}` : '已撤销回应';
    } else if (userId === env.OWNER_ID && data[0] === 'ban' && validUserId(data[1] || '')) {
      response = (await changeUser(env, data[1], 'ban', '通过消息按钮封禁'))
        ? '已封禁，不再接收该用户消息'
        : '未找到用户';
    } else if (userId === env.OWNER_ID && data[0] === 'who' && validUserId(data[1] || '')) {
      await sendText(env, env.OWNER_ID, await describeUser(env, data[1]));
      response = '用户信息已发送';
    }
  } catch (error) {
    if (error instanceof TelegramError && error.code < 500)
      response = error.description.slice(0, 150);
    else throw error;
  } finally {
    // Expired callback acknowledgements must never retry an already completed action.
    await telegram(env, 'answerCallbackQuery', {
      callback_query_id: query.id,
      text: response.slice(0, 190),
      show_alert: false,
    }).catch(() => undefined);
  }
}
async function relay(
  ctx: BotContext,
  message: Message,
  user: Person,
  toOwner: boolean,
): Promise<void> {
  const { env } = ctx,
    source = String(message.chat.id),
    target = toOwner ? env.OWNER_ID : user.id;
  // If Telegram retries a completed relay, reuse the existing mapping.
  const existing = await env.DB.prepare(
    'SELECT id FROM message_links WHERE source_chat=? AND source_message=?',
  )
    .bind(source, message.message_id)
    .first();
  if (existing) return;
  const replyLink =
    !toOwner && message.reply_to_message
      ? await findLink(env, source, message.reply_to_message.message_id)
      : null;
  const reply = replyLink?.user_id === user.id ? counterpart(replyLink, source) : null;
  const id = crypto.randomUUID();
  // Native forwards show the visitor's attribution without our own identity/menu rows.
  // Copy owner replies to avoid exposing their personal Telegram account.
  // forwardMessage does not accept reply_parameters or reply_markup.
  const sent = await telegram<{ message_id: number }>(
    env,
    toOwner ? 'forwardMessage' : 'copyMessage',
    {
      chat_id: target,
      from_chat_id: source,
      message_id: message.message_id,
      ...(reply && reply.chat === target
        ? { reply_parameters: { message_id: reply.message, allow_sending_without_reply: true } }
        : {}),
    },
  );
  await env.DB.prepare(
    'INSERT INTO message_links(id,user_id,source_chat,source_message,target_chat,target_message,created_at) VALUES(?,?,?,?,?,?,?)',
  )
    .bind(id, user.id, source, message.message_id, target, sent.message_id, now())
    .run();
}
async function edit(ctx: BotContext, message: Message, userId: string): Promise<boolean> {
  const link = await ctx.env.DB.prepare(
    'SELECT * FROM message_links WHERE source_chat=? AND source_message=?',
  )
    .bind(String(message.chat.id), message.message_id)
    .first<Link>();
  if (!link || link.user_id !== userId) return false;
  const base = { chat_id: link.target_chat, message_id: link.target_message };
  try {
    if (message.text !== undefined)
      await telegram(ctx.env, 'editMessageText', {
        ...base,
        text: message.text,
        entities: message.entities,
        link_preview_options: { is_disabled: true },
      });
    else {
      const kind = messageKind(message),
        file =
          kind === 'photo'
            ? message.photo?.at(-1)?.file_id
            : (message[kind] as { file_id?: string } | undefined)?.file_id;
      if (file && ['photo', 'video', 'animation', 'audio', 'document'].includes(kind)) {
        await telegram(ctx.env, 'editMessageMedia', {
          ...base,
          media: {
            type: kind,
            media: file,
            caption: message.caption || '',
            caption_entities: message.caption_entities,
          },
        });
      } else if (message.caption !== undefined)
        await telegram(ctx.env, 'editMessageCaption', {
          ...base,
          caption: message.caption,
          caption_entities: message.caption_entities,
        });
      else return false;
    }
  } catch (error) {
    if (!(error instanceof TelegramError && error.description.includes('message is not modified')))
      throw error;
  }
  return true;
}
export async function handleUpdate(env: Env, update: Update, origin: string): Promise<void> {
  const ctx: BotContext = { env, settings: await getSettings(env), origin };
  if (update.callback_query) {
    await callback(ctx, update.callback_query);
    return;
  }
  const message = update.message || update.edited_message;
  if (
    !message?.from ||
    message.chat.type !== 'private' ||
    message.from.is_bot ||
    String(message.from.id) !== String(message.chat.id)
  )
    return;
  const owner = String(message.from.id) === env.OWNER_ID,
    edited = !!update.edited_message;
  let user: Person | null;
  if (owner) {
    if (!edited) {
      try {
        if (await ownerCommand(ctx, message)) return;
      } catch (error) {
        if (!(error instanceof TelegramError) || error.code >= 500 || error.code === 429)
          throw error;
        await sendText(env, env.OWNER_ID, `操作未完成：${error.description}`);
        return;
      }
    }
    // New replies must quote a visitor message that we delivered into the owner's chat.
    // Never infer a recipient from the latest conversation, an owner reply, or forward_origin.
    const ownerLink = edited
      ? await env.DB.prepare('SELECT * FROM message_links WHERE source_chat=? AND source_message=?')
          .bind(env.OWNER_ID, message.message_id)
          .first<Link>()
      : message.reply_to_message
        ? await env.DB.prepare(
            'SELECT * FROM message_links WHERE target_chat=? AND target_message=?',
          )
            .bind(env.OWNER_ID, message.reply_to_message.message_id)
            .first<Link>()
        : null;
    if (
      !ownerLink ||
      (edited ? ownerLink.target_chat : ownerLink.source_chat) !== ownerLink.user_id
    )
      return;
    user = ownerLink ? await getUser(env, ownerLink.user_id) : null;
    if (!user) return;
    if (isBanned(user)) {
      await sendText(env, env.OWNER_ID, '该用户已被封禁，请先 /unban 后再回复。');
      return;
    }
  } else {
    user = await touchUser(env, message.from);
    if (isBanned(user)) {
      await blocked(ctx, user, message, 'banned', update.update_id);
      return;
    }
    // Rate-limit before commands and challenge issuance to avoid command spam.
    if (!(await takeRate(env, `incoming:${user.id}`, ctx.settings.messagesPerMinute, 60))) {
      await blocked(ctx, user, message, 'rate_limit', update.update_id);
      return;
    }
    const command = (message.text || '').split(/\s/)[0].split('@')[0];
    if (!edited && ['/start', '/verify', '/help'].includes(command)) {
      if (ctx.settings.paused) {
        await blocked(ctx, user, message, 'paused', update.update_id);
        return;
      }
      if (user.trusted || user.verified_until > now())
        await sendText(
          env,
          user.id,
          '你已通过验证，可以直接发送留言。可引用消息发送 /react 👍 回应，/react clear 撤销。私聊长按点赞无法自动同步。',
        );
      else await issueChallenge(ctx, user);
      return;
    }
    const reason = filterContent(ctx, user, message);
    if (reason) {
      await blocked(ctx, user, message, reason, update.update_id);
      return;
    }
    if (!edited && command.toLowerCase() === '/react') {
      await reactionCommand(ctx, message, (message.text || '').trim().split(/\s+/).slice(1));
      return;
    }
  }
  try {
    if (edited) {
      if (!(await edit(ctx, message, user.id))) return;
    } else await relay(ctx, message, user, !owner);
    await logEvent(env, {
      id: `update:${update.update_id}:delivered`,
      user: user.id,
      direction: owner ? 'out' : 'in',
      status: 'delivered',
      reason: edited ? 'edited' : 'relayed',
      message,
      storeContent: ctx.settings.storeContent,
    });
  } catch (error) {
    if (!(error instanceof TelegramError) || error.code >= 500 || error.code === 429) throw error;
    await logEvent(env, {
      id: `update:${update.update_id}:error`,
      user: user.id,
      direction: owner ? 'out' : 'in',
      status: 'error',
      reason: 'delivery_failed',
      message,
      detail: error.description,
      storeContent: ctx.settings.storeContent,
    });
    if (await takeRate(env, `delivery-notice:${message.chat.id}`, 1, 60)) {
      await sendText(
        env,
        String(message.chat.id),
        edited
          ? '这次修改未能同步，对方看到的仍是之前的版本。原生转发或部分消息不能编辑，请重新发送修改后的内容。'
          : owner
            ? `未能送达：${error.description}`
            : '这条消息未能送达，请稍后重试或改用普通文本。',
      ).catch(() => undefined);
    }
  }
}

export async function sendAdminReply(env: Env, userId: string, text: string): Promise<void> {
  const user = await getUser(env, userId);
  if (!user || isBanned(user)) throw new TelegramError(400, '用户不存在或已封禁');
  const settings = await getSettings(env);
  // Mirror web replies into the owner's chat so later replies/reactions have two endpoints.
  const latest = await env.DB.prepare(
    'SELECT target_message FROM message_links WHERE user_id=? AND target_chat=? ORDER BY created_at DESC,target_message DESC LIMIT 1',
  )
    .bind(userId, env.OWNER_ID)
    .first<{ target_message: number }>();
  const replyTo = latest
    ? {
        message_id: latest.target_message,
        chat: { id: Number(env.OWNER_ID), type: 'private' },
      }
    : undefined;
  const sent = await sendText(env, env.OWNER_ID, text, {
    ...(replyTo
      ? { reply_parameters: { message_id: replyTo.message_id, allow_sending_without_reply: true } }
      : {}),
  });
  try {
    await relay(
      { env, settings, origin: '' },
      {
        message_id: sent.message_id,
        chat: { id: Number(env.OWNER_ID), type: 'private' },
        text,
        reply_to_message: replyTo,
      },
      user,
      false,
    );
    await logEvent(env, {
      user: userId,
      direction: 'out',
      status: 'delivered',
      reason: 'relayed',
      content: text,
      storeContent: settings.storeContent,
      detail: '后台回复',
    });
  } catch (error) {
    await logEvent(env, {
      user: userId,
      direction: 'out',
      status: 'error',
      reason: 'delivery_failed',
      content: text,
      storeContent: settings.storeContent,
      detail: '后台回复未送达，管理员聊天中的镜像不表示发送成功',
    });
    throw error;
  }
}
