// regular_employees.hire_date 가 비어있고 서명된 계약서가 있으면 contract.work_start_date 로 복원
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('=== hire_date 비어있는 정규직 직원 (signed 계약서로부터 복원 가능) ===');
  const candidates = await pool.query(`
    SELECT re.id, re.name, re.hire_date AS current_hire,
           rlc.work_start_date AS contract_work_start,
           rlc.contract_start AS contract_start
    FROM regular_employees re
    JOIN LATERAL (
      SELECT work_start_date, contract_start, status
      FROM regular_labor_contracts
      WHERE employee_id = re.id AND status = 'signed'
      ORDER BY created_at DESC
      LIMIT 1
    ) rlc ON true
    WHERE (re.hire_date IS NULL OR re.hire_date = '')
      AND (rlc.work_start_date IS NOT NULL AND rlc.work_start_date <> '')
  `);

  console.log(`복원 대상: ${candidates.rowCount}명`);

  let restored = 0;
  for (const r of candidates.rows) {
    const hire = r.contract_work_start || r.contract_start;
    if (!hire) continue;
    await pool.query(`UPDATE regular_employees SET hire_date = $1, updated_at = NOW() WHERE id = $2`, [hire, r.id]);
    console.log(`✓ #${r.id} ${r.name}: hire_date = ${hire}`);
    restored++;

    // employee_offboardings 도 함께 backfill
    const off = await pool.query(`UPDATE employee_offboardings SET hire_date = $1 WHERE employee_type = 'regular' AND employee_ref_id = $2 AND (hire_date IS NULL OR hire_date = '')`, [hire, r.id]);
    if (off.rowCount > 0) console.log(`  └ offboarding #${r.id} hire_date 도 동기화`);
  }

  console.log(`\n총 ${restored}명 복원 완료`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
