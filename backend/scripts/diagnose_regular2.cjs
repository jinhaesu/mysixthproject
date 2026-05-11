// 현장 정규직 핵심 쿼리 측정 (Transaction 모드)
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const parsed = new URL(url);
const pool = new Pool({
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  host: parsed.hostname,
  port: parseInt(parsed.port) || 5432,
  database: parsed.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 30_000,
  idleTimeoutMillis: 3_000,
});
async function timed(label, fn) {
  const t0 = Date.now();
  try { const r = await fn(); console.log(`${(Date.now()-t0).toString().padStart(6)}ms  ${label}  (rows: ${r?.rowCount ?? '-'})`); return r; }
  catch (e) { console.log(`  ERR  ${label}  ${e.message}`); }
}
async function main() {
  await pool.query('SELECT 1');
  for (const t of ['regular_employees','regular_attendance','regular_labor_contracts','regular_vacation_requests','workers','labor_contracts','survey_requests','survey_responses','confirmed_attendance']) {
    await timed(`COUNT ${t}`, () => pool.query(`SELECT COUNT(*) FROM ${t}`));
  }
  console.log('---');
  await timed('regular_employees list',
    () => pool.query(`SELECT * FROM regular_employees WHERE is_active = 1 ORDER BY name LIMIT 200`));
  await timed('workers lite',
    () => pool.query(`SELECT id, phone, name_ko, name_en, bank_name, bank_account, id_number, category, department, workplace, COALESCE(hourly_rate, 0) as hourly_rate FROM workers ORDER BY name_ko ASC`));
  await timed('confirmed_list 2026-05',
    () => pool.query(`SELECT * FROM confirmed_attendance WHERE year_month = '2026-05' LIMIT 1000`));
  await timed('survey_requests 2026-05',
    () => pool.query(`SELECT * FROM survey_requests WHERE date >= '2026-05-01' AND date <= '2026-05-31' ORDER BY date DESC LIMIT 500`));
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
