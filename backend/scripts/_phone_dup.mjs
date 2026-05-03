import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
function norm(p) { return (p || '').replace(/[-\s]/g, '').trim(); }

async function main() {
  // confirmed_attendance: 같은 phone에 여러 employee_name 인 케이스
  const recs = (await pool.query(`SELECT DISTINCT employee_phone, employee_name FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_type = '정규직' ORDER BY employee_phone, employee_name`)).rows;
  const phoneToNames = new Map();
  for (const r of recs) {
    const p = norm(r.employee_phone);
    if (!p) continue;
    if (!phoneToNames.has(p)) phoneToNames.set(p, new Set());
    phoneToNames.get(p).add(r.employee_name);
  }
  console.log(`=== confirmed_attendance: 같은 phone, 여러 이름 ===`);
  let dupCount = 0;
  for (const [p, names] of phoneToNames) {
    if (names.size > 1) {
      console.log(`  phone ${p}: ${[...names].join(' / ')}`);
      dupCount++;
    }
  }
  if (dupCount === 0) console.log('  없음');

  // regular_employees: 같은 phone에 여러 row
  const emps = (await pool.query(`SELECT id, name, phone FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= '2026-04-01') ORDER BY phone`)).rows;
  const phoneToEmps = new Map();
  for (const e of emps) {
    const p = norm(e.phone);
    if (!p) continue;
    if (!phoneToEmps.has(p)) phoneToEmps.set(p, []);
    phoneToEmps.get(p).push(e);
  }
  console.log(`\n=== regular_employees: 같은 phone, 여러 row ===`);
  let dup2 = 0;
  for (const [p, list] of phoneToEmps) {
    if (list.length > 1) {
      console.log(`  phone ${p}: ${list.map(e => `#${e.id}/${e.name}`).join(' / ')}`);
      dup2++;
    }
  }
  if (dup2 === 0) console.log('  없음');

  // 신영순 / 이금실 phone 비교
  console.log(`\n=== 신영순/이금실 phone 비교 ===`);
  const sa = (await pool.query(`SELECT name, phone FROM regular_employees WHERE name IN ('신영순','이금실','니아','한계순','김리나')`)).rows;
  for (const r of sa) console.log(`  ${r.name}: phone=${r.phone}`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
