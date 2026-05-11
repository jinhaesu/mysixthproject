// 현장 정규직 관련 엔드포인트 쿼리 성능 측정
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
});

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`${(Date.now() - t0).toString().padStart(6)}ms  ${label}  (rows: ${r?.rowCount ?? '-'})`);
    return r;
  } catch (e) {
    console.log(`  ERR  ${label}  ${e.message}`);
  }
}

async function main() {
  await pool.query('SELECT 1'); // warm

  console.log('=== 현장 정규직 - 근무자 DB / 설문 출퇴근 핵심 쿼리 ===');

  await timed('regular_employees list',
    () => pool.query(`SELECT * FROM regular_employees WHERE is_active = 1 ORDER BY name LIMIT 200`));

  await timed('regular_employees full join (typical)',
    () => pool.query(`
      SELECT re.*,
        (SELECT MAX(created_at) FROM regular_attendance ra WHERE ra.employee_id = re.id) as last_attendance
      FROM regular_employees re
      WHERE re.is_active = 1
      ORDER BY re.name
      LIMIT 200
    `));

  await timed('regular_attendance month 2026-05',
    () => pool.query(`
      SELECT ra.*, re.name as employee_name, re.department, re.team
      FROM regular_attendance ra
      JOIN regular_employees re ON ra.employee_id = re.id
      WHERE ra.date >= '2026-05-01' AND ra.date <= '2026-05-31'
      ORDER BY ra.date DESC
    `));

  await timed('regular_attendance month 2026-04',
    () => pool.query(`
      SELECT ra.*, re.name as employee_name, re.department, re.team
      FROM regular_attendance ra
      JOIN regular_employees re ON ra.employee_id = re.id
      WHERE ra.date >= '2026-04-01' AND ra.date <= '2026-04-30'
      ORDER BY ra.date DESC
    `));

  // Most likely heavy: per-employee subqueries
  await timed('regular_employees with last attendance per employee',
    () => pool.query(`
      SELECT re.id, re.name, re.department, re.team, re.phone, re.is_active,
        (SELECT date FROM regular_attendance WHERE employee_id = re.id ORDER BY date DESC LIMIT 1) as last_date,
        (SELECT COUNT(*) FROM regular_attendance WHERE employee_id = re.id AND date >= '2026-05-01') as month_count
      FROM regular_employees re
      WHERE re.is_active = 1
      ORDER BY re.name
    `));

  // Contracts join (used in 정규직 근무자 DB likely)
  await timed('regular_labor_contracts join',
    () => pool.query(`
      SELECT re.id, re.name, re.phone,
        (SELECT created_at FROM regular_labor_contracts WHERE employee_id = re.id ORDER BY created_at DESC LIMIT 1) as last_contract
      FROM regular_employees re
      WHERE re.is_active = 1
      ORDER BY re.name
    `));

  console.log('\n=== Row counts ===');
  for (const t of ['regular_employees', 'regular_attendance', 'regular_labor_contracts', 'regular_vacation_requests']) {
    await timed(`COUNT ${t}`, () => pool.query(`SELECT COUNT(*) FROM ${t}`));
  }

  console.log('\n=== Index list (regular tables) ===');
  const idx = await pool.query(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename LIKE 'regular_%'
    ORDER BY tablename, indexname
  `);
  for (const r of idx.rows) console.log(`  ${r.tablename}.${r.indexname}: ${r.indexdef}`);

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
