import type { Env } from './types';
const encoder = new TextEncoder();
export const now = () => Math.floor(Date.now() / 1000);
export function randomToken(bytes = 24): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function constantEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
export async function derivedSecret(env: Env, purpose: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.BOT_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`telegramdoor:v1:${purpose}`),
  );
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function encryptionKey(env: Env) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode((await derivedSecret(env, 'settings')).slice(0, 32)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptSecret(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(env),
    encoder.encode(value),
  );
  return btoa(String.fromCharCode(...iv, ...new Uint8Array(encrypted)));
}
export async function decryptSecret(env: Env, value: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    await encryptionKey(env),
    bytes.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}
export function configured(env: Env): boolean {
  return (
    typeof env.ADMIN_PASSWORD === 'string' &&
    env.ADMIN_PASSWORD.length >= 16 &&
    /^\d+:[\w-]{20,}$/.test(env.BOT_TOKEN || '') &&
    /^[1-9]\d{0,15}$/.test(env.OWNER_ID || '') &&
    Number.isSafeInteger(Number(env.OWNER_ID))
  );
}
export function validUserId(value: string): boolean {
  return /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
}
export function isBanned(user: { banned_until: number }, at = now()): boolean {
  return user.banned_until === -1 || user.banned_until > at;
}
export function messageKind(message: Record<string, unknown>): string {
  return (
    [
      'text',
      'photo',
      'video',
      'animation',
      'voice',
      'audio',
      'document',
      'sticker',
      'video_note',
      'contact',
      'location',
      'venue',
      'poll',
      'dice',
    ].find((k) => message[k] !== undefined) || 'other'
  );
}
export function dayStart(at: number, offsetMinutes: number): number {
  const offset = offsetMinutes * 60;
  return Math.floor((at + offset) / 86400) * 86400 - offset;
}
