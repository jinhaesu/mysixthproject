// 유휴 + 좀비 연결 강제 종료 (Supabase Session pool 회복)
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
  try {
    const r = await pool.query(`
      SELECT pid, state, application_name, query_start, state_change,
             EXTRACT(EPOCH FROM (NOW() - state_change))::int as idle_seconds,
             SUBSTRING(query, 1, 80) as query_snippet
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      ORDER BY state_change ASC
    `);
    console.log(`Found ${r.rowCount} connections:`);
    let toKill = [];
    for (const row of r.rows) {
      console.log(`  pid=${row.pid} state=${row.state} app="${row.application_name}" idle=${row.idle_seconds}s query="${row.query_snippet}"`);
      if (row.state === 'idle' && row.idle_seconds > 30) toKill.push(row.pid);
    }
    console.log(`\nKilling ${toKill.length} idle connections (>30s)...`);
    for (const pid of toKill) {
      try {
        await pool.query('SELECT pg_terminate_backend($1)', [pid]);
        console.log(`  killed pid=${pid}`);
      } catch (e) { console.log(`  failed pid=${pid}: ${e.message}`); }
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}
main();
