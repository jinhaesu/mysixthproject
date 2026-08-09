import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
async function main() {
  const r = await pool.query(`SELECT id, employee_id, date, clock_in_time, clock_out_time FROM regular_attendance WHERE employee_id IN (109, 244) AND date = '2026-08-06'`);
  console.log('regular_attendance 8/6 (양쪽):');
  for (const x of r.rows) console.log(`  id=${x.id} emp=${x.employee_id} in=${x.clock_in_time} out=${x.clock_out_time}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
