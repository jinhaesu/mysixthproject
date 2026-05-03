import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});

async function main() {
  // 같은 직원·같은 날짜에 여러 records?
  console.log('=== 중복 records (같은 employee_name + date 에 여러 row) ===');
  const dups = await pool.query(`
    SELECT employee_name, date, COUNT(*) as n,
           STRING_AGG(employee_phone, ' / ') as phones,
           STRING_AGG(employee_type, ' / ') as types,
           SUM(regular_hours::numeric) as sum_reg,
           SUM(overtime_hours::numeric) as sum_ot
    FROM confirmed_attendance
    WHERE year_month = '2026-04'
    GROUP BY employee_name, date
    HAVING COUNT(*) > 1
    ORDER BY employee_name, date
  `);
  console.log(`총 중복 케이스: ${dups.rowCount}`);
  for (const r of dups.rows.slice(0, 30)) {
    console.log(`  ${r.employee_name} ${r.date}: n=${r.n} phones=[${r.phones}] types=[${r.types}] reg=${r.sum_reg} ot=${r.sum_ot}`);
  }

  // 같은 phone + date 에 여러 row
  console.log('\n=== phone + date 중복 (이름 다를 수도) ===');
  const dups2 = await pool.query(`
    SELECT employee_phone, date, COUNT(*) as n,
           STRING_AGG(employee_name, ' / ') as names,
           STRING_AGG(employee_type, ' / ') as types,
           SUM(regular_hours::numeric) as sum_reg,
           SUM(overtime_hours::numeric) as sum_ot
    FROM confirmed_attendance
    WHERE year_month = '2026-04' AND employee_phone IS NOT NULL AND employee_phone <> ''
    GROUP BY employee_phone, date
    HAVING COUNT(*) > 1
    ORDER BY employee_phone, date
  `);
  console.log(`총 중복 케이스: ${dups2.rowCount}`);
  for (const r of dups2.rows.slice(0, 30)) {
    console.log(`  phone=${r.employee_phone} ${r.date}: n=${r.n} names=[${r.names}] types=[${r.types}] reg=${r.sum_reg} ot=${r.sum_ot}`);
  }

  // 정규화 후 중복
  console.log('\n=== normalized phone + date 중복 ===');
  const dups3 = await pool.query(`
    SELECT REGEXP_REPLACE(employee_phone, '[-\s]', '', 'g') as np, date, COUNT(*) as n,
           STRING_AGG(employee_name, ' / ') as names,
           STRING_AGG(employee_type, ' / ') as types
    FROM confirmed_attendance
    WHERE year_month = '2026-04' AND employee_phone IS NOT NULL AND employee_phone <> ''
    GROUP BY np, date
    HAVING COUNT(*) > 1
    ORDER BY np, date
    LIMIT 30
  `);
  console.log(`총 중복: ${dups3.rowCount}`);
  for (const r of dups3.rows) {
    console.log(`  np=${r.np} ${r.date}: n=${r.n} names=[${r.names}] types=[${r.types}]`);
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
