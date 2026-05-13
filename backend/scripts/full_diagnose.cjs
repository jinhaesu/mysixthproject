// 완전 진단 — Supavisor 상태, Railway 인스턴스 수, 활성 connection, stuck 쿼리 모두
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function main() {
  console.log(`Connected to ${host}:${port}`);

  console.log('\n=== Total connections by application_name ===');
  try {
    const r = await pool.query(`
      SELECT application_name, state, COUNT(*) cnt
      FROM pg_stat_activity WHERE datname = current_database()
      GROUP BY application_name, state ORDER BY cnt DESC
    `);
    for (const row of r.rows) console.log(`  ${row.application_name.padEnd(40)} ${row.state.padEnd(15)} ${row.cnt}`);
  } catch (e) { console.log('ERR:', e.message); }

  console.log('\n=== All ACTIVE queries (regardless of duration) ===');
  try {
    const r = await pool.query(`
      SELECT pid, application_name, state,
             EXTRACT(EPOCH FROM (NOW() - query_start))::int age,
             wait_event_type, wait_event, SUBSTRING(query, 1, 120) q
      FROM pg_stat_activity WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid()
      ORDER BY query_start LIMIT 30
    `);
    for (const row of r.rows) console.log(`  pid=${row.pid} app=${row.application_name} age=${row.age}s wait=${row.wait_event_type || '-'}/${row.wait_event || '-'} ${row.q}`);
    console.log(`Total active: ${r.rowCount}`);
  } catch (e) { console.log('ERR:', e.message); }

  console.log('\n=== Kill ALL queries older than 30s ===');
  try {
    const r = await pool.query(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'active'
        AND pid <> pg_backend_pid() AND query_start < NOW() - INTERVAL '30 seconds'
    `);
    console.log(`Killing ${r.rowCount} stuck`);
    for (const row of r.rows) {
      try { await pool.query('SELECT pg_terminate_backend($1)', [row.pid]); console.log(`  terminated pid=${row.pid}`); }
      catch (e) { console.log(`  fail pid=${row.pid}: ${e.message}`); }
    }
  } catch (e) { console.log('ERR:', e.message); }

  console.log('\n=== Quick speed test ===');
  for (const [label, q] of [
    ['SELECT 1', 'SELECT 1'],
    ['COUNT regular_employees', 'SELECT COUNT(*) FROM regular_employees'],
    ['attendance-summary equivalent', "SELECT id, name, phone, department, team FROM regular_employees WHERE is_active = 1 LIMIT 50"],
    ['confirmed_attendance month', "SELECT COUNT(*) FROM confirmed_attendance WHERE year_month = '2026-05'"],
  ]) {
    const t = Date.now();
    try { const r = await pool.query(q); console.log(`  ${(Date.now()-t).toString().padStart(6)}ms ${label}`); }
    catch (e) { console.log(`  ERR ${label}: ${e.message.slice(0, 80)}`); }
  }

  await pool.end();
}
main().catch(e=>{console.error(e); process.exit(1);});
