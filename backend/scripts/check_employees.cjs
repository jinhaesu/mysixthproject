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
    const r1 = await pool.query('SELECT COUNT(*) as total FROM regular_employees');
    console.log('Total regular_employees:', r1.rows[0].total);
    const r2 = await pool.query('SELECT COUNT(*) as active FROM regular_employees WHERE is_active = 1');
    console.log('is_active=1:', r2.rows[0].active);
    const r3 = await pool.query('SELECT is_active, COUNT(*) cnt FROM regular_employees GROUP BY is_active');
    console.log('is_active distribution:');
    for (const row of r3.rows) console.log(' ', JSON.stringify(row));
    const r4 = await pool.query('SELECT id, name, is_active, resign_date FROM regular_employees ORDER BY id LIMIT 10');
    console.log('Sample rows:');
    for (const row of r4.rows) console.log(' ', JSON.stringify(row));
    const r5 = await pool.query(`
      SELECT id, name, is_active FROM regular_employees re
      WHERE re.is_active = 1 LIMIT 3
    `);
    console.log('Endpoint WHERE clause result (first 3):');
    for (const row of r5.rows) console.log(' ', JSON.stringify(row));
  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
})();
