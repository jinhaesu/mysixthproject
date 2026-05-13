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
    // Table size
    let t = Date.now();
    const r1 = await pool.query("SELECT pg_size_pretty(pg_total_relation_size('workers')) as size, pg_size_pretty(pg_relation_size('workers')) as main");
    console.log('workers size:', r1.rows[0], 'in', Date.now()-t, 'ms');

    // Column sizes — find which is huge
    t = Date.now();
    const r2 = await pool.query(`
      SELECT
        AVG(LENGTH(COALESCE(phone,''))) avg_phone,
        AVG(LENGTH(COALESCE(name_ko,''))) avg_name_ko,
        AVG(LENGTH(COALESCE(bank_name,''))) avg_bank_name,
        AVG(LENGTH(COALESCE(bank_account,''))) avg_bank_account,
        AVG(LENGTH(COALESCE(id_number,''))) avg_id_number,
        AVG(LENGTH(COALESCE(memo,''))) avg_memo,
        MAX(LENGTH(COALESCE(memo,''))) max_memo,
        MAX(LENGTH(COALESCE(id_number,''))) max_id_number
      FROM workers
    `);
    console.log('column sizes:', JSON.stringify(r2.rows[0]), 'in', Date.now()-t, 'ms');

    // List all columns
    t = Date.now();
    const r3 = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'workers' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    console.log('Columns:');
    for (const row of r3.rows) console.log(' ', row.column_name, '-', row.data_type);

    // Slow query analysis
    t = Date.now();
    const r4 = await pool.query(`
      SELECT id, phone, name_ko, name_en, bank_name, bank_account, id_number,
             category, department, workplace, COALESCE(hourly_rate,0) as hourly_rate
      FROM workers ORDER BY name_ko ASC LIMIT 5
    `);
    console.log('workers/lite LIMIT 5:', r4.rowCount, 'in', Date.now()-t, 'ms');

    // Just IDs
    t = Date.now();
    const r5 = await pool.query("SELECT id FROM workers ORDER BY name_ko ASC");
    console.log('Just IDs:', r5.rowCount, 'in', Date.now()-t, 'ms');

  } catch (e) {
    console.error('ERR:', e.message);
  }
  await pool.end();
})();
