// 부서 라벨 통일: '물류1층' → '물류'
// 정규직과 사업소득/파견의 부서 분류를 '물류'로 통합한다.
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const TARGETS = [
  { table: 'regular_employees',       column: 'department' },
  { table: 'regular_org_settings',    column: 'department' },
  { table: 'regular_notices',         column: 'target_department' },
  { table: 'regular_labor_contracts', column: 'department' },
  { table: 'org_chart_nodes',         column: 'department' },
  { table: 'attendance_records',      column: 'department' },
  { table: 'confirmed_attendance',    column: 'department' },
  { table: 'survey_requests',         column: 'department' },
  { table: 'workers',                 column: 'department' },
];

async function main() {
  const client = await pool.connect();
  try {
    const conn = await client.query('SELECT current_database() AS db, current_user AS usr');
    console.log(`DB: ${conn.rows[0].db} (user: ${conn.rows[0].usr})`);

    await client.query('BEGIN');
    let total = 0;

    for (const { table, column } of TARGETS) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, column]
      );
      if (exists.rowCount === 0) {
        console.log(`-  ${table}.${column} : 컬럼 없음 (스킵)`);
        continue;
      }

      const before = await client.query(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = '물류1층'`
      );
      const n = before.rows[0].n;

      if (n === 0) {
        console.log(`-  ${table}.${column} : 0건`);
        continue;
      }

      const upd = await client.query(
        `UPDATE ${table} SET ${column} = '물류' WHERE ${column} = '물류1층'`
      );
      console.log(`✓  ${table}.${column} : ${upd.rowCount}건 → '물류'`);
      total += upd.rowCount ?? 0;
    }

    await client.query('COMMIT');
    console.log(`\n=== 총 ${total}건 업데이트 완료 ===`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('롤백:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
