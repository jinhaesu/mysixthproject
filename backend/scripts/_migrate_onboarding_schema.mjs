// 입사자/퇴사자 관리용 컬럼 일괄 추가 + 4월 입사자 onboarding_status 초기화
// Railway 자동 배포 전 수동 실행용 (db.ts initializeDB와 동일 결과)
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const REGULAR_EMP_COLS = [
  ['birth_date',                "TEXT DEFAULT ''"],
  ['email',                     "TEXT DEFAULT ''"],
  ['address',                   "TEXT DEFAULT ''"],
  ['nationality',               "TEXT DEFAULT 'KR'"],
  ['visa_type',                 "TEXT DEFAULT ''"],
  ['visa_expiry',               "TEXT DEFAULT ''"],
  ['bank_slip_data',            "TEXT DEFAULT ''"],
  ['foreign_id_card_data',      "TEXT DEFAULT ''"],
  ['family_register_data',      "TEXT DEFAULT ''"],
  ['resident_register_data',    "TEXT DEFAULT ''"],
  ['signed_contract_url',       "TEXT DEFAULT ''"],
  ['business_registration_no',  "TEXT DEFAULT ''"],
  ['monthly_salary',            'INTEGER DEFAULT 0'],
  ['non_taxable_meal',          'INTEGER DEFAULT 0'],
  ['non_taxable_vehicle',       'INTEGER DEFAULT 0'],
  ['job_code',                  "TEXT DEFAULT ''"],
  ['weekly_work_hours',         'NUMERIC(4,1) DEFAULT 40'],
  ['employment_type',           "TEXT DEFAULT 'regular'"],
  ['onboarding_status',         "TEXT DEFAULT 'pending'"],
  ['onboarding_completed_at',   'TIMESTAMPTZ'],
  ['onboarding_email_sent',     'INTEGER DEFAULT 0'],
  ['onboarding_email_sent_at',  'TIMESTAMPTZ'],
];

const REGULAR_CONTRACT_COLS = [
  ['email',                "TEXT DEFAULT ''"],
  ['nationality',          "TEXT DEFAULT 'KR'"],
  ['visa_type',            "TEXT DEFAULT ''"],
  ['visa_expiry',          "TEXT DEFAULT ''"],
  ['bank_slip_data',       "TEXT DEFAULT ''"],
  ['foreign_id_card_data', "TEXT DEFAULT ''"],
];

const OFFBOARDING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS employee_offboardings (
    id SERIAL PRIMARY KEY,
    employee_type TEXT NOT NULL,
    employee_ref_id INTEGER,
    employee_name TEXT NOT NULL,
    employee_phone TEXT DEFAULT '',
    department TEXT DEFAULT '',
    hire_date TEXT DEFAULT '',
    resign_date TEXT NOT NULL,
    loss_date TEXT DEFAULT '',
    reason_code TEXT NOT NULL DEFAULT '',
    reason_detail TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_progress',
    resignation_letter_received INTEGER DEFAULT 0,
    assets_returned INTEGER DEFAULT 0,
    pension_reported INTEGER DEFAULT 0,
    health_insurance_reported INTEGER DEFAULT 0,
    employment_insurance_reported INTEGER DEFAULT 0,
    industrial_accident_reported INTEGER DEFAULT 0,
    severance_paid INTEGER DEFAULT 0,
    annual_leave_settled INTEGER DEFAULT 0,
    income_tax_reported INTEGER DEFAULT 0,
    severance_method TEXT DEFAULT 'avg_3m',
    severance_auto NUMERIC(12,0) DEFAULT 0,
    severance_final NUMERIC(12,0) DEFAULT 0,
    annual_leave_remaining NUMERIC(5,1) DEFAULT 0,
    annual_leave_pay_auto NUMERIC(12,0) DEFAULT 0,
    annual_leave_pay_final NUMERIC(12,0) DEFAULT 0,
    retirement_income_tax NUMERIC(12,0) DEFAULT 0,
    notes TEXT DEFAULT '',
    email_sent INTEGER DEFAULT 0,
    email_sent_at TIMESTAMPTZ,
    last_reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_offboarding_status ON employee_offboardings(status);
  CREATE INDEX IF NOT EXISTS idx_offboarding_resign_date ON employee_offboardings(resign_date);
  CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON employee_offboardings(employee_type, employee_ref_id);
`;

async function main() {
  const conn = await pool.query('SELECT current_database() AS db');
  console.log(`DB: ${conn.rows[0].db}\n`);

  console.log('=== 1. employee_offboardings 테이블 생성 ===');
  await pool.query(OFFBOARDING_TABLE_SQL);
  console.log('  ✓ 테이블 + 인덱스 생성 완료\n');

  console.log('=== 2. regular_employees 신규 컬럼 ===');
  for (const [col, def] of REGULAR_EMP_COLS) {
    try {
      await pool.query(`ALTER TABLE regular_employees ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      console.log(`  ✓ ${col}`);
    } catch (e) {
      console.log(`  ✗ ${col} : ${e.message}`);
    }
  }

  console.log('\n=== 3. regular_labor_contracts 신규 컬럼 ===');
  for (const [col, def] of REGULAR_CONTRACT_COLS) {
    try {
      await pool.query(`ALTER TABLE regular_labor_contracts ADD COLUMN IF NOT EXISTS ${col} ${def}`);
      console.log(`  ✓ ${col}`);
    } catch (e) {
      console.log(`  ✗ ${col} : ${e.message}`);
    }
  }

  console.log('\n=== 4. 외국인 자동 분류 (이름·비자 키워드 기반) ===');
  // E-9, F-4, F-5, F-6 등이 이름에 포함되거나 영문 이름 포함된 경우 외국인으로 분류
  const fr = await pool.query(`
    UPDATE regular_employees
    SET nationality = 'FOREIGN'
    WHERE (name ~ 'E-9|F-4|F-5|F-6|H-2|D-2|D-10|e-9|f-4|f-5|f-6'
       OR name ~ '^[A-Z]')
      AND (nationality IS NULL OR nationality = '' OR nationality = 'KR')
    RETURNING id, name
  `);
  console.log(`  ✓ ${fr.rowCount}명 외국인 분류`);

  console.log('\n=== 5. 4월 정규직 입사자 onboarding_status 초기화 ===');
  // 모두 'pending'으로 시작 (이미 default 'pending'이지만 명시적 처리)
  // bank_account가 있으면 어느 정도 정보 수집된 상태로 표시
  const aprilUpd = await pool.query(`
    UPDATE regular_employees
    SET onboarding_status = 'pending'
    WHERE hire_date LIKE '2026-04%'
      AND is_active = 1
      AND (onboarding_status IS NULL OR onboarding_status = '')
    RETURNING id, name
  `);
  console.log(`  ✓ ${aprilUpd.rowCount}명 onboarding_status='pending' 설정`);

  console.log('\n=== 6. 계약서 정보를 regular_employees로 backfill ===');
  // 가장 최근 계약서의 email, address 등을 regular_employees로 propagate
  const backfillResult = await pool.query(`
    WITH latest_contract AS (
      SELECT DISTINCT ON (employee_id) *
      FROM regular_labor_contracts
      WHERE signature_data IS NOT NULL AND signature_data <> ''
      ORDER BY employee_id, created_at DESC
    )
    UPDATE regular_employees re
    SET
      email   = COALESCE(NULLIF(re.email, ''),   COALESCE(lc.email, '')),
      address = COALESCE(NULLIF(re.address, ''), COALESCE(lc.address, ''))
    FROM latest_contract lc
    WHERE re.id = lc.employee_id
      AND re.hire_date LIKE '2026-04%'
    RETURNING re.id, re.name
  `);
  console.log(`  ✓ ${backfillResult.rowCount}명 이메일/주소 backfill`);

  console.log('\n=== 7. 4월 입사자 최종 상태 ===');
  const final = await pool.query(`
    SELECT re.id, re.name, re.phone, re.hire_date, re.nationality, re.onboarding_status,
           CASE WHEN re.email IS NOT NULL AND re.email <> '' THEN 'O' ELSE 'X' END AS email_ok,
           CASE WHEN re.bank_account IS NOT NULL AND re.bank_account <> '' THEN 'O' ELSE 'X' END AS bank_ok,
           EXISTS(SELECT 1 FROM regular_labor_contracts rlc
                  WHERE rlc.employee_id = re.id AND rlc.signature_data IS NOT NULL AND rlc.signature_data <> '')
             AS has_signed_contract
    FROM regular_employees re
    WHERE re.hire_date LIKE '2026-04%' AND re.is_active = 1
    ORDER BY re.hire_date, re.name
  `);
  final.rows.forEach(r => {
    console.log(`  #${r.id} ${r.name.padEnd(40)} ${r.hire_date} | ${r.nationality} | onb=${r.onboarding_status} | email=${r.email_ok} bank=${r.bank_ok} contract=${r.has_signed_contract ? 'O' : 'X'}`);
  });
  console.log(`\n  총 ${final.rowCount}명`);

  await pool.end();
  console.log('\n=== 완료 ===');
  console.log('이제 백엔드(Railway)가 새 코드로 배포되면 /api/onboarding 호출 시 4월 입사자 모두 보입니다.');
  console.log('현재 Railway 버전이 v2.0.0이므로 main 브랜치로 머지하거나 Railway 수동 배포가 필요합니다.');
}

main().catch(err => { console.error(err); process.exit(1); });
