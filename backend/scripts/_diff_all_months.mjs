import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); }
function norm(p) { return (p || '').replace(/[-\s]/g, '').trim(); }

async function main() {
  // 모든 year_month 조회
  const months = await pool.query(`SELECT DISTINCT year_month FROM confirmed_attendance WHERE employee_type = '정규직' ORDER BY year_month DESC`);

  for (const m of months.rows) {
    const ym = m.year_month;
    const recs = await pool.query(`SELECT employee_name, employee_phone, date, regular_hours, overtime_hours FROM confirmed_attendance WHERE year_month = $1 AND employee_type = '정규직'`, [ym]);

    // 확정 페이지 합계
    let listOt = 0, listHol = 0;
    for (const r of recs.rows) {
      const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
      if (isHolidayOrWeekend(r.date)) listHol += reg + ot; else listOt += ot;
    }

    // BEFORE-fix payroll-calc (name 매칭만)
    const empRows = await pool.query(`SELECT name, phone FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= $1)`, [`${ym}-01`]);
    const empNames = new Set(empRows.rows.map(r => r.name));
    const empPhones = new Set(empRows.rows.map(r => norm(r.phone)).filter(Boolean));
    let oldOt = 0, oldHol = 0, newOt = 0, newHol = 0;
    for (const r of recs.rows) {
      const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
      const nm = empNames.has(r.employee_name);
      const ph = empPhones.has(norm(r.employee_phone));
      const matchOld = nm;
      const matchNew = ph || nm;
      if (matchOld) {
        if (isHolidayOrWeekend(r.date)) oldHol += reg + ot; else oldOt += ot;
      }
      if (matchNew) {
        if (isHolidayOrWeekend(r.date)) newHol += reg + ot; else newOt += ot;
      }
    }
    console.log(`${ym}  확정[ot=${listOt.toFixed(1)} hol=${listHol.toFixed(1)}]  BEFORE[ot=${oldOt.toFixed(1)} hol=${oldHol.toFixed(1)}]  AFTER[ot=${newOt.toFixed(1)} hol=${newHol.toFixed(1)}]`);
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
