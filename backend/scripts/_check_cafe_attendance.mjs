import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 카페팀 데이터 현황 (2026-07) ===\n');

  const req = await pool.query(`
    SELECT sr.department, COUNT(*) as sent,
           SUM(CASE WHEN resp.clock_in_time IS NOT NULL THEN 1 ELSE 0 END) as clocked_in
    FROM survey_requests sr
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    WHERE sr.date >= '2026-07-01' AND sr.date <= '2026-07-31'
      AND sr.department LIKE '카페%'
    GROUP BY sr.department
    ORDER BY sr.department
  `);
  console.log('[survey_requests] 7월 카페 부서별 발송/출근:');
  for (const r of req.rows) console.log(`  ${r.department}: 발송 ${r.sent}건, 출근 ${r.clocked_in}건`);
  if (!req.rowCount) console.log('  (없음)');

  const workers = await pool.query(`
    SELECT resp.worker_name_ko as name, resp.worker_type, sr.phone, sr.department,
           COUNT(*) as records,
           SUM(CASE WHEN resp.clock_in_time IS NOT NULL THEN 1 ELSE 0 END) as clocked_in
    FROM survey_requests sr
    JOIN survey_responses resp ON sr.id = resp.request_id
    WHERE sr.date >= '2026-07-01' AND sr.date <= '2026-07-31'
      AND sr.department LIKE '카페%'
    GROUP BY resp.worker_name_ko, resp.worker_type, sr.phone, sr.department
    ORDER BY sr.department, resp.worker_name_ko
  `);
  console.log('\n[survey_requests] 7월 카페 근무자별:');
  for (const r of workers.rows) {
    console.log(`  ${r.department} · ${r.name || '(이름미상)'} (${r.phone}) type=${r.worker_type || '?'}: ${r.records}건 발송, ${r.clocked_in}건 출근`);
  }
  if (!workers.rowCount) console.log('  (없음)');

  const conf = await pool.query(`
    SELECT employee_type, department, COUNT(*) as records, COUNT(DISTINCT employee_name) as workers
    FROM confirmed_attendance
    WHERE year_month = '2026-07' AND department LIKE '카페%'
    GROUP BY employee_type, department
    ORDER BY employee_type, department
  `);
  console.log('\n[confirmed_attendance] 7월 카페 부서 확정근태:');
  for (const r of conf.rows) console.log(`  ${r.employee_type} · ${r.department}: ${r.records}건, ${r.workers}명`);
  if (!conf.rowCount) console.log('  (없음 → 확정근태에 아직 반영 안 됨)');

  const regs = await pool.query(`
    SELECT id, name, phone, department, is_active,
           COALESCE(resign_date, '') as resign_date
    FROM regular_employees
    WHERE department LIKE '카페%'
    ORDER BY department, name
  `);
  console.log('\n[regular_employees] 카페 부서 정규직 마스터:');
  for (const r of regs.rows) console.log(`  #${r.id} ${r.name} (${r.phone}) ${r.department} active=${r.is_active}${r.resign_date ? ' resign=' + r.resign_date : ''}`);
  if (!regs.rowCount) console.log('  (없음)');

  const wks = await pool.query(`
    SELECT id, name_ko, phone, department, category
    FROM workers
    WHERE department LIKE '카페%' OR category = 'cafe_alba'
    ORDER BY department, name_ko
  `);
  console.log('\n[workers] 카페 관련 마스터 (파견/알바):');
  for (const r of wks.rows) console.log(`  #${r.id} ${r.name_ko} (${r.phone}) dept=${r.department || '(none)'} cat=${r.category || '(none)'}`);
  if (!wks.rowCount) console.log('  (없음)');

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
