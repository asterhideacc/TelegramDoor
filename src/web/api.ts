export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: { 'content-type': 'application/json', 'x-td-request': '1' },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ApiError('服务返回了无效响应，请检查部署状态。', response.status);
  }
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/admin'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      (data as { error?: string }).error || '请求失败，请稍后重试',
      response.status,
    );
  }
  return data as T;
}
export const timezoneOffset = () => -new Date().getTimezoneOffset();
export const formatTime = (seconds: number, short = false) =>
  new Intl.DateTimeFormat(
    'zh-CN',
    short
      ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
      : {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        },
  ).format(new Date(seconds * 1000));
