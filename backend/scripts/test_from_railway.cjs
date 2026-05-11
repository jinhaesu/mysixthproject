// Railway env 에서 direct IPv6 + Session pooler 비교 테스트
const dns = require('dns');
const { Pool } = require('pg');

async function timed(label, pool, q) {
  const t0 = Date.now();
  try {
    const r = await pool.query(q);
    console.log(`  ${label}: ${Date.now()-t0}ms (${r.rows[0]?.count || r.rowCount})`);
    return true;
  } catch (e) {
    console.log(`  ${label}: ERR (${Date.now()-t0}ms) ${e.message.slice(0, 100)}`);
    return false;
  }
}

async function tryPool(label, opts) {
  console.log(`\n=== ${label} ===`);
  const pool = new Pool({ ...opts, max: 1, connectionTimeoutMillis: 15_000 });
  pool.on('error', e => console.log(`  [pool err] ${e.message.slice(0, 80)}`));
  await timed('ping', pool, 'SELECT 1');
  await timed('count', pool, 'SELECT COUNT(*) FROM regular_employees');
  await pool.end().catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL;
  console.log(`Current DATABASE_URL host: ${url.split('@')[1]?.split('/')[0]}`);

  // Manual parse password (may contain /:!@)
  const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
  const [, user, password, host, port, database] = m;
  console.log(`Parsed: user=${user} host=${host}:${port}`);

  // 1) Current (Transaction pooler 6543)
  await tryPool('Transaction pooler (6543)', {
    user, password, host, port: parseInt(port), database, ssl: { rejectUnauthorized: false }
  });

  // 2) Session pooler (5432, same host)
  await tryPool('Session pooler (5432)', {
    user, password, host, port: 5432, database, ssl: { rejectUnauthorized: false }
  });

  // 3) Direct (db.PROJECT.supabase.co:5432) — IPv6 only on Pro w/o IPv4 add-on
  const projMatch = user.match(/postgres\.(.+)/);
  if (projMatch) {
    const directHost = `db.${projMatch[1]}.supabase.co`;
    try {
      const v6 = await new Promise((res, rej) => dns.lookup(directHost, { family: 6 }, (e, a) => e ? rej(e) : res(a)));
      console.log(`\nDirect IPv6 resolved: ${v6}`);
      await tryPool('Direct (IPv6)', {
        user: 'postgres', password, host: v6, port: 5432, database: 'postgres',
        ssl: { rejectUnauthorized: false, servername: directHost }
      });
    } catch (e) {
      console.log(`\nDirect IPv6 resolve failed: ${e.message}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
