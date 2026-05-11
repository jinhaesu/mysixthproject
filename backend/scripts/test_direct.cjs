// Direct Supabase 연결 테스트 (pooler 우회)
const fs = require('fs');
const { Pool } = require('pg');

let directUrl;
try {
  const envContent = fs.readFileSync(__dirname + '/../.env.direct', 'utf-8');
  const match = envContent.match(/DATABASE_URL_DIRECT=(.+)/);
  if (!match) { console.error('No DATABASE_URL_DIRECT in .env.direct'); process.exit(1); }
  directUrl = match[1].trim();
} catch (e) {
  console.error('Cannot read .env.direct:', e.message);
  process.exit(1);
}

// Manual parse — password may contain special chars (/!@:.) breaking URL parser
const m = directUrl.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+))?$/);
if (!m) { console.error('Failed to parse direct URL'); process.exit(1); }
const [, user, password, host, port, database] = m;
console.log(`Direct host: ${host}:${port || 5432}`);
console.log(`Direct user: ${user}`);

const pool = new Pool({
  user,
  password,
  host,
  port: parseInt(port || '5432'),
  database: database || 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
});

async function timed(label, fn) {
  const t0 = Date.now();
  try { const r = await fn(); console.log(`${(Date.now()-t0).toString().padStart(6)}ms  ${label}  rows=${r?.rowCount ?? '-'}`); return r; }
  catch (e) { console.log(`  ERR  ${label}  ${e.message}`); }
}

async function main() {
  await timed('connect+SELECT 1', () => pool.query('SELECT 1'));
  await timed('COUNT regular_employees', () => pool.query('SELECT COUNT(*) FROM regular_employees'));
  await timed('list 50', () => pool.query('SELECT id, name FROM regular_employees ORDER BY name LIMIT 50'));
  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
