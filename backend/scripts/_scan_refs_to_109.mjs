import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const OLD_ID = 109;
async function main() {
  console.log(`\n=== #${OLD_ID} 정연화 (구, 퇴사) 참조 데이터 (충돌 확인) ===\n`);
  const tables = ['employee_loans', 'regular_attendance', 'regular_labor_contracts', 'regular_payroll_adjustments', 'regular_salary_settings', 'regular_shift_assignments', 'regular_vacation_balances', 'regular_vacation_requests'];
  for (const t of tables) {
    const c = await pool.query(`SELECT COUNT(*) as cnt FROM ${t} WHERE employee_id = $1`, [OLD_ID]);
    console.log(`  ${t}: ${c.rows[0].cnt}건`);
  }
  console.log('\n---세부 (충돌 가능 테이블)---');
  const ss109 = await pool.query(`SELECT * FROM regular_salary_settings WHERE employee_id = 109`);
  const ss244 = await pool.query(`SELECT * FROM regular_salary_settings WHERE employee_id = 244`);
  console.log(`salary_settings #109: base=${ss109.rows[0]?.base_pay} meal=${ss109.rows[0]?.meal_allowance}`);
  console.log(`salary_settings #244: base=${ss244.rows[0]?.base_pay} meal=${ss244.rows[0]?.meal_allowance}`);
  const vb109 = await pool.query(`SELECT * FROM regular_vacation_balances WHERE employee_id = 109`);
  const vb244 = await pool.query(`SELECT * FROM regular_vacation_balances WHERE employee_id = 244`);
  console.log(`vacation_balances #109: ${vb109.rows.map(x => JSON.stringify(x)).join('\n  ')}`);
  console.log(`vacation_balances #244: ${vb244.rows.map(x => JSON.stringify(x)).join('\n  ')}`);
  const sa244 = await pool.query(`SELECT * FROM regular_shift_assignments WHERE employee_id = 244 ORDER BY id`);
  console.log(`shift_assignments #244 (${sa244.rowCount}건):`);
  for (const s of sa244.rows) console.log(`  ${JSON.stringify(s)}`);
  const lc244 = await pool.query(`SELECT id, contract_start, contract_end, contract_url, status FROM regular_labor_contracts WHERE employee_id = 244 ORDER BY id`);
  console.log(`labor_contracts #244:`);
  for (const c of lc244.rows) console.log(`  ${JSON.stringify(c)}`);
  const lc109 = await pool.query(`SELECT id, contract_start, contract_end, status FROM regular_labor_contracts WHERE employee_id = 109 ORDER BY id`);
  console.log(`labor_contracts #109 (${lc109.rowCount}건):`);
  for (const c of lc109.rows) console.log(`  ${JSON.stringify(c)}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
