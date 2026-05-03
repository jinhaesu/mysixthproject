import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); }

async function main() {
  const ym = '2026-04';
  const recs = (await pool.query(`SELECT date, regular_hours, overtime_hours, holiday_work FROM confirmed_attendance WHERE year_month = $1 AND employee_type = '정규직'`, [ym])).rows;

  let cntCalHol = 0, cntFlagHol = 0, cntBoth = 0, cntFlagOnly = 0, cntCalOnly = 0;
  let hrsCalHol = 0, hrsFlagHol = 0, hrsBoth = 0, hrsFlagOnly = 0;
  let totalReg = 0, totalOt = 0;
  for (const r of recs) {
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    totalReg += reg; totalOt += ot;
    const calHol = isHolidayOrWeekend(r.date);
    const flagHol = r.holiday_work === 1 || r.holiday_work === '1' || r.holiday_work === true;
    if (calHol) { cntCalHol++; hrsCalHol += reg+ot; }
    if (flagHol) { cntFlagHol++; hrsFlagHol += reg+ot; }
    if (calHol && flagHol) { cntBoth++; hrsBoth += reg+ot; }
    if (flagHol && !calHol) { cntFlagOnly++; hrsFlagOnly += reg+ot; }
    if (calHol && !flagHol) cntCalOnly++;
  }
  console.log(`총 records: ${recs.length}`);
  console.log(`전체 regular+overtime: ${(totalReg+totalOt).toFixed(1)}h (regular ${totalReg.toFixed(1)} + overtime ${totalOt.toFixed(1)})`);
  console.log('');
  console.log(`isHolidayOrWeekend(date) 인 records: ${cntCalHol}건, 시간 ${hrsCalHol.toFixed(1)}h`);
  console.log(`holiday_work=1 인 records: ${cntFlagHol}건, 시간 ${hrsFlagHol.toFixed(1)}h`);
  console.log(`둘 다 (날짜 휴일 + flag=1): ${cntBoth}건, 시간 ${hrsBoth.toFixed(1)}h`);
  console.log(`flag만 휴일 (평일이지만 holiday_work=1): ${cntFlagOnly}건, 시간 ${hrsFlagOnly.toFixed(1)}h`);
  console.log(`날짜만 휴일 (휴일/주말이지만 flag=0): ${cntCalOnly}건`);

  console.log('\n현재 backend 로직 (날짜만 봄):');
  let logicCal_ot = 0, logicCal_hol = 0;
  for (const r of recs) {
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    if (isHolidayOrWeekend(r.date)) logicCal_hol += reg+ot;
    else logicCal_ot += ot;
  }
  console.log(`  연장 ${logicCal_ot.toFixed(1)}h, 휴일 ${logicCal_hol.toFixed(1)}h`);

  console.log('\n만약 holiday_work flag도 본다면:');
  let logicFlag_ot = 0, logicFlag_hol = 0;
  for (const r of recs) {
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    const flagHol = r.holiday_work === 1;
    const dateHol = isHolidayOrWeekend(r.date);
    if (dateHol || flagHol) logicFlag_hol += reg+ot;
    else logicFlag_ot += ot;
  }
  console.log(`  연장 ${logicFlag_ot.toFixed(1)}h, 휴일 ${logicFlag_hol.toFixed(1)}h`);

  console.log('\n사용자 보고: 연장 2737, 휴일 3621.5 (합 6358.5)');
  console.log(`확정 로직 (날짜): 연장 ${logicCal_ot.toFixed(1)}, 휴일 ${logicCal_hol.toFixed(1)} (합 ${(logicCal_ot+logicCal_hol).toFixed(1)})`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
