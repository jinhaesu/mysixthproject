import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 긴급: 7월 데이터 존재 확인 ===\n');

  const c = await pool.query(`SELECT COUNT(*) as cnt FROM confirmed_attendance WHERE year_month = '2026-07'`);
  console.log(`confirmed_attendance 2026-07 총 건수: ${c.rows[0].cnt}`);

  const cByType = await pool.query(`SELECT employee_type, COUNT(*) as cnt FROM confirmed_attendance WHERE year_month = '2026-07' GROUP BY employee_type`);
  console.log('타입별:');
  for (const r of cByType.rows) console.log(`  ${r.employee_type}: ${r.cnt}건`);

  const cRecent = await pool.query(`SELECT MAX(confirmed_at) as latest, MIN(confirmed_at) as earliest FROM confirmed_attendance WHERE year_month = '2026-07'`);
  console.log(`\nconfirmed_at range: ${cRecent.rows[0].earliest} ~ ${cRecent.rows[0].latest}`);

  const ep = await pool.query(`SELECT COUNT(*) as cnt FROM employment_periods`);
  console.log(`\nemployment_periods 총: ${ep.rows[0].cnt}`);

  const re = await pool.query(`SELECT COUNT(*) FILTER (WHERE is_active = 1) as active, COUNT(*) FILTER (WHERE is_active = 0) as inactive FROM regular_employees`);
  console.log(`regular_employees: active=${re.rows[0].active} inactive=${re.rows[0].inactive}`);

  // 최근 이 컬럼 변경 흔적 확인
  const recent = await pool.query(`SELECT id, name, updated_at FROM regular_employees ORDER BY updated_at DESC LIMIT 5`);
  console.log('\nregular_employees 최근 update:');
  for (const r of recent.rows) console.log(`  #${r.id} ${r.name} ${r.updated_at}`);

  await pool.end();
}
main().catch(e => { console.error('DB ERROR:', e); process.exit(1); });
