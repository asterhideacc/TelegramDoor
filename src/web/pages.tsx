import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleCheck,
  Clock3,
  LockKeyhole,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  ShieldX,
  Users,
  X,
} from 'lucide-react';
import type { EventRow, Person, Stats } from '../shared/types';
import { reasonLabels } from '../shared/types';
import type { Notify } from './App';
import { api, formatTime, timezoneOffset } from './api';
import {
  Avatar,
  Badge,
  Drawer,
  Empty,
  ErrorBox,
  EventTable,
  Pagination,
  Spinner,
  UserBadge,
  userState,
} from './components';
import { useDebounce, useResource } from './hooks';

interface PageProps {
  range: string;
  revision: number;
  onEvent: (event: EventRow) => void;
  refresh: () => void;
  notify: Notify;
}
interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
}
function Loading() {
  return (
    <div className="loading-area">
      <Spinner />
      <span>正在读取记录…</span>
    </div>
  );
}
export function Overview({
  range,
  revision,
  onEvent,
  onViewAll,
}: PageProps & { onViewAll: () => void }) {
  const stats = useResource<Stats>(
    `/admin/stats?range=${range}&offset=${timezoneOffset()}`,
    revision,
  );
  const events = useResource<ListResponse<EventRow>>(
    `/admin/events?range=${range}&status=blocked&offset=${timezoneOffset()}`,
    revision,
  );
  const value = (field: keyof Stats) =>
    stats.loading ? '—' : Number(stats.data?.[field] || 0).toLocaleString();
  const cards = [
    {
      title: '收到的留言',
      value: value('received'),
      icon: MessageSquare,
      color: 'indigo',
      note: '访客发送的消息',
    },
    {
      title: '成功送达',
      value: value('delivered'),
      icon: Send,
      color: 'green',
      note: '已转发到你的 Telegram',
    },
    {
      title: '拦截记录',
      value: value('blocked'),
      icon: ShieldX,
      color: 'orange',
      note: '消息拦截与验证失败',
    },
    {
      title: '完成验证',
      value: value('verified'),
      icon: ShieldCheck,
      color: 'blue',
      note: '通过人机验证的次数',
    },
  ];
  const chartDays = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  const days = Array.from({ length: chartDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - chartDays + i + 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      day: key,
      delivered: 0,
      blocked: 0,
      ...stats.data?.chart.find((row) => row.day === key),
    };
  });
  const max = Math.max(2, Math.ceil(Math.max(...days.map((d) => d.delivered + d.blocked)) / 2) * 2),
    totalBlocked = stats.data?.blocked || 0;
  return (
    <>
      {stats.error && <ErrorBox error={stats.error} retry={stats.reload} />}
      <div className="stats-grid">
        {cards.map((card) => (
          <section className="stat-card" key={card.title}>
            <div className="stat-top">
              <span>{card.title}</span>
              <span className={`stat-icon ${card.color}`}>
                <card.icon size={19} />
              </span>
            </div>
            <strong className="stat-value">{card.value}</strong>
            <small>{card.note}</small>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel activity-panel">
          <div className="panel-head">
            <div>
              <h2>消息动态</h2>
              <p>
                {range === 'today'
                  ? '今天的消息接收情况'
                  : range === 'all'
                    ? '最近 30 天的变化'
                    : `最近 ${chartDays} 天的变化`}
              </p>
            </div>
            <div className="legend">
              <span>
                <i className="dot indigo-dot" />
                送达
              </span>
              <span>
                <i className="dot orange-dot" />
                拦截
              </span>
            </div>
          </div>
          {stats.loading ? (
            <Loading />
          ) : (
            <div className="chart-area">
              <div className="chart-y">
                <span>{max}</span>
                <span>{Math.round(max / 2)}</span>
                <span>0</span>
              </div>
              <div
                className="bar-chart"
                role="img"
                aria-label={days
                  .map((d) => `${d.day}：送达${d.delivered}，拦截${d.blocked}`)
                  .join('；')}
              >
                <div className="chart-grid-lines">
                  <i />
                  <i />
                  <i />
                </div>
                {days.map((day) => (
                  <div className="chart-column" key={day.day}>
                    <div
                      className="bar-stack"
                      title={`${day.day} · 送达 ${day.delivered} / 拦截 ${day.blocked}`}
                    >
                      <span
                        className="bar-blocked"
                        style={{ height: `${(day.blocked / max) * 100}%` }}
                      />
                      <span
                        className="bar-delivered"
                        style={{ height: `${(day.delivered / max) * 100}%` }}
                      />
                      {day.delivered + day.blocked === 0 && <span className="bar-zero" />}
                    </div>
                    <span className="chart-label">
                      {chartDays > 7 ? day.day.slice(8) : day.day.slice(5).replace('-', '/')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="chart-note">
            <CircleCheck size={14} />{' '}
            {stats.data?.errors
              ? `当前范围有 ${stats.data.errors} 条失败记录，可在消息记录中查看。`
              : '发送失败与异常会单独记录，方便你随时检查。'}
          </div>
        </section>
        <section className="panel protection-panel">
          <div className="panel-head">
            <div>
              <h2>拦截原因</h2>
              <p>了解门外发生了什么</p>
            </div>
            <ShieldCheck size={20} className="muted" />
          </div>
          {stats.loading ? (
            <Loading />
          ) : totalBlocked === 0 ? (
            <Empty title="暂时没有打扰" text="发生拦截后，原因分布会显示在这里。" />
          ) : (
            <>
              <div className="protection-total">
                <strong>{totalBlocked.toLocaleString()}</strong>
                <span>次拦截</span>
                <span className="soft-tag">防护记录</span>
              </div>
              <div className="reason-bars">
                {stats.data?.reasons.slice(0, 5).map((reason, i) => (
                  <div key={reason.reason}>
                    <div>
                      <span>
                        <i className={`reason-dot reason-${i}`} />
                        {reasonLabels[reason.reason] || reason.reason}
                      </span>
                      <strong>{reason.count}</strong>
                    </div>
                    <div className="reason-track">
                      <span
                        className={`reason-${i}`}
                        style={{ width: `${(reason.count / totalBlocked) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="protection-foot">
            <Users size={14} /> {stats.data?.users || 0} 位访客<span>·</span>
            <LockKeyhole size={13} /> {stats.data?.banned || 0} 位已封禁
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>最近拦截</h2>
            <p>没有打扰你，但每条都有记录。</p>
          </div>
          <button className="text-button" onClick={onViewAll}>
            查看全部 <ArrowRight size={14} />
          </button>
        </div>
        {events.error ? (
          <ErrorBox error={events.error} retry={events.reload} />
        ) : events.loading ? (
          <Loading />
        ) : (
          <EventTable items={events.data?.items.slice(0, 5) || []} onSelect={onEvent} compact />
        )}
      </section>
    </>
  );
}
export function Events({
  range,
  revision,
  onEvent,
  blockedOnly,
}: PageProps & { blockedOnly: boolean }) {
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [page, setPage] = useState(1);
  const query = useDebounce(search);
  useEffect(() => {
    setPage(1);
  }, [query, status, range, blockedOnly]);
  const effective = blockedOnly ? 'blocked' : status;
  const result = useResource<ListResponse<EventRow>>(
    `/admin/events?range=${range}&status=${effective}&page=${page}&offset=${timezoneOffset()}&search=${encodeURIComponent(query)}`,
    revision,
  );
  return (
    <section className="panel">
      <div className="record-toolbar">
        {blockedOnly ? (
          <div className="toolbar-label">
            <ShieldX size={18} />
            <strong>所有拦截记录</strong>
          </div>
        ) : (
          <div className="tabs">
            {[
              ['all', '全部'],
              ['delivered', '已送达'],
              ['error', '失败'],
              ['verified', '验证'],
              ['action', '操作'],
            ].map(([key, label]) => (
              <button
                className={status === key ? 'active' : ''}
                key={key}
                onClick={() => setStatus(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="搜索消息"
            placeholder="搜索访客、ID 或消息内容"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button aria-label="清空搜索" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : result.loading ? (
        <Loading />
      ) : (
        <EventTable items={result.data?.items || []} onSelect={onEvent} />
      )}
      <Pagination page={page} total={result.data?.total || 0} onChange={setPage} />
    </section>
  );
}
export function UserList({
  revision,
  onUser,
}: {
  revision: number;
  onUser: (user: Person) => void;
}) {
  const [search, setSearch] = useState(''),
    [state, setState] = useState('all'),
    [page, setPage] = useState(1);
  const query = useDebounce(search);
  useEffect(() => setPage(1), [query, state]);
  const result = useResource<ListResponse<Person>>(
    `/admin/users?state=${state}&page=${page}&search=${encodeURIComponent(query)}`,
    revision,
  );
  return (
    <section className="panel">
      <div className="record-toolbar">
        <div className="tabs">
          {[
            ['all', '全部访客'],
            ['banned', '已封禁'],
            ['trusted', '白名单'],
            ['verified', '已验证'],
            ['pending', '待验证'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={state === key ? 'active' : ''}
              onClick={() => setState(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="搜索访客"
            placeholder="搜索昵称、用户名或 ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : result.loading ? (
        <Loading />
      ) : !result.data?.items.length ? (
        <Empty title="还没有这样的访客" text="收到第一条消息后，访客信息会自动显示。" />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>访客</th>
                <th>用户 ID</th>
                <th>状态</th>
                <th>最近来访</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.data.items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={user.name} id={user.id} />
                      <div>
                        <strong>{user.name}</strong>
                        <small>{user.username ? `@${user.username}` : '未设置用户名'}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code>{user.id}</code>
                  </td>
                  <td>
                    <UserBadge user={user} />
                  </td>
                  <td className="date-cell">{formatTime(user.last_seen, true)}</td>
                  <td>
                    <button className="text-button" onClick={() => onUser(user)}>
                      管理 <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={result.data?.total || 0} onChange={setPage} />
    </section>
  );
}

function UserActions({
  id,
  banned,
  trusted = false,
  refresh,
  notify,
  onDone,
}: {
  id: string;
  banned: boolean;
  trusted?: boolean;
  refresh: () => void;
  notify: Notify;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(''),
    [duration, setDuration] = useState('0'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const action = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${id}/action`, {
        method: 'POST',
        body: { action: value, reason, duration: Number(duration) },
      });
      notify('用户状态已更新');
      refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="drawer-section">
      <h3>访客管理</h3>
      {error && <ErrorBox error={error} />}
      {!banned && (
        <div className="ban-form">
          <label className="field">
            封禁时长
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="0">永久封禁</option>
              <option value="3600">1 小时</option>
              <option value="86400">1 天</option>
              <option value="604800">7 天</option>
            </select>
          </label>
          <label className="field">
            备注原因
            <input
              placeholder="例如：重复发送广告（可选）"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="action-row">
        <button
          disabled={busy}
          className={`button ${banned ? 'primary' : 'danger'}`}
          onClick={() => action(banned ? 'unban' : 'ban')}
        >
          {busy ? <Spinner /> : <ShieldX size={15} />}
          {banned ? '解除封禁' : '封禁此用户'}
        </button>
        {!banned && (
          <button
            disabled={busy}
            className="button secondary"
            onClick={() => action(trusted ? 'untrust' : 'trust')}
          >
            {trusted ? '移出白名单' : '加入白名单'}
          </button>
        )}
      </div>
      {!banned && (
        <button
          disabled={busy}
          className="text-button reset-button"
          onClick={() => action('reset')}
        >
          重置验证状态
        </button>
      )}
      <p className="field-hint">
        封禁后不再转发此用户的消息和回应。解封后需要重新验证；白名单跳过验证和内容过滤，但仍受发送频率限制。
      </p>
    </section>
  );
}
export function EventDetail({
  event,
  onClose,
  refresh,
  notify,
}: {
  event: EventRow;
  onClose: () => void;
  refresh: () => void;
  notify: Notify;
}) {
  return (
    <Drawer title="记录详情" onClose={onClose}>
      <div className="drawer-section">
        <div className="detail-person">
          <Avatar name={event.name || '系统'} id={event.user_id || ''} />
          <div>
            <h3>{event.name || '系统操作'}</h3>
            <p>
              {event.user_id || 'TelegramDoor'} {event.username && `· @${event.username}`}
            </p>
          </div>
          <Badge status={event.status} />
        </div>
        <dl className="detail-meta">
          <div>
            <dt>记录时间</dt>
            <dd>{formatTime(event.created_at)}</dd>
          </div>
          <div>
            <dt>处理原因</dt>
            <dd>{reasonLabels[event.reason] || event.reason}</dd>
          </div>
          <div>
            <dt>消息类型</dt>
            <dd>{event.message_type}</dd>
          </div>
        </dl>
        <h3>消息内容</h3>
        <div className="message-bubble">
          {event.content || '未保存文本内容，或这是一条媒体消息。'}
        </div>
        {event.detail && <p className="detail-note">{event.detail}</p>}
        <p className="field-hint">记录用于查看和排查，不会自动重新投递被拦截的内容。</p>
      </div>
      {event.user_id && (
        <UserActions
          id={event.user_id}
          banned={event.banned_until === -1 || (event.banned_until || 0) > Date.now() / 1000}
          refresh={refresh}
          notify={notify}
          onDone={onClose}
        />
      )}
    </Drawer>
  );
}
export function UserDetail({
  user,
  onClose,
  refresh,
  notify,
}: {
  user: Person;
  onClose: () => void;
  refresh: () => void;
  notify: Notify;
}) {
  const history = useResource<ListResponse<EventRow>>(`/admin/events?range=all&user=${user.id}`);
  const [reply, setReply] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const banned = userState(user) === 'banned';
  return (
    <Drawer title="访客详情" onClose={onClose}>
      <div className="drawer-section">
        <div className="detail-person">
          <Avatar name={user.name} id={user.id} />
          <div>
            <h3>{user.name}</h3>
            <p>
              {user.id} {user.username && `· @${user.username}`}
            </p>
          </div>
          <UserBadge user={user} />
        </div>
        <dl className="detail-meta">
          <div>
            <dt>首次来访</dt>
            <dd>{formatTime(user.first_seen)}</dd>
          </div>
          <div>
            <dt>最近来访</dt>
            <dd>{formatTime(user.last_seen)}</dd>
          </div>
          {banned && (
            <>
              <div>
                <dt>封禁到期</dt>
                <dd>{user.banned_until === -1 ? '永久' : formatTime(user.banned_until)}</dd>
              </div>
              <div>
                <dt>封禁原因</dt>
                <dd>{user.ban_reason || '未填写'}</dd>
              </div>
            </>
          )}
        </dl>
      </div>
      <UserActions
        id={user.id}
        banned={banned}
        trusted={!!user.trusted}
        refresh={refresh}
        notify={notify}
        onDone={onClose}
      />
      {!banned && (
        <form
          className="drawer-section"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api(`/admin/users/${user.id}/reply`, { method: 'POST', body: { text: reply } });
              setReply('');
              notify('回复已发送');
              history.reload();
              refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : '回复失败');
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>发送回复</h3>
          <textarea
            aria-label="回复内容"
            placeholder="输入想对这位访客说的话…"
            rows={3}
            maxLength={4096}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            required
          />
          {error && <ErrorBox error={error} />}
          <button disabled={busy || !reply.trim()} className="button primary">
            {busy ? <Spinner /> : <Send size={15} />}发送回复
          </button>
        </form>
      )}
      <section className="drawer-section">
        <h3>
          最近记录 <span className="muted">{history.data?.total || 0}</span>
        </h3>
        {history.error ? (
          <ErrorBox error={history.error} />
        ) : history.loading ? (
          <Loading />
        ) : (
          <div className="timeline">
            {history.data?.items.length ? (
              history.data.items.map((event) => (
                <div key={event.id}>
                  <span className={`timeline-dot ${event.status}`} />
                  <div>
                    <div className="timeline-meta">
                      <strong>{reasonLabels[event.reason] || event.reason}</strong>
                      <time>{formatTime(event.created_at, true)}</time>
                    </div>
                    <p>{event.content || event.detail || `[${event.message_type}]`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">暂无记录</p>
            )}
          </div>
        )}
      </section>
    </Drawer>
  );
}
