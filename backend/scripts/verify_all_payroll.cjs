// 전체 v2 vs 시스템 비교 — 119명 모두 검증
const { Pool } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL;
const parsed = new URL(url);
const pool = new Pool({
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  host: parsed.hostname,
  port: parseInt(parsed.port) || 5432,
  database: parsed.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
});

const KOREAN_HOLIDAYS_2026 = ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'];
function isHolidayOrWeekend(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const utc = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3])));
  const dow = utc.getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return KOREAN_HOLIDAYS_2026.includes(dateStr);
}

async function main() {
  // Load v2 data
  const v2 = JSON.parse(fs.readFileSync('C:/Users/lion9/Downloads/payroll_v2.json', 'utf-8'));
  const rows = v2['급여'];
  const H = {};
  rows[0].forEach((h, i) => H[h] = i);

  const closed = await pool.query("SELECT 1 FROM payroll_closing WHERE year_month = '2026-04'");
  const payrollClosed = closed.rowCount > 0;
  const RATE = 10320;
  const floor30 = h => Math.floor(h * 2) / 2;
  const yearMonth = '2026-04', monthStart = '2026-04-01', monthEnd = '2026-04-30', daysInMonth = 30;

  const diffs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const v2_name = r[H['성명']];
    const v2_gross = r[H['지급액']] || 0;

    // Find DB employee by name (exact then ILIKE fallback)
    let empRes = await pool.query(`SELECT * FROM regular_employees WHERE name = $1`, [v2_name]);
    if (empRes.rowCount === 0) {
      // Try simplified pattern
      const distinctive = v2_name.split(/[\s(]/)[0];
      empRes = await pool.query(`SELECT * FROM regular_employees WHERE name ILIKE $1 LIMIT 1`, [`%${distinctive}%`]);
    }
    if (empRes.rowCount === 0) {
      diffs.push({ name: v2_name, v2_gross, status: 'NO_DB_MATCH' });
      continue;
    }
    const e = empRes.rows[0];

    const ssRes = await pool.query(`SELECT * FROM regular_salary_settings WHERE employee_id = $1`, [e.id]);
    const ss = ssRes.rows[0] || {};
    const adjRes = await pool.query(`SELECT amount FROM regular_payroll_adjustments WHERE employee_id = $1 AND year_month = '2026-04'`, [e.id]);
    const adj = adjRes.rows[0] ? parseFloat(adjRes.rows[0].amount) : 0;

    // Compute scheduled days
    const hireDate = e.hire_date || '';
    const resignDate = e.resign_date || '';
    let totalScheduledDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${yearMonth}-${String(d).padStart(2, '0')}`;
      if (isHolidayOrWeekend(ds)) continue;
      if (hireDate && ds < hireDate) continue;
      if (resignDate && resignDate >= monthStart && resignDate <= monthEnd && ds > resignDate) continue;
      totalScheduledDays++;
    }

    // Attendance
    const recs = await pool.query(`
      SELECT date, regular_hours::numeric as regular_hours, overtime_hours::numeric as overtime_hours, night_hours::numeric as night_hours
      FROM confirmed_attendance
      WHERE employee_name = $1 AND year_month = '2026-04' AND employee_type = '정규직'
    `, [e.name]);
    let work_days = 0, holiday_days = 0, total_overtime = 0, holiday_hours = 0;
    for (const rec of recs.rows) {
      work_days++;
      const regH = parseFloat(rec.regular_hours) || 0;
      const otH = parseFloat(rec.overtime_hours) || 0;
      const nightH = parseFloat(rec.night_hours) || 0;
      const totalH = regH + otH + nightH;
      if (isHolidayOrWeekend(rec.date)) {
        holiday_days++;
        holiday_hours += totalH;
      } else {
        total_overtime += otH;
      }
    }
    const actualWorkDays = work_days - holiday_days;

    // Prorate
    const isFirstMonth = hireDate.startsWith(yearMonth);
    const isResignMonth = resignDate && resignDate.startsWith(yearMonth);
    const isPartial = isFirstMonth || isResignMonth;
    const hireDay = isFirstMonth ? parseInt(hireDate.slice(8, 10)) : 1;
    const resignDay = isResignMonth ? parseInt(resignDate.slice(8, 10)) : daysInMonth;
    const workedCalDays = Math.max(resignDay - hireDay + 1, 0);

    let basePay = parseFloat(ss.base_pay || 0);
    let mealAllowance = parseFloat(ss.meal_allowance || 0);
    if (isPartial) {
      const calRatio = workedCalDays / daysInMonth;
      const workRatio = payrollClosed ? (totalScheduledDays > 0 ? Math.min(actualWorkDays / totalScheduledDays, 1) : 0) : 1;
      const finalRatio = calRatio * workRatio;
      basePay = Math.round(parseFloat(ss.base_pay || 0) * finalRatio);
      mealAllowance = Math.round(parseFloat(ss.meal_allowance || 0) * finalRatio);
    } else if (payrollClosed) {
      const absentDays = Math.max(totalScheduledDays - actualWorkDays, 0);
      const dailyRate = totalScheduledDays > 0 ? parseFloat(ss.base_pay || 0) / totalScheduledDays : 0;
      const mealDailyRate = totalScheduledDays > 0 ? parseFloat(ss.meal_allowance || 0) / totalScheduledDays : 0;
      basePay = Math.round(parseFloat(ss.base_pay || 0) - dailyRate * absentDays);
      mealAllowance = Math.round(parseFloat(ss.meal_allowance || 0) - mealDailyRate * absentDays);
    }

    const otPay = Math.round(floor30(total_overtime) * RATE * 1.5);
    const holPay = Math.round(floor30(holiday_hours) * RATE * 1.5);
    const front_gross = basePay + mealAllowance + parseFloat(ss.bonus || 0) + parseFloat(ss.position_allowance || 0) + parseFloat(ss.other_allowance || 0) + otPay + holPay + adj;
    const target_diff = v2_gross - front_gross;

    if (Math.abs(target_diff) > 1) {
      diffs.push({ id: e.id, name: e.name, v2_gross, front_gross, diff: target_diff, current_adj: adj, correct_adj: adj + target_diff });
    }
  }

  console.log(`Checked ${rows.length - 1} v2 rows`);
  console.log(`Diffs found: ${diffs.length}`);
  for (const d of diffs) {
    if (d.status === 'NO_DB_MATCH') {
      console.log(`  [NO_DB_MATCH] ${d.name} (v2_gross=${d.v2_gross})`);
    } else {
      console.log(`  [DIFF] id=${d.id} ${d.name}: v2=${d.v2_gross} sys=${d.front_gross} diff=${d.diff} → correct_adj=${d.correct_adj}`);
    }
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
