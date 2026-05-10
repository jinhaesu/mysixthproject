// 진단 스크립트 — Railway env 에서 실행: railway run node backend/scripts/diagnose_payroll.cjs
// 4월 급여계산의 직원별 DB 값을 출력해서 v2 엑셀과 차이 식별
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const parsed = new URL(url);
const pool = new Pool({
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  host: parsed.hostname,
  port: parseInt(parsed.port) || 5432,
  database: parsed.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
});

const TARGETS = [
  'NGUYEN HONG PHONG', 'KYAW ZIN WIN', 'TO NO', 'NGUYENTHEQUAN',
  '김종성', '박상천', '실비아',
  'YE YINT AUNG', 'MASROA', 'KHAN SAJIAD', 'TOMI AGUS',
  'MUKOKO', 'HARYANTO', 'HIDAYAT DIAN', 'TRAN VAN TAN',
  'KARTINI', 'PUTRA RISKO', 'SETIAWAN MOHAMMAD',
  'LUU VAN DAT', 'TRUONG VAN HAI', 'ARIS SETYAWAN',
  'BOONKET', 'ARID HAMZAH'
];

async function main() {
  for (const t of TARGETS) {
    const rows = await pool.query(`
      SELECT re.id, re.name, re.hire_date, re.resign_date,
             COALESCE(ss.base_pay, 0) as base_pay,
             COALESCE(ss.meal_allowance, 0) as meal,
             COALESCE(ss.bonus, 0) as bonus,
             COALESCE(ss.position_allowance, 0) as pos,
             COALESCE(ss.other_allowance, 0) as other,
             COALESCE(ss.overtime_hourly_rate, 0) as ot_rate,
             (SELECT amount FROM regular_payroll_adjustments WHERE employee_id = re.id AND year_month = '2026-04') as adjustment,
             (SELECT memo FROM regular_payroll_adjustments WHERE employee_id = re.id AND year_month = '2026-04') as adj_memo
      FROM regular_employees re
      LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
      WHERE re.name ILIKE $1
    `, [`%${t}%`]);
    if (rows.rowCount === 0) {
      console.log(`[${t}] NO MATCH`);
      continue;
    }
    for (const r of rows.rows) {
      // Get attendance hours for 2026-04
      const att = await pool.query(`
        SELECT COALESCE(SUM(overtime_hours::numeric), 0) as ot_h,
               COALESCE(SUM(CASE WHEN holiday_work = 1 THEN regular_hours::numeric + overtime_hours::numeric ELSE 0 END), 0) as hol_h_v1,
               COALESCE(SUM(CASE WHEN holiday_work = 1 THEN regular_hours::numeric + overtime_hours::numeric + night_hours::numeric ELSE 0 END), 0) as hol_h_v2
        FROM confirmed_attendance
        WHERE employee_name = $1 AND year_month = '2026-04' AND employee_type = '정규직'
      `, [r.name]);
      const a = att.rows[0];
      console.log(`[${t}] id=${r.id} name="${r.name}"`);
      console.log(`  base=${r.base_pay} meal=${r.meal} bonus=${r.bonus} pos=${r.pos} other=${r.other} rate=${r.ot_rate}`);
      console.log(`  attend: ot_h=${a.ot_h} hol_h(v1)=${a.hol_h_v1} hol_h(v2)=${a.hol_h_v2}`);
      console.log(`  adjustment=${r.adjustment ?? 'NULL'} memo="${r.adj_memo ?? ''}"`);
    }
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
