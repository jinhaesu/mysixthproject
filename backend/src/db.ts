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

  // Pool 옵션 강화 — 무거운 query hang 시 다른 요청들이 connection 못 받아 모든 메뉴가 멈추는 것 방지.
  // statement_timeout: PostgreSQL 서버 측에서 30초 초과 query 자동 cancel (가장 강력한 방어).
  // query_timeout: node-pg 클라이언트 측 timeout (네트워크/응답 지연 방어).
  // connectionTimeoutMillis: Pool에서 connection 받지 못하면 10초 후 throw (영원히 대기 방지).
  // idleTimeoutMillis: 30초간 idle 한 connection 회수.
  // max: 20 — 동시 connection 한계 (default 10에서 상향).
  const baseOpts = {
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    statement_timeout: 30_000,
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
  try { await pool.query('CREATE INDEX IF NOT EXISTS idx_offboarding_resignation_token ON employee_offboardings(resignation_letter_token)'); } catch {}

  // Legacy contract scan attachments (regular + dispatch)
  try { await pool.query('ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS is_legacy_scan INTEGER DEFAULT 0'); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS legacy_filename TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS scanned_file_data TEXT DEFAULT ''"); } catch {}
  try { await pool.query('ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS is_legacy_scan INTEGER DEFAULT 0'); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS legacy_filename TEXT DEFAULT ''"); } catch {}
  try { await pool.query("ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS scanned_file_data TEXT DEFAULT ''"); } catch {}

  // ===== One-time data backfill — 2026-04 마감본(v2 엑셀) 기준 기타(±조정) 적용 =====
  // 사용자 요청: 4월 v2 엑셀(실제 지급된 마감본) 기준으로 시스템 지급액을 일치시킴.
  // schema_migrations 로 idempotent 보장 — 두 번째 부팅부터는 스킵.
  // 이미 사용자가 UI 로 다른 값으로 변경한 row 는 ON CONFLICT DO NOTHING 으로 보존.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const MIGRATION_ID = 'payroll-2026-04-v2-backfill';
    const check = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [MIGRATION_ID]);
    if (check.rowCount === 0) {
      // 4월 v2 엑셀에서 발견된 4건의 수동 조정 (bonus/other_allowance 의 비표준 값)
      // 시스템 base+meal+ot+hol 산출값과 v2 지급액의 차이를 '기타(±조정)' 으로 등록.
      const TARGETS: Array<[string, number, string]> = [
        ['%NGUYEN HONG PHONG%', -455320, '4월 마감본 기준 (bonus -655,320 + other +200,000)'],
        ['%TOMI AGUS%',          701760, '4월 마감본 기준 (other +701,760)'],
        ['%BOONKET%',           -500000, '4월 마감본 기준 (other -500,000)'],
        ['%ARID HAMZAH%',       -500000, '4월 마감본 기준 (other -500,000)'],
      ];
      let inserted = 0;
      for (const [pattern, amount, memo] of TARGETS) {
        const r = await pool.query(`
          INSERT INTO regular_payroll_adjustments (employee_id, year_month, amount, memo)
          SELECT id, '2026-04', $2, $3
          FROM regular_employees
          WHERE name ILIKE $1
          ON CONFLICT (employee_id, year_month) DO NOTHING
        `, [pattern, amount, memo]);
        inserted += r.rowCount || 0;
      }
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [MIGRATION_ID]);
      console.log(`Applied one-time payroll backfill for 2026-04: ${inserted} adjustments inserted`);
    }
  } catch (err) {
    console.error('Payroll 2026-04 backfill error:', err);
  }

  // ===== 2026-04 v2 마감본 보정 backfill — 공백 문제 등으로 매칭 실패한 2건 재시도 =====
  try {
    const MIGRATION_ID_V2_FIX = 'payroll-2026-04-v2-backfill-fix';
    const checkFix = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [MIGRATION_ID_V2_FIX]);
    if (checkFix.rowCount === 0) {
      // 21개 전체를 다시 ILIKE 매칭. ON CONFLICT DO NOTHING 이라 이미 적용된 entry 는 보존.
      // 각 패턴의 매칭 결과 로그 → 어떤 게 누락됐는지 식별.
      const FIX_TARGETS: Array<{ patterns: string[]; amount: number; label: string }> = [
        { patterns: ['%NGUYEN HONG PHONG%'],          amount: -331480,  label: 'NGUYEN HONG PHONG' },
        { patterns: ['%KYAW ZIN WIN%', '%조진윈%'],   amount: 1274520,  label: 'KYAW ZIN WIN' },
        { patterns: ['%TO NO %', '%TO NO%', '%토노%'], amount: 1274520, label: 'TO NO' },
        { patterns: ['%NGUYENTHEQUAN%', '%THEQUAN%'], amount: 51840,   label: 'NGUYENTHEQUAN' },
        { patterns: ['%김종성%'],                      amount: 1266443, label: '김종성' },
        { patterns: ['%박상천%'],                      amount: 270000,  label: '박상천' },
        { patterns: ['%실비아%'],                      amount: 722400,  label: '실비아' },
        { patterns: ['%YE YINT AUNG%', '%예인엉%'],    amount: 1150680, label: 'YE YINT AUNG' },
        { patterns: ['%MASROA%', '%마쓰로이%'],        amount: 1166160, label: 'MASROA' },
        { patterns: ['%KHAN SAJIAD%', '%사자드%'],     amount: 758520,  label: 'KHAN SAJIAD' },
        { patterns: ['%TOMI AGUS%'],                   amount: 1620240, label: 'TOMI AGUS' },
        { patterns: ['%MUKOKO%'],                      amount: 910740,  label: 'MUKOKO' },
        { patterns: ['%HARYANTO%'],                    amount: 1166160, label: 'HARYANTO' },
        { patterns: ['%HIDAYAT DIAN%', '%디안%'],      amount: 1032000, label: 'HIDAYAT DIAN' },
        { patterns: ['%TRAN VAN TAN%', '%반단%'],      amount: 1274520, label: 'TRAN VAN TAN' },
        { patterns: ['%KARTINI%', '%파우즈%'],         amount: 448920,  label: 'KARTINI' },
        { patterns: ['%PUTRA RISKO%', '%리스코%'],     amount: 448920,  label: 'PUTRA RISKO' },
        { patterns: ['%SETIAWAN MOHAMMAD%', '%모하마드%'], amount: 121260, label: 'SETIAWAN MOHAMMAD' },
        { patterns: ['%LUU VAN DAT%'],                 amount: 352080,  label: 'LUU VAN DAT' },
        { patterns: ['%TRUONG VAN HAI%', '%반하이%'],  amount: 448920,  label: 'TRUONG VAN HAI' },
        { patterns: ['%ARIS SETYAWAN%', '%아리스%'],   amount: 686280,  label: 'ARIS SETYAWAN' },
      ];
      const unmatched: string[] = [];
      const inserted: string[] = [];
      for (const t of FIX_TARGETS) {
        let matched = false;
        for (const p of t.patterns) {
          const r = await pool.query(`
            INSERT INTO regular_payroll_adjustments (employee_id, year_month, amount, memo)
            SELECT id, '2026-04', $2, '4월 v2 마감본 종합 (보정)'
            FROM regular_employees
            WHERE name ILIKE $1
            ON CONFLICT (employee_id, year_month) DO NOTHING
          `, [p, t.amount]);
          if (r.rowCount && r.rowCount > 0) {
            inserted.push(`${t.label}(${p})`);
            matched = true;
            break;
          }
        }
        if (!matched) {
          // 이미 backfill 됐는지 확인 (UPDATE 케이스 인지)
          const exists = await pool.query(`
            SELECT 1 FROM regular_payroll_adjustments rpa
            JOIN regular_employees re ON rpa.employee_id = re.id
            WHERE rpa.year_month = '2026-04' AND (${t.patterns.map((_, i) => `re.name ILIKE $${i + 1}`).join(' OR ')})
          `, t.patterns);
          if (exists.rowCount && exists.rowCount > 0) {
            // 기존 등록된 것 — OK (이미 처리됨)
          } else {
            unmatched.push(t.label);
          }
        }
      }
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [MIGRATION_ID_V2_FIX]);
      console.log(`v2 backfill fix: inserted=${inserted.length}, unmatched=${unmatched.length}`);
      if (unmatched.length > 0) console.log(`  Unmatched names: ${unmatched.join(', ')}`);
    }
  } catch (err) {
    console.error('Payroll v2 backfill fix error:', err);
  }

  // ===== 2026-04 v2 마감본 종합 backfill (rate 10320 기준 차이 흡수) =====
  // v2 의 휴일수당/연장수당이 hol_h × rate × 1.5 와 무관한 수동 fixed amount 인 경우 다수.
  // (예: 야간 근무자 주말 출근 보너스 fixed 1,274,520 등) — 시스템 frontend(rate=10320) 기준
  // 지급액과 v2 지급액 차이를 기타(±조정) 으로 일괄 적용.
  // 기존 4월 backfill 적용된 row(메모 '4월%') 은 새 amount 로 UPDATE, 그 외는 INSERT.
  // 사용자가 UI 에서 수동 변경한 row(메모 다름) 는 보존.
  try {
    const MIGRATION_ID_V2 = 'payroll-2026-04-v2-comprehensive-backfill';
    const check2 = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [MIGRATION_ID_V2]);
    if (check2.rowCount === 0) {
      const TARGETS_V2: Array<[string, number]> = [
        ['%NGUYEN HONG PHONG%',     -331480],
        ['%KYAW ZIN WIN%',         1274520],
        ['% TO NO %',              1274520],
        ['%NGUYENTHEQUAN%',          51840],
        ['%김종성%',               1266443],
        ['%박상천%',                270000],
        ['%실비아%',                722400],
        ['%YE YINT AUNG%',         1150680],
        ['%MASROA%',               1166160],
        ['%KHAN SAJIAD%',           758520],
        ['%TOMI AGUS%',            1620240],
        ['%MUKOKO GRAP FATAKI%',    910740],
        ['%HARYANTO DARMAWANTRI%', 1166160],
        ['%HIDAYAT DIAN%',         1032000],
        ['%TRAN VAN TAN%',         1274520],
        ['%KARTINI FIKRI FAUZI%',   448920],
        ['%PUTRA RISKO%',           448920],
        ['%SETIAWAN MOHAMMAD%',     121260],
        ['%LUU VAN DAT%',           352080],
        ['%TRUONG VAN HAI%',        448920],
        ['%ARIS SETYAWAN%',         686280],
      ];
      let processed = 0;
      for (const [pattern, amount] of TARGETS_V2) {
        const r = await pool.query(`
          INSERT INTO regular_payroll_adjustments (employee_id, year_month, amount, memo)
          SELECT id, '2026-04', $2, '4월 v2 마감본 종합 (자동 매칭)'
          FROM regular_employees
          WHERE name ILIKE $1
          ON CONFLICT (employee_id, year_month)
          DO UPDATE SET amount = EXCLUDED.amount, memo = EXCLUDED.memo, updated_at = NOW()
          WHERE regular_payroll_adjustments.memo LIKE '4월%'
        `, [pattern, amount]);
        if (r.rowCount && r.rowCount > 0) processed++;
      }
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [MIGRATION_ID_V2]);
      console.log(`Applied v2 comprehensive backfill for 2026-04: ${processed}/${TARGETS_V2.length} patterns matched`);
    }
  } catch (err) {
    console.error('Payroll v2 comprehensive backfill error:', err);
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
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
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
