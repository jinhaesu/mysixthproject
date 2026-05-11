const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const parsed = new URL(url);
const pool = new Pool({
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  host: parsed.hostname,
  port: parseInt(parsed.port) || 5432,
  database: parsed.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
});
async function timed(label, fn) {
  const t0 = Date.now();
  try { const r = await fn(); console.log(`${(Date.now()-t0).toString().padStart(6)}ms  ${label}  rows=${r?.rowCount ?? '-'}`); return r; }
  catch (e) { console.log(`  ERR  ${label}  ${e.message}`); }
}
async function main() {
  const c1 = await timed('COUNT all', () => pool.query('SELECT COUNT(*) FROM regular_employees'));
  const c2 = await timed('COUNT active', () => pool.query('SELECT COUNT(*) FROM regular_employees WHERE is_active = 1'));
  console.log(`  total=${c1?.rows[0].count}, active=${c2?.rows[0].count}`);

  // Exact query the endpoint runs (with include_resigned=1)
  const r1 = await timed('endpoint COUNT (include_resigned=1)',
    () => pool.query('SELECT COUNT(*) as total FROM regular_employees re WHERE 1=1'));
  console.log(`  total=${r1?.rows[0].total}`);

  const r2 = await timed('endpoint list (include_resigned=1, limit 50)',
    () => pool.query(`
      SELECT re.*, sw.name as workplace_name
      FROM regular_employees re
      LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id
      WHERE 1=1
      ORDER BY re.is_active DESC, re.hire_date DESC NULLS LAST, re.name
      LIMIT 50 OFFSET 0
    `));
  console.log(`  rows=${r2?.rowCount}`);
  if (r2?.rows.length) {
    console.log('  first 3:');
    for (const row of r2.rows.slice(0, 3)) {
      console.log(`    id=${row.id} name=${row.name} dept=${row.department} active=${row.is_active}`);
    }
  }

  // workers table too
  const w = await timed('workers COUNT', () => pool.query('SELECT COUNT(*) FROM workers'));
  console.log(`  workers total=${w?.rows[0].count}`);

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
