import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
async function main() {
  const r = await pool.query(`SELECT DISTINCT employee_name, employee_phone FROM confirmed_attendance WHERE year_month='2026-07' AND employee_type='정규직' AND (employee_name LIKE '%티늉%' OR employee_name LIKE '%TRAN THI%' OR employee_phone LIKE '%1181293%')`);
  console.log('confirmed_attendance 티늉 후보:');
  for (const x of r.rows) console.log(`  name="${x.employee_name}" phone=${x.employee_phone}`);
  await pool.end();
}
main().catch(console.error);
