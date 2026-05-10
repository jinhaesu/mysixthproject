// 풀 prorate 로직 + API hour 분할 적용한 정밀 진단
const { Pool } = require('pg');

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

const V2_GROSS = {
  119: 2068520, 88: 3434520, 90: 3434520, 183: 123840, 4: 5842303,
  76: 3870000, 84: 2686036, 86: 3310680, 73: 3326160, 129: 2918520,
  91: 3827120, 75: 3070740, 93: 3326160, 138: 3093818, 78: 3434520,
  173: 1802160, 168: 1802160, 182: 1068060, 180: 1144080, 181: 1240920,
  145: 1838280, 126: 2413040, 113: 2095700,
};

async function main() {
  const closed = await pool.query("SELECT 1 FROM payroll_closing WHERE year_month = '2026-04'");
  const payrollClosed = closed.rowCount > 0;
  console.log(`payrollClosed=${payrollClosed}`);

  const yearMonth = '2026-04';
  const monthStart = '2026-04-01';
  const monthEnd = '2026-04-30';
  const daysInMonth = 30;
  const RATE = 10320;
  const floor30 = h => Math.floor(h * 2) / 2;

  const ids = Object.keys(V2_GROSS).sort((a,b)=>parseInt(a)-parseInt(b));
  for (const id of ids) {
    const v2_gross = V2_GROSS[id];
    const empRow = await pool.query(`
      SELECT re.id, re.name, re.hire_date, COALESCE(re.resign_date, '') as resign_date,
             COALESCE(ss.base_pay, 0) as base_pay,
             COALESCE(ss.meal_allowance, 0) as meal,
             COALESCE(ss.bonus, 0) as bonus,
             COALESCE(ss.position_allowance, 0) as pos,
             COALESCE(ss.other_allowance, 0) as other,
             (SELECT amount FROM regular_payroll_adjustments WHERE employee_id = re.id AND year_month = '2026-04') as adj
      FROM regular_employees re
      LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
      WHERE re.id = $1
    `, [id]);
    if (empRow.rowCount === 0) continue;
    const e = empRow.rows[0];
    const hireDate = e.hire_date || '';
    const resignDate = e.resign_date || '';

    // Compute totalScheduledDays and actualWorkDays
    let totalScheduledDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
      if (isHolidayOrWeekend(dateStr)) continue;
      if (hireDate && dateStr < hireDate) continue;
      if (resignDate && resignDate >= monthStart && resignDate <= monthEnd && dateStr > resignDate) continue;
      totalScheduledDays++;
    }

    // attendance
    const recs = await pool.query(`
      SELECT date, regular_hours::numeric as regular_hours, overtime_hours::numeric as overtime_hours, night_hours::numeric as night_hours, holiday_work
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
    const weekdayWorkDays = work_days - holiday_days;
    const actualWorkDays = weekdayWorkDays;

    // Prorate
    const isFirstMonth = hireDate.startsWith(yearMonth);
    const isResignMonth = resignDate && resignDate.startsWith(yearMonth);
    const isPartialMonth = isFirstMonth || isResignMonth;
    const hireDay = isFirstMonth ? parseInt(hireDate.slice(8, 10)) : 1;
    const resignDay = isResignMonth ? parseInt(resignDate.slice(8, 10)) : daysInMonth;
    const workedCalDays = Math.max(resignDay - hireDay + 1, 0);

    let basePay = parseFloat(e.base_pay);
    let mealAllowance = parseFloat(e.meal);
    if (isPartialMonth) {
      const calRatio = workedCalDays / daysInMonth;
      const workRatio = payrollClosed
        ? (totalScheduledDays > 0 ? Math.min(actualWorkDays / totalScheduledDays, 1) : 0)
        : 1;
      const finalRatio = calRatio * workRatio;
      basePay = Math.round(parseFloat(e.base_pay) * finalRatio);
      mealAllowance = Math.round(parseFloat(e.meal) * finalRatio);
    } else if (payrollClosed) {
      // 일반 + 마감: 결근 차감
      const absentDays = Math.max(totalScheduledDays - actualWorkDays, 0);
      const dailyRate = totalScheduledDays > 0 ? parseFloat(e.base_pay) / totalScheduledDays : 0;
      const mealDailyRate = totalScheduledDays > 0 ? parseFloat(e.meal) / totalScheduledDays : 0;
      basePay = Math.round(parseFloat(e.base_pay) - dailyRate * absentDays);
      mealAllowance = Math.round(parseFloat(e.meal) - mealDailyRate * absentDays);
    }

    // Frontend computation
    const otPay = Math.round(floor30(total_overtime) * RATE * 1.5);
    const holPay = Math.round(floor30(holiday_hours) * RATE * 1.5);
    const adj = parseFloat(e.adj) || 0;
    const front_gross = basePay + mealAllowance + parseFloat(e.bonus) + parseFloat(e.pos) + parseFloat(e.other) + otPay + holPay + adj;
    const target_diff = v2_gross - front_gross;
    const correct_adj = adj + target_diff;

    const status = Math.abs(target_diff) <= 1 ? 'OK' : 'DIFF';
    console.log(`[${status}] id=${id} ${e.name}`);
    if (status === 'DIFF') {
      console.log(`  hire=${hireDate} resign=${resignDate || '-'} partial=${isPartialMonth}`);
      console.log(`  base=${basePay} meal=${mealAllowance} bonus=${e.bonus} pos=${e.pos} other=${e.other}`);
      console.log(`  api: ot_h=${total_overtime} hol_h=${holiday_hours} sched=${totalScheduledDays} actual=${actualWorkDays}`);
      console.log(`  pay: ot=${otPay} hol=${holPay}`);
      console.log(`  adj=${adj} → front_gross=${front_gross}`);
      console.log(`  v2_gross=${v2_gross} → diff=${target_diff} → correct_adj=${correct_adj}`);
    }
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
