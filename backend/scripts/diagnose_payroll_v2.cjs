// API 와 동일한 hours 분할 로직을 적용해서 frontend display 와 v2 gross 차이 정확 계산
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

// v2 expected gross by name
const V2_GROSS = {
  119: 2068520,  // NGUYEN HONG PHONG
  88: 3434520,   // KYAW ZIN WIN
  90: 3434520,   // TO NO
  183: 123840,   // 콴
  4: 5842303,    // 김종성
  76: 3870000,   // 박상천
  84: 2686036,   // 실비아
  86: 3310680,   // YE YINT AUNG
  73: 3326160,   // MASROA
  129: 2918520,  // KHAN SAJIAD
  91: 3827120,   // TOMI AGUS
  75: 3070740,   // MUKOKO
  93: 3326160,   // HARYANTO
  138: 3093818,  // HIDAYAT DIAN
  78: 3434520,   // TRAN VAN TAN
  173: 1802160,  // KARTINI
  168: 1802160,  // PUTRA RISKO
  182: 1068060,  // SETIAWAN MOHAMMAD
  180: 1144080,  // LUU VAN DAT
  181: 1240920,  // TRUONG VAN HAI
  145: 1838280,  // ARIS SETYAWAN
  126: 2413040,  // BOONKET
  113: 2095700,  // ARID HAMZAH
};

async function main() {
  const ids = Object.keys(V2_GROSS);
  for (const id of ids) {
    const v2_gross = V2_GROSS[id];
    const empRow = await pool.query(`
      SELECT re.id, re.name, re.hire_date, re.resign_date,
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
    if (empRow.rowCount === 0) { console.log(`id=${id} NOT FOUND`); continue; }
    const e = empRow.rows[0];

    // Replicate API's hour splitting
    const recs = await pool.query(`
      SELECT date, regular_hours::numeric as regular_hours, overtime_hours::numeric as overtime_hours, night_hours::numeric as night_hours
      FROM confirmed_attendance
      WHERE employee_name = $1 AND year_month = '2026-04' AND employee_type = '정규직'
    `, [e.name]);
    let total_overtime = 0, holiday_hours = 0;
    for (const rec of recs.rows) {
      const regH = parseFloat(rec.regular_hours) || 0;
      const otH = parseFloat(rec.overtime_hours) || 0;
      const nightH = parseFloat(rec.night_hours) || 0;
      const totalH = regH + otH + nightH;
      if (isHolidayOrWeekend(rec.date)) {
        holiday_hours += totalH;
      } else {
        total_overtime += otH;
      }
    }

    // Prorate (입사월/퇴사월) - simplified: only apply if hire_date is in 2026-04 or resign_date in 2026-04
    let basePay = parseFloat(e.base_pay) || 0;
    let mealAllowance = parseFloat(e.meal) || 0;
    const hire = e.hire_date || '';
    const resign = e.resign_date || '';
    const isFirstMonth = hire.startsWith('2026-04');
    const isResignMonth = resign && resign.startsWith('2026-04');
    if (isFirstMonth || isResignMonth) {
      const hireDay = isFirstMonth ? parseInt(hire.slice(8, 10)) : 1;
      const resignDay = isResignMonth ? parseInt(resign.slice(8, 10)) : 30;
      const workedCalDays = Math.max(resignDay - hireDay + 1, 0);
      const calRatio = workedCalDays / 30;
      // Simplified: assume payrollClosed=true and workRatio derived from att data — skip for now
      basePay = Math.round(basePay * calRatio);
      mealAllowance = Math.round(mealAllowance * calRatio);
    }

    // Frontend computation with rate=10320
    const RATE = 10320;
    const floor30 = h => Math.floor(h * 2) / 2;
    const otPay = Math.round(floor30(total_overtime) * RATE * 1.5);
    const holPay = Math.round(floor30(holiday_hours) * RATE * 1.5);
    const adj = parseFloat(e.adj) || 0;
    const front_gross = basePay + mealAllowance + parseFloat(e.bonus) + parseFloat(e.pos) + parseFloat(e.other) + otPay + holPay + adj;
    const target_diff = v2_gross - front_gross;
    const correct_adj = adj + target_diff;

    if (Math.abs(target_diff) > 1) {
      console.log(`id=${id} ${e.name}`);
      console.log(`  base=${basePay} meal=${mealAllowance} bonus=${e.bonus} pos=${e.pos} other=${e.other}`);
      console.log(`  api: ot_h=${total_overtime} hol_h=${holiday_hours}`);
      console.log(`  pay: ot=${otPay} hol=${holPay}`);
      console.log(`  adj=${adj} → front_gross=${front_gross}`);
      console.log(`  v2_gross=${v2_gross} → diff=${target_diff} → correct_adj=${correct_adj}`);
    } else {
      console.log(`id=${id} ${e.name} OK (front=${front_gross}, v2=${v2_gross})`);
    }
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
