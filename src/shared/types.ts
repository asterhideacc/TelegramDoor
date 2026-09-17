export interface Person {
  id: string;
  name: string;
  username: string;
  first_seen: number;
  last_seen: number;
  verified_until: number;
  banned_until: number;
  ban_reason: string;
  trusted: number;
  verify_failures: number;
  cooldown_until: number;
}
export interface Settings {
  verification: 'native' | 'turnstile';
  verifiedDays: number;
  messagesPerMinute: number;
  blockLinks: boolean;
  keywords: string[];
  paused: boolean;
  retentionDays: number;
  storeContent: boolean;
  welcome: string;
  turnstileSiteKey: string;
}
export interface EventRow {
  id: string;
  created_at: number;
  user_id: string | null;
  name?: string;
  username?: string;
  banned_until?: number;
  direction: string;
  status: string;
  reason: string;
  message_type: string;
  content: string;
  message_id: number | null;
  detail: string;
}
export interface Stats {
  received: number;
  delivered: number;
  blocked: number;
  errors: number;
  verified: number;
  users: number;
  banned: number;
  chart: { day: string; delivered: number; blocked: number }[];
  reasons: { reason: string; count: number }[];
}
export const reasonLabels: Record<string, string> = {
  unverified: '尚未验证',
  banned: '已封禁',
  rate_limit: '发送过于频繁',
  links: '包含链接',
  keyword: '命中关键词',
  paused: '暂停接收',
  cooldown: '验证冷却中',
  verification_failed: '验证失败',
  verified: '验证通过',
  relayed: '正常送达',
  edited: '编辑已同步',
  reaction: '表情回应',
  delivery_failed: '发送失败',
  ban: '封禁用户',
  unban: '解除封禁',
  trust: '加入白名单',
  untrust: '移出白名单',
  settings: '更新设置',
  webhook: '连接机器人',
  reset: '重置验证',
  unsupported: '不支持的消息',
};
export const statusLabels: Record<string, string> = {
  delivered: '已送达',
  blocked: '已拦截',
  error: '失败',
  action: '管理操作',
  verified: '验证通过',
};
export const reactionEmoji = ['👍', '❤', '🔥', '👏', '😁', '🎉'] as const;
