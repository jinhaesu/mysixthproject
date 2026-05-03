import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
function norm(p) { return (p || '').replace(/[-\s]/g, '').trim(); }

async function main() {
  for (const name of ['신영순', '이금실', '니아', '한계순', '김리나', '카당카당']) {
    const r = (await pool.query(`SELECT DISTINCT employee_phone FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_name = $1`, [name])).rows;
    const e = (await pool.query(`SELECT phone FROM regular_employees WHERE name = $1`, [name])).rows;
    console.log(`${name}:`);
    console.log(`  regular_employees phone: ${e.map(x => x.phone).join(', ') || '(없음)'}`);
    console.log(`  confirmed_attendance phones: ${r.map(x => x.employee_phone).join(', ') || '(없음)'}`);
  }

  // payroll-calc 시뮬: 각 sal에 대해 어떤 confirmed group 매칭되는지 추적
  console.log(`\n=== payroll-calc 매칭 분석 (의심 인원만) ===`);
  const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
  const isHolidayOrWeekend = s => { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); };

  const recs = (await pool.query(`SELECT * FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_type = '정규직'`)).rows;
  const keyFor = r => norm(r.employee_phone) || r.employee_name;
  const empMap = new Map();
  for (const rec of recs) {
    const key = keyFor(rec);
    if (!empMap.has(key)) empMap.set(key, { employee_name: rec.employee_name, employee_phone: rec.employee_phone, total_overtime: 0, holiday_hours: 0, all_names: new Set(), record_count: 0 });
    const e = empMap.get(key);
    e.all_names.add(rec.employee_name);
    e.record_count++;
    const reg = parseFloat(rec.regular_hours)||0, ot = parseFloat(rec.overtime_hours)||0;
    if (isHolidayOrWeekend(rec.date)) e.holiday_hours += reg + ot;
    else e.total_overtime += ot;
  }

  const sals = (await pool.query(`SELECT name, phone FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= '2026-04-01')`)).rows;
  const groupHits = new Map();  // groupKey -> [salNames]
  for (const sal of sals) {
    const salPhone = norm(sal.phone);
    const att = [...empMap.entries()].find(([k, c]) => (salPhone && norm(c.employee_phone) === salPhone) || c.employee_name === sal.name);
    if (att) {
      const [gKey] = att;
      if (!groupHits.has(gKey)) groupHits.set(gKey, []);
      groupHits.get(gKey).push(sal.name);
    }
  }

  // 한 group이 여러 sal에 잡힌 경우 출력
  let dupCount = 0;
  for (const [gKey, salList] of groupHits) {
    if (salList.length > 1) {
      const grp = empMap.get(gKey);
      console.log(`\n!! group key="${gKey}" (이름: ${[...grp.all_names].join('/')}) → ${salList.length}명의 sal에 매칭됨`);
      console.log(`  매칭된 sal 직원: ${salList.join(', ')}`);
      console.log(`  group 시간: 연장 ${grp.total_overtime}h, 휴일 ${grp.holiday_hours}h`);
      console.log(`  → ${salList.length}명 모두 위 시간 부여 → 사용자가 보는 동일 휴일 시간!`);
      dupCount++;
    }
  }
  if (dupCount === 0) console.log('  중복 매칭 없음');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
