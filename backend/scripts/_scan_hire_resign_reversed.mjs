import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 정규직 hire_date/resign_date 이상치 스캔 ===\n');

  // Case A: hire_date > resign_date (뒤바뀜)
  const reversed = await pool.query(`
    SELECT id, name, phone, department, hire_date, resign_date, is_active
    FROM regular_employees
    WHERE hire_date IS NOT NULL AND hire_date <> ''
      AND resign_date IS NOT NULL AND resign_date <> ''
      AND hire_date > resign_date
    ORDER BY id
  `);
  console.log(`Case A - hire_date > resign_date (뒤바뀜): ${reversed.rowCount}명`);
  for (const r of reversed.rows) {
    console.log(`  #${r.id} ${r.name} (${r.phone}) ${r.department} hire=${r.hire_date} resign=${r.resign_date} active=${r.is_active}`);
  }

  // Case B: hire_date 가 미래 (2026-07 이후에 정규직 등록됐는데 미래 hire_date)
  const futureHire = await pool.query(`
    SELECT id, name, phone, department, hire_date, resign_date, is_active
    FROM regular_employees
    WHERE hire_date > '2026-07-31'
    ORDER BY hire_date
  `);
  console.log(`\nCase B - hire_date 가 미래(2026-08-01 이후): ${futureHire.rowCount}명`);
  for (const r of futureHire.rows) {
    console.log(`  #${r.id} ${r.name} hire=${r.hire_date} resign=${r.resign_date || '-'} active=${r.is_active}`);
  }

  // Case C: 7월 근태 있는데 hire_date 가 7월 말 이후 (실질적으로 급여 0원 위험)
  const atRisk = await pool.query(`
    SELECT re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date, re.is_active,
           COUNT(ca.id) as ca_days,
           SUM(COALESCE(ca.regular_hours,0) + COALESCE(ca.overtime_hours,0)) as total_hours
    FROM regular_employees re
    JOIN confirmed_attendance ca
      ON ca.year_month = '2026-07' AND ca.employee_type = '정규직'
         AND (ca.employee_name = re.name
              OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
                 = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g'))
    WHERE re.hire_date > '2026-07-01'
    GROUP BY re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date, re.is_active
    HAVING COUNT(ca.id) > 0
    ORDER BY re.hire_date DESC
  `);
  console.log(`\nCase C - hire_date > 7/1 인데 7월 근태 있음 (급여 0원 위험): ${atRisk.rowCount}명`);
  for (const r of atRisk.rows) {
    const skipCount = r.hire_date > '2026-07-31' ? r.ca_days : '일부';
    console.log(`  #${r.id} ${r.name} ${r.department || '(부서없음)'} hire=${r.hire_date} resign=${r.resign_date || '-'} | 근태 ${r.ca_days}건 (${parseFloat(r.total_hours).toFixed(1)}h) → skip 예상: ${skipCount}건`);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
