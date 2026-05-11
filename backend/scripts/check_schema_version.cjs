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
async function main() {
  const r = await pool.query("SELECT id, applied_at FROM schema_migrations WHERE id LIKE 'schema-v%' OR id LIKE 'payroll-%' ORDER BY applied_at DESC LIMIT 20");
  for (const row of r.rows) console.log(`  ${row.id}  ${row.applied_at}`);

  // Time some key queries
  const t0 = Date.now();
  const c = await pool.query('SELECT COUNT(*) FROM regular_employees');
  console.log(`COUNT regular_employees: ${Date.now()-t0}ms (${c.rows[0].count} rows)`);

  const t1 = Date.now();
  const w = await pool.query('SELECT id, name_ko FROM workers ORDER BY name_ko LIMIT 50');
  console.log(`workers list 50: ${Date.now()-t1}ms (${w.rowCount} rows)`);

  await pool.end();
}
main().catch(e=>{console.error('ERR:', e.message);process.exit(1);});
