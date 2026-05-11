const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function main() {
  console.log('=== regular_employees columns by avg length (largest first) ===');
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='regular_employees' AND table_schema='public'`);
  const colNames = cols.rows.map(r => r.column_name);
  for (const c of colNames) {
    try {
      const r = await pool.query(`SELECT AVG(LENGTH(${c}::text))::int as avg_len, MAX(LENGTH(${c}::text)) as max_len, COUNT(${c}) as non_null FROM regular_employees`);
      const { avg_len, max_len, non_null } = r.rows[0];
      if (avg_len > 100 || (max_len > 1000)) {
        console.log(`  ${c.padEnd(40)} avg=${(avg_len||0).toString().padStart(10)} max=${(max_len||0).toString().padStart(10)} non_null=${non_null}`);
      }
    } catch {}
  }
  console.log('\n=== Total table size breakdown ===');
  const sz = await pool.query(`
    SELECT pg_size_pretty(pg_relation_size('regular_employees'::regclass)) as heap,
           pg_size_pretty(pg_total_relation_size('regular_employees'::regclass) - pg_relation_size('regular_employees'::regclass)) as toast_index,
           pg_size_pretty(pg_total_relation_size('regular_employees'::regclass)) as total
  `);
  console.log(' ', sz.rows[0]);
  console.log('\n=== Other large tables ===');
  const big = await pool.query(`
    SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) as size, n_live_tup
    FROM pg_stat_user_tables WHERE schemaname='public'
    ORDER BY pg_total_relation_size(relid) DESC LIMIT 10
  `);
  for (const r of big.rows) console.log(`  ${r.relname.padEnd(35)} size=${r.size.padStart(10)} live=${r.n_live_tup}`);
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
