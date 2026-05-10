// 시스템 vs v2 합계 비교 — 어디서 166M 차이 나는지 찾기
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
  // v2 sum
  const v2 = JSON.parse(fs.readFileSync('C:/Users/lion9/Downloads/payroll_v2.json', 'utf-8'));
  const v2Rows = v2['급여'];
  const H = {};
  v2Rows[0].forEach((h, i) => H[h] = i);
  let v2Sum = 0;
  let v2Count = 0;
  const v2Map = new Map();
  for (let i = 1; i < v2Rows.length; i++) {
    const r = v2Rows[i];
    if (!r[0]) continue;
    v2Sum += r[H['지급액']] || 0;
    v2Count++;
    v2Map.set(r[H['성명']], r[H['지급액']]);
  }
  console.log(`V2: count=${v2Count}, sum=${v2Sum.toLocaleString()}`);

  // System sum — query all active regular employees + simulate API
  const yearMonth = '2026-04', monthStart = '2026-04-01', monthEnd = '2026-04-30', daysInMonth = 30;
  const RATE = 10320;
  const floor30 = h => Math.floor(h * 2) / 2;
  const closed = await pool.query("SELECT 1 FROM payroll_closing WHERE year_month = '2026-04'");
  const payrollClosed = closed.rowCount > 0;

  // Match exact backend query
  const employees = await pool.query(`
    SELECT re.id, re.name, re.hire_date, COALESCE(re.resign_date, '') as resign_date,
           COALESCE(ss.base_pay, 0) as base_pay,
           COALESCE(ss.meal_allowance, 0) as meal_allowance,
           COALESCE(ss.bonus, 0) as bonus,
           COALESCE(ss.position_allowance, 0) as position_allowance,
           COALESCE(ss.other_allowance, 0) as other_allowance,
           COALESCE(adj.amount, 0) as adjustment_amount
    FROM regular_employees re
    LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
    LEFT JOIN regular_payroll_adjustments adj ON re.id = adj.employee_id AND adj.year_month = '2026-04'
    WHERE re.is_active = 1 OR (re.resign_date != '' AND re.resign_date >= '2026-04-01')
  `);
  console.log(`System employees in payroll-calc: ${employees.rowCount}`);

  let sysSum = 0;
  let unmatchedV2Names = new Set(v2Map.keys());
  let extraInSystem = 0;
  for (const e of employees.rows) {
    let totalScheduledDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${yearMonth}-${String(d).padStart(2, '0')}`;
      if (isHolidayOrWeekend(ds)) continue;
      if (e.hire_date && ds < e.hire_date) continue;
      if (e.resign_date && e.resign_date >= monthStart && e.resign_date <= monthEnd && ds > e.resign_date) continue;
      totalScheduledDays++;
    }
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

    const isFirst = e.hire_date && e.hire_date.startsWith(yearMonth);
    const isResignM = e.resign_date && e.resign_date.startsWith(yearMonth);
    const isPartial = isFirst || isResignM;
    const hireDay = isFirst ? parseInt(e.hire_date.slice(8, 10)) : 1;
    const resignDay = isResignM ? parseInt(e.resign_date.slice(8, 10)) : daysInMonth;
    const workedCalDays = Math.max(resignDay - hireDay + 1, 0);

    let basePay = parseFloat(e.base_pay);
    let mealAllowance = parseFloat(e.meal_allowance);
    if (isPartial) {
      const calRatio = workedCalDays / daysInMonth;
      const workRatio = payrollClosed ? (totalScheduledDays > 0 ? Math.min(actualWorkDays / totalScheduledDays, 1) : 0) : 1;
      const finalRatio = calRatio * workRatio;
      basePay = Math.round(parseFloat(e.base_pay) * finalRatio);
      mealAllowance = Math.round(parseFloat(e.meal_allowance) * finalRatio);
    } else if (payrollClosed) {
      const absentDays = Math.max(totalScheduledDays - actualWorkDays, 0);
      const dailyRate = totalScheduledDays > 0 ? parseFloat(e.base_pay) / totalScheduledDays : 0;
      const mealDailyRate = totalScheduledDays > 0 ? parseFloat(e.meal_allowance) / totalScheduledDays : 0;
      basePay = Math.round(parseFloat(e.base_pay) - dailyRate * absentDays);
      mealAllowance = Math.round(parseFloat(e.meal_allowance) - mealDailyRate * absentDays);
    }
    const otPay = Math.round(floor30(total_overtime) * RATE * 1.5);
    const holPay = Math.round(floor30(holiday_hours) * RATE * 1.5);
    const adj = parseFloat(e.adjustment_amount) || 0;
    const gross = basePay + mealAllowance + parseFloat(e.bonus) + parseFloat(e.position_allowance) + parseFloat(e.other_allowance) + otPay + holPay + adj;
    sysSum += gross;

    if (v2Map.has(e.name)) {
      unmatchedV2Names.delete(e.name);
    } else {
      extraInSystem++;
      console.log(`  [system EXTRA] ${e.name} → gross=${gross.toLocaleString()}, base=${basePay.toLocaleString()}, adj=${adj.toLocaleString()}`);
    }
  }
  console.log(`\nSystem: count=${employees.rowCount}, sum=${sysSum.toLocaleString()}`);
  console.log(`Diff: ${(sysSum - v2Sum).toLocaleString()}`);
  console.log(`\nIn v2 but not in system (by exact name match): ${unmatchedV2Names.size}`);
  if (unmatchedV2Names.size > 0) {
    for (const n of unmatchedV2Names) console.log(`  ${n} (v2_gross=${v2Map.get(n).toLocaleString()})`);
  }
  console.log(`In system but not in v2 (extra): ${extraInSystem}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
