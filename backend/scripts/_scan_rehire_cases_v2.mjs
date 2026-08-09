import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 재입사 가능성 있는 인원 스캔 ===\n');

  // 판별 기준:
  //   (A) hire_date > resign_date (뒤바뀐 케이스 = 재입사 확정)
  //   (B) hire_date > 첫 근태일 (재입사 or 데이터 오류)
  //   (C) hire_date 가 최근 (7월 이후) 인데 이전 근태 있음

  // A) hire > resign (재입사 확정)
  console.log('▶ Case A: hire_date > resign_date (재입사 후 재직중, 이전 퇴사가 resign_date 로 남음)');
  const A = await pool.query(`
    SELECT id, name, phone, department, hire_date, resign_date, is_active
    FROM regular_employees
    WHERE hire_date IS NOT NULL AND hire_date <> ''
      AND resign_date IS NOT NULL AND resign_date <> ''
      AND hire_date > resign_date
    ORDER BY hire_date DESC
  `);
  if (!A.rowCount) console.log('  없음');
  for (const r of A.rows) {
    console.log(`  #${r.id} ${r.name} (${r.phone}) ${r.department} hire=${r.hire_date} resign=${r.resign_date}`);
  }

  // B) hire 가 첫 근태보다 30일 이상 늦음 (재입사 or hire 오류)
  console.log('\n▶ Case B: hire_date 가 첫 근태보다 30일 이상 늦음 (재입사 후 hire 갱신 or hire 잘못 등록)');
  const B = await pool.query(`
    SELECT re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date,
           MIN(ca.date) as first_att, MAX(ca.date) as last_att, COUNT(ca.id) as ca_days
    FROM regular_employees re
    JOIN confirmed_attendance ca
      ON ca.employee_type = '정규직'
         AND (ca.employee_name = re.name
              OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
                 = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g'))
    WHERE re.hire_date IS NOT NULL AND re.hire_date <> ''
    GROUP BY re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date
    HAVING MIN(ca.date) < (re.hire_date::date - INTERVAL '30 days')::text
    ORDER BY re.id
  `);
  if (!B.rowCount) console.log('  없음');
  for (const r of B.rows) {
    console.log(`  #${r.id} ${r.name} hire=${r.hire_date} resign=${r.resign_date || '-'} | 근태 ${r.ca_days}건 range=${r.first_att}~${r.last_att}`);
  }

  // C) offboardings 여러 번 (실질 재입사)
  console.log('\n▶ Case C: offboardings 여러 번 등장 (재입사 후 재퇴사)');
  const C = await pool.query(`
    SELECT employee_ref_id, employee_name, COUNT(*) as cnt,
           ARRAY_AGG(resign_date::text ORDER BY resign_date) as resigns
    FROM employee_offboardings
    WHERE employee_type = 'regular' AND status <> 'cancelled'
    GROUP BY employee_ref_id, employee_name
    HAVING COUNT(*) > 1
  `);
  if (!C.rowCount) console.log('  없음');
  for (const r of C.rows) {
    console.log(`  ${r.employee_name} × ${r.cnt}회 resigns=[${r.resigns.join(',')}]`);
  }

  // D) 이번 월 (2026-08) 신규 hire 중, 같은 phone/이름 으로 과거 근태 있는 사람
  console.log('\n▶ Case D: 최근(2026-07-15 이후) hire_date 신규 등록 중 과거 근태 존재 (재입사 후보)');
  const D = await pool.query(`
    SELECT re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date,
           MIN(ca.date) as first_att, COUNT(ca.id) as ca_days
    FROM regular_employees re
    JOIN confirmed_attendance ca
      ON ca.employee_type = '정규직'
         AND ca.date < re.hire_date
         AND (ca.employee_name = re.name
              OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
                 = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g'))
    WHERE re.hire_date >= '2026-07-15'
    GROUP BY re.id, re.name, re.phone, re.department, re.hire_date, re.resign_date
    ORDER BY re.hire_date DESC
  `);
  if (!D.rowCount) console.log('  없음');
  for (const r of D.rows) {
    console.log(`  #${r.id} ${r.name} ${r.department} 신규hire=${r.hire_date} | 과거 근태 ${r.ca_days}건 첫=${r.first_att}`);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
