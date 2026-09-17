import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
  X,
} from 'lucide-react';
import type { EventRow, Person } from '../shared/types';
import { reasonLabels, statusLabels } from '../shared/types';
import { formatTime } from './api';

export function Spinner() {
  return <LoaderCircle size={17} className="spin" aria-label="加载中" />;
}
export function Empty({
  title = '这里还很安静',
  text = '新的消息和记录会出现在这里。',
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={28} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="alert error" role="alert">
      {error}
      {retry && (
        <button className="text-button" onClick={retry}>
          重试
        </button>
      )}
    </div>
  );
}
export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {children || statusLabels[status] || status}
    </span>
  );
}
export function Avatar({ name, id = '' }: { name: string; id?: string }) {
  const color = Number(id.slice(-1) || 0) % 5;
  return <span className={`avatar color-${color}`}>{[...name][0]?.toUpperCase() || '?'}</span>;
}
export function userState(user: Person): string {
  return user.banned_until === -1 || user.banned_until > Date.now() / 1000
    ? 'banned'
    : user.trusted
      ? 'trusted'
      : user.verified_until > Date.now() / 1000
        ? 'verified'
        : 'pending';
}
export function UserBadge({ user }: { user: Person }) {
  const state = userState(user);
  return (
    <Badge status={state}>
      {{ banned: '已封禁', trusted: '白名单', verified: '已验证', pending: '待验证' }[state]}
    </Badge>
  );
}
export function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return (
    <div className="pagination">
      <span>共 {total.toLocaleString()} 条记录</span>
      <div>
        <button
          className="icon-button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          className="icon-button"
          aria-label="下一页"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function EventTable({
  items,
  onSelect,
  compact = false,
}: {
  items: EventRow[];
  onSelect: (event: EventRow) => void;
  compact?: boolean;
}) {
  if (!items.length)
    return <Empty title="没有找到记录" text="尝试切换时间范围，或等待第一条留言。" />;
  return (
    <div className="table-scroll">
      <table className="event-table">
        <thead>
          <tr>
            <th>访客</th>
            <th>消息内容</th>
            <th>状态 / 原因</th>
            {!compact && <th>方向</th>}
            <th>时间</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((event) => (
            <tr key={event.id}>
              <td>
                <div className="person-cell">
                  <Avatar name={event.name || '系统'} id={event.user_id || ''} />
                  <div>
                    <strong>{event.name || '系统操作'}</strong>
                    <small>
                      {event.username ? `@${event.username}` : event.user_id || 'TelegramDoor'}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <span className="message-preview">
                  {event.content ||
                    (event.message_type !== 'system'
                      ? `[${event.message_type}]`
                      : event.detail || '—')}
                </span>
                {event.message_type !== 'text' && event.message_type !== 'system' && (
                  <small className="muted">{event.message_type}</small>
                )}
              </td>
              <td>
                <Badge status={event.status} />
                <small className="reason">{reasonLabels[event.reason] || event.reason}</small>
              </td>
              {!compact && (
                <td>
                  <span className="direction">
                    {event.direction === 'in' ? (
                      <>
                        <ArrowDownLeft size={13} /> 收到
                      </>
                    ) : event.direction === 'out' ? (
                      <>
                        <ArrowUpRight size={13} /> 发出
                      </>
                    ) : (
                      '系统'
                    )}
                  </span>
                </td>
              )}
              <td className="date-cell">{formatTime(event.created_at, true)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`查看${event.name || '系统'}的记录`}
                  onClick={() => onSelect(event)}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const elements = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, select, textarea, a[href]',
      );
      if (!elements?.length) return;
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <section
        ref={ref}
        tabIndex={-1}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭详情" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
