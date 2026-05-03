import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); }

async function main() {
  // 김리나 - 사용자 데이터: 18/22, 연장 32.5, 휴일 42.0
  // 다르백 - 22/22, 연장 35.5, 휴일 46.0 (가장 휴일 많은 사람 중)
  // 한계순 - 18/22, 연장 15.0, 휴일 62.5
  for (const targetName of ['김리나', '다르백', '한계순', 'NGUYEN THI HUYEN 휴엔 E-9', '진해수']) {
    console.log(`\n========== ${targetName} ==========`);
    const recs = (await pool.query(`SELECT date, regular_hours, overtime_hours, night_hours, holiday_work, employee_phone FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_type = '정규직' AND employee_name = $1 ORDER BY date`, [targetName])).rows;
    if (recs.length === 0) { console.log('  records 없음'); continue; }
    let weekdayReg = 0, weekdayOt = 0, holidayRegOt = 0;
    for (const r of recs) {
      const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
      const isHol = isHolidayOrWeekend(r.date);
      if (isHol) holidayRegOt += reg + ot;
      else { weekdayReg += reg; weekdayOt += ot; }
      const dayName = ['일','월','화','수','목','금','토'][new Date(r.date+'T00:00:00+09:00').getDay()];
      console.log(`  ${r.date}(${dayName}) ${isHol?'[휴일]':'[평일]'} reg=${reg} ot=${ot} flag=${r.holiday_work}`);
    }
    console.log(`  → 평일 reg ${weekdayReg.toFixed(1)}, 평일 ot ${weekdayOt.toFixed(1)}, 휴일(reg+ot) ${holidayRegOt.toFixed(1)}`);
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
