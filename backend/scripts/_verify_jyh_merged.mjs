import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
async function main() {
  console.log('\n=== 정연화 통합 후 검증 ===\n');
  const r = await pool.query(`SELECT id, name, phone, department, team, hire_date, resign_date, is_active FROM regular_employees WHERE name LIKE '%정연화%' ORDER BY id`);
  console.log(`regular_employees 정연화: ${r.rowCount}건 (병합 전 2건 → 지금 1건이어야 정상)`);
  for (const x of r.rows) console.log(`  #${x.id} ${x.name} (${x.phone}) ${x.department} ${x.team} hire=${x.hire_date} resign=${x.resign_date || '-'} active=${x.is_active}`);

  const ep = await pool.query(`SELECT period_start, period_end, reason_start, reason_end, note FROM employment_periods WHERE employee_ref_id = 109 ORDER BY period_start`);
  console.log(`\nemployment_periods #109 (2건이어야 정상):`);
  for (const p of ep.rows) console.log(`  ${String(p.period_start).slice(0,10)}~${p.period_end ? String(p.period_end).slice(0,10) : '재직중'} [${p.reason_start}/${p.reason_end || '-'}] ${p.note}`);

  const ra = await pool.query(`SELECT COUNT(*) as cnt FROM regular_attendance WHERE employee_id = 109`);
  console.log(`\nregular_attendance #109: ${ra.rows[0].cnt}건 (병합 전 98건 + 이관 1건 = 99건이어야 정상)`);

  const lc = await pool.query(`SELECT COUNT(*) as cnt FROM regular_labor_contracts WHERE employee_id = 109`);
  console.log(`regular_labor_contracts #109: ${lc.rows[0].cnt}건`);

  // 유령 참조 (#244) 확인
  const dead = await pool.query(`
    SELECT 'regular_attendance' as t, COUNT(*) as cnt FROM regular_attendance WHERE employee_id = 244
    UNION ALL SELECT 'regular_labor_contracts', COUNT(*) FROM regular_labor_contracts WHERE employee_id = 244
    UNION ALL SELECT 'regular_shift_assignments', COUNT(*) FROM regular_shift_assignments WHERE employee_id = 244
    UNION ALL SELECT 'regular_salary_settings', COUNT(*) FROM regular_salary_settings WHERE employee_id = 244
    UNION ALL SELECT 'regular_vacation_balances', COUNT(*) FROM regular_vacation_balances WHERE employee_id = 244
    UNION ALL SELECT 'employment_periods', COUNT(*) FROM employment_periods WHERE employee_ref_id = 244
  `);
  console.log('\n#244 유령 참조 확인 (모두 0이어야 정상):');
  for (const x of dead.rows) console.log(`  ${x.t}: ${x.cnt}건`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
