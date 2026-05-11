// 주요 엔드포인트 성능 진단 — 어떤 쿼리가 느린지 측정
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
  try {
    const r = await fn();
    const dt = Date.now() - t0;
    console.log(`${dt.toString().padStart(6)}ms  ${label}  (rows: ${r?.rowCount ?? '-'})`);
    return r;
  } catch (e) {
    const dt = Date.now() - t0;
    console.log(`${dt.toString().padStart(6)}ms  ${label}  ERROR: ${e.message}`);
  }
}

async function main() {
  console.log('=== Row counts ===');
  for (const t of ['workers', 'labor_contracts', 'survey_requests', 'survey_responses', 'confirmed_attendance', 'regular_employees']) {
    await timed(`COUNT ${t}`, () => pool.query(`SELECT COUNT(*) FROM ${t}`));
  }

  console.log('\n=== Index list (key tables) ===');
  const idx = await pool.query(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename IN ('workers','labor_contracts','survey_requests','survey_responses','confirmed_attendance','regular_employees')
    ORDER BY tablename, indexname
  `);
  for (const r of idx.rows) console.log(`  ${r.tablename}.${r.indexname}: ${r.indexdef}`);

  console.log('\n=== Workers GET — current heavy query ===');
  const today = new Date().toISOString().slice(0, 10);
  await timed('workers GET (limit 50)', () => pool.query(`
    SELECT w.*,
      (SELECT lc.id FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_id,
      (SELECT lc.contract_start FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_start,
      (SELECT lc.contract_end FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_end,
      (SELECT MAX(sr.date) FROM survey_requests sr JOIN survey_responses resp ON sr.id = resp.request_id WHERE sr.phone = w.phone AND resp.clock_in_time IS NOT NULL) as last_clock_in_date
    FROM workers w WHERE 1=1
    ORDER BY last_clock_in_date DESC NULLS LAST, w.name_ko ASC LIMIT 50 OFFSET 0
  `));
  await timed('workers GET (limit 10000, full)', () => pool.query(`
    SELECT w.*,
      (SELECT lc.id FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_id,
      (SELECT lc.contract_start FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_start,
      (SELECT lc.contract_end FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_end,
      (SELECT MAX(sr.date) FROM survey_requests sr JOIN survey_responses resp ON sr.id = resp.request_id WHERE sr.phone = w.phone AND resp.clock_in_time IS NOT NULL) as last_clock_in_date
    FROM workers w WHERE 1=1
    ORDER BY last_clock_in_date DESC NULLS LAST, w.name_ko ASC LIMIT 10000 OFFSET 0
  `));

  console.log('\n=== Workers GET — proposed lite (no subqueries) ===');
  await timed('workers lite', () => pool.query(`
    SELECT id, phone, name_ko, name_en, bank_name, bank_account, id_number, category, department, workplace, hourly_rate
    FROM workers ORDER BY name_ko ASC
  `));

  console.log('\n=== Workers GET — proposed LATERAL joins ===');
  await timed('workers LATERAL', () => pool.query(`
    SELECT w.*, c.contract_id, c.contract_start, c.contract_end, s.last_clock_in_date
    FROM workers w
    LEFT JOIN LATERAL (
      SELECT id as contract_id, contract_start, contract_end
      FROM labor_contracts WHERE phone = w.phone AND contract_end >= '${today}'
      ORDER BY created_at DESC LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT MAX(sr.date) as last_clock_in_date
      FROM survey_requests sr JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.phone = w.phone AND resp.clock_in_time IS NOT NULL
    ) s ON true
    ORDER BY last_clock_in_date DESC NULLS LAST, w.name_ko ASC LIMIT 10000
  `));

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
