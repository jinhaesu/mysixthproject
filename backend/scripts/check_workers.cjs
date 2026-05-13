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
    const r1 = await pool.query('SELECT COUNT(*) as total FROM workers');
    console.log('Total workers:', r1.rows[0].total);
    const r2 = await pool.query("SELECT category, COUNT(*) cnt FROM workers GROUP BY category");
    console.log('Category distribution:');
    for (const row of r2.rows) console.log(' ', JSON.stringify(row));
    const r3 = await pool.query('SELECT id, name_ko, phone, category, department FROM workers ORDER BY id LIMIT 5');
    console.log('Sample rows:');
    for (const row of r3.rows) console.log(' ', JSON.stringify(row));

    // Actual endpoint query
    const t = Date.now();
    const r4 = await pool.query(`
      SELECT w.*, c.contract_id, c.contract_start, c.contract_end
      FROM workers w
      LEFT JOIN LATERAL (
        SELECT id as contract_id, contract_start, contract_end
        FROM labor_contracts
        WHERE phone = w.phone AND contract_end >= CURRENT_DATE::text
        ORDER BY created_at DESC LIMIT 1
      ) c ON true
      WHERE 1=1
      ORDER BY w.name_ko ASC
      LIMIT 50 OFFSET 0
    `);
    console.log('Endpoint query:', r4.rowCount, 'rows in', (Date.now()-t), 'ms');
  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
})();
