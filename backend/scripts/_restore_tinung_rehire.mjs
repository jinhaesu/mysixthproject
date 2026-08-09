import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 티늉 재입사 케이스 원상복구 + employment_periods 등록 ===\n');

  const emp = await pool.query(`SELECT * FROM regular_employees WHERE name LIKE '%티늉%' LIMIT 1`);
  if (!emp.rowCount) { console.log('티늉 없음'); process.exit(1); }
  const E = emp.rows[0];
  console.log(`대상: #${E.id} ${E.name}`);
  console.log(`  현재 DB: hire=${E.hire_date} resign=${E.resign_date}\n`);

  // 1) hire_date 를 원본(재입사일 8/4)으로 복구, resign_date 는 그대로 7/20 유지
  //    (직관적이진 않지만: 현재 재직 중 = 재입사 후, 이전 퇴사일이 resign_date 로 남아있는 케이스)
  //    정확한 처리: hire_date = 재입사일 8/4, resign_date = NULL (재직중), 이전 근속은 employment_periods 로.
  console.log('▶ 처리 방식: hire=재입사일(2026-08-04), resign=비움(재직중). 이전 근속은 employment_periods 로 관리.\n');

  await pool.query(
    `UPDATE regular_employees
       SET hire_date = '2026-08-04', resign_date = NULL, is_active = 1, updated_at = NOW()
     WHERE id = $1`,
    [E.id]
  );
  console.log('  ✓ regular_employees: hire=2026-08-04, resign=NULL, is_active=1');

  // 2) employment_periods 이전 seed 삭제 후 정확한 2개 period 등록
  await pool.query(
    `DELETE FROM employment_periods WHERE employee_type='regular' AND employee_ref_id=$1`,
    [E.id]
  );
  // Period 1: 3/30 ~ 7/20 (첫 근속, 퇴사)
  //   실제 첫 근태일을 확인
  const firstAtt = await pool.query(
    `SELECT MIN(date) as first_att FROM confirmed_attendance
     WHERE employee_type='정규직' AND employee_name=$1 AND date <= '2026-07-20'`,
    [E.name]
  );
  const period1Start = firstAtt.rows[0]?.first_att || '2026-03-30';
  await pool.query(
    `INSERT INTO employment_periods
       (employee_type, employee_ref_id, period_start, period_end, reason_start, reason_end, note)
     VALUES ('regular', $1, $2, '2026-07-20', '입사', '자진퇴사', '첫 근속 - 스크립트로 복구')`,
    [E.id, period1Start]
  );
  console.log(`  ✓ employment_periods Period 1: ${period1Start} ~ 2026-07-20 (첫 근속)`);
  // Period 2: 8/4 ~ 재직중
  await pool.query(
    `INSERT INTO employment_periods
       (employee_type, employee_ref_id, period_start, period_end, reason_start, reason_end, note)
     VALUES ('regular', $1, '2026-08-04', NULL, '재입사', '', '재입사')`,
    [E.id]
  );
  console.log('  ✓ employment_periods Period 2: 2026-08-04 ~ 재직중\n');

  // 3) 7월 급여를 위해서는 payroll-calc 가 period 1 을 참조해야 함.
  //    현재 payroll-calc 는 regular_employees.hire_date/resign_date 기반.
  //    → 이 단계 후 payroll-calc 가 employment_periods 참조하도록 코드 수정 필요.
  //    임시 방편: regular_employees.hire_date/resign_date 를 첫 근속 값으로 두고,
  //    재입사 정보는 employment_periods 에도 유지. 하지만 사용자 지시대로 hire=8/4 로 세팅.
  //    → 이 경우 7월 급여 계산에서 티늉은 다시 skip 됨. → payroll-calc 즉시 수정 필요.

  console.log('\n=== 결과 ===');
  console.log(`티늉 employment_periods 2개 등록 완료. payroll-calc 코드 수정 필요 (employment_periods 참조).`);

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
