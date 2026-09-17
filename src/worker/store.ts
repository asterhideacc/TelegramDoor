import { z } from 'zod';
import type { Person, Settings } from '../shared/types';
import type { Env, Link, Message, TgUser } from './types';
import { messageKind, now } from './security';

export const settingsSchema = z.object({
  verification: z.enum(['native', 'turnstile']),
  verifiedDays: z.number().int().min(1).max(365),
  messagesPerMinute: z.number().int().min(1).max(60),
  blockLinks: z.boolean(),
  keywords: z.array(z.string().trim().min(1).max(100)).max(100),
  paused: z.boolean(),
  retentionDays: z.number().int().min(1).max(365),
  storeContent: z.boolean(),
  welcome: z.string().max(1000),
  turnstileSiteKey: z.string().max(200),
});
export const defaultSettings: Settings = {
  verification: 'native',
  verifiedDays: 30,
  messagesPerMinute: 10,
  blockLinks: false,
  keywords: [],
  paused: false,
  retentionDays: 30,
  storeContent: true,
  welcome: '你好，欢迎留言。请先完成验证，再发送你的消息。',
  turnstileSiteKey: '',
};
export async function getValue(env: Env, key: string): Promise<string | null> {
  return (
    (
      await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
        .bind(key)
        .first<{ value: string }>()
    )?.value ?? null
  );
}
export async function setValue(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  )
    .bind(key, value)
    .run();
}
export async function getSettings(env: Env): Promise<Settings> {
  const value = await getValue(env, 'config');
  return value
    ? settingsSchema.parse({ ...defaultSettings, ...JSON.parse(value) })
    : { ...defaultSettings };
}
export async function touchUser(env: Env, user: TgUser): Promise<Person> {
  const id = String(user.id),
    at = now();
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 200);
  await env.DB.prepare(
    `INSERT INTO users(id,name,username,first_seen,last_seen) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username,last_seen=excluded.last_seen`,
  )
    .bind(id, name, user.username || '', at, at)
    .run();
  return (await getUser(env, id))!;
}
export async function getUser(env: Env, id: string): Promise<Person | null> {
  return env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<Person>();
}
export async function takeRate(
  env: Env,
  key: string,
  limit: number,
  seconds: number,
): Promise<boolean> {
  const at = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count`,
  )
    .bind(key, at + seconds, at, at)
    .first<{ count: number }>();
  return !!row && row.count <= limit;
}
export async function logEvent(
  env: Env,
  data: {
    user?: string;
    direction?: string;
    status: string;
    reason: string;
    message?: Message;
    content?: string;
    detail?: string;
    storeContent?: boolean;
    id?: string;
  },
): Promise<void> {
  const text = data.content ?? data.message?.text ?? data.message?.caption ?? '';
  await env.DB.prepare(
    `INSERT OR IGNORE INTO events(id,created_at,user_id,direction,status,reason,message_type,content,message_id,detail)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      data.id || crypto.randomUUID(),
      now(),
      data.user || null,
      data.direction || 'system',
      data.status,
      data.reason,
      data.message ? messageKind(data.message) : 'system',
      data.storeContent === false ? '' : text.slice(0, 4096),
      data.message?.message_id ?? null,
      (data.detail || '').slice(0, 1000),
    )
    .run();
}
export async function findLink(env: Env, chat: string, message: number): Promise<Link | null> {
  return env.DB.prepare(
    `SELECT * FROM message_links WHERE (source_chat=? AND source_message=?) OR (target_chat=? AND target_message=?) LIMIT 1`,
  )
    .bind(chat, message, chat, message)
    .first<Link>();
}
export async function changeUser(
  env: Env,
  id: string,
  action: 'ban' | 'unban' | 'trust' | 'untrust' | 'reset',
  reason = '',
  duration = 0,
): Promise<boolean> {
  if (id === env.OWNER_ID) return false;
  const user = await getUser(env, id);
  if (!user) return false;
  const queries: Record<string, string> = {
    ban: 'UPDATE users SET banned_until=?,ban_reason=?,trusted=0,verified_until=0 WHERE id=?',
    unban:
      "UPDATE users SET banned_until=0,ban_reason='',verify_failures=0,cooldown_until=0 WHERE id=?",
    trust: "UPDATE users SET trusted=1,banned_until=0,ban_reason='' WHERE id=?",
    untrust: 'UPDATE users SET trusted=0 WHERE id=?',
    reset:
      'UPDATE users SET verified_until=0,verify_failures=0,cooldown_until=0,trusted=0 WHERE id=?',
  };
  const stmt = env.DB.prepare(queries[action]);
  await env.DB.batch([
    action === 'ban'
      ? stmt.bind(duration ? now() + duration : -1, reason.slice(0, 300), id)
      : stmt.bind(id),
    env.DB.prepare('DELETE FROM challenges WHERE user_id=?').bind(id),
  ]);
  await logEvent(env, { user: id, status: 'action', reason: action, detail: reason });
  return true;
}
export async function cleanup(env: Env): Promise<void> {
  const settings = await getSettings(env),
    at = now(),
    cutoff = at - settings.retentionDays * 86400;
  // Bounded batches avoid large deletes exceeding free-plan CPU/write quotas.
  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM events WHERE id IN (SELECT id FROM events WHERE created_at<? LIMIT 2000)',
    ).bind(cutoff),
    env.DB.prepare(
      'DELETE FROM message_links WHERE id IN (SELECT id FROM message_links WHERE created_at<? LIMIT 2000)',
    ).bind(cutoff),
    env.DB.prepare(
      'DELETE FROM updates WHERE id IN (SELECT id FROM updates WHERE started_at<? LIMIT 5000)',
    ).bind(at - 7 * 86400),
    env.DB.prepare('DELETE FROM challenges WHERE expires_at<?').bind(at),
    env.DB.prepare(
      'DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<? LIMIT 5000)',
    ).bind(at),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(at),
  ]);
}
