const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host,
  port: parseInt(port || '5432'),
  database: database || 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 1, connectionTimeoutMillis: 60000,
});
(async () => {
  try {
    const r1 = await pool.query(`
      SELECT application_name, state, COUNT(*) cnt
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid != pg_backend_pid()
      GROUP BY application_name, state
      ORDER BY cnt DESC
    `);
    console.log('Connections by app/state:');
    for (const row of r1.rows) console.log(' ', row.application_name?.padEnd(40) || '', row.state?.padEnd(15), row.cnt);

    const r2 = await pool.query(`SELECT setting FROM pg_settings WHERE name = 'max_connections'`);
    console.log('PG max_connections:', r2.rows[0]?.setting);

    const r3 = await pool.query(`SELECT setting FROM pg_settings WHERE name = 'superuser_reserved_connections'`);
    console.log('PG reserved:', r3.rows[0]?.setting);

    // List long-running queries
    const r4 = await pool.query(`
      SELECT application_name, EXTRACT(EPOCH FROM (NOW() - query_start))::int age, state,
             SUBSTRING(query, 1, 80) q
      FROM pg_stat_activity
      WHERE datname = current_database() AND state != 'idle' AND pid != pg_backend_pid()
      ORDER BY age DESC LIMIT 10
    `);
    console.log('Active queries:', r4.rowCount);
    for (const row of r4.rows) console.log(' ', row.application_name?.padEnd(30) || '', `${row.age}s`, row.state, row.q?.replace(/\s+/g,' ').substring(0,60));
  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
})();
