import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const OLD_ID = 244;

async function main() {
  console.log(`\n=== #${OLD_ID} 정연화(F-4) 참조 스캔 ===\n`);

  // regular_employees.id 를 FK 로 참조하는 테이블들 자동 발견
  const fks = await pool.query(`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'regular_employees'
      AND ccu.column_name = 'id'
    ORDER BY tc.table_name
  `);
  console.log(`regular_employees.id 참조 FK 테이블: ${fks.rowCount}건`);
  for (const f of fks.rows) console.log(`  ${f.table_name}.${f.column_name}`);

  // 각 테이블에서 #244 참조하는 row count
  console.log(`\n#${OLD_ID} 참조 데이터:`);
  for (const f of fks.rows) {
    try {
      const c = await pool.query(`SELECT COUNT(*) as cnt FROM ${f.table_name} WHERE ${f.column_name} = $1`, [OLD_ID]);
      console.log(`  ${f.table_name}: ${c.rows[0].cnt}건`);
    } catch (e) {
      console.log(`  ${f.table_name}: 조회 실패 (${e.message})`);
    }
  }

  // employment_periods 별도 (FK 는 아니지만 employee_ref_id)
  const ep = await pool.query(`SELECT * FROM employment_periods WHERE employee_type='regular' AND employee_ref_id = $1`, [OLD_ID]);
  console.log(`\nemployment_periods (employee_ref_id 기반): ${ep.rowCount}건`);
  for (const p of ep.rows) console.log(`  id=${p.id} ${p.period_start}~${p.period_end || '재직중'}`);

  // employee_offboardings (employee_ref_id)
  const off = await pool.query(`SELECT * FROM employee_offboardings WHERE employee_type='regular' AND employee_ref_id = $1`, [OLD_ID]);
  console.log(`\nemployee_offboardings (employee_ref_id): ${off.rowCount}건`);

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
