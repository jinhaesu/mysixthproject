// per-row blob 크기 확인
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function main() {
  console.log('=== regular_employees blob 크기 상위 10명 ===');
  const r = await pool.query(`
    SELECT id, name,
           COALESCE(LENGTH(bank_slip_data), 0) +
           COALESCE(LENGTH(foreign_id_card_data), 0) +
           COALESCE(LENGTH(family_register_data), 0) +
           COALESCE(LENGTH(resident_register_data), 0) AS blob_bytes,
           CASE WHEN bank_slip_data != '' THEN 1 ELSE 0 END as has_bs,
           CASE WHEN foreign_id_card_data != '' THEN 1 ELSE 0 END as has_fic,
           CASE WHEN family_register_data != '' THEN 1 ELSE 0 END as has_fr,
           CASE WHEN resident_register_data != '' THEN 1 ELSE 0 END as has_rr
    FROM regular_employees
    ORDER BY blob_bytes DESC LIMIT 10
  `);
  for (const row of r.rows) {
    const mb = (row.blob_bytes / 1024 / 1024).toFixed(2);
    console.log(`  id=${row.id} ${row.name}  ${mb} MB  bs=${row.has_bs} fic=${row.has_fic} fr=${row.has_fr} rr=${row.has_rr}`);
  }

  // total
  const t = await pool.query(`
    SELECT COUNT(*) cnt, AVG(blob)::bigint avg, MAX(blob) mx, SUM(blob) tot
    FROM (SELECT
      COALESCE(LENGTH(bank_slip_data), 0) +
      COALESCE(LENGTH(foreign_id_card_data), 0) +
      COALESCE(LENGTH(family_register_data), 0) +
      COALESCE(LENGTH(resident_register_data), 0) AS blob
    FROM regular_employees) x
  `);
  console.log(`\nTotal: ${t.rows[0].cnt} rows, avg=${(t.rows[0].avg/1024/1024).toFixed(2)}MB, max=${(t.rows[0].mx/1024/1024).toFixed(2)}MB, sum=${(t.rows[0].tot/1024/1024).toFixed(2)}MB`);

  // contracts
  console.log('\n=== regular_labor_contracts blob 크기 상위 5건 ===');
  const c = await pool.query(`
    SELECT id, name,
           COALESCE(LENGTH(signature_data), 0) +
           COALESCE(LENGTH(scanned_file_data), 0) +
           COALESCE(LENGTH(bank_slip_data), 0) +
           COALESCE(LENGTH(foreign_id_card_data), 0) AS blob_bytes
    FROM regular_labor_contracts
    ORDER BY blob_bytes DESC LIMIT 5
  `);
  for (const row of c.rows) console.log(`  contract id=${row.id} ${row.name}  ${(row.blob_bytes/1024/1024).toFixed(2)} MB`);

  await pool.end();
}
main().catch(e=>{console.error(e); process.exit(1);});
