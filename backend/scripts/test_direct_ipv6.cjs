// Test direct connection with IPv6
const dns = require('dns');
const { Pool } = require('pg');
const fs = require('fs');

const envContent = fs.readFileSync(__dirname + '/../.env.direct', 'utf-8');
const directUrl = envContent.match(/DATABASE_URL_DIRECT=(.+)/)[1].trim();
const m = directUrl.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+))?$/);
const [, user, password, host, port, database] = m;

async function main() {
  // Resolve IPv6 directly
  const v6 = await new Promise((res, rej) => dns.lookup(host, { family: 6 }, (e, a) => e ? rej(e) : res(a)));
  console.log(`IPv6 address: ${v6}`);

  const pool = new Pool({
    user,
    password,
    host: v6,           // use IPv6 directly
    port: parseInt(port || '5432'),
    database: database || 'postgres',
    ssl: { rejectUnauthorized: false, servername: host },  // SNI uses hostname
    max: 1,
    connectionTimeoutMillis: 20_000,
  });
  try {
    const t0 = Date.now();
    const r = await pool.query('SELECT COUNT(*) FROM regular_employees');
    console.log(`COUNT regular_employees: ${Date.now()-t0}ms, value=${r.rows[0].count}`);
    const t1 = Date.now();
    const w = await pool.query('SELECT id, name_ko FROM workers LIMIT 50');
    console.log(`workers list 50: ${Date.now()-t1}ms, rows=${w.rowCount}`);
  } catch (e) {
    console.error('ERR:', e.message);
  } finally {
    await pool.end();
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
