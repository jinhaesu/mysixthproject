// payroll-calc vs confirmed-list-regular 합산 차이 진단
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const HOLIDAYS = {
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
};
function isHolidayOrWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}

async function main() {
  const ym = '2026-04';  // 사용자가 보고 있을 가능성 높은 월
  console.log(`\n=== 분석 대상 월: ${ym} ===\n`);

  // 모든 정규직 confirmed_attendance
  const recs = await pool.query(`
    SELECT employee_name, employee_phone, date, regular_hours, overtime_hours, holiday_work
    FROM confirmed_attendance
    WHERE year_month = $1 AND employee_type = '정규직'
    ORDER BY employee_name, date
  `, [ym]);

  // confirmed-list 페이지 totals 계산 방식
  let listOt = 0, listHoliday = 0;
  const empSet = new Set();
  for (const r of recs.rows) {
    empSet.add(r.employee_name);
    const reg = parseFloat(r.regular_hours) || 0;
    const ot = parseFloat(r.overtime_hours) || 0;
    if (isHolidayOrWeekend(r.date)) listHoliday += reg + ot;
    else listOt += ot;
  }
  console.log(`[근태정보확정 합계 — confirmed_attendance 전체]`);
  console.log(`  연장: ${listOt.toFixed(1)}h, 휴일: ${listHoliday.toFixed(1)}h`);
  console.log(`  대상 직원수: ${empSet.size}명`);

  // payroll-calc는 regular_employees와 매칭되는 직원만
  const monthStart = `${ym}-01`;
  const emps = await pool.query(`
    SELECT name FROM regular_employees
    WHERE is_active = 1 OR (resign_date != '' AND resign_date >= $1)
  `, [monthStart]);
  const empNames = new Set(emps.rows.map(r => r.name));
  console.log(`\n[급여 계산 대상 직원 (regular_employees active or resigned ≥ ${monthStart}): ${empNames.size}명]`);

  let payOt = 0, payHoliday = 0;
  let droppedOt = 0, droppedHoliday = 0;
  const droppedNames = new Map();
  for (const r of recs.rows) {
    const reg = parseFloat(r.regular_hours) || 0;
    const ot = parseFloat(r.overtime_hours) || 0;
    if (empNames.has(r.employee_name)) {
      if (isHolidayOrWeekend(r.date)) payHoliday += reg + ot;
      else payOt += ot;
    } else {
      // dropped from payroll
      const cur = droppedNames.get(r.employee_name) || { ot: 0, hol: 0 };
      if (isHolidayOrWeekend(r.date)) { cur.hol += reg + ot; droppedHoliday += reg + ot; }
      else { cur.ot += ot; droppedOt += ot; }
      droppedNames.set(r.employee_name, cur);
    }
  }
  console.log(`\n[급여 계산 합계 — regular_employees 매칭 직원만]`);
  console.log(`  연장: ${payOt.toFixed(1)}h, 휴일: ${payHoliday.toFixed(1)}h`);

  console.log(`\n[빠진 직원들 — confirmed에 있지만 regular_employees에 없거나 매칭 안되는 이름]`);
  console.log(`  손실 연장: ${droppedOt.toFixed(1)}h, 손실 휴일: ${droppedHoliday.toFixed(1)}h`);
  console.log(`  명단 (${droppedNames.size}명):`);
  for (const [name, v] of [...droppedNames.entries()].sort((a, b) => (b[1].ot + b[1].hol) - (a[1].ot + a[1].hol))) {
    console.log(`    "${name}" — 연장 ${v.ot.toFixed(1)}h, 휴일 ${v.hol.toFixed(1)}h`);
  }

  console.log(`\n[검증]`);
  console.log(`  근태정보확정 연장 (${listOt.toFixed(1)}) = 급여계산 연장 (${payOt.toFixed(1)}) + 빠진 연장 (${droppedOt.toFixed(1)}) ?`);
  console.log(`    ${(payOt + droppedOt).toFixed(1)} → ${Math.abs(listOt - (payOt + droppedOt)) < 0.5 ? 'OK' : 'MISMATCH'}`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
