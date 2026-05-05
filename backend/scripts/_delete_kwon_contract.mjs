import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});

async function main() {
  // 1) 권선경 직원 식별 (이름 동명이인 가능 → 다중 매치 시 사용자 확인)
  const emps = (await pool.query(`SELECT id, name, phone, department, team, hire_date FROM regular_employees WHERE name = '권선경'`)).rows;
  console.log('=== 권선경 직원 row ===');
  emps.forEach(e => console.log(`  #${e.id} ${e.name} (${e.phone}) ${e.department}/${e.team} hire=${e.hire_date}`));
  if (emps.length === 0) { console.log('  ❌ 권선경 직원 row 없음. 종료.'); await pool.end(); return; }

  const empIds = emps.map(e => e.id);

  // 2) 삭제 대상 계약서 미리 조회 (감사 기록용)
  const contracts = (await pool.query(
    `SELECT id, employee_id, worker_name, contract_start, contract_end, work_start_date, status, token, created_at
     FROM regular_labor_contracts
     WHERE employee_id = ANY($1::int[]) OR worker_name = '권선경'
     ORDER BY created_at`,
    [empIds]
  )).rows;
  console.log(`\n=== 삭제 대상 계약서 ${contracts.length}건 ===`);
  contracts.forEach(c => console.log(`  #${c.id} emp=${c.employee_id} ${c.worker_name} ${c.contract_start}~${c.contract_end} status=${c.status} token=${c.token.slice(0,12)}... created=${c.created_at}`));

  if (contracts.length === 0) { console.log('  계약서 없음. 종료.'); await pool.end(); return; }

  // 3) 삭제 실행
  const del = await pool.query(
    `DELETE FROM regular_labor_contracts WHERE employee_id = ANY($1::int[]) OR worker_name = '권선경' RETURNING id`,
    [empIds]
  );
  console.log(`\n✓ ${del.rowCount}건 삭제 완료. 삭제된 contract id: ${del.rows.map(r => r.id).join(', ')}`);

  // 4) 검증
  const remain = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM regular_labor_contracts WHERE employee_id = ANY($1::int[]) OR worker_name = '권선경'`,
    [empIds]
  )).rows[0].n;
  console.log(`\n검증: 남은 권선경 계약서 = ${remain}건 (0이어야 함)`);

  // 5) 직원 본체는 그대로 유지됨을 확인
  const stillEmp = (await pool.query(`SELECT COUNT(*)::int AS n FROM regular_employees WHERE name = '권선경'`)).rows[0].n;
  console.log(`직원 본체 (regular_employees) row: ${stillEmp}건 — 그대로 유지`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
