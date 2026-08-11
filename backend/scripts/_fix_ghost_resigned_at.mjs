import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

// is_active=1 인데 resigned_at 에 실제 timestamp 값이 남아있는 유령상태 정리.
// (빈 문자열은 정상. 실제 timestamp만 대상.)
console.log('=== BEFORE ===');
const before = await pool.query(`
  SELECT id, name, is_active, resign_date, resigned_at
  FROM regular_employees
  WHERE is_active = 1
    AND resigned_at IS NOT NULL
    AND resigned_at::text <> ''
  ORDER BY id
`);
for (const r of before.rows) {
  console.log(`  #${r.id} ${r.name} | active=${r.is_active} | resign_date=${r.resign_date} | resigned_at=${r.resigned_at}`);
}

const ids = before.rows.map(r => r.id);
if (ids.length > 0) {
  await pool.query(
    `UPDATE regular_employees SET resigned_at = NULL, updated_at = NOW() WHERE id = ANY($1::int[])`,
    [ids]
  );
  console.log(`\n✓ ${ids.length}명 resigned_at NULL 처리 완료`);
}

console.log('\n=== AFTER ===');
const after = await pool.query(`
  SELECT id, name, is_active, resign_date, resigned_at
  FROM regular_employees
  WHERE id = ANY($1::int[])
  ORDER BY id
`, [ids]);
for (const r of after.rows) {
  console.log(`  #${r.id} ${r.name} | active=${r.is_active} | resign_date=${r.resign_date} | resigned_at=${r.resigned_at}`);
}

await pool.end();
