import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

// 완료(양쪽 서명) + 현재 유효(supersede X) + company_stamp_url 비어있는 계약서
// regular_labor_contracts (정규직 카페 등)
console.log('=== [regular_labor_contracts] 회사 날인 누락 (완료+현재유효) ===');
const reg = await pool.query(`
  SELECT id, worker_name, employee_id, contract_kind, contract_start, contract_end,
         worker_signed_at, employer_signed_at, company_stamp_url,
         (document_snapshot_html IS NOT NULL) as has_snapshot,
         document_version
  FROM regular_labor_contracts
  WHERE worker_signed_at IS NOT NULL
    AND employer_signed_at IS NOT NULL
    AND superseded_by IS NULL
    AND (company_stamp_url IS NULL OR company_stamp_url = '')
  ORDER BY employer_signed_at DESC
`);
console.log(`대상: ${reg.rowCount}건`);
reg.rows.slice(0, 10).forEach(r => {
  console.log(`  id=${r.id} ${r.worker_name} (${r.contract_kind}) 서명완료=${new Date(r.employer_signed_at).toISOString().slice(0,10)} snapshot=${r.has_snapshot}`);
});
if (reg.rowCount > 10) console.log(`  ... 외 ${reg.rowCount - 10}건`);

// contract_kind 분포
if (reg.rowCount > 0) {
  const byKind = await pool.query(`
    SELECT contract_kind, COUNT(*) as n
    FROM regular_labor_contracts
    WHERE worker_signed_at IS NOT NULL AND employer_signed_at IS NOT NULL
      AND superseded_by IS NULL
      AND (company_stamp_url IS NULL OR company_stamp_url = '')
    GROUP BY contract_kind ORDER BY n DESC
  `);
  console.log('\n  contract_kind 분포:');
  byKind.rows.forEach(r => console.log(`    ${r.contract_kind}: ${r.n}건`));
}

// labor_contracts (알바/카페 알바) — 컬럼 존재 여부 먼저 확인
console.log('\n=== [labor_contracts] 컬럼 존재 여부 확인 ===');
const cols = await pool.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'labor_contracts'
    AND column_name IN ('company_stamp_url', 'worker_signed_at', 'employer_signed_at', 'superseded_by', 'worker_type')
  ORDER BY column_name
`);
console.log('  존재 컬럼:', cols.rows.map(r => r.column_name).join(', '));
const hasCompanyStamp = cols.rows.some(r => r.column_name === 'company_stamp_url');
if (hasCompanyStamp) {
  console.log('\n=== [labor_contracts] 회사 날인 누락 (완료+현재유효) ===');
  const alba = await pool.query(`
    SELECT id, name, worker_type, contract_start, contract_end,
           worker_signed_at, employer_signed_at,
           (document_snapshot_html IS NOT NULL) as has_snapshot
    FROM labor_contracts
    WHERE worker_signed_at IS NOT NULL
      AND employer_signed_at IS NOT NULL
      AND superseded_by IS NULL
      AND (company_stamp_url IS NULL OR company_stamp_url = '')
    ORDER BY employer_signed_at DESC
  `);
  console.log(`대상: ${alba.rowCount}건`);
  alba.rows.slice(0, 10).forEach(r => {
    console.log(`  id=${r.id} ${r.name} (${r.worker_type}) 서명완료=${new Date(r.employer_signed_at).toISOString().slice(0,10)} snapshot=${r.has_snapshot}`);
  });
  if (alba.rowCount > 10) console.log(`  ... 외 ${alba.rowCount - 10}건`);
} else {
  console.log('  labor_contracts 에는 company_stamp_url 컬럼 없음 → 알바/카페 알바는 컬럼 자체가 없어 처리 대상 아님');
}

await pool.end();
