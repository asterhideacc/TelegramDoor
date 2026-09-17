import type { Env } from './types';

export class TelegramError extends Error {
  constructor(
    public code: number,
    public description: string,
    public retryAfter = 0,
  ) {
    super(`Telegram ${code}: ${description}`);
  }
}
export async function telegram<T = unknown>(
  env: Env,
  method: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new TelegramError(503, 'Telegram 网络连接超时，请稍后重试');
  }
  let result: {
    ok: boolean;
    result: T;
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number };
  };
  try {
    result = await response.json();
  } catch {
    throw new TelegramError(503, 'Telegram 返回了无效响应');
  }
  if (!result.ok) {
    const description = (result.description || '请求失败').replaceAll(env.BOT_TOKEN, '[redacted]');
    throw new TelegramError(
      result.error_code || response.status,
      description,
      result.parameters?.retry_after || 0,
    );
  }
  return result.result;
}
export function sendText(
  env: Env,
  chat: string,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return telegram<{ message_id: number }>(env, 'sendMessage', {
    chat_id: chat,
    text,
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}
export const ownerCommands = [
  { command: 'help', description: '使用说明和命令列表' },
  { command: 'ban', description: '回复消息封禁用户，或 /ban 用户ID [1h/1d] [原因]' },
  { command: 'unban', description: '解除封禁，支持回复消息或用户ID' },
  { command: 'trust', description: '加入白名单，跳过验证与内容过滤' },
  { command: 'untrust', description: '移出白名单' },
  { command: 'who', description: '查看消息对应的用户信息' },
  { command: 'react', description: '回复消息添加表情，如 /react 👍；/react clear 撤销' },
  { command: 'stats', description: '查看最近24小时统计' },
  { command: 'pause', description: '暂停接收新消息' },
  { command: 'resume', description: '恢复接收消息' },
  { command: 'reset', description: '要求用户重新验证' },
];
