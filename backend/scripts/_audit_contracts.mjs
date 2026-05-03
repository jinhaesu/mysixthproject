// 근로계약서 데이터 무결성 audit
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});

async function main() {
  // 1. contract_start = created_at(date) 인 계약서 (자동으로 today 박힌 케이스)
  console.log('=== 1. contract_start === created_at(date) — admin 발송시 today 자동 ===');
  const auto = await pool.query(`
    SELECT id, employee_id, worker_name, contract_start, contract_end, work_start_date, status, created_at::date::text as created_date
    FROM regular_labor_contracts
    WHERE contract_start = created_at::date::text
       OR contract_start = TO_CHAR(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')
    ORDER BY created_at DESC
  `);
  console.log(`  ${auto.rowCount}건`);
  auto.rows.slice(0, 10).forEach(r => console.log(`  #${r.id} ${r.worker_name} contract=${r.contract_start}~${r.contract_end} work_start=${r.work_start_date} status=${r.status}`));

  // 2. contract_start ≠ work_start_date — 의미 분리되었는지
  console.log('\n=== 2. contract_start ≠ work_start_date — 별개로 관리되고 있는지 ===');
  const diff = await pool.query(`
    SELECT COUNT(*) as n
    FROM regular_labor_contracts
    WHERE work_start_date IS NOT NULL AND work_start_date <> ''
      AND contract_start IS NOT NULL AND contract_start <> ''
      AND contract_start <> work_start_date
  `);
  console.log(`  ${diff.rows[0].n}건 (둘이 다르게 저장된 케이스)`);

  const same = await pool.query(`
    SELECT COUNT(*) as n FROM regular_labor_contracts
    WHERE work_start_date = contract_start
  `);
  console.log(`  ${same.rows[0].n}건 (둘이 같음 — 입사일과 계약일이 같은 첫 계약)`);

  // 3. 한 직원이 여러 계약서 — 재계약 케이스
  console.log('\n=== 3. 한 직원 여러 계약서 (재계약) ===');
  const multi = await pool.query(`
    SELECT employee_id, worker_name, COUNT(*) as n,
           STRING_AGG(contract_start || '~' || contract_end || '(' || status || ')', ', ' ORDER BY created_at) as contracts
    FROM regular_labor_contracts
    WHERE employee_id IS NOT NULL
    GROUP BY employee_id, worker_name
    HAVING COUNT(*) > 1
    ORDER BY n DESC
    LIMIT 10
  `);
  multi.rows.forEach(r => console.log(`  #${r.employee_id} ${r.worker_name} (${r.n}건): ${r.contracts}`));

  // 4. 빈 계약서 (자동 생성된 것 의심)
  console.log('\n=== 4. 빈 계약서 (서명·기본급·계약기간 없음 — 자동생성 의심) ===');
  const empty = await pool.query(`
    SELECT id, employee_id, worker_name, work_start_date, contract_start, contract_end, status, created_at
    FROM regular_labor_contracts
    WHERE (contract_start IS NULL OR contract_start = '')
      AND (signature_data IS NULL OR signature_data = '')
      AND (base_pay IS NULL OR base_pay = '')
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log(`  ${empty.rowCount}건`);
  empty.rows.forEach(r => console.log(`  #${r.id} emp=${r.employee_id} ${r.worker_name} work_start=${r.work_start_date} created=${r.created_at}`));

  // 5. employee_id가 NULL인 고아 계약서
  console.log('\n=== 5. employee_id NULL — 고아 계약서 ===');
  const orphan = await pool.query(`SELECT COUNT(*) as n FROM regular_labor_contracts WHERE employee_id IS NULL`);
  console.log(`  ${orphan.rows[0].n}건`);

  // 6. work_start_date 가 regular_employees.hire_date 와 다른 케이스
  console.log('\n=== 6. 계약서 work_start_date ≠ regular_employees.hire_date ===');
  const mismatch = await pool.query(`
    SELECT rlc.id, rlc.worker_name, rlc.work_start_date AS contract_work_start, re.hire_date AS emp_hire_date, rlc.status
    FROM regular_labor_contracts rlc
    JOIN regular_employees re ON rlc.employee_id = re.id
    WHERE rlc.work_start_date IS NOT NULL AND rlc.work_start_date <> ''
      AND re.hire_date IS NOT NULL AND re.hire_date <> ''
      AND rlc.work_start_date <> re.hire_date
    ORDER BY rlc.created_at DESC
    LIMIT 15
  `);
  console.log(`  ${mismatch.rowCount}건 (계약서의 입사일과 직원 정보의 입사일 불일치)`);
  mismatch.rows.forEach(r => console.log(`  #${r.id} ${r.worker_name} 계약=${r.contract_work_start} 직원=${r.emp_hire_date} status=${r.status}`));

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
