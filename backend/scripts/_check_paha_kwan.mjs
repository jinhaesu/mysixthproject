import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('=== regular_employees ===');
  const emps = await pool.query(`
    SELECT id, name, phone, department, team, hire_date, resigned_at, resign_date, is_active, created_at, updated_at
    FROM regular_employees
    WHERE name ILIKE '%FATA%' OR name ILIKE '%파타%' OR name ILIKE '%NGUYENTHEQUAN%' OR name ILIKE '%콴%' OR name ILIKE '%QUAN%'
    ORDER BY id
  `);
  emps.rows.forEach(r => {
    console.log(`#${r.id} ${r.name}`);
    console.log(`  phone=${r.phone}, dept=${r.department}, team=${r.team}`);
    console.log(`  hire_date=${JSON.stringify(r.hire_date)}, resigned_at=${JSON.stringify(r.resigned_at)}, resign_date=${JSON.stringify(r.resign_date)}, is_active=${r.is_active}`);
    console.log(`  created=${r.created_at}, updated=${r.updated_at}`);
  });

  console.log('\n=== regular_labor_contracts (이 두명의 계약서에 입사일 있는지) ===');
  for (const r of emps.rows) {
    const cs = await pool.query(`
      SELECT id, contract_start, contract_end, work_start_date, status, created_at
      FROM regular_labor_contracts
      WHERE employee_id = $1
      ORDER BY created_at DESC
    `, [r.id]);
    console.log(`\n${r.name} (#${r.id}) 계약서 ${cs.rowCount}건:`);
    cs.rows.forEach(c => {
      console.log(`  contract #${c.id}: start=${c.contract_start} end=${c.contract_end} work_start=${c.work_start_date} status=${c.status} created=${c.created_at}`);
    });
  }

  console.log('\n=== employee_offboardings ===');
  const offs = await pool.query(`
    SELECT id, employee_ref_id, employee_name, hire_date, resign_date, loss_date, created_at
    FROM employee_offboardings
    WHERE employee_name ILIKE '%FATA%' OR employee_name ILIKE '%파타%' OR employee_name ILIKE '%NGUYENTHEQUAN%' OR employee_name ILIKE '%콴%' OR employee_name ILIKE '%QUAN%'
    ORDER BY id
  `);
  offs.rows.forEach(r => {
    console.log(`#${r.id} ref=${r.employee_ref_id} ${r.employee_name}`);
    console.log(`  hire_date=${JSON.stringify(r.hire_date)}, resign_date=${r.resign_date}, loss_date=${r.loss_date}`);
  });

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
