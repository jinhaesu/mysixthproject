import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  const yearMonth = '2026-07';
  const monthStart = '2026-07-01';
  const monthEnd = '2026-07-31';

  console.log('\n=== payroll-calc 새 SQL 테스트 ===\n');

  // 1) employment_periods 조회 테스트
  const ep = await pool.query(`
    SELECT ep.employee_ref_id, ep.period_start, ep.period_end,
           re.name, re.phone
    FROM employment_periods ep
    JOIN regular_employees re ON ep.employee_ref_id = re.id
    WHERE ep.employee_type = 'regular'
    LIMIT 5
  `);
  console.log(`employment_periods sample: ${ep.rowCount}건`);
  for (const r of ep.rows) console.log(`  #${r.employee_ref_id} ${r.name} ${r.period_start}~${r.period_end || '재직중'}`);

  // 2) 새 SQL 실행 (salaries WHERE)
  console.log('\n▶ 새 salaries WHERE 절 테스트');
  try {
    const salaries = await pool.query(`
      SELECT re.id as employee_id, re.name, re.phone, re.department, re.hire_date,
             COALESCE(re.resign_date, '') as resign_date,
             COALESCE(ss.base_pay, 0) as base_pay
      FROM regular_employees re
      LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
      LEFT JOIN regular_payroll_adjustments adj ON re.id = adj.employee_id AND adj.year_month = $1
      WHERE re.is_active = 1
         OR (COALESCE(re.resign_date, '') <> '' AND re.resign_date >= $2)
         OR EXISTS (
           SELECT 1 FROM employment_periods ep
           WHERE ep.employee_type = 'regular' AND ep.employee_ref_id = re.id
             AND ep.period_start <= $3
             AND (ep.period_end IS NULL OR ep.period_end >= $4)
         )
         OR (
           COALESCE(re.resign_date, '') = ''
           AND EXISTS (
             SELECT 1 FROM confirmed_attendance ca
             WHERE ca.year_month = $5
               AND ca.employee_type = '정규직'
               AND (
                 (re.phone IS NOT NULL AND re.phone <> ''
                  AND REGEXP_REPLACE(COALESCE(ca.employee_phone, ''), '[-\\s]', '', 'g')
                    = REGEXP_REPLACE(re.phone, '[-\\s]', '', 'g'))
                 OR ca.employee_name = re.name
               )
           )
         )
    `, [yearMonth, monthStart, monthEnd, monthStart, yearMonth]);
    console.log(`  salaries count: ${salaries.rowCount}`);
    // 티늉 있는지 확인
    const tinung = salaries.rows.find(s => s.name?.includes('티늉'));
    if (tinung) console.log(`  ✓ 티늉 포함: hire=${tinung.hire_date} resign=${tinung.resign_date}`);
    else console.log('  ✗ 티늉 미포함');
  } catch (e) {
    console.error('  ✗ SQL 오류:', e.message);
  }

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
