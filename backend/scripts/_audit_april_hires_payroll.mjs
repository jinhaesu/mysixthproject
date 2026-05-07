import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return false;
  const [, ys, ms, ds] = m;
  const utc = new Date(Date.UTC(+ys, +ms - 1, +ds));
  const dow = utc.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[+ys] || []).includes(s);
}
const ym = '2026-04';
const monthStart = `${ym}-01`;
const lastDay = new Date(2026, 4, 0).getDate();
const monthEnd = `${ym}-${String(lastDay).padStart(2, '0')}`;

async function main() {
  const aprilHires = (await pool.query(`SELECT id, name, phone, hire_date FROM regular_employees WHERE hire_date LIKE '2026-04%' AND is_active = 1 ORDER BY hire_date, name`)).rows;
  console.log(`4월 입사자: ${aprilHires.length}명\n`);

  for (const emp of aprilHires) {
    const recs = (await pool.query(`SELECT date, regular_hours, overtime_hours FROM confirmed_attendance WHERE year_month = '2026-04' AND employee_type = '정규직' AND employee_phone = $1 ORDER BY date`, [emp.phone])).rows;

    // payroll-calc 의 actualWorkDays 시뮬
    let workDays = 0, holidayDays = 0, beforeHireRecs = 0;
    for (const r of recs) {
      workDays++;
      if (isHolidayOrWeekend(r.date)) holidayDays++;
      if (r.date < emp.hire_date) beforeHireRecs++;
    }
    const weekdayWork = workDays - holidayDays;

    // totalScheduledDays (입사일 이후 평일만)
    let totalSched = 0;
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${ym}-${String(day).padStart(2,'0')}`;
      if (isHolidayOrWeekend(ds)) continue;
      if (ds < emp.hire_date) continue;
      totalSched++;
    }

    const absent = Math.max(totalSched - weekdayWork, 0);
    const overWork = weekdayWork > totalSched;

    const flag = overWork ? '⚠ 출근>소정' : (beforeHireRecs > 0 ? '⚠ 입사前 records' : '');
    console.log(`#${emp.id} ${emp.name.padEnd(40)} hire=${emp.hire_date}  records ${recs.length} (휴일${holidayDays} 평일${weekdayWork})  소정 ${totalSched}  결근 ${absent}  ${flag}`);
    if (beforeHireRecs > 0) {
      console.log(`    └ 입사일 이전 records: ${beforeHireRecs}건`);
      const earlies = recs.filter(r => r.date < emp.hire_date).map(r => r.date);
      console.log(`      날짜: ${earlies.join(', ')}`);
    }
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
