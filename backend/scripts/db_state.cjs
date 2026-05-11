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
  connectionTimeoutMillis: 60_000,
});

async function main() {
  // Active queries
  console.log('=== pg_stat_activity (active or long-idle) ===');
  const act = await pool.query(`
    SELECT pid, state, application_name,
           EXTRACT(EPOCH FROM (NOW() - state_change))::int as state_age_s,
           EXTRACT(EPOCH FROM (NOW() - query_start))::int as query_age_s,
           SUBSTRING(query, 1, 120) as q
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
    ORDER BY state_change ASC
    LIMIT 30
  `);
  for (const r of act.rows) {
    console.log(`  pid=${r.pid} state=${r.state} app="${r.application_name}" state_age=${r.state_age_s}s query_age=${r.query_age_s}s  ${r.q}`);
  }
  console.log(`Total connections: ${act.rowCount}`);

  // Table bloat
  console.log('\n=== Table sizes and dead tuples ===');
  const bloat = await pool.query(`
    SELECT relname,
           n_live_tup, n_dead_tup,
           CASE WHEN n_live_tup > 0 THEN ROUND(100.0 * n_dead_tup / n_live_tup, 1) ELSE NULL END as dead_pct,
           last_vacuum, last_autovacuum, last_analyze, last_autoanalyze,
           pg_size_pretty(pg_total_relation_size(relid)) as size
    FROM pg_stat_user_tables
    WHERE schemaname='public' AND (n_live_tup > 50 OR n_dead_tup > 50)
    ORDER BY n_dead_tup DESC NULLS LAST
    LIMIT 20
  `);
  for (const r of bloat.rows) {
    console.log(`  ${r.relname.padEnd(35)} live=${(r.n_live_tup||0).toString().padStart(7)} dead=${(r.n_dead_tup||0).toString().padStart(7)} dead%=${(r.dead_pct||'-').toString().padStart(6)}  size=${r.size}`);
  }

  // Locks
  console.log('\n=== Blocking locks ===');
  const locks = await pool.query(`
    SELECT blocked.pid as blocked_pid, blocked.query as blocked_query,
           blocking.pid as blocking_pid, blocking.query as blocking_query
    FROM pg_locks bl1
    JOIN pg_stat_activity blocked ON bl1.pid = blocked.pid
    JOIN pg_locks bl2 ON bl1.locktype = bl2.locktype AND bl1.database IS NOT DISTINCT FROM bl2.database
      AND bl1.relation IS NOT DISTINCT FROM bl2.relation AND bl1.page IS NOT DISTINCT FROM bl2.page
      AND bl1.tuple IS NOT DISTINCT FROM bl2.tuple AND bl1.virtualxid IS NOT DISTINCT FROM bl2.virtualxid
      AND bl1.transactionid IS NOT DISTINCT FROM bl2.transactionid AND bl1.classid IS NOT DISTINCT FROM bl2.classid
      AND bl1.objid IS NOT DISTINCT FROM bl2.objid AND bl1.objsubid IS NOT DISTINCT FROM bl2.objsubid
      AND bl1.pid <> bl2.pid
    JOIN pg_stat_activity blocking ON bl2.pid = blocking.pid
    WHERE NOT bl1.granted AND bl2.granted
    LIMIT 20
  `);
  if (locks.rowCount === 0) console.log('  (none)');
  for (const r of locks.rows) console.log(`  ${r.blocked_pid} blocked by ${r.blocking_pid}: ${r.blocking_query?.substring(0,100)}`);

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
