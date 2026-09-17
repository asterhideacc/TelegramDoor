import type { Person } from '../shared/types';
import type { BotContext, Challenge } from './types';
import { isBanned, now, randomToken } from './security';
import { getUser, getValue, logEvent, takeRate } from './store';
import { sendText } from './telegram';

export async function issueChallenge(ctx: BotContext, user: Person): Promise<void> {
  const { env, settings } = ctx,
    at = now();
  if (isBanned(user)) return;
  if (user.cooldown_until > at) {
    if (await takeRate(env, `cooldown-notice:${user.id}`, 1, 60))
      await sendText(env, user.id, '验证尝试过多，请在 15 分钟后重试。');
    return;
  }
  if (user.cooldown_until > 0) {
    await env.DB.prepare(
      'UPDATE users SET verify_failures=0,cooldown_until=0 WHERE id=? AND cooldown_until<=?',
    )
      .bind(user.id, at)
      .run();
  }
  const existing = await env.DB.prepare('SELECT * FROM challenges WHERE user_id=?')
    .bind(user.id)
    .first<Challenge>();
  if (existing && existing.expires_at > at && existing.kind === settings.verification) {
    if (await takeRate(env, `verify-notice:${user.id}`, 1, 60))
      await sendText(env, user.id, '请完成上方的验证。验证后请重新发送刚才的留言。');
    return;
  }
  if (!(await takeRate(env, `challenge:${user.id}`, 3, 60))) return;
  const id = randomToken(16);
  let answer = '',
    prompt = '',
    reply_markup: unknown;
  if (settings.verification === 'turnstile') {
    const origin = (await getValue(env, 'publicOrigin')) || ctx.origin;
    prompt = `${settings.welcome}\n\n点击下方按钮完成验证。链接 5 分钟内有效，验证后请重新发送留言。`;
    reply_markup = {
      inline_keyboard: [[{ text: '🛡 完成人机验证', url: `${origin}/verify#${id}` }]],
    };
  } else {
    const random = crypto.getRandomValues(new Uint32Array(4));
    const a = 2 + (random[0] % 17),
      b = 2 + (random[1] % 13);
    const correct = a + b;
    const options = [correct - 2, correct, correct + 1, correct + 4];
    for (let i = options.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    reply_markup = {
      inline_keyboard: [
        options.map((value) => {
          const token = randomToken(4);
          if (value === correct) answer = token;
          return { text: String(value), callback_data: `v:${id}:${token}` };
        }),
      ],
    };
    prompt = `${settings.welcome}\n\n请选择 ${a} + ${b} 的结果。\n5 分钟内有效，验证后请重新发送留言。`;
  }
  await env.DB.prepare(
    `INSERT INTO challenges(id,user_id,kind,answer,expires_at,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET id=excluded.id,kind=excluded.kind,answer=excluded.answer,expires_at=excluded.expires_at,created_at=excluded.created_at`,
  )
    .bind(id, user.id, settings.verification, answer, at + 300, at)
    .run();
  try {
    await sendText(env, user.id, prompt, { reply_markup });
  } catch (error) {
    await env.DB.prepare('DELETE FROM challenges WHERE id=?').bind(id).run();
    throw error;
  }
}

export async function completeChallenge(
  ctx: BotContext,
  id: string,
  userId: string,
  kind: string,
  answer: string,
): Promise<boolean> {
  const at = now();
  const result = await ctx.env.DB.prepare(
    `DELETE FROM challenges WHERE id=? AND user_id=? AND kind=? AND answer=? AND expires_at>? RETURNING user_id`,
  )
    .bind(id, userId, kind, answer, at)
    .first<{ user_id: string }>();
  if (!result) return false;
  const updated = await ctx.env.DB.prepare(
    `UPDATE users SET verified_until=?,verify_failures=0,cooldown_until=0
    WHERE id=? AND banned_until!=-1 AND banned_until<=? AND cooldown_until<=? RETURNING id`,
  )
    .bind(at + ctx.settings.verifiedDays * 86400, userId, at, at)
    .first();
  if (!updated) return false;
  await logEvent(ctx.env, { user: userId, status: 'verified', reason: 'verified' });
  return true;
}

export async function failChallenge(ctx: BotContext, id: string, userId: string): Promise<void> {
  const claim = await ctx.env.DB.prepare(
    'DELETE FROM challenges WHERE id=? AND user_id=? RETURNING id',
  )
    .bind(id, userId)
    .first();
  if (!claim) return;
  await ctx.env.DB.prepare(
    `UPDATE users SET verify_failures=verify_failures+1,
    cooldown_until=CASE WHEN verify_failures+1>=3 THEN ? ELSE cooldown_until END WHERE id=?`,
  )
    .bind(now() + 900, userId)
    .run();
  await logEvent(ctx.env, { user: userId, status: 'blocked', reason: 'verification_failed' });
}

export async function nativeVerify(
  ctx: BotContext,
  userId: string,
  id: string,
  answer: string,
): Promise<string> {
  const user = await getUser(ctx.env, userId);
  if (!user || isBanned(user)) return '暂时无法验证。';
  if (ctx.settings.verification !== 'native') return '验证方式已更新，请发送 /verify 重新验证。';
  if (user.cooldown_until > now()) return '验证尝试过多，请稍后再试。';
  const challenge = await ctx.env.DB.prepare(
    "SELECT * FROM challenges WHERE id=? AND user_id=? AND kind='native'",
  )
    .bind(id, userId)
    .first<Challenge>();
  if (!challenge || challenge.expires_at <= now())
    return '验证已过期或已使用，请发送 /verify 重新获取。';
  if (challenge.answer !== answer) {
    await failChallenge(ctx, id, userId);
    return '答案不正确，请发送 /verify 重试。连续失败 3 次将冷却 15 分钟。';
  }
  return (await completeChallenge(ctx, id, userId, 'native', answer))
    ? '验证通过！请重新发送你的留言。'
    : '验证已失效，请重试。';
}
