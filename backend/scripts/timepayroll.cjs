// payroll-calc 쿼리들 실측
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function T(label, q, ...p) {
  const t = Date.now();
  try { const r = await pool.query(q, p); console.log(`  ${(Date.now()-t).toString().padStart(6)}ms  ${label}  rows=${r.rowCount}`); return r; }
  catch (e) { console.log(`  ${(Date.now()-t).toString().padStart(6)}ms  ${label}  ERR: ${e.message.slice(0,100)}`); }
}
async function main() {
  await pool.query('SELECT 1');
  const ym = '2026-05';
  const ms = '2026-05-01';
  console.log(`=== payroll-calc queries for ${ym} ===`);
  await T('confirmed_attendance', "SELECT * FROM confirmed_attendance WHERE year_month = $1 AND employee_type = '정규직' ORDER BY employee_name, date", ym);
  await T('regular_employees (hire info)', "SELECT phone, name, hire_date FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= $1)", ms);
  await T('salaries join', `
    SELECT re.id as employee_id, re.name, re.phone, re.department, re.team, re.hire_date,
           COALESCE(re.resign_date, '') as resign_date,
           COALESCE(re.bank_name, '') as bank_name,
           COALESCE(re.bank_account, '') as bank_account,
           COALESCE(re.id_number, '') as id_number,
           COALESCE(ss.base_pay, 0) as base_pay
    FROM regular_employees re
    LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
    LEFT JOIN regular_payroll_adjustments adj ON re.id = adj.employee_id AND adj.year_month = $1
    WHERE re.is_active = 1 OR (re.resign_date != '' AND re.resign_date >= $2)
  `, ym, ms);
  await T('payroll_closing', "SELECT * FROM payroll_closing WHERE year_month = $1", ym);
  await T('active loans', "SELECT * FROM employee_loans WHERE status = 'active'");
  await T('approved vacations', `
    SELECT rvr.employee_id, re.name as employee_name, re.phone as employee_phone,
           rvr.start_date, rvr.end_date, rvr.type
    FROM regular_vacation_requests rvr
    JOIN regular_employees re ON rvr.employee_id = re.id
    WHERE rvr.status = 'approved' AND rvr.start_date <= $1 AND rvr.end_date >= $2
  `, '2026-05-31', ms);
  await pool.end();
}
main().catch(e=>{console.error(e); process.exit(1);});
