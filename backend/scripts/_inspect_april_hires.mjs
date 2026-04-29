// 4월 2026 정규직 입사자 진단
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  const conn = await pool.query('SELECT current_database() AS db');
  console.log(`DB: ${conn.rows[0].db}\n`);

  console.log('=== 0. regular_employees 컬럼 확인 ===');
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='regular_employees' AND column_name IN
      ('email','address','nationality','onboarding_status','monthly_salary','business_registration_no','bank_slip_data','job_code','weekly_work_hours','employment_type')
    ORDER BY column_name
  `);
  console.log(`  존재하는 새 컬럼: ${cols.rows.map(r=>r.column_name).join(', ') || '(없음)'}`);
  const newColExists = cols.rows.length > 0;

  console.log('\n=== 1. regular_employees 4월 입사자 ===');
  const e = await pool.query(`
    SELECT id, name, phone, department, team, hire_date, is_active, resigned_at, resign_date,
           bank_account, bank_name
    FROM regular_employees
    WHERE hire_date LIKE '2026-04%'
    ORDER BY hire_date, name
  `);
  if (e.rows.length === 0) console.log('  (없음)');
  e.rows.forEach(r => console.log(`  #${r.id} ${r.name} (${r.phone}) ${r.department}/${r.team} hire=${r.hire_date} active=${r.is_active} bank=${r.bank_account ? 'O' : 'X'}`));

  console.log('\n=== 2. regular_labor_contracts 4월 체결 ===');
  const c = await pool.query(`
    SELECT rlc.id, rlc.employee_id, rlc.worker_name, rlc.phone, rlc.work_start_date,
           rlc.contract_start, rlc.status, rlc.created_at,
           rlc.signature_data IS NOT NULL AND rlc.signature_data <> '' AS has_sig,
           re.name AS emp_name, re.hire_date AS emp_hire, re.is_active AS emp_active
    FROM regular_labor_contracts rlc
    LEFT JOIN regular_employees re ON re.id = rlc.employee_id
    WHERE (rlc.work_start_date LIKE '2026-04%' OR rlc.contract_start LIKE '2026-04%' OR rlc.created_at::text LIKE '2026-04%')
    ORDER BY COALESCE(rlc.work_start_date, rlc.contract_start, rlc.created_at::text), rlc.worker_name
  `);
  if (c.rows.length === 0) console.log('  (없음)');
  c.rows.forEach(r => console.log(`  #${r.id} emp=${r.employee_id} ${r.worker_name} (${r.phone}) work_start=${r.work_start_date} contract=${r.contract_start} status=${r.status} sig=${r.has_sig} emp_in_db=${r.emp_name ? 'O' : 'X'}`));

  console.log('\n=== 3. 계약서 있는데 regular_employees 없는 사람 ===');
  const orphans = await pool.query(`
    SELECT rlc.id, rlc.worker_name, rlc.phone, rlc.work_start_date, rlc.contract_start, rlc.status
    FROM regular_labor_contracts rlc
    LEFT JOIN regular_employees re ON re.id = rlc.employee_id
    WHERE re.id IS NULL
      AND (rlc.work_start_date LIKE '2026-04%' OR rlc.contract_start LIKE '2026-04%')
  `);
  if (orphans.rows.length === 0) console.log('  (없음)');
  orphans.rows.forEach(r => console.log(`  ${r.worker_name} (${r.phone}) work_start=${r.work_start_date} status=${r.status}`));

  console.log('\n=== 4. is_active=0 또는 resigned된 4월 입사자 ===');
  const hidden = await pool.query(`
    SELECT id, name, phone, hire_date, is_active, resigned_at, resign_date
    FROM regular_employees
    WHERE hire_date LIKE '2026-04%' AND (is_active = 0 OR (resigned_at IS NOT NULL AND resigned_at <> ''))
  `);
  if (hidden.rows.length === 0) console.log('  (없음)');
  hidden.rows.forEach(r => console.log(`  #${r.id} ${r.name} active=${r.is_active} resigned=${r.resigned_at}`));

  console.log('\n=== 5. is_active 분포 ===');
  const dist = await pool.query(`
    SELECT is_active, COUNT(*) AS n FROM regular_employees GROUP BY is_active
  `);
  dist.rows.forEach(r => console.log(`  is_active=${r.is_active}: ${r.n}명`));

  console.log('\n=== 6. 전체 regular_employees 카운트 (월별 입사) ===');
  const m = await pool.query(`
    SELECT SUBSTRING(hire_date, 1, 7) AS ym, COUNT(*) AS n
    FROM regular_employees
    WHERE hire_date IS NOT NULL AND hire_date <> ''
    GROUP BY ym
    ORDER BY ym DESC
    LIMIT 8
  `);
  m.rows.forEach(r => console.log(`  ${r.ym}: ${r.n}명`));

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
