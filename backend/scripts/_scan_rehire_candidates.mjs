import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 재입사 후보 스캔 ===\n');

  // A) 같은 phone 으로 여러 regular_employees 등록 (퇴사·재등록)
  const dup = await pool.query(`
    SELECT phone, COUNT(*) as cnt, ARRAY_AGG(id ORDER BY id) as ids, ARRAY_AGG(name) as names,
           ARRAY_AGG(hire_date::text ORDER BY id) as hires, ARRAY_AGG(COALESCE(resign_date::text,'')  ORDER BY id) as resigns
    FROM regular_employees
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  console.log(`Case A - 같은 phone 여러 regular_employees 등록: ${dup.rowCount}건`);
  for (const r of dup.rows) {
    console.log(`  phone=${r.phone} × ${r.cnt}: ids=[${r.ids.join(',')}] names=[${r.names.join(',')}] hires=[${r.hires.join(',')}] resigns=[${r.resigns.join(',')}]`);
  }

  // B) confirmed_attendance 에 hire_date 이전 근태가 있는 경우 (재입사 가능성 or hire 잘못)
  const preHire = await pool.query(`
    SELECT re.id, re.name, re.phone, re.hire_date, re.resign_date,
           MIN(ca.date) as first_att, MAX(ca.date) as last_att, COUNT(ca.id) as ca_days
    FROM regular_employees re
    JOIN confirmed_attendance ca
      ON ca.employee_type = '정규직'
         AND (ca.employee_name = re.name
              OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
                 = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g'))
    WHERE re.hire_date IS NOT NULL AND re.hire_date <> ''
    GROUP BY re.id, re.name, re.phone, re.hire_date, re.resign_date
    HAVING MIN(ca.date) < re.hire_date
       AND MIN(ca.date) < (re.hire_date::date - INTERVAL '14 days')::text
    ORDER BY re.id
  `);
  console.log(`\nCase B - hire_date 보다 14일 이상 이전 근태가 존재 (재입사 or hire 오류): ${preHire.rowCount}건`);
  for (const r of preHire.rows) {
    console.log(`  #${r.id} ${r.name} hire=${r.hire_date} resign=${r.resign_date || '-'} | ca range=${r.first_att}~${r.last_att} (${r.ca_days}건)`);
  }

  // C) offboardings 에 여러 번 등장하는 사람
  const multiOff = await pool.query(`
    SELECT employee_ref_id, employee_name, COUNT(*) as cnt,
           ARRAY_AGG(resign_date ORDER BY resign_date) as resign_dates
    FROM employee_offboardings
    WHERE employee_type = 'regular' AND status <> 'cancelled'
    GROUP BY employee_ref_id, employee_name
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `);
  console.log(`\nCase C - offboardings 여러 번 (재입사 후 재퇴사): ${multiOff.rowCount}건`);
  for (const r of multiOff.rows) {
    console.log(`  ${r.employee_name} (ref=${r.employee_ref_id}) × ${r.cnt}회 resigns=[${r.resign_dates.join(',')}]`);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
