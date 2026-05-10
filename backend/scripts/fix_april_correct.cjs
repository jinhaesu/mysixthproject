// 4월 기타 전체 정정: 모든 4월 adjustment 를 0 으로 리셋한 후, 정확한 verify_totals_v2 로직 기반으로 재계산해서 적용
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
const norm = p => (p || '').replace(/[-\s]/g, '').trim();

async function main() {
  const yearMonth = '2026-04', monthStart = '2026-04-01', monthEnd = '2026-04-30', daysInMonth = 30;
  const RATE = 10320;
  const floor30 = h => Math.floor(h * 2) / 2;

  // STEP 1: Load v2 expected
  const v2 = JSON.parse(fs.readFileSync('C:/Users/lion9/Downloads/payroll_v2.json', 'utf-8'));
  const v2Rows = v2['급여'];
  const H = {};
  v2Rows[0].forEach((h, i) => H[h] = i);
  const v2Map = new Map();
  for (let i = 1; i < v2Rows.length; i++) {
    const r = v2Rows[i];
    if (!r[0]) continue;
    v2Map.set(r[H['성명']], r[H['지급액']] || 0);
  }
  console.log(`V2: ${v2Map.size} rows`);

  // STEP 2: DELETE all 4월 adjustments to start clean
  const delResult = await pool.query("DELETE FROM regular_payroll_adjustments WHERE year_month = '2026-04'");
  console.log(`Deleted ${delResult.rowCount} existing 4월 adjustments`);

  // STEP 3: Replicate full backend logic (without adjustments now)
  const closed = await pool.query("SELECT 1 FROM payroll_closing WHERE year_month = '2026-04'");
  const payrollClosed = closed.rowCount > 0;

  const allRecords = (await pool.query(`
    SELECT * FROM confirmed_attendance
    WHERE year_month = '2026-04' AND employee_type = '정규직'
    ORDER BY employee_name, date
  `)).rows;

  const empHireRows = (await pool.query(`
    SELECT phone, name, hire_date FROM regular_employees
    WHERE is_active = 1 OR (resign_date != '' AND resign_date >= $1)
  `, [monthStart])).rows;
  const hireMap = new Map();
  for (const r of empHireRows) {
    if (!r.hire_date) continue;
    const np = norm(r.phone);
    if (np) hireMap.set(np, r.hire_date);
    if (r.name) hireMap.set(`name:${r.name}`, r.hire_date);
  }

  const keyFor = rec => norm(rec.employee_phone) || rec.employee_name;
  const empMap = new Map();
  for (const rec of allRecords) {
    const np = norm(rec.employee_phone);
    const empHire = (np && hireMap.get(np)) || hireMap.get(`name:${rec.employee_name}`);
    if (empHire && rec.date < empHire) continue;
    const key = keyFor(rec);
    if (!empMap.has(key)) {
      empMap.set(key, { employee_name: rec.employee_name, employee_phone: rec.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
    }
    const emp = empMap.get(key);
    emp.work_days++;
    const regH = parseFloat(rec.regular_hours) || 0;
    const otH = parseFloat(rec.overtime_hours) || 0;
    const nightH = parseFloat(rec.night_hours) || 0;
    const totalH = regH + otH + nightH;
    if (isHolidayOrWeekend(rec.date)) {
      emp.holiday_days++;
      emp.holiday_hours += totalH;
    } else {
      emp.total_regular += regH;
      emp.total_overtime += otH;
    }
    emp.total_night += nightH;
  }

  const vacations = (await pool.query(`
    SELECT rvr.employee_id, re.name as employee_name, re.phone as employee_phone,
           rvr.start_date, rvr.end_date
    FROM regular_vacation_requests rvr
    JOIN regular_employees re ON rvr.employee_id = re.id
    WHERE rvr.status = 'approved' AND rvr.start_date <= $1 AND rvr.end_date >= $2
  `, [monthEnd, monthStart])).rows;
  for (const vac of vacations) {
    const vacStart = new Date(Math.max(new Date(vac.start_date).getTime(), new Date(monthStart).getTime()));
    const vacEnd = new Date(Math.min(new Date(vac.end_date).getTime(), new Date(monthEnd).getTime()));
    const vacKey = norm(vac.employee_phone) || vac.employee_name;
    for (let d = new Date(vacStart); d <= vacEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      if (isHolidayOrWeekend(dateStr)) continue;
      const alreadyCounted = allRecords.some(r => keyFor(r) === vacKey && r.date === dateStr);
      if (alreadyCounted) continue;
      if (!empMap.has(vacKey)) {
        empMap.set(vacKey, { employee_name: vac.employee_name, employee_phone: vac.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
      }
      const empEntry = empMap.get(vacKey);
      empEntry.total_regular += 8;
      empEntry.work_days++;
    }
  }
  const confirmedWithVacation = Array.from(empMap.values());

  const salaries = (await pool.query(`
    SELECT re.id as employee_id, re.name, re.phone, re.hire_date,
           COALESCE(re.resign_date, '') as resign_date,
           COALESCE(ss.base_pay, 0) as base_pay,
           COALESCE(ss.meal_allowance, 0) as meal_allowance,
           COALESCE(ss.bonus, 0) as bonus,
           COALESCE(ss.position_allowance, 0) as position_allowance,
           COALESCE(ss.other_allowance, 0) as other_allowance
    FROM regular_employees re
    LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
    WHERE re.is_active = 1 OR (re.resign_date != '' AND re.resign_date >= $1)
  `, [monthStart])).rows;

  // Compute system gross WITHOUT adj for each employee, compute needed adj = v2 - sys
  let toApply = [];
  let v2NotInSystem = new Set(v2Map.keys());
  for (const sal of salaries) {
    const salPhone = norm(sal.phone);
    const att = confirmedWithVacation.find(c =>
      (salPhone && norm(c.employee_phone) === salPhone) || c.employee_name === sal.name
    );
    const overtimeHours = att?.total_overtime || 0;
    const holidayHours = att?.holiday_hours || 0;

    const hireDate = sal.hire_date || '';
    const resignDate = sal.resign_date || '';

    let totalScheduledDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${yearMonth}-${String(day).padStart(2, '0')}`;
      if (isHolidayOrWeekend(ds)) continue;
      if (hireDate && ds < hireDate) continue;
      if (resignDate && resignDate >= monthStart && resignDate <= monthEnd && ds > resignDate) continue;
      totalScheduledDays++;
    }
    const weekdayWorkDays = att ? att.work_days - (att.holiday_days || 0) : 0;
    const actualWorkDays = weekdayWorkDays;

    const isFirst = hireDate.startsWith(yearMonth);
    const isResignM = resignDate && resignDate.startsWith(yearMonth);
    const isPartial = isFirst || isResignM;
    const hireDay = isFirst ? parseInt(hireDate.slice(8, 10)) : 1;
    const resignDay = isResignM ? parseInt(resignDate.slice(8, 10)) : daysInMonth;
    const workedCalDays = Math.max(resignDay - hireDay + 1, 0);

    let basePay, mealAllowance;
    if (isPartial) {
      const calRatio = workedCalDays / daysInMonth;
      const workRatio = payrollClosed ? (totalScheduledDays > 0 ? Math.min(actualWorkDays / totalScheduledDays, 1) : 0) : 1;
      const fr = calRatio * workRatio;
      basePay = Math.round(parseFloat(sal.base_pay) * fr);
      mealAllowance = Math.round(parseFloat(sal.meal_allowance) * fr);
    } else if (payrollClosed) {
      const absentDays = Math.max(totalScheduledDays - actualWorkDays, 0);
      const dailyRate = totalScheduledDays > 0 ? parseFloat(sal.base_pay) / totalScheduledDays : 0;
      const mealDailyRate = totalScheduledDays > 0 ? parseFloat(sal.meal_allowance) / totalScheduledDays : 0;
      basePay = Math.round(parseFloat(sal.base_pay) - dailyRate * absentDays);
      mealAllowance = Math.round(parseFloat(sal.meal_allowance) - mealDailyRate * absentDays);
    } else {
      basePay = parseFloat(sal.base_pay);
      mealAllowance = parseFloat(sal.meal_allowance);
    }
    const otPay = Math.round(floor30(overtimeHours) * RATE * 1.5);
    const holPay = Math.round(floor30(holidayHours) * RATE * 1.5);
    const grossNoAdj = basePay + mealAllowance + parseFloat(sal.bonus) + parseFloat(sal.position_allowance) + parseFloat(sal.other_allowance) + otPay + holPay;

    if (v2Map.has(sal.name)) {
      v2NotInSystem.delete(sal.name);
      const v2g = v2Map.get(sal.name);
      const neededAdj = v2g - grossNoAdj;
      if (neededAdj !== 0) {
        toApply.push({ id: sal.employee_id, name: sal.name, adj: neededAdj });
      }
    }
  }
  console.log(`\nApplying ${toApply.length} adjustments...`);
  let applied = 0;
  for (const t of toApply) {
    const r = await pool.query(`
      INSERT INTO regular_payroll_adjustments (employee_id, year_month, amount, memo)
      VALUES ($1, '2026-04', $2, '4월 v2 마감본 정밀 (vacation 포함)')
    `, [t.id, t.adj]);
    applied += r.rowCount;
  }
  console.log(`Applied: ${applied}`);
  console.log(`\nV2 names not found in system: ${v2NotInSystem.size}`);
  for (const n of v2NotInSystem) console.log(`  ${n}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
