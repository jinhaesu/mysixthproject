import { Pool } from 'pg';
import pg from 'pg';

// Parse BIGINT (INT8) as JavaScript number (for COUNT(*) etc.)
pg.types.setTypeParser(20, (val: string) => parseInt(val, 10));

// Parse DATABASE_URL and ensure database name defaults to 'postgres'
function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set!');
    process.exit(1);
  }

  try {
    const parsed = new URL(url);
    return new Pool({
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      database: parsed.pathname.slice(1) || 'postgres',
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  } catch {
    // Fallback to connection string
    return new Pool({
      connectionString: url,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
  }
}

const pool = createPool();

/**
 * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ... format
 */
function pg$(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Query single row (like db.prepare(sql).get(...params))
 */
export async function dbGet(sql: string, ...params: any[]): Promise<any> {
  const result = await pool.query(pg$(sql), params);
  return result.rows[0] || undefined;
}

/**
 * Query all rows (like db.prepare(sql).all(...params))
 */
export async function dbAll(sql: string, ...params: any[]): Promise<any[]> {
  const result = await pool.query(pg$(sql), params);
  return result.rows;
}

/**
 * Execute INSERT/UPDATE/DELETE (like db.prepare(sql).run(...params))
 * For INSERTs, automatically adds RETURNING id
 */
export async function dbRun(sql: string, ...params: any[]): Promise<{ lastInsertRowid: number | string; changes: number }> {
  let pgSql = pg$(sql);
  const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
  if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
    pgSql += ' RETURNING id';
  }
  const result = await pool.query(pgSql, params);
  return {
    lastInsertRowid: result.rows[0]?.id ?? 0,
    changes: result.rowCount ?? 0,
  };
}

/**
 * Execute raw SQL (for DDL statements)
 */
export async function dbExec(sql: string): Promise<void> {
  await pool.query(sql);
}

/**
 * Transaction wrapper
 */
interface TxClient {
  get: (sql: string, ...params: any[]) => Promise<any>;
  all: (sql: string, ...params: any[]) => Promise<any[]>;
  run: (sql: string, ...params: any[]) => Promise<{ lastInsertRowid: number | string; changes: number }>;
}

export async function dbTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txGet = async (sql: string, ...params: any[]) => {
      const result = await client.query(pg$(sql), params);
      return result.rows[0] || undefined;
    };

    const txAll = async (sql: string, ...params: any[]) => {
      const result = await client.query(pg$(sql), params);
      return result.rows;
    };

    const txRun = async (sql: string, ...params: any[]) => {
      let pgSql = pg$(sql);
      const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !pgSql.toUpperCase().includes('RETURNING')) {
        pgSql += ' RETURNING id';
      }
      const result = await client.query(pgSql, params);
      return {
        lastInsertRowid: result.rows[0]?.id ?? 0,
        changes: result.rowCount ?? 0,
      };
    };

    const result = await fn({ get: txGet, all: txAll, run: txRun });
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Initialize database schema (PostgreSQL)
 * SAFETY: Only uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS.
 * NEVER drops, truncates, or deletes existing data.
 * All schema changes are additive only - safe to run on every server start.
 */
export async function initializeDB(): Promise<void> {
  // Verify connection first
  const connTest = await pool.query('SELECT current_database(), current_user');
  console.log(`DB connected: database=${connTest.rows[0].current_database}, user=${connTest.rows[0].current_user}`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      ai_analysis TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id SERIAL PRIMARY KEY,
      upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      clock_in TEXT,
      clock_out TEXT,
      category TEXT,
      department TEXT,
      workplace TEXT,
      shift TEXT DEFAULT '',
      total_hours DOUBLE PRECISION DEFAULT 0,
      regular_hours DOUBLE PRECISION DEFAULT 0,
      overtime_hours DOUBLE PRECISION DEFAULT 0,
      night_hours DOUBLE PRECISION DEFAULT 0,
      break_time DOUBLE PRECISION DEFAULT 0,
      annual_leave TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_records_date ON attendance_records(date);
    CREATE INDEX IF NOT EXISTS idx_records_name ON attendance_records(name);
    CREATE INDEX IF NOT EXISTS idx_records_upload ON attendance_records(upload_id);
    CREATE INDEX IF NOT EXISTS idx_records_department ON attendance_records(department);
    CREATE INDEX IF NOT EXISTS idx_records_workplace ON attendance_records(workplace);
    CREATE INDEX IF NOT EXISTS idx_records_category ON attendance_records(category);

    CREATE TABLE IF NOT EXISTS org_chart_nodes (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER,
      node_type TEXT NOT NULL DEFAULT 'person',
      name TEXT NOT NULL,
      position TEXT DEFAULT '',
      department TEXT DEFAULT '',
      employment_type TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (parent_id) REFERENCES org_chart_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workforce_plans (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      worker_type TEXT NOT NULL,
      planned_count INTEGER DEFAULT 0,
      planned_hours DOUBLE PRECISION DEFAULT 0,
      memo TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(year, month, day, worker_type)
    );

    CREATE TABLE IF NOT EXISTS workforce_plan_slots (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      worker_type TEXT NOT NULL,
      start_hour INTEGER NOT NULL,
      duration DOUBLE PRECISION NOT NULL,
      headcount INTEGER NOT NULL DEFAULT 1,
      memo TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_wps_year_month ON workforce_plan_slots(year, month);

    CREATE TABLE IF NOT EXISTS survey_workplaces (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 200,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS survey_requests (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      workplace_id INTEGER REFERENCES survey_workplaces(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      message_type TEXT DEFAULT 'sms',
      message_id TEXT DEFAULT '',
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_survey_requests_token ON survey_requests(token);
    CREATE INDEX IF NOT EXISTS idx_survey_requests_phone ON survey_requests(phone);
    CREATE INDEX IF NOT EXISTS idx_survey_requests_date ON survey_requests(date);

    CREATE TABLE IF NOT EXISTS survey_responses (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES survey_requests(id) ON DELETE CASCADE,
      clock_in_time TEXT,
      clock_in_lat DOUBLE PRECISION,
      clock_in_lng DOUBLE PRECISION,
      clock_in_gps_valid INTEGER DEFAULT 0,
      clock_out_time TEXT,
      clock_out_lat DOUBLE PRECISION,
      clock_out_lng DOUBLE PRECISION,
      clock_out_gps_valid INTEGER DEFAULT 0,
      worker_name_ko TEXT DEFAULT '',
      worker_name_en TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      id_number TEXT DEFAULT '',
      emergency_contact TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_survey_responses_request ON survey_responses(request_id);

    CREATE TABLE IF NOT EXISTS workers (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name_ko TEXT NOT NULL DEFAULT '',
      name_en TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      id_number TEXT DEFAULT '',
      emergency_contact TEXT DEFAULT '',
      category TEXT DEFAULT '',
      department TEXT DEFAULT '',
      workplace TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers(phone);
    CREATE INDEX IF NOT EXISTS idx_workers_name ON workers(name_ko);

    CREATE TABLE IF NOT EXISTS payroll_settings (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL UNIQUE,
      hourly_rate INTEGER NOT NULL DEFAULT 0,
      overtime_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.5,
      night_multiplier DOUBLE PRECISION NOT NULL DEFAULT 0.5,
      weekly_holiday_enabled INTEGER NOT NULL DEFAULT 1,
      memo TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Migrations
  try { await pool.query('ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS reminder_sent INTEGER DEFAULT 0'); } catch {}
  try { await pool.query('ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ'); } catch {}

  console.log('Database initialized successfully');
}

export { pool };
