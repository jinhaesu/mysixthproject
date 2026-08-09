import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
async function main() {
  const s109 = await pool.query(`SELECT id, shift_id, employee_id FROM regular_shift_assignments WHERE employee_id = 109 ORDER BY shift_id`);
  console.log(`shift_assignments #109 (${s109.rowCount}건):`);
  for (const r of s109.rows) console.log(`  id=${r.id} shift_id=${r.shift_id}`);
  const s244 = await pool.query(`SELECT id, shift_id, employee_id FROM regular_shift_assignments WHERE employee_id = 244 ORDER BY shift_id`);
  console.log(`shift_assignments #244 (${s244.rowCount}건):`);
  for (const r of s244.rows) console.log(`  id=${r.id} shift_id=${r.shift_id}`);

  const ra244 = await pool.query(`SELECT id, employee_id, date FROM regular_attendance WHERE employee_id = 244`);
  console.log(`regular_attendance #244 (${ra244.rowCount}건): ${ra244.rows.map(r => r.date).join(', ')}`);

  // UNIQUE constraint 확인
  const uniques = await pool.query(`
    SELECT tc.constraint_name, tc.table_name, kcu.column_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name IN ('regular_shift_assignments', 'regular_attendance', 'regular_labor_contracts')
      AND tc.constraint_type IN ('UNIQUE','PRIMARY KEY')
    ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
  `);
  console.log('\nUNIQUE/PK constraints:');
  for (const r of uniques.rows) console.log(`  ${r.table_name}.${r.constraint_name} (${r.constraint_type}): ${r.column_name}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
