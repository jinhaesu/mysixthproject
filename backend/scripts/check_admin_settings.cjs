const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function T(label, q) {
  const t = Date.now();
  try { const r = await pool.query(q); console.log(`  ${(Date.now()-t).toString().padStart(6)}ms  ${label}  rows=${r.rowCount}`); }
  catch (e) { console.log(`  ${(Date.now()-t).toString().padStart(6)}ms  ${label}  ERR: ${e.message.slice(0,80)}`); }
}
async function main() {
  await T('SELECT 1', 'SELECT 1');
  await T('admin_settings SELECT', "SELECT value FROM admin_settings WHERE key = 'contract_password'");
  await T('admin_settings COUNT', 'SELECT COUNT(*) FROM admin_settings');
  await T('admin_settings size', "SELECT pg_size_pretty(pg_total_relation_size('admin_settings'::regclass)) as s");
  // active queries
  const r = await pool.query(`
    SELECT pid, state, EXTRACT(EPOCH FROM (NOW() - query_start))::int as age,
           wait_event_type, wait_event, SUBSTRING(query, 1, 100) as q
    FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state<>'idle'
    ORDER BY query_start LIMIT 20
  `);
  console.log(`\n=== Active queries (${r.rowCount}) ===`);
  for (const row of r.rows) console.log(`  pid=${row.pid} age=${row.age}s wait=${row.wait_event_type}/${row.wait_event} ${row.q}`);
  await pool.end();
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
