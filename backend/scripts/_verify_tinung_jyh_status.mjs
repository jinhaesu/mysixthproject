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

console.log('\n=== 티늉 (#47) 상태 ===');
const t = await pool.query(`SELECT id, name, phone, department, is_active, hire_date, resign_date FROM regular_employees WHERE id = 47`);
for (const r of t.rows) {
  console.log(`  #${r.id} ${r.name} | phone=${r.phone} | dept=${r.department}`);
  console.log(`  is_active=${r.is_active} | hire=${toYMD(r.hire_date)} | resign=${toYMD(r.resign_date)||'-'}`);
}
const tp = await pool.query(`SELECT id, period_start, period_end, reason_start, reason_end, note FROM employment_periods WHERE employee_type='regular' AND employee_ref_id = 47 ORDER BY period_start`);
console.log(`  employment_periods (${tp.rowCount}건):`);
for (const p of tp.rows) {
  console.log(`    [${p.id}] ${toYMD(p.period_start)} ~ ${toYMD(p.period_end)||'재직중'} | ${p.reason_start} → ${p.reason_end || ''} | ${p.note || ''}`);
}

// 티늉 이름 중복 스캔 (혹시 다른 ID로 또 등록되어 있진 않은지)
const tDup = await pool.query(`SELECT id, name, phone, department, is_active, hire_date, resign_date FROM regular_employees WHERE name LIKE '%티늉%' OR name LIKE '%티능%'`);
console.log(`\n  [중복스캔] 티늉 유사이름 전체:`);
for (const r of tDup.rows) {
  console.log(`    #${r.id} ${r.name} | phone=${r.phone} | active=${r.is_active} | hire=${toYMD(r.hire_date)}`);
}

console.log('\n=== 정연화 (#109) 상태 ===');
const j = await pool.query(`SELECT id, name, phone, department, is_active, hire_date, resign_date FROM regular_employees WHERE id = 109`);
for (const r of j.rows) {
  console.log(`  #${r.id} ${r.name} | phone=${r.phone} | dept=${r.department}`);
  console.log(`  is_active=${r.is_active} | hire=${toYMD(r.hire_date)} | resign=${toYMD(r.resign_date)||'-'}`);
}
const jp = await pool.query(`SELECT id, period_start, period_end, reason_start, reason_end, note FROM employment_periods WHERE employee_type='regular' AND employee_ref_id = 109 ORDER BY period_start`);
console.log(`  employment_periods (${jp.rowCount}건):`);
for (const p of jp.rows) {
  console.log(`    [${p.id}] ${toYMD(p.period_start)} ~ ${toYMD(p.period_end)||'재직중'} | ${p.reason_start} → ${p.reason_end || ''} | ${p.note || ''}`);
}

const jDup = await pool.query(`SELECT id, name, phone, department, is_active, hire_date, resign_date FROM regular_employees WHERE name LIKE '%정연화%'`);
console.log(`\n  [중복스캔] 정연화 유사이름 전체:`);
for (const r of jDup.rows) {
  console.log(`    #${r.id} ${r.name} | phone=${r.phone} | active=${r.is_active} | hire=${toYMD(r.hire_date)}`);
}

// #244 (병합으로 삭제되었어야 하는 정연화 잘못된 신규등록)이 살아있진 않은지
const dead244 = await pool.query(`SELECT id, name FROM regular_employees WHERE id = 244`);
console.log(`\n  #244 (병합 후 삭제되었어야 함): ${dead244.rowCount === 0 ? '삭제됨 ✓' : `⚠ 아직 존재: ${dead244.rows[0].name}`}`);

console.log('\n=== 7월 근태·급여 반영 여부 (2026-07) ===');
for (const [id, name] of [[47, '티늉'], [109, '정연화']]) {
  const ca = await pool.query(`
    SELECT COUNT(*) as cnt, SUM(COALESCE(regular_hours,0) + COALESCE(overtime_hours,0) + COALESCE(night_hours,0) + COALESCE(holiday_hours,0)) as hours
    FROM confirmed_attendance
    WHERE year_month = '2026-07' AND employee_type = '정규직' AND employee_name = $1
  `, [name]);
  console.log(`  ${name}(#${id}) 7월 근태: ${ca.rows[0].cnt}건, 합계 시간=${ca.rows[0].hours || 0}`);
}

await pool.end();
