import { neon, NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction<false, false> | null = null;

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
    }
    _sql = neon(url);
  }
  return _sql;
}

let _migrated = false;

export async function ensureSchema() {
  if (_migrated) return;
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      ai_analysis TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
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
      total_hours REAL DEFAULT 0,
      regular_hours REAL DEFAULT 0,
      overtime_hours REAL DEFAULT 0,
      break_time REAL DEFAULT 0,
      annual_leave TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_records_date ON attendance_records(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_records_name ON attendance_records(name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_records_upload ON attendance_records(upload_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_records_department ON attendance_records(department)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_records_workplace ON attendance_records(workplace)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_records_category ON attendance_records(category)`;

  _migrated = true;
}
