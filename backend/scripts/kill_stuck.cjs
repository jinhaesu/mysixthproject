// 1분 이상 active 인 쿼리 강제 종료
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function main() {
  const r = await pool.query(`
    SELECT pid, EXTRACT(EPOCH FROM (NOW() - query_start))::int as age,
           SUBSTRING(query, 1, 80) as q
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND state = 'active' AND query_start < NOW() - INTERVAL '20 seconds'
  `);
  console.log(`Found ${r.rowCount} stuck queries (>20s):`);
  for (const row of r.rows) {
    console.log(`  pid=${row.pid} age=${row.age}s  ${row.q}`);
    try {
      await pool.query('SELECT pg_cancel_backend($1)', [row.pid]);
      console.log(`    cancel sent`);
    } catch (e) { console.log(`    cancel fail: ${e.message}`); }
  }
  // 5s wait, then terminate any remaining
  await new Promise(r => setTimeout(r, 5000));
  const r2 = await pool.query(`
    SELECT pid FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND state = 'active' AND query_start < NOW() - INTERVAL '20 seconds'
  `);
  console.log(`\nStill stuck after cancel: ${r2.rowCount}. Terminating...`);
  for (const row of r2.rows) {
    try {
      await pool.query('SELECT pg_terminate_backend($1)', [row.pid]);
      console.log(`  terminated pid=${row.pid}`);
    } catch (e) { console.log(`  fail pid=${row.pid}: ${e.message}`); }
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
