// 미확정 캘린더 데이터 진단
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function main() {
  console.log('=== regular_attendance 월별 row 분포 ===');
  const r1 = await pool.query(`
    SELECT TO_CHAR(date::date, 'YYYY-MM') as ym, COUNT(*) cnt
    FROM regular_attendance GROUP BY 1 ORDER BY 1 DESC LIMIT 6
  `);
  for (const r of r1.rows) console.log(`  ${r.ym}: ${r.cnt}건`);

  console.log('\n=== confirmed_attendance 정규직 월별 분포 ===');
  const r2 = await pool.query(`
    SELECT year_month, COUNT(*) cnt FROM confirmed_attendance
    WHERE employee_type = '정규직' GROUP BY year_month ORDER BY year_month DESC LIMIT 6
  `);
  for (const r of r2.rows) console.log(`  ${r.year_month}: ${r.cnt}건`);

  console.log('\n=== 5월 미확정 (regular_attendance 에 있지만 confirmed_attendance 에 없는 row) ===');
  const r3 = await pool.query(`
    SELECT re.name, COUNT(ra.id) as actuals
    FROM regular_employees re
    JOIN regular_attendance ra ON ra.employee_id = re.id
    LEFT JOIN confirmed_attendance ca ON ca.employee_name = re.name AND ca.date = ra.date AND ca.employee_type = '정규직'
    WHERE re.is_active = 1 AND ra.date >= '2026-05-01' AND ra.date <= '2026-05-31' AND ca.id IS NULL
    GROUP BY re.name ORDER BY actuals DESC LIMIT 10
  `);
  for (const r of r3.rows) console.log(`  ${r.name}: ${r.actuals}일 미확정`);
  console.log(`Total: ${r3.rowCount}명`);

  console.log('\n=== regular_shifts (예정 출퇴근 시간) ===');
  const r4 = await pool.query(`SELECT COUNT(*) as cnt FROM regular_shifts WHERE is_active = 1`);
  console.log(`  active shifts: ${r4.rows[0].cnt}`);
  const r5 = await pool.query(`SELECT COUNT(*) as cnt FROM regular_shift_assignments`);
  console.log(`  shift assignments: ${r5.rows[0].cnt}`);

  console.log('\n=== 활성 정규직 직원 ===');
  const r6 = await pool.query(`SELECT id, name, department FROM regular_employees WHERE is_active = 1 LIMIT 5`);
  console.log(`  active total: 약간만`);
  for (const r of r6.rows) console.log(`    ${r.id} ${r.name} (${r.department})`);

  console.log('\n=== attendance-summary 실제 응답 시뮬레이션 (직원당 actuals 수) ===');
  const r7 = await pool.query(`
    SELECT re.id, re.name,
      (SELECT COUNT(*) FROM regular_attendance ra WHERE ra.employee_id = re.id AND ra.date >= '2026-05-01' AND ra.date <= '2026-05-31') as actuals_count
    FROM regular_employees re
    WHERE re.is_active = 1
    ORDER BY actuals_count DESC LIMIT 10
  `);
  for (const r of r7.rows) console.log(`  ${r.name}: ${r.actuals_count} actuals`);

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
