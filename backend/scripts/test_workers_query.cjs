const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host,
  port: parseInt(port || '5432'),
  database: database || 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 1, connectionTimeoutMillis: 30000,
});
(async () => {
  try {
    // Test workers/lite
    let t = Date.now();
    const r1 = await pool.query(
      `SELECT id, phone, name_ko, name_en, bank_name, bank_account, id_number,
              category, department, workplace, COALESCE(hourly_rate,0) as hourly_rate
       FROM workers ORDER BY name_ko ASC`
    );
    console.log('workers/lite:', r1.rowCount, 'rows in', Date.now()-t, 'ms');

    // Test workers main with LATERAL
    t = Date.now();
    const r2 = await pool.query(`
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
    console.log('workers main:', r2.rowCount, 'rows in', Date.now()-t, 'ms');

    // Count with WHERE
    t = Date.now();
    const r3 = await pool.query("SELECT COUNT(*) as total FROM workers w WHERE 1=1");
    console.log('count:', r3.rows[0].total, 'in', Date.now()-t, 'ms');
  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
})();
