import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 티늉 진단 ===\n');

  // 이름 검색 (티늉 정확한 표기 다양할 수 있음)
  const cands = await pool.query(`
    SELECT id, name, phone, department, hire_date, resign_date, is_active
    FROM regular_employees
    WHERE name LIKE '%티늉%' OR name LIKE '%티능%' OR name LIKE '%TINUNG%' OR name LIKE '%tinung%'
    ORDER BY id
  `);
  console.log(`정규직 마스터 매칭: ${cands.rowCount}건`);
  for (const c of cands.rows) console.log(`  #${c.id} ${c.name} (${c.phone}) ${c.department} hire=${c.hire_date} resign=${c.resign_date || '(없음)'} active=${c.is_active}`);

  if (!cands.rowCount) {
    console.log('  regular_employees 이름 매칭 없음. offboardings 에서 검색...');
    const off = await pool.query(`SELECT * FROM employee_offboardings WHERE employee_name LIKE '%티늉%' OR employee_name LIKE '%티능%' OR employee_name LIKE '%TINUNG%'`);
    console.log(`  offboardings: ${off.rowCount}건`);
    for (const o of off.rows) console.log(`  ${JSON.stringify(o).slice(0, 200)}`);
  }

  for (const emp of cands.rows) {
    console.log(`\n▶ #${emp.id} ${emp.name} 상세`);
    // salary settings
    const ss = await pool.query(`SELECT * FROM regular_salary_settings WHERE employee_id = $1`, [emp.id]);
    if (ss.rowCount) {
      const s = ss.rows[0];
      console.log(`  salary_settings: base=${s.base_pay} meal=${s.meal_allowance} bonus=${s.bonus} pos=${s.position_allowance} other=${s.other_allowance} otRate=${s.overtime_hourly_rate}`);
    } else {
      console.log('  ⚠  salary_settings 없음 → base_pay=0 이라서 급여 0원!');
    }

    // confirmed_attendance 7월
    const ca = await pool.query(`
      SELECT date, employee_type, confirmed_clock_in, confirmed_clock_out,
             regular_hours, overtime_hours, night_hours, department
      FROM confirmed_attendance
      WHERE year_month = '2026-07'
        AND (employee_name = $1
             OR REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g')
                = REGEXP_REPLACE(COALESCE($2,''), '[-\\s]', '', 'g'))
      ORDER BY date
    `, [emp.name, emp.phone]);
    console.log(`  confirmed_attendance 7월: ${ca.rowCount}건`);
    for (const r of ca.rows) console.log(`    ${r.date} ${r.employee_type} dept=${r.department} ${r.confirmed_clock_in}~${r.confirmed_clock_out} reg=${r.regular_hours} ot=${r.overtime_hours} night=${r.night_hours}`);

    const total = ca.rows.reduce((s, r) => s + (parseFloat(r.regular_hours)||0) + (parseFloat(r.overtime_hours)||0) + (parseFloat(r.night_hours)||0), 0);
    console.log(`  총 시간 합: ${total.toFixed(1)}h`);
  }

  // === 티늉 같은 케이스 (근태 있는데 급여 0원 가능성 있는 인원) 전체 스캔 ===
  console.log('\n\n=== 7월 근태 있는데 salary_settings 없거나 base_pay=0 인 정규직 ===\n');
  const noSalary = await pool.query(`
    SELECT re.id, re.name, re.phone, re.department, re.is_active,
           COALESCE(re.resign_date, '') as resign_date, re.hire_date,
           COALESCE(ss.base_pay, 0) as base_pay,
           COUNT(ca.id) as ca_days,
           SUM(COALESCE(ca.regular_hours,0) + COALESCE(ca.overtime_hours,0) + COALESCE(ca.night_hours,0)) as total_hours
    FROM regular_employees re
    LEFT JOIN regular_salary_settings ss ON ss.employee_id = re.id
    LEFT JOIN confirmed_attendance ca
      ON ca.year_month = '2026-07' AND ca.employee_type = '정규직'
         AND (ca.employee_name = re.name
              OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
                 = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g'))
    WHERE (COALESCE(ss.base_pay, 0) = 0)
    GROUP BY re.id, re.name, re.phone, re.department, re.is_active, re.resign_date, re.hire_date, ss.base_pay
    HAVING COUNT(ca.id) > 0
    ORDER BY COUNT(ca.id) DESC
  `);
  console.log(`base_pay=0 인데 7월 근태 있는 정규직: ${noSalary.rowCount}명\n`);
  for (const r of noSalary.rows) {
    console.log(`  #${r.id} ${r.name} (${r.phone}) ${r.department || '(부서없음)'} active=${r.is_active} resign=${r.resign_date || '-'} hire=${r.hire_date} | 근태 ${r.ca_days}건 ${parseFloat(r.total_hours).toFixed(1)}h | base_pay=${r.base_pay}`);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
