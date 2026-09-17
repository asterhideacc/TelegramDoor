import { useEffect, useRef, useState } from 'react';
import { DoorOpen, ShieldCheck, CircleCheck, CircleAlert } from 'lucide-react';
import { api } from './api';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}
export default function Verify() {
  const id = window.location.hash.slice(1),
    widget = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('loading'),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true,
      widgetId: string | undefined;
    const controller = new AbortController();
    const onError = (value: string) => {
      if (alive) {
        setError(value);
        setStatus('error');
      }
    };
    async function init() {
      if (!/^[a-f0-9]{32}$/.test(id)) {
        onError('验证链接无效，请回到 Telegram 发送 /verify。');
        return;
      }
      try {
        const data = await api<{ siteKey: string }>(`/challenge/${id}`, {
          signal: controller.signal,
        });
        await new Promise<void>((resolve, reject) => {
          if (window.turnstile) {
            resolve();
            return;
          }
          let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
          if (!script) {
            script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.dataset.turnstile = 'true';
            script.async = true;
            document.head.appendChild(script);
          }
          script.addEventListener('load', () => resolve(), { once: true });
          script.addEventListener(
            'error',
            () => reject(new Error('验证组件加载失败，请检查网络后刷新页面。')),
            { once: true },
          );
        });
        if (!alive || !widget.current || !window.turnstile) return;
        setStatus('ready');
        widgetId = window.turnstile.render(widget.current, {
          sitekey: data.siteKey,
          action: 'telegramdoor',
          cData: id,
          theme: 'light',
          callback: async (token: string) => {
            if (!alive) return;
            setStatus('checking');
            try {
              await api('/challenge/verify', { method: 'POST', body: { id, token } });
              if (alive) setStatus('success');
            } catch (e) {
              onError(e instanceof Error ? e.message : '验证失败，请重新获取链接');
            }
          },
          'expired-callback': () => {
            if (alive) setStatus('ready');
            if (widgetId) window.turnstile?.reset(widgetId);
          },
          'error-callback': () => onError('验证服务暂时无法连接，请稍后刷新重试。'),
        });
      } catch (e) {
        if (!controller.signal.aborted) onError(e instanceof Error ? e.message : '验证失败');
      }
    }
    void init();
    return () => {
      alive = false;
      controller.abort();
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [id]);
  return (
    <main className="verify-page">
      <div className="verify-card">
        <div className="brand centered">
          <span className="brand-icon">
            <DoorOpen size={24} />
          </span>
          TelegramDoor
        </div>
        <div className={`verify-symbol ${status === 'success' ? 'success' : ''}`}>
          {status === 'success' ? (
            <CircleCheck size={36} />
          ) : status === 'error' ? (
            <CircleAlert size={36} />
          ) : (
            <ShieldCheck size={36} />
          )}
        </div>
        <h1>{status === 'success' ? '验证通过，欢迎来聊。' : '完成验证，开始对话。'}</h1>
        <p>
          {status === 'success'
            ? '请回到 Telegram，重新发送你的留言。'
            : '一个小小的验证，让每一次对话少一些打扰。'}
        </p>
        {status === 'loading' && <p className="muted">正在加载验证…</p>}
        {status === 'checking' && <p className="muted">正在确认验证结果…</p>}
        <div
          ref={widget}
          className={['success', 'error'].includes(status) ? 'hidden' : 'turnstile-container'}
        />
        {error && <div className="alert error">{error}</div>}
        {status === 'success' && (
          <div className="alert success">验证结果已保存，可以关闭此页面。</div>
        )}
        <p className="verify-foot">此验证不需要 Telegram 密码或短信验证码。</p>
      </div>
    </main>
  );
}
