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

  // Pool 옵션 — 응급 보수 설정.
  // Web (PROCESS_TYPE=web): max:6 min:4 — 4개 항상 warm 으로 동시 요청 cold start 회피.
  //   페이지 로드 시 3-5 동시 요청이 흔함. min:2 면 3번째부터 cold conn 대기 (15s+).
  // Worker (PROCESS_TYPE=worker): max:2 min:1 — background 만.
  // 합계 8. PG max 60 (Supabase Pro) 내 안전.
  const isWorker = process.env.PROCESS_TYPE === 'worker';
  const baseOpts = {
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: isWorker ? 2 : 6,
    min: isWorker ? 1 : 4,            // web min 2→4 (warm pool 확대)
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 30_000,
    query_timeout: isWorker ? 60_000 : 12_000,
    statement_timeout: isWorker ? 60_000 : 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    application_name: isWorker ? 'mysixthproject-worker' : 'mysixthproject-web',
  };

  try {
    const parsed = new URL(url);
    return new Pool({
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      database: parsed.pathname.slice(1) || 'postgres',
      ...baseOpts,
    });
  } catch {
    // Fallback to connection string
    return new Pool({
      connectionString: url,
      ...baseOpts,
    });
  }
}

const pool = createPool();

// CRITICAL: pool.on('error') 가 없으면 idle client 에서 발생하는 error event 가
// Node 의 unhandled 'error' event 로 전파되어 프로세스가 죽음.
// Supavisor 의 EDBHANDLEREXITED (Transaction 모드 idle backend 정리) 같은 일시적
// 에러도 unhandled 되면 앱 전체 crash → Railway 재배포 루프 야기.
pool.on('error', (err: Error) => {
  console.error('[Pool] Idle client error (recovered):', err.message);
});

/**
 * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ... format
 */
function pg$(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Supavisor 가 idle 백엔드 정리 시 클라이언트는 EDBHANDLEREXITED / connection closed 받음.
// 이건 정상 동작이지만 그 순간 진행 중인 쿼리는 한 번 실패. 따라서 재시도해서 사용자에게는 투명하게.
// dead-checkout 레이스: pool 의 stale idle client 가 checkout 되면 첫 쿼리에서 fail.
// 만약 10개 slot 다 stale 이면 retry 마다 다른 dead client 받을 수 있음 → 3회 시도 + backoff 길게.
const RETRYABLE = (e: any) => {
  if (!e) return false;
  const m = String(e.message || '');
  return m.includes('EDBHANDLEREXITED') ||
         m.includes('Connection terminated') ||
         m.includes('connection closed') ||
         m.includes('connection terminated unexpectedly') ||
         m.includes('ECONNRESET') ||
         m.includes('ETIMEDOUT') ||
         m.includes('read ECONNRESET') ||
         m.includes('Client has encountered a connection error') ||
         e.code === '57P01' || e.code === '08006' || e.code === '08003' || e.code === 'ECONNRESET';
};
async function queryWithRetry(sql: string, params: any[], attempts = 3): Promise<any> {
  let last: any;
  for (let i = 1; i <= attempts; i++) {
    try { return await pool.query(sql, params); }
    catch (e: any) {
      last = e;
      if (i < attempts && RETRYABLE(e)) {
        await new Promise(r => setTimeout(r, 300 * i));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

/**
 * Query single row (like db.prepare(sql).get(...params))
 */
export async function dbGet(sql: string, ...params: any[]): Promise<any> {
  const result = await queryWithRetry(pg$(sql), params);
  return result.rows[0] || undefined;
}

/**
 * Query all rows (like db.prepare(sql).all(...params))
 */
export async function dbAll(sql: string, ...params: any[]): Promise<any[]> {
  const result = await queryWithRetry(pg$(sql), params);
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
  const result = await queryWithRetry(pgSql, params);
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
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3, delayMs = 2000): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      console.error(`[${label}] attempt ${i}/${attempts} failed: ${e.message}`);
      if (i < attempts) await new Promise(r => setTimeout(r, delayMs * i));
    }
  }
  throw lastErr;
}

export async function initializeDB(): Promise<void> {
  // Verify connection first — retry transient Supavisor EDBHANDLEREXITED 에러
  const connTest = await withRetry('initializeDB:connect',
    () => pool.query('SELECT current_database(), current_user'));
  console.log(`DB connected: database=${connTest.rows[0].current_database}, user=${connTest.rows[0].current_user}`);

  // 마이그레이션 가드 — 매 부팅마다 수십 개 ALTER TABLE 이 실행되면 ACCESS EXCLUSIVE 락 경합으로
  // 동시 SELECT 가 대기됨. schema_migrations 에 이번 버전 키가 있으면 전체 스키마 마이그 SKIP.
  // 새 컬럼/테이블 추가 시 SCHEMA_VERSION 만 올리면 다음 부팅에 재실행.
  try { await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`); } catch {}
  const SCHEMA_VERSION = 'schema-v2.32.0';
  const check = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [SCHEMA_VERSION]);
  if (check.rowCount && check.rowCount > 0) {
    console.log(`Schema already migrated (${SCHEMA_VERSION}), skipping ALTER block`);
    return;
  }
  console.log(`Running schema migration ${SCHEMA_VERSION}...`);

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
  try { await pool.query("ALTER TABLE workers ADD COLUMN IF NOT EXISTS division TEXT DEFAULT ''"); } catch {}

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
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS resigned_at TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS resign_date TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS bank_account TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS id_number TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS personal_info_completed INTEGER DEFAULT 0"); } catch {}

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

  try { await pool.query("ALTER TABLE regular_vacation_requests ADD COLUMN IF NOT EXISTS type TEXT DEFAULT '연차'"); } catch {}

  // Vacation update logs
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vacation_update_logs (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name TEXT NOT NULL,
        action TEXT NOT NULL,
        prev_days NUMERIC(4,1) DEFAULT 0,
        new_days NUMERIC(4,1) DEFAULT 0,
        reason TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  // Short-term labor contracts
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS labor_contracts (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        worker_type TEXT NOT NULL DEFAULT 'alba',
        contract_start TEXT NOT NULL,
        contract_end TEXT NOT NULL,
        address TEXT DEFAULT '',
        signature_data TEXT DEFAULT '',
        sms_sent INTEGER DEFAULT 0,
        request_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  try { await pool.query("ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS worker_type TEXT DEFAULT ''"); } catch {}

  // Regular employee shift schedules (계획 출퇴근 배치)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_shifts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        week_number INTEGER NOT NULL,
        day_of_week INTEGER NOT NULL,
        planned_clock_in TEXT NOT NULL,
        planned_clock_out TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  // Regular employee shift assignments
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_shift_assignments (
        id SERIAL PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES regular_shifts(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(shift_id, employee_id)
      )
    `);
  } catch {}

  // Migrations for regular_shifts: month/week-based structure + multi-day support
  try { await pool.query("ALTER TABLE regular_shifts ADD COLUMN IF NOT EXISTS month INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE regular_shifts ADD COLUMN IF NOT EXISTS days_of_week TEXT DEFAULT ''"); } catch {}

  // Regular employee labor contracts
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_labor_contracts (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        phone TEXT NOT NULL,
        worker_name TEXT NOT NULL,
        contract_start TEXT NOT NULL,
        contract_end TEXT NOT NULL,
        address TEXT DEFAULT '',
        signature_data TEXT DEFAULT '',
        token TEXT NOT NULL UNIQUE,
        status TEXT DEFAULT 'pending',
        sms_sent INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  // Additional contract fields for full 근로계약서
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS work_start_date TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS department TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS position_title TEXT DEFAULT '사원'"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS annual_salary TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS base_pay TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS meal_allowance TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS other_allowance TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS pay_day TEXT DEFAULT '10'"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS work_hours TEXT DEFAULT '09:00~18:00'"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS birth_date TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS id_number TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS consent_signed INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS consent_signature_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS work_place TEXT DEFAULT ''"); } catch {}

  // Admin password settings
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}

  // Confirmed attendance records
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS confirmed_attendance (
        id SERIAL PRIMARY KEY,
        employee_type TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        employee_phone TEXT DEFAULT '',
        date TEXT NOT NULL,
        confirmed_clock_in TEXT DEFAULT '',
        confirmed_clock_out TEXT DEFAULT '',
        source TEXT DEFAULT 'planned',
        regular_hours NUMERIC(5,2) DEFAULT 0,
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        night_hours NUMERIC(5,2) DEFAULT 0,
        break_hours NUMERIC(5,2) DEFAULT 1,
        holiday_work INTEGER DEFAULT 0,
        memo TEXT DEFAULT '',
        confirmed_at TIMESTAMPTZ DEFAULT NOW(),
        year_month TEXT NOT NULL,
        UNIQUE(employee_type, employee_name, date)
      )
    `);
  } catch {}

  // confirmed_attendance migrations
  try { await pool.query("ALTER TABLE confirmed_attendance ADD COLUMN IF NOT EXISTS department TEXT DEFAULT ''"); } catch {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_confirmed_year_month ON confirmed_attendance(year_month, employee_type)"); } catch {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_confirmed_employee_name ON confirmed_attendance(employee_name)"); } catch {}

  // Regular employee salary settings
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_salary_settings (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        base_pay NUMERIC(12,0) DEFAULT 0,
        meal_allowance NUMERIC(12,0) DEFAULT 0,
        bonus NUMERIC(12,0) DEFAULT 0,
        position_allowance NUMERIC(12,0) DEFAULT 0,
        other_allowance NUMERIC(12,0) DEFAULT 0,
        overtime_hourly_rate NUMERIC(10,0) DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(employee_id)
      )
    `);
  } catch {}

  // Payroll closing (급여 마감)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_closing (
        id SERIAL PRIMARY KEY,
        year_month TEXT NOT NULL UNIQUE,
        closed_at TIMESTAMPTZ DEFAULT NOW(),
        closed_by TEXT DEFAULT ''
      )
    `);
  } catch {}

  // Payroll payment status (지급 완료) — 마감과 별개로 실제 지급이 완료된 시점 기록
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_payroll_payment (
        id SERIAL PRIMARY KEY,
        year_month TEXT NOT NULL UNIQUE,
        paid_at TIMESTAMPTZ DEFAULT NOW(),
        paid_by TEXT DEFAULT ''
      )
    `);
  } catch {}

  // Payroll adjustments (기타 — 과지급/미지급 정산용 직원별 조정 금액)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regular_payroll_adjustments (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        year_month TEXT NOT NULL,
        amount NUMERIC(12,0) DEFAULT 0,
        memo TEXT DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(employee_id, year_month)
      );
      CREATE INDEX IF NOT EXISTS idx_regular_payroll_adj_ym ON regular_payroll_adjustments(year_month);
    `);
  } catch {}

  // Employee loans (직원 대출 관리)
  // repayment_method: 'monthly' (월별 분할) | 'lump_sum' (지정일 일괄)
  // monthly: start_month 부터 매월 monthly_amount 차감 — 누적 금액이 amount 도달 시 자동 종료
  // lump_sum: lump_sum_date 가 속한 월에 amount 전액 차감
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_loans (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL REFERENCES regular_employees(id) ON DELETE CASCADE,
        amount NUMERIC(12,0) NOT NULL,
        executed_date TEXT NOT NULL,
        repayment_method TEXT NOT NULL,
        monthly_amount NUMERIC(12,0) DEFAULT 0,
        start_month TEXT DEFAULT '',
        lump_sum_date TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        memo TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_employee_loans_employee ON employee_loans(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_loans_status ON employee_loans(status);
    `);
  } catch {}

  // Offboarding management
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employee_offboardings (
        id SERIAL PRIMARY KEY,
        employee_type TEXT NOT NULL,
        employee_ref_id INTEGER,
        employee_name TEXT NOT NULL,
        employee_phone TEXT DEFAULT '',
        department TEXT DEFAULT '',
        hire_date TEXT DEFAULT '',
        resign_date TEXT NOT NULL,
        loss_date TEXT DEFAULT '',
        reason_code TEXT NOT NULL DEFAULT '',
        reason_detail TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'in_progress',
        resignation_letter_received INTEGER DEFAULT 0,
        assets_returned INTEGER DEFAULT 0,
        pension_reported INTEGER DEFAULT 0,
        health_insurance_reported INTEGER DEFAULT 0,
        employment_insurance_reported INTEGER DEFAULT 0,
        industrial_accident_reported INTEGER DEFAULT 0,
        severance_paid INTEGER DEFAULT 0,
        annual_leave_settled INTEGER DEFAULT 0,
        income_tax_reported INTEGER DEFAULT 0,
        severance_method TEXT DEFAULT 'avg_3m',
        severance_auto NUMERIC(12,0) DEFAULT 0,
        severance_final NUMERIC(12,0) DEFAULT 0,
        annual_leave_remaining NUMERIC(5,1) DEFAULT 0,
        annual_leave_pay_auto NUMERIC(12,0) DEFAULT 0,
        annual_leave_pay_final NUMERIC(12,0) DEFAULT 0,
        retirement_income_tax NUMERIC(12,0) DEFAULT 0,
        notes TEXT DEFAULT '',
        email_sent INTEGER DEFAULT 0,
        email_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_offboarding_status ON employee_offboardings(status);
      CREATE INDEX IF NOT EXISTS idx_offboarding_resign_date ON employee_offboardings(resign_date);
      CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON employee_offboardings(employee_type, employee_ref_id);
    `);
  } catch (err) {
    console.error('Offboarding table init error:', err);
  }

  // Onboarding columns for regular_employees
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS birth_date TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS address TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'KR'"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS visa_type TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS visa_expiry TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS bank_slip_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS foreign_id_card_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS family_register_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS resident_register_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS signed_contract_url TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS business_registration_no TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS monthly_salary INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS non_taxable_meal INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS non_taxable_vehicle INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS job_code TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS weekly_work_hours NUMERIC(4,1) DEFAULT 40"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'regular'"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'pending'"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS onboarding_email_sent INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS onboarding_email_sent_at TIMESTAMPTZ"); } catch {}

  // Onboarding columns for regular_labor_contracts
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'KR'"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS visa_type TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS visa_expiry TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS bank_slip_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS foreign_id_card_data TEXT DEFAULT ''"); } catch {}

  // Phase 2: offboarding deadline reminder tracking
  try { await pool.query('ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ'); } catch {}

  // Phase 3: resignation letter fields
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_filename TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_token TEXT DEFAULT ''"); } catch {}
  try { await pool.query('ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_token_expires_at TIMESTAMPTZ'); } catch {}
  try { await pool.query('ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_sms_sent INTEGER DEFAULT 0'); } catch {}
  try { await pool.query('ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_sms_sent_at TIMESTAMPTZ'); } catch {}
  try { await pool.query('ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_submitted_at TIMESTAMPTZ'); } catch {}
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_employee_reason TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_detail TEXT DEFAULT ''"); } catch {}
  // 직원 자가 사인패드 (data URL base64 PNG, 수 KB 이내라 DB 저장 OK)
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_signature_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query('CREATE INDEX IF NOT EXISTS idx_offboarding_resignation_token ON employee_offboardings(resignation_letter_token)'); } catch {}

  // Legacy contract scan attachments (regular + dispatch)
  try { await pool.query('ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS is_legacy_scan INTEGER DEFAULT 0'); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS legacy_filename TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS scanned_file_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query('ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS is_legacy_scan INTEGER DEFAULT 0'); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS legacy_filename TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS scanned_file_data TEXT DEFAULT ''"); } catch {}

  // 카페 단독 문자 웹링크용 컬럼 — worker_type='cafe_alba' 로 구분.
  // 발송 시 admin이 매장·근무시간·시급·근무일 지정 → 직원이 본인 정보+서명 제출.
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS token TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS work_time_start TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS work_time_end TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS work_days TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS hourly_rate INTEGER DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS consent_signature_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS birth_date TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS id_number TEXT DEFAULT ''"); } catch {}
  try { await pool.query("CREATE INDEX IF NOT EXISTS idx_labor_contracts_token ON labor_contracts(token) WHERE token <> ''"); } catch {}

  // workers — 개별 시급 (알바·파견 정산용)
  try { await pool.query('ALTER TABLE workers ADD COLUMN IF NOT EXISTS hourly_rate INTEGER DEFAULT 0'); } catch {}

  // regular_labor_contracts.updated_at — 보기 SELECT 에 필요. 미존재 시 추가.
  try { await pool.query('ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()'); } catch {}

  // 성능 보강 인덱스 — workers 페이지 LATERAL join 속도 개선
  try { await pool.query('CREATE INDEX IF NOT EXISTS idx_labor_contracts_phone_end ON labor_contracts(phone, contract_end DESC)'); } catch {}
  try { await pool.query('CREATE INDEX IF NOT EXISTS idx_survey_responses_clockin ON survey_responses(request_id) WHERE clock_in_time IS NOT NULL'); } catch {}
  try { await pool.query('CREATE INDEX IF NOT EXISTS idx_workers_category ON workers(category)'); } catch {}

  // v2.25.0: Supabase Storage 마이그레이션 — base64 blob → Storage path 컬럼 추가.
  // 큰 첨부파일 (통장사본/외국인등록증/주민등록등본/가족관계증명서/사직서/계약서스캔본) 을
  // Storage 로 옮기고 DB 에는 path 만 저장. 기존 *_data 컬럼은 fallback 으로 한동안 유지.
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS bank_slip_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS foreign_id_card_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS family_register_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS resident_register_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS bank_slip_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS foreign_id_card_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS scanned_file_path TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE employee_offboardings ADD COLUMN IF NOT EXISTS resignation_letter_path TEXT DEFAULT ''"); } catch {}

  // 계약 종류 — 'production'(생산·물류 기본) | 'cafe'(카페 정규직).
  // 카페 정규직은 담당업무·근무장소 문구가 달라 서명 페이지에서 분기 렌더링.
  // 값 null/'' 이면 기존 로직대로 production 취급.
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS contract_kind TEXT DEFAULT 'production'"); } catch {}
  try { await pool.query("UPDATE regular_labor_contracts SET contract_kind = 'production' WHERE contract_kind IS NULL OR contract_kind = ''"); } catch {}
  // 담당 업무 / 근무일 / 휴게시간 — 카페용 별도 저장. production 계약은 조항에 하드코딩된 기본값 사용.
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS work_duties TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS work_days TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS break_time TEXT DEFAULT ''"); } catch {}

  // ═══════════════════════════════════════════════════════════════
  // v2.27.0 — 안전보건관리 시스템 P1 (근로자 매일 셀프체크 + 게이팅)
  // 산업안전보건법 + 중대재해처벌법 기준 이행 증빙 자동 축적 구조.
  // 카페 정규직 제외, 생산직 대상. clock-in/out API 훅에서 미완 시 409.
  // ═══════════════════════════════════════════════════════════════
  await pool.query(`
    CREATE TABLE IF NOT EXISTS safety_areas (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      workplace_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS safety_check_templates (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      frequency TEXT NOT NULL,
      area_id INTEGER REFERENCES safety_areas(id) ON DELETE SET NULL,
      target_role TEXT DEFAULT 'worker',
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS safety_check_items_master (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES safety_check_templates(id) ON DELETE CASCADE,
      item_no INTEGER NOT NULL,
      item_title TEXT NOT NULL,
      item_detail TEXT DEFAULT '',
      requires_photo_on_x INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_safety_items_template ON safety_check_items_master(template_id);

    CREATE TABLE IF NOT EXISTS worker_safety_task_log (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      task_type TEXT NOT NULL,
      task_date TEXT NOT NULL,
      template_id INTEGER,
      response_json JSONB DEFAULT '{}'::jsonb,
      overall_ok INTEGER DEFAULT 1,
      completed_at TIMESTAMPTZ DEFAULT NOW(),
      client_ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      UNIQUE (employee_id, task_type, task_date)
    );

    CREATE INDEX IF NOT EXISTS idx_worker_task_log_emp_date ON worker_safety_task_log(employee_id, task_date);
    CREATE INDEX IF NOT EXISTS idx_worker_task_log_type_date ON worker_safety_task_log(task_type, task_date);
  `);

  // 게이팅 대상 판정 함수는 서비스 계층에서. 여기서는 스키마만.
  // 기본 마스터 시드 — 없으면 삽입. P1은 매일 precheck/postcheck 2종 하드코딩 seed.
  try {
    const seedCheck = await pool.query("SELECT id FROM safety_check_templates WHERE frequency = 'daily' AND kind = 'safety' AND target_role = 'worker' LIMIT 1");
    if (!seedCheck.rowCount) {
      // 출근 전 셀프체크
      const preRes = await pool.query(
        `INSERT INTO safety_check_templates (kind, frequency, target_role, name, sort_order)
         VALUES ('safety', 'daily', 'worker', '출근 전 셀프체크', 10) RETURNING id`
      );
      const preId = preRes.rows[0].id;
      const preItems = [
        [1, '위생모·마스크·안전화 착용 완료', '위생복·위생모·마스크·안전화를 모두 착용하고 반지·시계·목걸이 등 개인 장신구는 제거했습니까?'],
        [2, '오늘 발열·감기·소화기 증상 없음', '체온 37.5℃ 미만 및 감기·설사·구토 등 증상이 없습니까?'],
        [3, '충분한 수면·컨디션 양호', '수면 부족·과음·복용 중인 약물로 작업에 지장이 있는 상태가 아닙니까?'],
        [4, '어제 신고한 안전 이슈 재확인 없음', '전일 신고한 아차사고·이상 상황이 오늘 재발할 위험이 없습니까?'],
        [5, '작업장 진입 안전 서약', '오늘 지시받은 작업 내용을 숙지했고 위험 상황 발견 시 즉시 관리자에 보고할 것을 약속합니까?'],
      ];
      for (const [no, title, detail] of preItems) {
        await pool.query(
          `INSERT INTO safety_check_items_master (template_id, item_no, item_title, item_detail, sort_order)
           VALUES ($1, $2, $3, $4, $2)`, [preId, no, title, detail]
        );
      }
      // 퇴근 전 셀프체크
      const postRes = await pool.query(
        `INSERT INTO safety_check_templates (kind, frequency, target_role, name, sort_order)
         VALUES ('safety', 'daily', 'worker', '퇴근 전 셀프체크', 20) RETURNING id`
      );
      const postId = postRes.rows[0].id;
      const postItems = [
        [1, '오늘 근무 중 통증·근골격 이상 없음', '오늘 작업 중 새로 발생한 목·어깨·팔·허리·다리 통증이 없습니까? (있으면 X 선택 후 상세 기재)'],
        [2, '오늘 목격한 아차사고·위험요인 신고 완료', '오늘 목격한 위험 상황이 있다면 아차사고 신고를 제출했습니까? (없으면 O)'],
        [3, '담당 라인·설비 안전 이상 없이 인계', '담당 설비의 전원 차단·정리정돈·다음 조 인계가 완료되었습니까?'],
        [4, '개인 소지품·보호구 회수·반납 완료', '개인 물품 회수 및 재사용 보호구 반납이 완료되었습니까?'],
      ];
      for (const [no, title, detail] of postItems) {
        await pool.query(
          `INSERT INTO safety_check_items_master (template_id, item_no, item_title, item_detail, sort_order)
           VALUES ($1, $2, $3, $4, $2)`, [postId, no, title, detail]
        );
      }
      console.log('[safety] Seeded default daily precheck/postcheck templates');
    }
  } catch (e: any) {
    console.error('[safety] template seed failed:', e.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // v2.28.0 — 안전보건관리 시스템 P2 (아차사고 신고 + 순회점검 + 조치 티켓)
  // ─ safety_daily_inspections: 안전관리자 일일 순회점검 헤더
  // ─ safety_inspection_findings: 순회점검 세부 지적
  // ─ safety_action_tickets: 아차사고·순회점검·셀프체크 이상 공용 조치 티켓
  // ─ hazard_reports: 근로자 아차사고·위험요인 신고
  // ═══════════════════════════════════════════════════════════════
  await pool.query(`
    CREATE TABLE IF NOT EXISTS safety_daily_inspections (
      id SERIAL PRIMARY KEY,
      area_id INTEGER,
      inspector_id INTEGER NOT NULL,
      inspector_name TEXT DEFAULT '',
      inspection_date TEXT NOT NULL,
      inspected_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'in_progress',
      overall_notes TEXT DEFAULT '',
      weather TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_safety_insp_date ON safety_daily_inspections(inspection_date);

    CREATE TABLE IF NOT EXISTS safety_inspection_findings (
      id SERIAL PRIMARY KEY,
      inspection_id INTEGER NOT NULL REFERENCES safety_daily_inspections(id) ON DELETE CASCADE,
      item_master_id INTEGER,
      item_title TEXT DEFAULT '',
      area_id INTEGER,
      judgement TEXT NOT NULL,
      photo_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      ticket_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_safety_findings_inspection ON safety_inspection_findings(inspection_id);

    CREATE TABLE IF NOT EXISTS safety_action_tickets (
      id SERIAL PRIMARY KEY,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      area_id INTEGER,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      severity TEXT NOT NULL DEFAULT 'mid',
      assignee_type TEXT DEFAULT 'manager',
      assignee_id INTEGER,
      assignee_name TEXT DEFAULT '',
      due_date TEXT,
      status TEXT DEFAULT 'open',
      completion_photo_url TEXT DEFAULT '',
      completion_notes TEXT DEFAULT '',
      completed_at TIMESTAMPTZ,
      verified_by INTEGER,
      verified_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON safety_action_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_due ON safety_action_tickets(due_date);

    CREATE TABLE IF NOT EXISTS hazard_reports (
      id SERIAL PRIMARY KEY,
      reporter_employee_id INTEGER,
      reporter_name TEXT DEFAULT '',
      reporter_phone TEXT DEFAULT '',
      is_anonymous INTEGER DEFAULT 0,
      occurred_at TIMESTAMPTZ DEFAULT NOW(),
      area_id INTEGER,
      area_name TEXT DEFAULT '',
      hazard_type TEXT NOT NULL,
      description TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      freq_score INTEGER,
      intensity_score INTEGER,
      grade TEXT,
      assessed_by INTEGER,
      assessed_at TIMESTAMPTZ,
      ticket_id INTEGER,
      response_to_reporter TEXT DEFAULT '',
      response_sent_at TIMESTAMPTZ,
      closed_at TIMESTAMPTZ,
      status TEXT DEFAULT 'reported',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hazard_status ON hazard_reports(status);

    -- ═══════════════════════════════════════════════════════════════
    -- P3 — 보건관리자 + 건강진단 + 보건증
    -- ═══════════════════════════════════════════════════════════════

    -- 주간 보건 순회점검 (소음/분진/온습도/휴게공간/세면/응급/AED/화학물질 보관)
    CREATE TABLE IF NOT EXISTS health_weekly_inspections (
      id SERIAL PRIMARY KEY,
      inspector_id INTEGER NOT NULL,
      inspector_name TEXT DEFAULT '',
      inspection_date TEXT NOT NULL,
      noise_status TEXT DEFAULT '',
      dust_status TEXT DEFAULT '',
      temp_status TEXT DEFAULT '',
      rest_area_status TEXT DEFAULT '',
      wash_area_status TEXT DEFAULT '',
      first_aid_status TEXT DEFAULT '',
      aed_status TEXT DEFAULT '',
      chemical_storage_status TEXT DEFAULT '',
      overall_notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_health_insp_date ON health_weekly_inspections(inspection_date);

    -- 근로자 건강상담 기록 (요양보호법 준수 목적, 개인정보 접근권한 유의)
    CREATE TABLE IF NOT EXISTS health_consultations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      employee_name TEXT DEFAULT '',
      consultation_date TEXT NOT NULL,
      consultation_type TEXT NOT NULL,
      chief_complaint TEXT DEFAULT '',
      action_taken TEXT DEFAULT '',
      next_followup_date TEXT,
      consulted_by INTEGER,
      consulted_by_name TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_consult_emp ON health_consultations(employee_id);

    -- MSDS(물질안전보건자료) 관리대장
    CREATE TABLE IF NOT EXISTS msds_registry (
      id SERIAL PRIMARY KEY,
      material_name TEXT NOT NULL,
      usage_description TEXT DEFAULT '',
      handling_dept TEXT DEFAULT '',
      handling_location TEXT DEFAULT '',
      posted_photo_url TEXT DEFAULT '',
      container_label_photo_url TEXT DEFAULT '',
      required_ppe TEXT DEFAULT '',
      training_completed_at TIMESTAMPTZ,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 일반·특수건강진단 관리
    CREATE TABLE IF NOT EXISTS health_checkups (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      employee_name TEXT DEFAULT '',
      checkup_type TEXT NOT NULL,
      scheduled_month TEXT,
      scheduled_year INTEGER,
      received_at TIMESTAMPTZ,
      result_grade TEXT DEFAULT '',
      result_notes TEXT DEFAULT '',
      followup_required INTEGER DEFAULT 0,
      followup_actions TEXT DEFAULT '',
      followup_completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_checkup_emp ON health_checkups(employee_id);

    -- 보건증(식품위생법 30조) — 식품취급자 필수, 만료 D-30 이내 clock-in/out 게이팅
    CREATE TABLE IF NOT EXISTS health_certificates (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      employee_name TEXT DEFAULT '',
      cert_type TEXT DEFAULT 'food_handler',
      issue_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      cert_photo_url TEXT DEFAULT '',
      status TEXT DEFAULT 'valid',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_healthcert_emp ON health_certificates(employee_id);
    CREATE INDEX IF NOT EXISTS idx_healthcert_exp ON health_certificates(expiry_date);

    -- ═══════════════════════════════════════════════════════════════
    -- P4 — 반기 정기교육 + 근골격계·의견 설문 + 게이팅 확대
    -- ═══════════════════════════════════════════════════════════════

    -- 교육 콘텐츠 마스터 (KOSHA 유튜브 링크 등)
    CREATE TABLE IF NOT EXISTS training_courses (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      video_source_type TEXT DEFAULT 'youtube',
      video_url TEXT DEFAULT '',
      duration_min INTEGER DEFAULT 0,
      half_year_credit_hours DOUBLE PRECISION DEFAULT 0,
      target_role TEXT DEFAULT 'production',
      category TEXT DEFAULT 'safety',
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 교육 퀴즈
    CREATE TABLE IF NOT EXISTS training_quiz_items (
      id SERIAL PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
      question_no INTEGER NOT NULL,
      question TEXT NOT NULL,
      choices JSONB NOT NULL,
      correct_index INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 이수 기록 (반기 단위)
    CREATE TABLE IF NOT EXISTS training_completions (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL REFERENCES training_courses(id),
      watched_seconds INTEGER DEFAULT 0,
      quiz_score INTEGER,
      quiz_total INTEGER,
      signed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      credited_hours DOUBLE PRECISION DEFAULT 0,
      half_year_period TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (employee_id, course_id, half_year_period)
    );
    CREATE INDEX IF NOT EXISTS idx_train_comp_emp ON training_completions(employee_id);

    -- 설문 마스터 (근골격계 증상·안전보건 의견)
    CREATE TABLE IF NOT EXISTS surveys (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      form_json JSONB NOT NULL,
      frequency TEXT DEFAULT 'semi',
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 안전보건 설문 응답 (기존 survey_responses 와 충돌 방지 위해 _safety 접미사)
    CREATE TABLE IF NOT EXISTS survey_responses_safety (
      id SERIAL PRIMARY KEY,
      survey_id INTEGER NOT NULL REFERENCES surveys(id),
      employee_id INTEGER NOT NULL,
      response_json JSONB NOT NULL,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      period TEXT,
      UNIQUE (survey_id, employee_id, period)
    );
    CREATE INDEX IF NOT EXISTS idx_survey_resp_safety_emp ON survey_responses_safety(employee_id);
    CREATE INDEX IF NOT EXISTS idx_survey_resp_safety_period ON survey_responses_safety(period);
  `);

  // Seed — safety_areas 비어있으면 기본 7개 구역 삽입
  try {
    const areaSeed = [
      ['RAW_STORE', '원료 입고·창고', 10],
      ['MIXING', '배합·전처리', 20],
      ['FORMING', '성형·충전', 30],
      ['OVEN', '오븐·튀김·가열', 40],
      ['COLD_STORE', '냉각·냉동·냉장', 50],
      ['PACKAGING', '포장·출하', 60],
      ['COMMON', '공통·통로·비상구', 70],
    ] as const;
    for (const [code, name, order] of areaSeed) {
      await pool.query(
        `INSERT INTO safety_areas (code, name, sort_order) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [code, name, order]
      );
    }

    // 구역별 daily 순회점검 템플릿 (target_role='manager') seed — 없으면 생성
    const areas = await pool.query(`SELECT id, code, name FROM safety_areas ORDER BY sort_order`);
    const inspectionItemsByCode: Record<string, [number, string, string][]> = {
      RAW_STORE: [
        [1, '원료 입고 검수기록 존재', '오늘 입고된 원료의 성적서·거래명세서·CoA 확인 여부'],
        [2, '창고 온·습도 로그 정상 범위', '냉장 0-10℃, 냉동 -18℃ 이하 유지 로그 이상 없음'],
        [3, '적재 안정성 (5단 이하·통로 확보)', '팔레트 적재 붕괴 위험, 비상 통로 90cm 확보'],
        [4, '유통기한 임박·경과 재고 없음', '선입선출 표기, 유통기한 경과분 격리 표시'],
      ],
      MIXING: [
        [1, '배합기 안전커버·비상정지 정상', '커버 인터록 작동, 비상정지 스위치 접근성'],
        [2, '작업자 보호구 착용 상태', '위생복·마스크·장갑·귀마개 착용 상태'],
        [3, '전처리 위험 원료 라벨 표시', '알레르기·중요 유해물질 라벨링'],
        [4, '바닥 미끄럼 방지 상태', '누수·유분 즉시 처리, 미끄럼 방지 매트'],
      ],
      FORMING: [
        [1, '성형기 안전문 인터록 작동', '안전문 열림 시 자동 정지 확인'],
        [2, '금형·다이 예열·냉각 관리', '적정 온도 유지 및 화상 방지 커버'],
        [3, '충전기 노즐·배관 청결', '이물 혼입 방지 상태'],
        [4, '작업대 정리정돈', '공구·부품 미방치, 통로 확보'],
      ],
      OVEN: [
        [1, '오븐 도어 인터록·안전 정지', '도어 열림 시 가열 자동 정지'],
        [2, '가스·전기 누출 감지기 정상', '누출 감지기 표시 정상, 소화기 3m 이내'],
        [3, '내열 장갑·보호구 비치·상태', '내열 장갑 파손·오염 없음'],
        [4, '주변 인화물질 격리', '유지·기름·먼지 축적 없음, 3m 이내 인화물 없음'],
        [5, '고온부 커버·표시 상태', '접촉 위험 부위 커버·경고 표시'],
      ],
      COLD_STORE: [
        [1, '냉동실 비상 탈출 장치 정상', '내부 비상 개방 장치 및 조명 작동'],
        [2, '온도 로그 이상 없음', '자동 기록 로그 정상, 편차 알람 정상'],
        [3, '결로·빙결 낙하 위험 관리', '천장·문틀 결빙 즉시 제거'],
        [4, '방한복·방한 장갑 비치', '개인용 방한 장구 상태 양호'],
      ],
      PACKAGING: [
        [1, '포장기·실링기 인터록 작동', '가동 중 손 진입 시 자동 정지'],
        [2, '컨베이어 안전 커버 정상', '롤러·풀리 커버 이탈 없음'],
        [3, '금속 검출기 정상 가동', '캘리브레이션 로그 정상'],
        [4, '지게차 통로 표시·경적 정상', '전용 통로 라인, 후진 경보 정상'],
      ],
      COMMON: [
        [1, '비상구·유도등 정상', '비상구 앞 적재 없음, 유도등 점등'],
        [2, '소화기·소화전 접근성', '소화기 앞 3m 이내 통로 확보, 압력 정상'],
        [3, '통로 조명·바닥 표시 상태', '조명 300lx 이상, 바닥 라인 유지'],
        [4, '위험물 보관소 잠금·표시', '유해물질 MSDS 비치, 잠금 상태'],
      ],
    };
    for (const area of areas.rows as any[]) {
      const items = inspectionItemsByCode[area.code];
      if (!items) continue;
      const exists = await pool.query(
        `SELECT id FROM safety_check_templates
          WHERE kind='safety' AND frequency='daily' AND target_role='manager' AND area_id = $1
          LIMIT 1`, [area.id]
      );
      if (exists.rowCount && exists.rowCount > 0) continue;
      const tpl = await pool.query(
        `INSERT INTO safety_check_templates (kind, frequency, target_role, area_id, name, sort_order)
         VALUES ('safety', 'daily', 'manager', $1, $2, $3) RETURNING id`,
        [area.id, `${area.name} 일일 순회점검`, 100 + area.id]
      );
      const tplId = tpl.rows[0].id;
      for (const [no, title, detail] of items) {
        await pool.query(
          `INSERT INTO safety_check_items_master (template_id, item_no, item_title, item_detail, requires_photo_on_x, sort_order)
           VALUES ($1, $2, $3, $4, 1, $2)`,
          [tplId, no, title, detail]
        );
      }
    }
    console.log('[safety P2] Seeded areas and daily inspection templates');
  } catch (e: any) {
    console.error('[safety P2] seed failed:', e.message);
  }

  // ── P4 seed — 설문 마스터 2건 + 교육 콘텐츠 3건 ──────────────────
  try {
    // 근골격계 증상 설문 (v2 §3-5)
    const muscForm = {
      version: 'v2',
      description: '지난 1년간 목·어깨·팔/팔꿈치·손/손목·허리·다리/무릎의 통증·불편감 여부와 정도를 조사합니다.',
      body_parts: [
        { key: 'neck', label: '목' },
        { key: 'shoulder', label: '어깨' },
        { key: 'arm', label: '팔·팔꿈치' },
        { key: 'hand', label: '손·손목·손가락' },
        { key: 'back', label: '허리' },
        { key: 'leg', label: '다리·무릎·발' },
      ],
      questions: [
        { key: 'q1', text: '통증·불편감을 느낀 적이 있습니까?', type: 'yesno' },
        { key: 'q2', text: '통증이 얼마나 자주 나타납니까?', type: 'select', choices: ['거의 없음', '한 달에 1회', '한 달에 2-3회', '주 1회 이상', '매일'] },
        { key: 'q3', text: '통증의 심한 정도는?', type: 'select', choices: ['약함', '보통', '심함', '매우 심함'] },
        { key: 'q4', text: '통증이 지난 1주간 계속되었습니까?', type: 'yesno' },
        { key: 'q5', text: '병원 진료·물리치료가 필요하다고 느낍니까?', type: 'yesno' },
      ],
      overall: [
        { key: 'work_hours', text: '하루 평균 작업시간(시간)', type: 'number' },
        { key: 'main_task', text: '주된 작업 내용', type: 'text' },
        { key: 'wants_consult', text: '보건관리자 상담을 원하십니까?', type: 'yesno' },
      ],
    };
    await pool.query(
      `INSERT INTO surveys (kind, title, description, form_json, frequency, active)
       SELECT 'musculoskeletal', '근골격계 증상 설문(반기)', '산업안전보건법 39조 근골격계 부담작업 유해요인 조사', $1::jsonb, 'semi', 1
       WHERE NOT EXISTS (SELECT 1 FROM surveys WHERE kind = 'musculoskeletal')`,
      [JSON.stringify(muscForm)]
    );

    // 안전보건 의견 설문 (v2 §5-4)
    const opinionForm = {
      version: 'v2',
      description: '최근 반기 근무 중 느낀 안전·보건 관련 개선의견을 수집합니다. 관리자에게 공유되며 익명 옵션 사용 가능.',
      questions: [
        { key: 'q1', text: '현재 근무공간의 안전 수준에 만족하십니까?', type: 'select', choices: ['매우 불만족', '불만족', '보통', '만족', '매우 만족'] },
        { key: 'q2', text: '현재 보호구·안전 장비가 충분히 지급·정비되고 있습니까?', type: 'select', choices: ['전혀 아님', '부족함', '보통', '충분함', '매우 충분함'] },
        { key: 'q3', text: '작업 중 스트레스·과중한 업무 부담이 있습니까?', type: 'select', choices: ['전혀 없음', '가끔', '자주', '매일'] },
        { key: 'q4', text: '휴게·복지시설(휴게실·화장실·세면)의 상태는 어떻습니까?', type: 'select', choices: ['매우 나쁨', '나쁨', '보통', '좋음', '매우 좋음'] },
        { key: 'q5', text: '아차사고·위험 상황을 자유롭게 신고할 수 있는 분위기입니까?', type: 'yesno' },
        { key: 'q6', text: '가장 우선적으로 개선했으면 하는 안전보건 이슈는?', type: 'text' },
        { key: 'q7', text: '관리자에게 하고 싶은 말씀', type: 'text' },
      ],
      allow_anonymous: true,
    };
    await pool.query(
      `INSERT INTO surveys (kind, title, description, form_json, frequency, active)
       SELECT 'opinion', '안전보건 의견 설문(반기)', '반기별 근로자 안전보건 의견·건의사항 수렴', $1::jsonb, 'semi', 1
       WHERE NOT EXISTS (SELECT 1 FROM surveys WHERE kind = 'opinion')`,
      [JSON.stringify(opinionForm)]
    );

    // 교육 콘텐츠 3건 — KOSHA 유튜브 placeholder
    const courseSeed = [
      {
        title: '근골격계 부담작업 예방',
        description: '올바른 자세·인력물자취급·스트레칭으로 요통·목 어깨 통증을 예방합니다.',
        video_url: '', // 관리자가 /admin/training-master 에서 실제 KOSHA 공식 유튜브 URL 등록 필요
        duration_min: 25,
        half_year_credit_hours: 1.0,
        category: 'safety',
        sort_order: 10,
        quiz: [
          { question: '중량물 인력취급 시 허리를 굽히기 전에 확인해야 할 사항으로 옳은 것은?', choices: ['체중을 뒤로 두고 양팔로 들어올린다', '무릎을 굽히고 물체를 몸에 밀착시킨다', '한손으로 균형을 잡는다', '아무 자세나 상관없다'], correct_index: 1 },
          { question: '근골격계 부담작업의 대표적 증상이 아닌 것은?', choices: ['목·어깨 통증', '허리 통증', '팔꿈치 저림', '심한 두통'], correct_index: 3 },
          { question: '작업 중 스트레칭은 언제 하는 것이 좋은가?', choices: ['작업 시작 전·중간·끝', '점심시간에만', '통증이 있을 때만', '주말에만'], correct_index: 0 },
        ],
      },
      {
        title: '컨베이어 끼임 예방 + LOTO(잠금·표찰) 절차',
        description: '설비 정비 시 반드시 지켜야 할 잠금·표찰 절차와 컨베이어 안전수칙.',
        video_url: '', // 관리자가 /admin/training-master 에서 실제 KOSHA 공식 유튜브 URL 등록 필요
        duration_min: 20,
        half_year_credit_hours: 0.75,
        category: 'safety',
        sort_order: 20,
        quiz: [
          { question: 'LOTO 절차의 첫 단계는?', choices: ['전원 차단', '작업 지시', '안전화 착용', '휴식'], correct_index: 0 },
          { question: '컨베이어 정비 시 반드시 해야 할 것은?', choices: ['안전커버 제거 후 손 삽입', '전원 차단 및 잠금·표찰', '동료 감시 하 가동', '장갑만 착용'], correct_index: 1 },
          { question: '컨베이어 가동 중 이물 제거 방법으로 옳은 것은?', choices: ['가동 상태로 손으로 제거', '가동 상태로 도구로 제거', '정지 후 잠금·표찰 후 제거', '동료에게 부탁'], correct_index: 2 },
        ],
      },
      {
        title: '화학물질 취급 안전 + MSDS 활용법',
        description: '화학물질 취급 전 MSDS 확인·PPE 착용·응급조치 원칙.',
        video_url: '', // 관리자가 /admin/training-master 에서 실제 KOSHA 공식 유튜브 URL 등록 필요
        duration_min: 20,
        half_year_credit_hours: 0.75,
        category: 'health',
        sort_order: 30,
        quiz: [
          { question: 'MSDS(물질안전보건자료)에 반드시 포함되는 것이 아닌 것은?', choices: ['유해성·위험성 정보', '응급조치 요령', '취급자 개인정보', '보관·취급 방법'], correct_index: 2 },
          { question: '화학물질 취급 시 우선 확인할 사항은?', choices: ['가격', 'MSDS·라벨·PPE', '색깔', '냄새'], correct_index: 1 },
          { question: '화학물질이 피부에 묻었을 때 첫 조치는?', choices: ['수건으로 닦기', '즉시 흐르는 물로 15분 이상 씻기', '연고 바르기', '무시하기'], correct_index: 1 },
        ],
      },
    ];
    for (const c of courseSeed) {
      const exists = await pool.query(`SELECT id FROM training_courses WHERE title = $1 LIMIT 1`, [c.title]);
      if (exists.rowCount && exists.rowCount > 0) continue;
      const ins = await pool.query(
        `INSERT INTO training_courses
           (title, description, video_source_type, video_url, duration_min, half_year_credit_hours,
            target_role, category, active, sort_order)
         VALUES ($1, $2, 'youtube', $3, $4, $5, 'production', $6, 1, $7)
         RETURNING id`,
        [c.title, c.description, c.video_url, c.duration_min, c.half_year_credit_hours, c.category, c.sort_order]
      );
      const cid = ins.rows[0].id;
      let qno = 1;
      for (const q of c.quiz) {
        await pool.query(
          `INSERT INTO training_quiz_items (course_id, question_no, question, choices, correct_index)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [cid, qno++, q.question, JSON.stringify(q.choices), q.correct_index]
        );
      }
    }
    console.log('[safety P4] Seeded surveys and training courses');
  } catch (e: any) {
    console.error('[safety P4] seed failed:', e.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // v2.31.0 — 안전보건관리 시스템 P5
  // ─ risk_assessments / risk_assessment_items / risk_assessment_participants
  //   (산업안전보건법 36조 위험성평가 — 정기·수시·최초, 매트릭스 판정, 근로자 서명)
  // ─ loto_authorizations
  //   (설비 정비 시 잠금·표찰 6단계 절차 — 사진 필수)
  // ─ incidents (산업재해)
  //   (중대재해처벌법 대응 — 자동 판별, 산업재해조사표 제출 카운트다운)
  // ─ safety_committee_minutes
  //   (산업안전보건위원회 — 분기별, 근로자 대표 참여, 의결·보고사항)
  // ═══════════════════════════════════════════════════════════════
  await pool.query(`
    CREATE TABLE IF NOT EXISTS risk_assessments (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'regular',
      title TEXT NOT NULL,
      triggered_by TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      posted_at TIMESTAMPTZ,
      ceo_reported_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_risk_assess_year ON risk_assessments(year);

    CREATE TABLE IF NOT EXISTS risk_assessment_items (
      id SERIAL PRIMARY KEY,
      assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
      process TEXT NOT NULL,
      task TEXT DEFAULT '',
      hazard TEXT NOT NULL,
      freq_score INTEGER NOT NULL,
      intensity_score INTEGER NOT NULL,
      risk_grade TEXT NOT NULL,
      mitigation TEXT DEFAULT '',
      assignee_id INTEGER,
      assignee_name TEXT DEFAULT '',
      due_date TEXT,
      closed_risk_grade TEXT DEFAULT '',
      ticket_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_risk_items_assess ON risk_assessment_items(assessment_id);

    CREATE TABLE IF NOT EXISTS risk_assessment_participants (
      id SERIAL PRIMARY KEY,
      assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
      employee_id INTEGER,
      participant_name TEXT NOT NULL,
      role TEXT DEFAULT 'worker',
      signed_at TIMESTAMPTZ,
      signature_notes TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_risk_part_assess ON risk_assessment_participants(assessment_id);

    CREATE TABLE IF NOT EXISTS loto_authorizations (
      id SERIAL PRIMARY KEY,
      equipment_name TEXT NOT NULL,
      area_id INTEGER,
      work_description TEXT NOT NULL,
      worker_ids TEXT DEFAULT '',
      worker_names TEXT DEFAULT '',
      expected_hours DOUBLE PRECISION DEFAULT 1,
      energy_off_photo_url TEXT DEFAULT '',
      lock_photo_url TEXT DEFAULT '',
      verify_no_energy INTEGER DEFAULT 0,
      release_photo_url TEXT DEFAULT '',
      trial_run_ok INTEGER DEFAULT 0,
      status TEXT DEFAULT 'requested',
      started_at TIMESTAMPTZ,
      released_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_loto_status ON loto_authorizations(status);

    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL,
      area_id INTEGER,
      area_name TEXT DEFAULT '',
      injured_employee_id INTEGER,
      injured_name TEXT DEFAULT '',
      injury_body_part TEXT DEFAULT '',
      injury_severity TEXT DEFAULT '',
      witnesses TEXT DEFAULT '',
      description TEXT DEFAULT '',
      photo_url TEXT DEFAULT '',
      hospital_transfer INTEGER DEFAULT 0,
      first_aid_notes TEXT DEFAULT '',
      is_critical INTEGER DEFAULT 0,
      cause_unsafe_state TEXT DEFAULT '',
      cause_unsafe_action TEXT DEFAULT '',
      cause_managerial TEXT DEFAULT '',
      mitigation TEXT DEFAULT '',
      hospitalization_days INTEGER DEFAULT 0,
      requires_report INTEGER DEFAULT 0,
      report_deadline TEXT,
      report_submitted_at TIMESTAMPTZ,
      report_receipt_url TEXT DEFAULT '',
      status TEXT DEFAULT 'reported',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(occurred_at);

    CREATE TABLE IF NOT EXISTS safety_committee_minutes (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      round_no INTEGER,
      held_at TIMESTAMPTZ NOT NULL,
      location TEXT DEFAULT '',
      agenda_reported TEXT DEFAULT '',
      agenda_decided TEXT DEFAULT '',
      decisions TEXT DEFAULT '',
      worker_rep_input TEXT DEFAULT '',
      participants_employer TEXT DEFAULT '',
      participants_worker TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (year, quarter)
    );
    CREATE INDEX IF NOT EXISTS idx_committee_year ON safety_committee_minutes(year);
  `);

  // ═══════════════════════════════════════════════════════════════
  // v2.32.0 — P6 대표이사 대시보드 + 중처법 반기 이행점검 + 겸직 관리자 시간 결산
  // ─ cdpa_reviews / cdpa_review_items
  //   (중대재해처벌법 시행령 제4조 각 호 — 안전보건확보의무 반기 이행점검)
  // ─ manager_activity_hours
  //   (겸직 안전·보건관리자 활동시간 결산 — 이벤트별 자동 로깅)
  // ═══════════════════════════════════════════════════════════════
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cdpa_reviews (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      half INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      ceo_signed_at TIMESTAMPTZ,
      ceo_signature_name TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      improvement_plan TEXT DEFAULT '',
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (year, half)
    );

    CREATE TABLE IF NOT EXISTS cdpa_review_items (
      id SERIAL PRIMARY KEY,
      review_id INTEGER NOT NULL REFERENCES cdpa_reviews(id) ON DELETE CASCADE,
      item_no INTEGER NOT NULL,
      obligation_name TEXT NOT NULL,
      status TEXT DEFAULT 'not_started',
      evidence_source TEXT DEFAULT '',
      evidence_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      improvement_action TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cdpa_items_review ON cdpa_review_items(review_id);

    CREATE TABLE IF NOT EXISTS manager_activity_hours (
      id SERIAL PRIMARY KEY,
      manager_id INTEGER NOT NULL,
      manager_name TEXT DEFAULT '',
      activity_type TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      source_type TEXT DEFAULT '',
      source_id INTEGER,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mgr_hours_month ON manager_activity_hours(manager_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_mgr_hours_name_month ON manager_activity_hours(manager_name, occurred_at);
  `);

  // 마이그레이션 완료 표시 — 다음 부팅부터 스키마 ALTER 블록 SKIP
  try { await pool.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [SCHEMA_VERSION]); } catch {}

  // 데이터 동기화 마이그레이션 (별도 키 — 스키마 가드와 독립적)
  // employee_offboardings 에는 퇴사 기록이 있는데 regular_employees.resign_date 가 비어있어
  // 급여계산 화면(/payroll-calc)에서 퇴사일이 안 뜨는 케이스 보정.
  // v2: employee_ref_id 매칭 + employee_name fallback 매칭 — 닷·반하이·실비아·카당카당·테오살린·조진윈·모하마드 등.
  try {
    const dataKey = 'data-sync-regular-resign-from-offboardings-v2';
    const dataCheck = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [dataKey]);
    if (!dataCheck.rowCount) {
      // 1단계: employee_ref_id 매칭 (정확)
      const r1 = await pool.query(`
        UPDATE regular_employees re
        SET resign_date = eo.resign_date,
            is_active = 0,
            updated_at = NOW()
        FROM employee_offboardings eo
        WHERE eo.employee_type = 'regular'
          AND eo.employee_ref_id = re.id
          AND eo.status <> 'cancelled'
          AND eo.resign_date IS NOT NULL AND eo.resign_date <> ''
          AND (re.resign_date IS NULL OR re.resign_date = '')
      `);
      console.log(`[data-sync] resign_date backfilled via employee_ref_id: ${r1.rowCount} rows`);

      // 2단계: employee_name fallback 매칭 — employee_ref_id 가 NULL 이거나 employee_type 이 다른 값으로 저장된 케이스
      const r2 = await pool.query(`
        UPDATE regular_employees re
        SET resign_date = sub.resign_date,
            is_active = 0,
            updated_at = NOW()
        FROM (
          SELECT DISTINCT ON (eo.employee_name) eo.employee_name, eo.resign_date
          FROM employee_offboardings eo
          WHERE eo.status <> 'cancelled'
            AND eo.resign_date IS NOT NULL AND eo.resign_date <> ''
            AND eo.employee_name IS NOT NULL AND eo.employee_name <> ''
          ORDER BY eo.employee_name, eo.created_at DESC
        ) sub
        WHERE re.name = sub.employee_name
          AND (re.resign_date IS NULL OR re.resign_date = '')
      `);
      console.log(`[data-sync] resign_date backfilled via employee_name fallback: ${r2.rowCount} rows`);

      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [dataKey]);
    }
  } catch (err: any) {
    console.error('[data-sync] resign_date backfill error (continuing):', err.message);
  }

  // 2026-06-03(제9회 전국동시지방선거) 임시공휴일 backfill.
  // KOREAN_HOLIDAYS 상수에 뒤늦게 추가돼서, 이미 저장된 confirmed_attendance rows 는
  // holiday_work=0 인 상태. dashboard.ts 는 컬럼 직접 사용 → 대시보드 휴일수당 누락됨.
  // (regular payroll 재산정은 isHolidayOrWeekend 로 재분류하므로 자동 보정됨.)
  try {
    const dataKey = 'data-sync-backfill-holiday-2026-06-03-v1';
    const dataCheck = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [dataKey]);
    if (!dataCheck.rowCount) {
      const r = await pool.query(`UPDATE confirmed_attendance SET holiday_work = 1 WHERE date = '2026-06-03' AND (holiday_work IS NULL OR holiday_work = 0)`);
      console.log(`[data-sync] 2026-06-03 holiday_work backfilled: ${r.rowCount} rows`);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [dataKey]);
    }
  } catch (err: any) {
    console.error('[data-sync] 2026-06-03 holiday_work backfill error (continuing):', err.message);
  }

  // v2.30.0 Rick Roll placeholder seed 청소 — workflow subagent 가 넣은 dQw4w9WgXcQ URL 을
  // 빈 값으로 UPDATE. 관리자가 /admin/training-master 에서 실제 KOSHA 공식 URL 을 등록해야 함.
  try {
    const dataKey = 'data-sync-clear-rickroll-training-seed-v1';
    const dataCheck = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [dataKey]);
    if (!dataCheck.rowCount) {
      const r = await pool.query(`UPDATE training_courses SET video_url = '' WHERE video_url LIKE '%dQw4w9WgXcQ%'`);
      console.log(`[data-sync] cleared placeholder training video_url: ${r.rowCount} rows`);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [dataKey]);
    }
  } catch (err: any) {
    console.error('[data-sync] rickroll clear error (continuing):', err.message);
  }

  console.log('Database initialized successfully');
}

export { pool };

// ===== Frontend URL Helpers =====
// 도메인 변경 시 이 한 곳만 수정하면 모든 SMS 링크에 반영됨
const FRONTEND_BASE = process.env.FRONTEND_URL || 'https://aisystem.nuldam.com';

export function getFrontendUrl(path: string = ''): string {
  const base = FRONTEND_BASE.replace(/\/+$/, ''); // trailing slash 제거
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function getSurveyUrl(token: string): string {
  return getFrontendUrl(`/s?token=${token}`);
}

export function getRegularUrl(token: string): string {
  return getFrontendUrl(`/r?token=${token}`);
}

// ===== Phone Number Normalization =====
// 010-1234-5678 → 01012345678 (대시, 공백 제거)
export function normalizePhone(phone: string): string {
  return (phone || '').replace(/[-\s]/g, '').trim();
}

// ===== KST (Korean Standard Time) Helpers =====
export function getKSTDate(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// Returns UTC ISO timestamp. Stored as-is in DB; frontend converts to KST for display.
// Note: Do NOT add +9h here - timestamps are stored in UTC and converted at display time.
export function getKSTTimestamp(): string {
  return new Date().toISOString();
}

// Business day boundary for attendance records.
// Workers clocking in before this hour (KST) are attributed to the previous calendar day,
// so that night shifts (e.g., 21:00 → 06:00) stay as a single business day record.
export const BUSINESS_DAY_START_HOUR = 7;

// Returns the business date string (YYYY-MM-DD) that the given instant belongs to.
// If current KST hour is before BUSINESS_DAY_START_HOUR, returns previous calendar day.
export function getBusinessDate(now?: Date): string {
  const d = now || new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCHours() < BUSINESS_DAY_START_HOUR) {
    kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return kst.toISOString().slice(0, 10);
}

// ===== Korean Public Holidays =====
const KOREAN_HOLIDAYS: Record<number, string[]> = {
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
};

export function isHolidayOrWeekend(dateStr: string): boolean {
  // Calendar date (YYYY-MM-DD) — compute day-of-week independent of system timezone.
  // Without this, Railway (UTC) interprets `new Date('2026-04-06T00:00:00+09:00').getDay()`
  // as 0 (Sunday) because KST midnight is UTC 15:00 of the previous day.
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const [, ys, ms, ds] = m;
  const y = parseInt(ys, 10), mo = parseInt(ms, 10), d = parseInt(ds, 10);
  const utc = new Date(Date.UTC(y, mo - 1, d));
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat, identical regardless of system TZ
  if (dow === 0 || dow === 6) return true; // Weekend
  const holidays = KOREAN_HOLIDAYS[y] || [];
  return holidays.includes(dateStr);
}

export function isKoreanHoliday(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4));
  const holidays = KOREAN_HOLIDAYS[year] || [];
  return holidays.includes(dateStr);
}
