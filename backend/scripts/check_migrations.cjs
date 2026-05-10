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
});
async function main() {
  const r = await pool.query("SELECT id, applied_at FROM schema_migrations WHERE id LIKE 'payroll-2026-04%' ORDER BY id");
  for (const row of r.rows) console.log(`  ${row.id} | ${row.applied_at}`);
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
