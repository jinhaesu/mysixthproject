import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

async function main() {
  console.log('\n=== 티늉 - 첫 근속 데이터로 복원 (payroll-calc 정상화 목적) ===\n');
  console.log('배경: employment_periods 참조 코드가 revert 되어 old payroll-calc 는 hire_date 만 봄.');
  console.log('     hire=8/4 (재입사) 로 두면 7월 records 전부 skip → 급여 0원.');
  console.log('     → 임시로 hire=3/30, resign=7/20 (첫 근속) 로 복원. employment_periods 는 유지.\n');

  await pool.query(
    `UPDATE regular_employees
       SET hire_date = '2026-03-30', resign_date = '2026-07-20', is_active = 1, updated_at = NOW()
     WHERE id = 47`
  );
  console.log('✓ regular_employees #47 TRAN THI NHUNG(티늉): hire=2026-03-30, resign=2026-07-20, active=1');
  console.log('  → 7월 payroll: is_active OR resign>=7/1 통과. rec.date >= hire(3/30) 통과. 정상 계산.\n');

  // employment_periods 는 그대로 유지 (2개 period: 3/30~7/20, 8/4~).
  //   old code 는 무시하지만, 나중에 new code 재배포 시 재사용 가능.
  const eps = await pool.query(`SELECT id, period_start, period_end FROM employment_periods WHERE employee_ref_id = 47`);
  console.log(`employment_periods #47 유지: ${eps.rowCount}건`);
  for (const p of eps.rows) console.log(`  ${p.period_start} ~ ${p.period_end || '재직중'}`);

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
