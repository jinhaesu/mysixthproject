import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); }

async function main() {
  // 신영순 - 사용자: 18/22 결근4 연장17.5 휴일65.0
  // 이금실 - 18/22 결근4 연장17.5 휴일65.0  
  // 김단니 - 19/22 결근3 연장12.5 휴일42
  for (const targetName of ['신영순', '이금실', '김단니']) {
    console.log(`\n========== ${targetName} (사용자 표 기준) ==========`);
    const recs = (await pool.query(`SELECT date, regular_hours, overtime_hours, holiday_work, employee_phone, employee_type FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_name = $1 ORDER BY date`, [targetName])).rows;
    let total_records = recs.length, weekdayReg = 0, weekdayOt = 0, holidayRegOt = 0;
    for (const r of recs) {
      const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
      if (isHolidayOrWeekend(r.date)) holidayRegOt += reg + ot;
      else { weekdayReg += reg; weekdayOt += ot; }
    }
    console.log(`  total ${total_records} records`);
    console.log(`  → 평일 reg ${weekdayReg.toFixed(1)}, 평일 ot ${weekdayOt.toFixed(1)}, 휴일(reg+ot) ${holidayRegOt.toFixed(1)}`);
    console.log(`  사용자가 본 값: 휴일 65.0 — 우리 시뮬 ${holidayRegOt.toFixed(1)}, 차이 ${(65-holidayRegOt).toFixed(1)}`);

    // employee_type 다른 것 (정규직 아닌) 도 확인
    const allTypes = await pool.query(`SELECT DISTINCT employee_type FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_name = $1`, [targetName]);
    console.log(`  존재하는 employee_type: ${allTypes.rows.map(r=>r.employee_type).join(', ')}`);
  }

  // 만약 사용자가 본 65h가 실제 데이터에 있다면 그 인원의 정확한 records 파헤치기
  console.log(`\n========== 신영순 ALL employee_type records ==========`);
  const all = (await pool.query(`SELECT date, regular_hours, overtime_hours, employee_type FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_name = $1 ORDER BY date, employee_type`, ['신영순'])).rows;
  for (const r of all) {
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    const isHol = isHolidayOrWeekend(r.date);
    const dayName = ['일','월','화','수','목','금','토'][new Date(r.date+'T00:00:00+09:00').getDay()];
    console.log(`  ${r.date}(${dayName}) [${r.employee_type}] ${isHol?'휴':'평'} reg=${reg} ot=${ot}`);
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
