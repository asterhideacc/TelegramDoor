import type { Settings } from '../shared/types';
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  BOT_TOKEN: string;
  OWNER_ID: string;
}
export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}
export interface Message {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  date?: number;
  text?: string;
  caption?: string;
  entities?: Record<string, unknown>[];
  caption_entities?: Record<string, unknown>[];
  reply_to_message?: Message;
  media_group_id?: string;
  photo?: { file_id: string }[];
  video?: { file_id: string };
  animation?: { file_id: string };
  audio?: { file_id: string };
  document?: { file_id: string; file_name?: string };
  voice?: { file_id: string };
  sticker?: { file_id: string; emoji?: string };
  video_note?: { file_id: string };
  contact?: unknown;
  location?: unknown;
  poll?: unknown;
  dice?: unknown;
  [key: string]: unknown;
}
export interface Callback {
  id: string;
  from: TgUser;
  data?: string;
  message?: Message;
}
export interface Update {
  update_id: number;
  message?: Message;
  edited_message?: Message;
  callback_query?: Callback;
  message_reaction?: {
    chat: { id: number };
    message_id: number;
    user?: TgUser;
    new_reaction: { type: string; emoji?: string }[];
  };
}
export interface Link {
  id: string;
  user_id: string;
  source_chat: string;
  source_message: number;
  target_chat: string;
  target_message: number;
  created_at: number;
}
export interface Challenge {
  id: string;
  user_id: string;
  kind: string;
  answer: string;
  expires_at: number;
  created_at: number;
}
export interface BotContext {
  env: Env;
  settings: Settings;
  origin: string;
}
