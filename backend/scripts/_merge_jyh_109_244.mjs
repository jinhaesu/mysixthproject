import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const NEW = 244;
const OLD = 109;

async function main() {
  console.log('\n=== 정연화 병합: #244 → #109 통합 ===\n');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. regular_attendance 이관 (1건 8/6)
    const r1 = await client.query(`UPDATE regular_attendance SET employee_id = $1 WHERE employee_id = $2`, [OLD, NEW]);
    console.log(`1. regular_attendance 이관: ${r1.rowCount}건`);

    // 2. regular_labor_contracts 이관 (2건)
    const r2 = await client.query(`UPDATE regular_labor_contracts SET employee_id = $1 WHERE employee_id = $2`, [OLD, NEW]);
    console.log(`2. regular_labor_contracts 이관: ${r2.rowCount}건`);

    // 3. regular_shift_assignments 삭제 (#109 에 이미 동일 shift 배정됨, 중복 방지)
    const r3 = await client.query(`DELETE FROM regular_shift_assignments WHERE employee_id = $1`, [NEW]);
    console.log(`3. regular_shift_assignments 삭제 (중복): ${r3.rowCount}건`);

    // 4. regular_salary_settings 삭제 (#109 에 동일값)
    const r4 = await client.query(`DELETE FROM regular_salary_settings WHERE employee_id = $1`, [NEW]);
    console.log(`4. regular_salary_settings 삭제 (중복): ${r4.rowCount}건`);

    // 5. regular_vacation_balances 삭제 (#109 에 동일값)
    const r5 = await client.query(`DELETE FROM regular_vacation_balances WHERE employee_id = $1`, [NEW]);
    console.log(`5. regular_vacation_balances 삭제 (중복): ${r5.rowCount}건`);

    // 6. employment_periods: 기존 삭제 후 2개 재구성
    await client.query(`DELETE FROM employment_periods WHERE employee_type='regular' AND employee_ref_id IN ($1, $2)`, [OLD, NEW]);
    await client.query(
      `INSERT INTO employment_periods (employee_type, employee_ref_id, period_start, period_end, reason_start, reason_end, note)
       VALUES ('regular', $1, '2024-04-15', '2026-07-31', '입사', '자진퇴사(비자변경 h2→f4)', '통합: 첫 근속 (구 #109)')`,
      [OLD]
    );
    await client.query(
      `INSERT INTO employment_periods (employee_type, employee_ref_id, period_start, period_end, reason_start, reason_end, note)
       VALUES ('regular', $1, '2026-08-05', NULL, '재입사', '', '통합: F-4 비자 재입사 (구 #244 병합)')`,
      [OLD]
    );
    console.log('6. employment_periods 재구성: #109 에 Period 1(2024-04-15~2026-07-31 자진퇴사), Period 2(2026-08-05~재직중 재입사)');

    // 7. #244 삭제 (phone UNIQUE constraint 회피 위해 먼저)
    const r7 = await client.query(`DELETE FROM regular_employees WHERE id = $1`, [NEW]);
    console.log(`7. #244 삭제: ${r7.rowCount}건`);

    // 8. #109 업데이트: 재직중 상태로 + phone 정규화 (이제 #244 없으므로 UNIQUE 충돌 없음)
    await client.query(
      `UPDATE regular_employees
         SET is_active = 1, resign_date = NULL, phone = '01073107988', updated_at = NOW()
       WHERE id = $1`,
      [OLD]
    );
    console.log('8. #109 업데이트: is_active=1, resign_date=NULL, phone=01073107988');

    await client.query('COMMIT');
    console.log('\n✓ 병합 완료. 이제 정연화는 #109 하나로 통합됐고 재입사 이력은 employment_periods 로 관리됨.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('✗ 롤백:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
