import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const toYMD = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getFullYear(); const m = String(v.getMonth()+1).padStart(2,'0'); const d = String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

console.log('\n=== BEFORE ===');
const before = await pool.query(`SELECT id, name, is_active, hire_date, resign_date FROM regular_employees WHERE id IN (47, 109) ORDER BY id`);
for (const r of before.rows) {
  console.log(`  #${r.id} ${r.name} | active=${r.is_active} | hire=${toYMD(r.hire_date)||'NULL'} | resign=${toYMD(r.resign_date)||'NULL'}`);
}

// 티늉 (#47): resign_date NULL 처리 (재입사 완료 상태 반영). hire_date는 첫 근속일 유지.
await pool.query(`UPDATE regular_employees SET resign_date = NULL, resigned_at = NULL, updated_at = NOW() WHERE id = 47`);

// 정연화 (#109): hire_date를 첫 근속일(2024-04-15)로 세팅.
await pool.query(`UPDATE regular_employees SET hire_date = '2024-04-15', updated_at = NOW() WHERE id = 109`);

console.log('\n=== AFTER ===');
const after = await pool.query(`SELECT id, name, is_active, hire_date, resign_date FROM regular_employees WHERE id IN (47, 109) ORDER BY id`);
for (const r of after.rows) {
  console.log(`  #${r.id} ${r.name} | active=${r.is_active} | hire=${toYMD(r.hire_date)||'NULL'} | resign=${toYMD(r.resign_date)||'NULL'}`);
}

// periods 재확인 (참고용)
console.log('\n=== periods (참고) ===');
const per = await pool.query(`SELECT employee_ref_id, period_start, period_end, reason_start, reason_end FROM employment_periods WHERE employee_type='regular' AND employee_ref_id IN (47, 109) ORDER BY employee_ref_id, period_start`);
for (const p of per.rows) {
  console.log(`  #${p.employee_ref_id} ${toYMD(p.period_start)} ~ ${toYMD(p.period_end)||'재직중'} | ${p.reason_start} → ${p.reason_end||''}`);
}

await pool.end();
