// schema_migrations 에 마커 강제 삽입 — 다음 부팅부터 ALTER 블록 SKIP
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 60_000,
});
async function main() {
  console.log('Creating schema_migrations table (idempotent)...');
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())');
  console.log('Inserting schema-v2.21.2 marker...');
  const r = await pool.query("INSERT INTO schema_migrations (id) VALUES ('schema-v2.21.2') ON CONFLICT DO NOTHING");
  console.log(`  inserted ${r.rowCount} row`);
  console.log('Inserted markers:');
  const r2 = await pool.query("SELECT id, applied_at FROM schema_migrations WHERE id LIKE 'schema%' OR id LIKE 'payroll%' ORDER BY applied_at DESC");
  for (const row of r2.rows) console.log(`  ${row.id} | ${row.applied_at}`);
  await pool.end();
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
