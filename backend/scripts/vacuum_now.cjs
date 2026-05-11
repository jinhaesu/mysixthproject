// 무거운 테이블 VACUUM + ANALYZE
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 60_000,
  // VACUUM 은 길 수 있음 — query_timeout 늘리고 statement_timeout 무한
  query_timeout: 600_000, statement_timeout: 0,
});
async function main() {
  // SET statement_timeout=0 for this session
  await pool.query("SET statement_timeout = 0");
  await pool.query("SET lock_timeout = 0");

  for (const tbl of ['regular_employees', 'regular_labor_contracts']) {
    console.log(`\n=== VACUUM ANALYZE ${tbl} ===`);
    const t0 = Date.now();
    try {
      await pool.query(`VACUUM (ANALYZE, VERBOSE) ${tbl}`);
      console.log(`  done in ${Date.now()-t0}ms`);
    } catch (e) {
      console.log(`  ERR: ${e.message}`);
    }
  }

  // Test speed after
  console.log('\n=== Post-VACUUM timings ===');
  for (const q of [
    ['COUNT regular_employees', 'SELECT COUNT(*) FROM regular_employees'],
    ['list 50 (lite)', "SELECT id, name, department FROM regular_employees WHERE is_active = 1 ORDER BY name LIMIT 50"],
    ['COUNT workers', 'SELECT COUNT(*) FROM workers'],
  ]) {
    const t = Date.now();
    try { const r = await pool.query(q[1]); console.log(`  ${q[0]}: ${Date.now()-t}ms rows=${r.rowCount}`); }
    catch (e) { console.log(`  ${q[0]}: ERR ${e.message.slice(0,80)}`); }
  }

  await pool.end();
}
main().catch(e=>{console.error(e); process.exit(1);});
