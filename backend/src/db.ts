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
  try { await pool.query("ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS department TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ"); } catch {}
  try { await pool.query("ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS scheduled_status TEXT DEFAULT 'immediate'"); } catch {}
  try { await pool.query("ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS planned_clock_in TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE survey_requests ADD COLUMN IF NOT EXISTS planned_clock_out TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''"); } catch {}
  try { await pool.query('ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS birth_year INTEGER'); } catch {}
  try { await pool.query('ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS agreement_accepted INTEGER DEFAULT 0'); } catch {}
  try { await pool.query('ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ'); } catch {}
  try { await pool.query("ALTER TABLE workers ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''"); } catch {}
  try { await pool.query('ALTER TABLE workers ADD COLUMN IF NOT EXISTS birth_year INTEGER'); } catch {}
  try { await pool.query("ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS overtime_willing TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE workers ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT ''"); } catch {}

  // Scheduled messages table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        notice_id INTEGER REFERENCES safety_notices(id),
        phones TEXT NOT NULL,
        date TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT DEFAULT 'scheduled',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  // Report schedules table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_schedules (
        id SERIAL PRIMARY KEY,
        time TEXT NOT NULL,
        phones TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  // Report schedules: add repeat_days column
  try { await pool.query("ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS repeat_days TEXT DEFAULT 'daily'"); } catch {}

  // Safety notice templates
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS safety_notices (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Insert default templates if table is empty
    const count = await pool.query('SELECT COUNT(*) as cnt FROM safety_notices');
    if (parseInt(count.rows[0].cnt) === 0) {
      await pool.query(`
        INSERT INTO safety_notices (title, content) VALUES
        ('위생관리 안내', '[조인앤조인 근무 안내]\n\n내일 근무 예정이신 분께 안내드립니다.\n\n■ 위생관리 수칙\n• 작업 전 반드시 손 세척 및 소독\n• 위생복, 위생모, 마스크 착용 필수\n• 작업장 내 음식물 반입 금지\n• 손에 상처가 있을 경우 반드시 보고\n\n■ 시설물 안전\n• 장비 작동 전 이상 유무 확인\n• 바닥 물기 주의 (미끄럼 방지)\n• 시설물 파손 발견 시 즉시 보고\n• 안전장비 미착용 시 작업 금지\n\n■ 개인 안전\n• 무리한 작업 금지, 컨디션 불량 시 보고\n• 비상구 위치 숙지\n• 안전사고 발생 시 즉시 관리자에게 연락\n\n안전하고 건강한 근무 되시기 바랍니다.\n조인앤조인 관리팀')
      `);
    }
  } catch (err) {
    console.error('Safety notices table init error:', err);
  }

  // Safety notice log
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS safety_notice_log (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        date TEXT NOT NULL,
        notice_id INTEGER REFERENCES safety_notices(id),
        sent_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_safety_log_phone_date ON safety_notice_log(phone, date)');
  } catch (err) {
    console.error('Safety notice log table init error:', err);
  }

  // Regular employees (현장 정규직)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_employees (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        department TEXT NOT NULL DEFAULT '',
        team TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '일반',
        workplace_id INTEGER REFERENCES survey_workplaces(id),
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_regular_employees_token ON regular_employees(token);
      CREATE INDEX IF NOT EXISTS idx_regular_employees_phone ON regular_employees(phone);

      CREATE TABLE IF NOT EXISTS regular_attendance (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        clock_in_time TIMESTAMPTZ,
        clock_out_time TIMESTAMPTZ,
        clock_in_lat DOUBLE PRECISION,
        clock_in_lng DOUBLE PRECISION,
        clock_out_lat DOUBLE PRECISION,
        clock_out_lng DOUBLE PRECISION,
        gps_valid INTEGER DEFAULT 0,
        agreement_accepted INTEGER DEFAULT 0,
        agreement_accepted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(employee_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_regular_attendance_date ON regular_attendance(date);
      CREATE INDEX IF NOT EXISTS idx_regular_attendance_employee ON regular_attendance(employee_id);

      CREATE TABLE IF NOT EXISTS regular_notices (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        date TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_regular_notices_date ON regular_notices(date);
      ALTER TABLE regular_notices ADD COLUMN IF NOT EXISTS date_type TEXT DEFAULT 'specific';
      ALTER TABLE regular_notices ADD COLUMN IF NOT EXISTS end_date TEXT DEFAULT '';
      ALTER TABLE regular_notices ADD COLUMN IF NOT EXISTS target_department TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS regular_org_settings (
        id SERIAL PRIMARY KEY,
        department TEXT NOT NULL,
        team TEXT NOT NULL,
        leader_name TEXT DEFAULT '',
        leader_role TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error('Regular employee tables init error:', err);
  }

  // Regular employee report schedules table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_report_schedules (
        id SERIAL PRIMARY KEY,
        time TEXT NOT NULL,
        phones TEXT NOT NULL,
        repeat_days TEXT DEFAULT 'daily',
        is_active INTEGER DEFAULT 1,
        last_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch {}

  // Regular employee vacation balances
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_vacation_balances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        total_days NUMERIC(4,1) NOT NULL DEFAULT 0,
        used_days NUMERIC(4,1) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(employee_id, year)
      )
    `);
  } catch {}

  // Add hire_date column to regular_employees
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS hire_date TEXT DEFAULT ''"); } catch {}

  // Regular employee vacation requests
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_vacation_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days NUMERIC(4,1) NOT NULL DEFAULT 1,
        reason TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        admin_memo TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  console.log('Database initialized successfully');
}

export { pool };

// ===== KST (Korean Standard Time) Helpers =====
export function getKSTDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function getKSTTimestamp(): string {
  // Store as plain UTC - frontend converts to local time for display
  return new Date().toISOString();
}
