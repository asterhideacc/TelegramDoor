import initialSchema from '../../migrations/0001_initial.sql';

const initialMigration = '0001_initial.sql';
// Cache completed work only. Sharing in-flight D1 promises across requests can
// cause Workers cross-request I/O errors, and a failure must remain retryable.
const ready = new WeakSet<D1Database>();

export class DatabaseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseSetupError';
  }
}

export async function ensureDatabase(db: D1Database | undefined): Promise<void> {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function')
    throw new DatabaseSetupError(
      '缺少 D1 数据库绑定。请在 Worker 设置 → 绑定中添加 D1，绑定名为 DB。',
    );
  if (ready.has(db)) return;

  try {
    const hasMigrations = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'")
      .first();
    const applied = hasMigrations
      ? await db
          .prepare('SELECT name FROM d1_migrations WHERE name=?')
          .bind(initialMigration)
          .first()
      : null;
    if (!applied) {
      // This immutable initial migration contains only idempotent CREATEs, with
      // no triggers or semicolons in strings. Do not use this splitter or this
      // automatic bootstrap to execute arbitrary/future migration files.
      const statements = initialSchema
        .split(';')
        .map((sql) => sql.trim())
        .filter(Boolean);
      // D1 batch is transactional: schema and Wrangler-compatible migration
      // marker commit together. IF NOT EXISTS / OR IGNORE permit cold-start races.
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS d1_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )`),
        ...statements.map((sql) => db.prepare(sql)),
        db.prepare('INSERT OR IGNORE INTO d1_migrations(name) VALUES(?)').bind(initialMigration),
      ]);
    }
    ready.add(db);
  } catch {
    // Database errors can contain stored data. Expose only actionable guidance.
    throw new DatabaseSetupError(
      '数据库初始化暂时失败，请稍后重试；若持续失败，请检查 DB 绑定和 D1 用量。',
    );
  }
}
