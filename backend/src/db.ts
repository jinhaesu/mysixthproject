import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'attendance.db');

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      ai_analysis TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_records_date ON attendance_records(date);
    CREATE INDEX IF NOT EXISTS idx_records_name ON attendance_records(name);
    CREATE INDEX IF NOT EXISTS idx_records_upload ON attendance_records(upload_id);
    CREATE INDEX IF NOT EXISTS idx_records_department ON attendance_records(department);
    CREATE INDEX IF NOT EXISTS idx_records_workplace ON attendance_records(workplace);
    CREATE INDEX IF NOT EXISTS idx_records_category ON attendance_records(category);
  `);

  // Migration: add new columns for existing databases
  try { db.exec('ALTER TABLE attendance_records ADD COLUMN shift TEXT DEFAULT ""'); } catch {}
  try { db.exec('ALTER TABLE attendance_records ADD COLUMN night_hours REAL DEFAULT 0'); } catch {}

  // Organization chart table
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_chart_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER,
      node_type TEXT NOT NULL DEFAULT 'person',
      name TEXT NOT NULL,
      position TEXT DEFAULT '',
      department TEXT DEFAULT '',
      employment_type TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES org_chart_nodes(id) ON DELETE CASCADE
    );
  `);

  // Workforce planning table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workforce_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      worker_type TEXT NOT NULL,
      planned_count INTEGER DEFAULT 0,
      memo TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    db.exec('CREATE UNIQUE INDEX idx_workforce_plan_unique ON workforce_plans(year, month, day, worker_type)');
  } catch {
    // Index already exists
  }

  // Migration: add planned_hours column (transition from headcount to hours-based)
  try { db.exec('ALTER TABLE workforce_plans ADD COLUMN planned_hours REAL DEFAULT 0'); } catch {}

  // Workforce plan time slots - detailed time block entries
  db.exec(`
    CREATE TABLE IF NOT EXISTS workforce_plan_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      worker_type TEXT NOT NULL,
      start_hour INTEGER NOT NULL,
      duration REAL NOT NULL,
      headcount INTEGER NOT NULL DEFAULT 1,
      memo TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  try {
    db.exec('CREATE INDEX idx_wps_year_month ON workforce_plan_slots(year, month)');
  } catch {
    // Index already exists
  }

  // Survey workplaces - designated GPS locations
  db.exec(`
    CREATE TABLE IF NOT EXISTS survey_workplaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 200,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Survey requests - sent to workers via SMS/KakaoTalk
  db.exec(`
    CREATE TABLE IF NOT EXISTS survey_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      workplace_id INTEGER,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      message_type TEXT DEFAULT 'sms',
      message_id TEXT DEFAULT '',
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workplace_id) REFERENCES survey_workplaces(id)
    );
  `);
  try { db.exec('CREATE INDEX idx_survey_requests_token ON survey_requests(token)'); } catch {}
  try { db.exec('CREATE INDEX idx_survey_requests_phone ON survey_requests(phone)'); } catch {}
  try { db.exec('CREATE INDEX idx_survey_requests_date ON survey_requests(date)'); } catch {}

  // Survey responses - worker-submitted clock-in/out and personal info
  db.exec(`
    CREATE TABLE IF NOT EXISTS survey_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      clock_in_time TEXT,
      clock_in_lat REAL,
      clock_in_lng REAL,
      clock_in_gps_valid INTEGER DEFAULT 0,
      clock_out_time TEXT,
      clock_out_lat REAL,
      clock_out_lng REAL,
      clock_out_gps_valid INTEGER DEFAULT 0,
      worker_name_ko TEXT DEFAULT '',
      worker_name_en TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      id_number TEXT DEFAULT '',
      emergency_contact TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES survey_requests(id) ON DELETE CASCADE
    );
  `);
  try { db.exec('CREATE INDEX idx_survey_responses_request ON survey_responses(request_id)'); } catch {}

  console.log('Database initialized successfully');
}

export default db;
