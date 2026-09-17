import { env as bindings } from 'cloudflare:workers';
import {
  applyD1Migrations,
  createExecutionContext,
  createScheduledController,
  reset,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../src/worker/index';
import { ensureDatabase } from '../src/worker/database';
import type { Env } from '../src/worker/types';

const bindingsEnv = bindings as unknown as Env & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
let env: Env;
const origin = 'https://door.example.com';

// A fresh binding identity models a cold isolate without clearing production caches.
function freshBinding(): D1Database {
  return new Proxy(bindingsEnv.DB, {
    get(db, key) {
      const value = Reflect.get(db, key);
      return typeof value === 'function' ? value.bind(db) : value;
    },
  });
}
beforeEach(() => {
  env = { ...bindingsEnv, DB: freshBinding() };
});
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

describe('deployment database bootstrap', () => {
  it('starts with an empty D1 binding and supports login and dashboard queries', async () => {
    expect(
      await env.DB.prepare("SELECT name FROM sqlite_master WHERE name='settings'").first(),
    ).toBeNull();
    const health = await app.request(`${origin}/health`, {}, env);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true });
    const login = await app.request(
      `${origin}/api/auth/login`,
      {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', 'x-td-request': '1' },
        body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
      },
      env,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    for (const path of ['stats', 'events', 'users', 'settings', 'status']) {
      const response = await app.request(
        `${origin}/api/admin/${path}`,
        { headers: { cookie } },
        env,
      );
      expect(response.status, path).toBe(200);
    }
  });

  it('preserves existing settings, bans and message links from a manually migrated database', async () => {
    await applyD1Migrations(bindingsEnv.DB, bindingsEnv.TEST_MIGRATIONS);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('config','{\"paused\":true}')"),
      env.DB.prepare(
        "INSERT INTO users(id,name,first_seen,last_seen,banned_until,ban_reason) VALUES('100001','访客',1,2,-1,'广告')",
      ),
      env.DB.prepare(
        "INSERT INTO message_links(id,user_id,source_chat,source_message,target_chat,target_message,created_at) VALUES('link','100001','100001',1,'900001',2,3)",
      ),
    ]);
    const before = await env.DB.batch([
      env.DB.prepare('SELECT * FROM settings'),
      env.DB.prepare('SELECT * FROM users'),
      env.DB.prepare('SELECT * FROM message_links'),
      env.DB.prepare('SELECT * FROM d1_migrations'),
    ]);
    const cold = freshBinding();
    const batch = vi.spyOn(cold, 'batch');
    await ensureDatabase(cold);
    expect(batch).not.toHaveBeenCalled();
    const after = await env.DB.batch([
      env.DB.prepare('SELECT * FROM settings'),
      env.DB.prepare('SELECT * FROM users'),
      env.DB.prepare('SELECT * FROM message_links'),
      env.DB.prepare('SELECT * FROM d1_migrations'),
    ]);
    expect(after.map((r) => r.results)).toEqual(before.map((r) => r.results));
  });

  it('records the initial migration in the format understood by Wrangler migrations', async () => {
    await ensureDatabase(env.DB);
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES('sentinel','keep')").run();
    await applyD1Migrations(bindingsEnv.DB, bindingsEnv.TEST_MIGRATIONS);
    expect((await env.DB.prepare('SELECT name FROM d1_migrations').all()).results).toEqual([
      { name: '0001_initial.sql' },
    ]);
    expect(
      await env.DB.prepare("SELECT value FROM settings WHERE key='sentinel'").first('value'),
    ).toBe('keep');
  });

  it('tolerates concurrent cold starts and keeps a single migration record', async () => {
    await Promise.all([
      ensureDatabase(freshBinding()),
      ensureDatabase(freshBinding()),
      ensureDatabase(freshBinding()),
    ]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first('count')).toBe(
      1,
    );
    const batch = vi.spyOn(env.DB, 'batch');
    await ensureDatabase(env.DB);
    await ensureDatabase(env.DB);
    expect(batch).not.toHaveBeenCalled();
  });

  it('rolls back a failed initialization and retries without exposing database error details', async () => {
    const realBatch = bindingsEnv.DB.batch.bind(bindingsEnv.DB);
    vi.spyOn(env.DB, 'batch').mockImplementationOnce((statements) =>
      realBatch([
        ...statements,
        env.DB.prepare("INSERT INTO missing_table(secret) VALUES('private-database-value')"),
      ]),
    );
    const failed = await app.request(`${origin}/health`, {}, env);
    expect(failed.status).toBe(503);
    expect(failed.headers.get('retry-after')).toBe('5');
    const body = await failed.text();
    expect(body).toContain('数据库初始化');
    expect(body).not.toContain('private-database-value');
    expect(body).not.toContain(env.BOT_TOKEN);
    expect(
      await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('settings','d1_migrations')",
      ).first(),
    ).toBeNull();
    expect((await app.request(`${origin}/health`, {}, env)).status).toBe(200);
  });

  it('explains a missing DB binding with a retryable response', async () => {
    const response = await app.request(`${origin}/health`, {}, { ...env, DB: undefined });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('绑定名为 DB') });
  });

  it('rejects an unauthorized webhook before doing any database initialization', async () => {
    const response = await app.request(
      `${origin}/webhook`,
      {
        method: 'POST',
        body: JSON.stringify({ update_id: 1 }),
        headers: { 'content-type': 'application/json' },
      },
      env,
    );
    expect(response.status).toBe(401);
    expect(
      await env.DB.prepare("SELECT name FROM sqlite_master WHERE name='settings'").first(),
    ).toBeNull();
  });

  it('initializes before the first scheduled cleanup', async () => {
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM events').first('count')).toBe(0);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM d1_migrations').first('count')).toBe(
      1,
    );
  });
});
