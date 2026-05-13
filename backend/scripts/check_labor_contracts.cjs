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
    let t = Date.now();
    const r1 = await pool.query("SELECT COUNT(*) FROM labor_contracts");
    console.log('labor_contracts count:', r1.rows[0].count, 'in', Date.now()-t, 'ms');

    t = Date.now();
    const r2 = await pool.query("SELECT pg_size_pretty(pg_total_relation_size('labor_contracts')) sz");
    console.log('labor_contracts size:', r2.rows[0].sz, 'in', Date.now()-t, 'ms');

    t = Date.now();
    const r3 = await pool.query(`
      SELECT indexname, indexdef
      FROM pg_indexes WHERE tablename='labor_contracts'
    `);
    console.log('indexes:', r3.rowCount);
    for (const row of r3.rows) console.log(' ', row.indexname);

    // Run the actual LATERAL query
    t = Date.now();
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
    console.log('workers main query:', r4.rowCount, 'rows in', Date.now()-t, 'ms');

    // Just w.* without lateral
    t = Date.now();
    const r5 = await pool.query("SELECT * FROM workers ORDER BY name_ko ASC LIMIT 50");
    console.log('plain workers SELECT *:', r5.rowCount, 'in', Date.now()-t, 'ms');

    // EXPLAIN the LATERAL
    t = Date.now();
    const r6 = await pool.query(`
      EXPLAIN ANALYZE
      SELECT w.*, c.contract_id
      FROM workers w
      LEFT JOIN LATERAL (
        SELECT id as contract_id
        FROM labor_contracts
        WHERE phone = w.phone AND contract_end >= CURRENT_DATE::text
        ORDER BY created_at DESC LIMIT 1
      ) c ON true
      ORDER BY w.name_ko ASC
      LIMIT 50
    `);
    console.log('EXPLAIN:');
    for (const row of r6.rows) console.log(' ', row['QUERY PLAN']);
  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
})();
