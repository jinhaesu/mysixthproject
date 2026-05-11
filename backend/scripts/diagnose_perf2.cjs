// 반복 측정 + VACUUM/bloat 확인
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const parsed = new URL(url);
const pool = new Pool({
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  host: parsed.hostname,
  port: parseInt(parsed.port) || 5432,
  database: parsed.pathname.slice(1) || 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function timed(label, fn) {
  const t0 = Date.now();
  try { await fn(); console.log(`${(Date.now() - t0).toString().padStart(6)}ms  ${label}`); }
  catch (e) { console.log(`  ERR  ${label}  ${e.message}`); }
}

async function main() {
  // Warm up
  await pool.query('SELECT 1');

  console.log('=== Repeated COUNT timings (cold vs warm) ===');
  for (let i = 0; i < 5; i++) {
    await timed(`COUNT workers #${i+1}`, () => pool.query('SELECT COUNT(*) FROM workers'));
  }

  console.log('\n=== Repeated workers GET (limit 50) ===');
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 3; i++) {
    await timed(`workers list #${i+1}`, () => pool.query(`
      SELECT w.*,
        (SELECT lc.id FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_id
      FROM workers w ORDER BY w.name_ko LIMIT 50
    `));
  }

  console.log('\n=== Table bloat info ===');
  const bloat = await pool.query(`
    SELECT relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze, last_vacuum, last_analyze
    FROM pg_stat_user_tables
    WHERE relname IN ('workers','labor_contracts','survey_requests','survey_responses','confirmed_attendance','regular_employees','regular_payroll_adjustments')
    ORDER BY n_dead_tup DESC NULLS LAST
  `);
  for (const r of bloat.rows) {
    console.log(`  ${r.relname.padEnd(35)} live=${(r.n_live_tup||0).toString().padStart(8)} dead=${(r.n_dead_tup||0).toString().padStart(8)} last_autovac=${r.last_autovacuum || '-'}`);
  }

  console.log('\n=== Common search endpoints ===');
  await timed('survey_requests recent date',
    () => pool.query(`SELECT * FROM survey_requests WHERE date >= '2026-04-01' ORDER BY date DESC LIMIT 100`));
  await timed('confirmed_attendance 2026-04',
    () => pool.query(`SELECT * FROM confirmed_attendance WHERE year_month = '2026-04' LIMIT 1000`));

  console.log('\n=== VACUUM ANALYZE workers (manual) ===');
  await timed('VACUUM ANALYZE workers', () => pool.query('VACUUM ANALYZE workers'));
  console.log('\n=== After VACUUM ===');
  for (let i = 0; i < 3; i++) {
    await timed(`COUNT workers post-vac #${i+1}`, () => pool.query('SELECT COUNT(*) FROM workers'));
  }

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
