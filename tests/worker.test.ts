import { env as bindings } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/worker/index';
import type { Env, Message, Update, Link, Challenge } from '../src/worker/types';
import { cleanup, defaultSettings, getUser, setValue, touchUser } from '../src/worker/store';
import { dayStart, decryptSecret, derivedSecret, encryptSecret, now } from '../src/worker/security';

const env = bindings as unknown as Env & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const origin = 'https://door.example.com';
const userId = '100001';
let nextId = 1000,
  updateId = 0;
let calls: { method: string; body: Record<string, any> }[] = [];
let telegramFailure: { method: string; code: number; description?: string } | null = null;
let turnstileResult: Record<string, unknown> = { success: true };

function msg(
  id: string,
  text = '你好',
  messageId = ++nextId,
  extra: Partial<Message> = {},
): Message {
  return {
    message_id: messageId,
    chat: { id: Number(id), type: 'private' },
    from: { id: Number(id), first_name: `用户${id}`, username: `person${id}` },
    text,
    ...extra,
  };
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  return app.request(
    `${origin}${path}`,
    {
      method,
      headers: {
        'content-type': 'application/json',
        'x-td-request': '1',
        origin,
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
}
async function login() {
  const response = await request('/api/auth/login', 'POST', { password: env.ADMIN_PASSWORD });
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
async function webhook(update: Partial<Update>) {
  return request('/webhook', 'POST', { update_id: ++updateId, ...update }, undefined, {
    'x-telegram-bot-api-secret-token': await derivedSecret(env, 'webhook'),
  });
}
async function verified(id = userId) {
  await touchUser(env, { id: Number(id), first_name: `用户${id}` });
  await env.DB.prepare('UPDATE users SET verified_until=? WHERE id=?')
    .bind(now() + 86400, id)
    .run();
}
async function config(values: Record<string, unknown>) {
  await setValue(env, 'config', JSON.stringify({ ...defaultSettings, ...values }));
}
async function incoming() {
  await verified();
  const message = msg(userId);
  const response = await webhook({ message });
  expect(response.status).toBe(200);
  return (await env.DB.prepare('SELECT * FROM message_links WHERE source_message=?')
    .bind(message.message_id)
    .first<Link>())!;
}
async function callback(id: string, data: string, chatMessage: number) {
  return webhook({
    callback_query: {
      id: `query${++nextId}`,
      from: { id: Number(id), first_name: '点击者' },
      data,
      message: msg(id, '', chatMessage),
    },
  });
}
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  nextId = 1000;
  updateId = 0;
  calls = [];
  telegramFailure = null;
  turnstileResult = { success: true };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const body = JSON.parse(String(init?.body || '{}'));
      if (url.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
        calls.push({ method: 'siteverify', body });
        return Response.json(turnstileResult);
      }
      if (!url.startsWith(`https://api.telegram.org/bot${env.BOT_TOKEN}/`))
        throw new Error('Unexpected external request');
      const method = url.split('/').at(-1)!;
      calls.push({ method, body });
      if (telegramFailure?.method === method)
        return Response.json({
          ok: false,
          error_code: telegramFailure.code,
          description: telegramFailure.description || 'mock failure',
          parameters: { retry_after: 3 },
        });
      const result =
        method === 'getMe'
          ? { id: 123456789, username: 'telegramdoor_test_bot', first_name: 'Test' }
          : method === 'getWebhookInfo'
            ? { url: `${origin}/webhook`, pending_update_count: 0 }
            : { message_id: ++nextId };
      return Response.json({ ok: true, result });
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await reset();
});

describe('administration security', () => {
  it('protects admin data, validates configuration and never returns credentials', async () => {
    expect((await request('/api/admin/settings')).status).toBe(401);
    const bad = await app.request(`${origin}/health`, {}, { ...env, ADMIN_PASSWORD: 'short' });
    expect(bad.status).toBe(503);
    const cookie = await login();
    const settings = await request('/api/admin/settings', 'GET', undefined, cookie);
    const output = await settings.text();
    expect(output).not.toContain(env.BOT_TOKEN);
    expect(output).not.toContain(env.ADMIN_PASSWORD);
  });
  it('uses HttpOnly same-site secure cookies and revokes them on logout', async () => {
    const response = await request('/api/auth/login', 'POST', { password: env.ADMIN_PASSWORD });
    const raw = response.headers.get('set-cookie')!;
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Secure');
    expect(raw).toContain('SameSite=Strict');
    const cookie = raw.split(';')[0];
    expect((await request('/api/admin/status', 'GET', undefined, cookie)).status).toBe(200);
    await request('/api/auth/logout', 'POST', {}, cookie);
    expect((await request('/api/admin/status', 'GET', undefined, cookie)).status).toBe(401);
  });
  it('rejects cross-origin writes and requests missing the custom header', async () => {
    const cookie = await login();
    expect(
      (
        await request('/api/admin/settings', 'PUT', defaultSettings, cookie, {
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (await request('/api/admin/settings', 'PUT', defaultSettings, cookie, { 'x-td-request': '' }))
        .status,
    ).toBe(403);
  });
  it('limits password guessing and does not trust an arbitrary session cookie', async () => {
    expect(
      (await request('/api/admin/events', 'GET', undefined, `td_session=${'a'.repeat(64)}`)).status,
    ).toBe(401);
    for (let i = 0; i < 10; i++)
      expect((await request('/api/auth/login', 'POST', { password: 'wrong' })).status).toBe(401);
    expect(
      (await request('/api/auth/login', 'POST', { password: env.ADMIN_PASSWORD })).status,
    ).toBe(429);
  });
  it('validates settings and encrypts Turnstile secrets without echoing them', async () => {
    const cookie = await login();
    expect(
      (
        await request(
          '/api/admin/settings',
          'PUT',
          { ...defaultSettings, messagesPerMinute: 0 },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          '/api/admin/settings',
          'PUT',
          { ...defaultSettings, verification: 'turnstile' },
          cookie,
        )
      ).status,
    ).toBe(400);
    const secret = 'turnstile-secret-test';
    expect(
      (
        await request(
          '/api/admin/settings',
          'PUT',
          {
            ...defaultSettings,
            verification: 'turnstile',
            turnstileSiteKey: 'site',
            turnstileSecret: secret,
          },
          cookie,
        )
      ).status,
    ).toBe(200);
    const cipher = await env.DB.prepare(
      "SELECT value FROM settings WHERE key='turnstileSecret'",
    ).first<{ value: string }>();
    expect(cipher?.value).not.toContain(secret);
    expect(await decryptSecret(env, cipher!.value)).toBe(secret);
    expect(
      await (await request('/api/admin/settings', 'GET', undefined, cookie)).text(),
    ).not.toContain(secret);
  });
  it('connects webhook with generated secret, explicit updates and no dropped messages', async () => {
    const cookie = await login();
    expect((await request('/api/admin/setup', 'POST', {}, cookie)).status).toBe(200);
    const setup = calls.find((c) => c.method === 'setWebhook')!.body;
    expect(setup.url).toBe(`${origin}/webhook`);
    expect(setup.secret_token).toBe(await derivedSecret(env, 'webhook'));
    expect(setup.drop_pending_updates).toBe(false);
    expect(setup.allowed_updates).toContain('edited_message');
    expect(calls.filter((c) => c.method === 'setMyCommands')).toHaveLength(2);
  });
});

describe('webhook delivery and mapping', () => {
  it('rejects forged webhooks before inserting updates', async () => {
    expect((await request('/webhook', 'POST', { update_id: 1, message: msg(userId) })).status).toBe(
      401,
    );
    expect(
      (await env.DB.prepare('SELECT COUNT(*) AS n FROM updates').first<{ n: number }>())?.n,
    ).toBe(0);
  });
  it('copies inbound media with controls and deduplicates delivered updates', async () => {
    await verified();
    const message = msg(userId, undefined, 100, {
      text: undefined,
      photo: [{ file_id: 'photo-id' }],
    });
    expect((await webhook({ update_id: 42, message })).status).toBe(200);
    expect((await webhook({ update_id: 42, message })).status).toBe(200);
    const copies = calls.filter((c) => c.method === 'copyMessage');
    expect(copies).toHaveLength(1);
    expect(copies[0].body.chat_id).toBe(env.OWNER_ID);
    expect(copies[0].body.reply_markup.inline_keyboard).toHaveLength(3);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='delivered'").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });
  it('routes owner replies and visitor follow-ups to the correct counterpart', async () => {
    const link = await incoming();
    const ownerMessage = msg(env.OWNER_ID, '收到啦', 777, {
      reply_to_message: msg(env.OWNER_ID, '', link.target_message),
    });
    await webhook({ message: ownerMessage });
    const out = calls.filter((c) => c.method === 'copyMessage').at(-1)!.body;
    expect(out.chat_id).toBe(userId);
    expect(out.reply_parameters.message_id).toBe(link.source_message);
    const ownerLink = (await env.DB.prepare(
      'SELECT * FROM message_links WHERE source_message=777',
    ).first<Link>())!;
    await webhook({
      message: msg(userId, '谢谢', 778, {
        reply_to_message: msg(userId, '', ownerLink.target_message),
      }),
    });
    expect(
      calls.filter((c) => c.method === 'copyMessage').at(-1)!.body.reply_parameters.message_id,
    ).toBe(777);
  });
  it('does not guess recipients and rejects spoofed owner identity', async () => {
    await incoming();
    calls = [];
    await webhook({ message: msg(env.OWNER_ID, '没有引用对象') });
    await webhook({
      message: msg(userId, '/ban 100002', undefined, {
        from: { id: Number(env.OWNER_ID), first_name: 'fake' },
      }),
    });
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(false);
  });
  it('keeps identical message IDs in different visitor chats isolated', async () => {
    await verified('100001');
    await verified('100002');
    await webhook({ message: msg('100001', '访客甲', 50) });
    await webhook({ message: msg('100002', '访客乙', 50) });
    const links = await env.DB.prepare('SELECT * FROM message_links ORDER BY user_id').all<Link>();
    expect(links.results).toHaveLength(2);
    for (const link of links.results) {
      await webhook({
        message: msg(env.OWNER_ID, `回复${link.user_id}`, undefined, {
          reply_to_message: msg(env.OWNER_ID, '', link.target_message),
        }),
      });
      expect(calls.filter((c) => c.method === 'copyMessage').at(-1)!.body.chat_id).toBe(
        link.user_id,
      );
    }
  });
  it('retries transient Telegram failures and preserves retry_after', async () => {
    await verified();
    telegramFailure = { method: 'copyMessage', code: 429 };
    const message = msg(userId);
    const first = await webhook({ update_id: 77, message });
    expect(first.status).toBe(503);
    expect(first.headers.get('retry-after')).toBe('3');
    telegramFailure = null;
    expect((await webhook({ update_id: 77, message })).status).toBe(200);
    expect(
      (await env.DB.prepare('SELECT COUNT(*) AS n FROM message_links').first<{ n: number }>())?.n,
    ).toBe(1);
  });
  it('records permanent delivery failures without retrying forever', async () => {
    await verified();
    telegramFailure = {
      method: 'copyMessage',
      code: 403,
      description: 'bot was blocked by the user',
    };
    expect((await webhook({ message: msg(userId) })).status).toBe(200);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='error'").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });
  it('copies stickers and voice messages through the same reliable mapping', async () => {
    await verified();
    for (const kind of ['sticker', 'voice'])
      await webhook({
        message: msg(userId, '', undefined, { text: undefined, [kind]: { file_id: `${kind}-id` } }),
      });
    expect(calls.filter((c) => c.method === 'copyMessage')).toHaveLength(2);
  });
  it('syncs edits but applies link filters to edited text', async () => {
    const link = await incoming();
    await config({ blockLinks: true });
    calls = [];
    await webhook({ edited_message: msg(userId, '修改后的正文', link.source_message) });
    expect(calls.find((c) => c.method === 'editMessageText')?.body.message_id).toBe(
      link.target_message,
    );
    calls = [];
    await webhook({ edited_message: msg(userId, 'https://spam.example', link.source_message) });
    expect(calls.some((c) => c.method === 'editMessageText')).toBe(false);
    expect(await env.DB.prepare("SELECT id FROM events WHERE reason='links'").first()).toBeTruthy();
  });
  it('mirrors web replies and stores mappings so visitors can quote and react', async () => {
    await verified();
    const cookie = await login();
    expect(
      (await request(`/api/admin/users/${userId}/reply`, 'POST', { text: '后台回复' }, cookie))
        .status,
    ).toBe(200);
    const link = await env.DB.prepare('SELECT * FROM message_links').first<Link>();
    expect(link?.source_chat).toBe(env.OWNER_ID);
    expect(link?.target_chat).toBe(userId);
  });
});

describe('verification and anti-spam', () => {
  it('keeps unverified messages out of the owner inbox and requires resend after verification', async () => {
    await webhook({ message: msg(userId, '第一条留言') });
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(false);
    const challenge = (await env.DB.prepare('SELECT * FROM challenges').first<Challenge>())!;
    await callback(userId, `v:${challenge.id}:${challenge.answer}`, 9);
    expect((await getUser(env, userId))!.verified_until).toBeGreaterThan(now());
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(false);
    await webhook({ message: msg(userId, '重新发送') });
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(true);
  });
  it('binds challenges to a user and prevents replay', async () => {
    await webhook({ message: msg(userId, '/start') });
    const challenge = (await env.DB.prepare('SELECT * FROM challenges').first<Challenge>())!;
    await touchUser(env, { id: 100002, first_name: 'Other' });
    await callback('100002', `v:${challenge.id}:${challenge.answer}`, 9);
    expect((await getUser(env, '100002'))!.verified_until).toBe(0);
    await callback(userId, `v:${challenge.id}:${challenge.answer}`, 9);
    const expiry = (await getUser(env, userId))!.verified_until;
    await callback(userId, `v:${challenge.id}:${challenge.answer}`, 9);
    expect((await getUser(env, userId))!.verified_until).toBe(expiry);
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='verified'").first<{
          n: number;
        }>()
      )?.n,
    ).toBe(1);
  });
  it('expires challenges and imposes cooldown after three wrong attempts', async () => {
    for (let i = 0; i < 3; i++) {
      await webhook({ message: msg(userId, '/verify') });
      const challenge = (await env.DB.prepare('SELECT * FROM challenges').first<Challenge>())!;
      await callback(userId, `v:${challenge.id}:wrong`, 9);
    }
    expect((await getUser(env, userId))!.cooldown_until).toBeGreaterThan(now());
    await webhook({ message: msg(userId, '/verify') });
    expect(await env.DB.prepare('SELECT * FROM challenges').first()).toBeNull();
  });
  it('does not allow an expired native challenge', async () => {
    await webhook({ message: msg(userId, '/verify') });
    const challenge = (await env.DB.prepare('SELECT * FROM challenges').first<Challenge>())!;
    await env.DB.prepare('UPDATE challenges SET expires_at=?')
      .bind(now() - 1)
      .run();
    await callback(userId, `v:${challenge.id}:${challenge.answer}`, 9);
    expect((await getUser(env, userId))!.verified_until).toBe(0);
  });
  it('resets failure counts after the cooldown has elapsed', async () => {
    await touchUser(env, { id: Number(userId), first_name: 'Cooldown' });
    await env.DB.prepare('UPDATE users SET verify_failures=3,cooldown_until=? WHERE id=?')
      .bind(now() - 1, userId)
      .run();
    await webhook({ message: msg(userId, '/verify') });
    expect((await getUser(env, userId))!.verify_failures).toBe(0);
    expect(
      await env.DB.prepare('SELECT * FROM challenges WHERE user_id=?').bind(userId).first(),
    ).toBeTruthy();
  });
  it('supports reply-based temporary ban, silent blocking and unban requiring verification', async () => {
    const link = await incoming();
    await webhook({
      message: msg(env.OWNER_ID, '/ban 1d 重复广告', undefined, {
        reply_to_message: msg(env.OWNER_ID, '', link.target_message),
      }),
    });
    const user = (await getUser(env, userId))!;
    expect(user.banned_until).toBeGreaterThan(now() + 86000);
    expect(user.ban_reason).toBe('重复广告');
    calls = [];
    await webhook({ message: msg(userId, '骚扰') });
    await webhook({ message: msg(userId, '/start') });
    expect(calls).toHaveLength(0);
    await webhook({ message: msg(env.OWNER_ID, `/unban ${userId}`) });
    expect((await getUser(env, userId))!.banned_until).toBe(0);
    expect((await getUser(env, userId))!.verified_until).toBe(0);
  });
  it('ignores fake admin ban callbacks and refuses to ban owner', async () => {
    const link = await incoming();
    await callback(userId, `ban:${userId}`, 9);
    expect((await getUser(env, userId))!.banned_until).toBe(0);
    const cookie = await login();
    expect(
      (await request(`/api/admin/users/${env.OWNER_ID}/action`, 'POST', { action: 'ban' }, cookie))
        .status,
    ).toBe(400);
    await callback(env.OWNER_ID, `ban:${userId}`, link.target_message);
    expect((await getUser(env, userId))!.banned_until).toBe(-1);
  });
  it('blocks hidden links, normalizes keyword matching and honors white lists', async () => {
    await verified();
    await config({ blockLinks: true, keywords: ['SPAM'] });
    await webhook({
      message: msg(userId, '点击这里', undefined, {
        entities: [{ type: 'text_link', url: 'https://spam.example', offset: 0, length: 4 }],
      }),
    });
    await webhook({ message: msg(userId, 'ＳＰＡＭ') });
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(false);
    await env.DB.prepare('UPDATE users SET trusted=1 WHERE id=?').bind(userId).run();
    await webhook({ message: msg(userId, 'SPAM https://example.com') });
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(true);
  });
  it('rate limits trusted users and pauses all incoming messages', async () => {
    await verified();
    await env.DB.prepare('UPDATE users SET trusted=1 WHERE id=?').bind(userId).run();
    await config({ messagesPerMinute: 1 });
    await webhook({ message: msg(userId) });
    await webhook({ message: msg(userId) });
    expect(calls.filter((c) => c.method === 'copyMessage')).toHaveLength(1);
    await config({ paused: true });
    calls = [];
    await webhook({ message: msg(userId) });
    expect(calls.some((c) => c.method === 'copyMessage')).toBe(false);
  });
  it('respects disabled content logging and keeps ban records through cleanup', async () => {
    await verified();
    await config({ storeContent: false, retentionDays: 1 });
    await webhook({ message: msg(userId, 'private-text') });
    expect(
      (await env.DB.prepare('SELECT content FROM events').first<{ content: string }>())?.content,
    ).toBe('');
    await env.DB.prepare('UPDATE users SET banned_until=-1 WHERE id=?').bind(userId).run();
    await env.DB.prepare('UPDATE events SET created_at=?')
      .bind(now() - 2 * 86400)
      .run();
    await env.DB.prepare('UPDATE message_links SET created_at=?')
      .bind(now() - 2 * 86400)
      .run();
    await cleanup(env);
    expect(await env.DB.prepare('SELECT * FROM events').first()).toBeNull();
    expect(await env.DB.prepare('SELECT * FROM message_links').first()).toBeNull();
    expect((await getUser(env, userId))!.banned_until).toBe(-1);
  });
});

describe('reaction bridge', () => {
  it('relays owner reaction buttons and clears reactions', async () => {
    const link = await incoming();
    await callback(env.OWNER_ID, `r:${link.id}:0`, link.target_message);
    const call = calls.find((c) => c.method === 'setMessageReaction')!.body;
    expect(call).toMatchObject({
      chat_id: userId,
      message_id: link.source_message,
      reaction: [{ type: 'emoji', emoji: '👍' }],
    });
    await callback(env.OWNER_ID, `r:${link.id}:clear`, link.target_message);
    expect(calls.filter((c) => c.method === 'setMessageReaction').at(-1)!.body.reaction).toEqual(
      [],
    );
  });
  it('binds buttons to exact recipient/message and blocks reactions from banned users', async () => {
    const link = await incoming();
    await callback('100002', `r:${link.id}:0`, link.target_message);
    await callback(env.OWNER_ID, `r:${link.id}:0`, link.target_message + 100);
    await env.DB.prepare('UPDATE users SET banned_until=-1 WHERE id=?').bind(userId).run();
    await callback(env.OWNER_ID, `r:${link.id}:0`, link.target_message);
    expect(calls.some((c) => c.method === 'setMessageReaction')).toBe(false);
  });
  it('supports /react and user reactions on owner replies', async () => {
    const link = await incoming();
    await webhook({
      message: msg(env.OWNER_ID, '/react ❤️', 888, {
        reply_to_message: msg(env.OWNER_ID, '', link.target_message),
      }),
    });
    expect(calls.find((c) => c.method === 'setMessageReaction')!.body.reaction[0].emoji).toBe('❤');
    await webhook({
      message: msg(env.OWNER_ID, '回复', 889, {
        reply_to_message: msg(env.OWNER_ID, '', link.target_message),
      }),
    });
    const out = (await env.DB.prepare(
      'SELECT * FROM message_links WHERE source_message=889',
    ).first<Link>())!;
    await callback(userId, `r:${out.id}:2`, out.target_message);
    expect(calls.filter((c) => c.method === 'setMessageReaction').at(-1)!.body).toMatchObject({
      chat_id: env.OWNER_ID,
      message_id: 889,
      reaction: [{ type: 'emoji', emoji: '🔥' }],
    });
  });
});

describe('Turnstile server validation', () => {
  async function prepare() {
    await config({ verification: 'turnstile', turnstileSiteKey: 'test-site' });
    await setValue(env, 'publicOrigin', origin);
    await setValue(env, 'turnstileSecret', await encryptSecret(env, 'test-secret'));
    await webhook({ message: msg(userId, '/verify') });
    return (await env.DB.prepare('SELECT * FROM challenges').first<Challenge>())!;
  }
  it('requires hostname, action and challenge binding, consumes token exactly once', async () => {
    const challenge = await prepare();
    turnstileResult = {
      success: true,
      hostname: 'door.example.com',
      action: 'telegramdoor',
      cdata: challenge.id,
    };
    expect(
      (await request('/api/challenge/verify', 'POST', { id: challenge.id, token: 'test-token' }))
        .status,
    ).toBe(200);
    expect((await getUser(env, userId))!.verified_until).toBeGreaterThan(now());
    expect(
      (await request('/api/challenge/verify', 'POST', { id: challenge.id, token: 'test-token' }))
        .status,
    ).toBe(410);
    expect(calls.filter((c) => c.method === 'siteverify')).toHaveLength(1);
  });
  it.each(['hostname', 'action', 'cdata'])(
    'rejects mismatched %s even when Cloudflare returns success',
    async (field) => {
      const challenge = await prepare();
      turnstileResult = {
        success: true,
        hostname: 'door.example.com',
        action: 'telegramdoor',
        cdata: challenge.id,
        [field]: 'wrong',
      };
      expect(
        (await request('/api/challenge/verify', 'POST', { id: challenge.id, token: 'test-token' }))
          .status,
      ).toBe(400);
      expect((await getUser(env, userId))!.verified_until).toBe(0);
    },
  );
  it('cannot downgrade an active Turnstile challenge into native verification', async () => {
    const challenge = await prepare();
    await callback(userId, `v:${challenge.id}:`, 9);
    expect((await getUser(env, userId))!.verified_until).toBe(0);
  });
});

describe('dashboard queries', () => {
  it('uses local midnight for today and filters historical records', async () => {
    await incoming();
    await env.DB.prepare('UPDATE events SET created_at=?')
      .bind(dayStart(now(), 480) - 1)
      .run();
    const cookie = await login();
    const today = await (
      await request('/api/admin/events?range=today&offset=480', 'GET', undefined, cookie)
    ).json<any>();
    const all = await (
      await request('/api/admin/events?range=all', 'GET', undefined, cookie)
    ).json<any>();
    expect(today.total).toBe(0);
    expect(all.total).toBe(1);
    const stats = await (
      await request('/api/admin/stats?range=all', 'GET', undefined, cookie)
    ).json<any>();
    expect(stats.delivered).toBe(1);
    expect(stats.received).toBe(1);
    expect(stats.users).toBe(1);
  });
  it('searches safely, paginates, and validates ranges', async () => {
    await incoming();
    const cookie = await login();
    const found = await (
      await request(
        `/api/admin/events?range=all&search=${encodeURIComponent('你好')}`,
        'GET',
        undefined,
        cookie,
      )
    ).json<any>();
    expect(found.total).toBe(1);
    const injection = await (
      await request(
        `/api/admin/events?range=all&search=${encodeURIComponent("' OR 1=1 --")}`,
        'GET',
        undefined,
        cookie,
      )
    ).json<any>();
    expect(injection.total).toBe(0);
    expect((await request('/api/admin/events?page=-1', 'GET', undefined, cookie)).status).toBe(400);
    expect((await request('/api/admin/stats?range=forever', 'GET', undefined, cookie)).status).toBe(
      400,
    );
    expect(
      (await request('/api/admin/users?state=verified', 'GET', undefined, cookie)).status,
    ).toBe(200);
  });
});
