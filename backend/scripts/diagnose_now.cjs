// 현재 DB 가 왜 느린지 종합 진단
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 60_000,
});

async function main() {
  console.log(`Connecting to ${host}:${port}...`);

  // 1) Long-running queries / blocking
  console.log('\n=== Active and slow queries ===');
  try {
    const r = await pool.query(`
      SELECT pid, state, application_name,
             EXTRACT(EPOCH FROM (NOW() - query_start))::int as q_age_s,
             wait_event_type, wait_event,
             SUBSTRING(query, 1, 150) as q
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
      ORDER BY query_start ASC LIMIT 30
    `);
    for (const row of r.rows) {
      console.log(`  pid=${row.pid} state=${row.state} age=${row.q_age_s}s wait=${row.wait_event_type}/${row.wait_event} app="${row.application_name}"`);
      console.log(`    Q: ${row.q}`);
    }
    console.log(`Active queries: ${r.rowCount}`);
  } catch (e) { console.log('  ERR:', e.message); }

  // 2) Locks
  console.log('\n=== Blocked queries (lock waits) ===');
  try {
    const r = await pool.query(`
      SELECT pid, mode, locktype, granted, relation::regclass::text as rel
      FROM pg_locks WHERE NOT granted LIMIT 20
    `);
    for (const row of r.rows) console.log(`  pid=${row.pid} ${row.mode} on ${row.rel} (${row.locktype}) granted=${row.granted}`);
    if (r.rowCount === 0) console.log('  (none)');
  } catch (e) { console.log('  ERR:', e.message); }

  // 3) Table bloat & autovacuum status
  console.log('\n=== Table stats (regular_employees) ===');
  try {
    const r = await pool.query(`
      SELECT n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze,
             pg_size_pretty(pg_total_relation_size('regular_employees'::regclass)) as size,
             vacuum_count, autovacuum_count
      FROM pg_stat_user_tables WHERE relname='regular_employees'
    `);
    console.log('  ', r.rows[0]);
  } catch (e) { console.log('  ERR:', e.message); }

  // 4) Time COUNT
  console.log('\n=== Timing tests ===');
  const T = async (label, q) => {
    const t = Date.now();
    try { const r = await pool.query(q); console.log(`  ${label}: ${Date.now()-t}ms rows=${r.rowCount}`); }
    catch (e) { console.log(`  ${label}: ERR (${Date.now()-t}ms) ${e.message.slice(0,80)}`); }
  };
  await T('SELECT 1', 'SELECT 1');
  await T('COUNT regular_employees', 'SELECT COUNT(*) FROM regular_employees');
  await T('LIMIT 1 regular_employees', 'SELECT * FROM regular_employees LIMIT 1');
  await T('list 50 (endpoint shape)', `SELECT re.*, sw.name as workplace_name FROM regular_employees re LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id WHERE re.is_active = 1 OR (re.resign_date != '' AND re.resign_date >= '2026-04-01') ORDER BY re.is_active DESC, re.hire_date DESC NULLS LAST, re.name LIMIT 50`);
  await T('COUNT workers', 'SELECT COUNT(*) FROM workers');

  // 5) schema_migrations marker
  console.log('\n=== schema_migrations ===');
  try {
    const r = await pool.query("SELECT id FROM schema_migrations WHERE id LIKE 'schema-%' ORDER BY id");
    for (const row of r.rows) console.log(`  ${row.id}`);
  } catch (e) { console.log('  ERR:', e.message); }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
