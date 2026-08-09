import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 최근 hire_date + 과거 근태 있는 인원 (재입사 후보 넓게) ===\n');
  const rows = await pool.query(`
    SELECT re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date, re.is_active,
           COUNT(ca.id) as ca_days_before_hire,
           MIN(ca.date) as first_prior, MAX(ca.date) as last_prior
    FROM regular_employees re
    LEFT JOIN confirmed_attendance ca
      ON ca.employee_type = '정규직'
         AND ca.date < re.hire_date
         AND (ca.employee_name = re.name
              OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\s]', '', 'g')
                 = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\s]', '', 'g'))
    WHERE re.hire_date >= '2026-07-01'
    GROUP BY re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date, re.is_active
    ORDER BY re.hire_date DESC
  `);
  console.log(`hire >= 7/1 인 정규직: ${rows.rowCount}명 (과거 근태 유무 포함)\n`);
  for (const r of rows.rows) {
    const flag = r.ca_days_before_hire > 0 ? ' ← 재입사 후보' : '';
    console.log(`  #${r.id} ${r.name} ${r.department || '(부서없음)'} hire=${r.hire_date} resign=${r.resign_date || '-'} active=${r.is_active} | 이전근태 ${r.ca_days_before_hire}건${r.first_prior ? ` (${r.first_prior}~${r.last_prior})` : ''}${flag}`);
  }
  await pool.end();
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
