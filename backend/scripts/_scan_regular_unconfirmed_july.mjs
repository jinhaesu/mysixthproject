import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 7월 정규직: regular_attendance 있는데 confirmed_attendance 미확정인 인원 ===\n');

  // 정규직 직원별 7월 regular_attendance 카운트 vs confirmed_attendance 카운트 대조
  const rows = await pool.query(`
    WITH ra_july AS (
      SELECT re.id, re.name, re.phone, re.department, re.is_active,
             COUNT(ra.id) as ra_days
      FROM regular_employees re
      JOIN regular_attendance ra ON ra.employee_id = re.id
      WHERE ra.date >= '2026-07-01' AND ra.date <= '2026-07-31'
      GROUP BY re.id, re.name, re.phone, re.department, re.is_active
    ),
    ca_july AS (
      SELECT employee_name, employee_phone, COUNT(*) as ca_days
      FROM confirmed_attendance
      WHERE year_month = '2026-07' AND employee_type = '정규직'
      GROUP BY employee_name, employee_phone
    )
    SELECT ra.id, ra.name, ra.phone, ra.department, ra.is_active, ra.ra_days,
           COALESCE(ca.ca_days, 0) as ca_days
    FROM ra_july ra
    LEFT JOIN ca_july ca ON ca.employee_name = ra.name
      OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
        = REGEXP_REPLACE(COALESCE(ra.phone,''), '[-\\s]', '', 'g')
    WHERE COALESCE(ca.ca_days, 0) < ra.ra_days
    ORDER BY (ra.ra_days - COALESCE(ca.ca_days, 0)) DESC
  `);

  console.log(`미확정 인원 ${rows.rowCount}명:\n`);
  console.log('부서'.padEnd(18) + '이름'.padEnd(10) + 'phone'.padEnd(16) + 'GPS찍음  확정  차이');
  console.log('-'.repeat(70));
  for (const r of rows.rows) {
    const diff = r.ra_days - r.ca_days;
    console.log(
      (r.department || '(없음)').padEnd(18) +
      (r.name || '').padEnd(10) +
      (r.phone || '').padEnd(16) +
      String(r.ra_days).padStart(4) + '건  ' +
      String(r.ca_days).padStart(4) + '건  ' +
      String(diff).padStart(4) + '건'
    );
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
