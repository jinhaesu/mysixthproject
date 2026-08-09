import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const toYMD = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

const yearMonth = '2026-07';
const monthStart = '2026-07-01';
const monthEnd = '2026-07-31';

console.log('\n=== 정규직: 7월 payroll 리스트에 잘못 들어가는 8월+ 입사자 스캔 ===\n');

// (1) is_active=1 인데 hire_date 가 8월 이후인 직원
const r1 = await pool.query(`
  SELECT id, name, phone, department, team, hire_date, is_active, resign_date
  FROM regular_employees
  WHERE is_active = 1
    AND hire_date IS NOT NULL AND hire_date <> ''
  ORDER BY hire_date DESC
`);

let futureHires = [];
for (const emp of r1.rows) {
  const hd = toYMD(emp.hire_date);
  if (hd && hd > monthEnd) {
    futureHires.push({ ...emp, hire_date_norm: hd });
  }
}
console.log(`[정규직] is_active=1 & hire_date > 2026-07-31 인 인원: ${futureHires.length}명`);
for (const e of futureHires) {
  console.log(`  #${e.id} ${e.name} | phone=${e.phone} | dept=${e.department} | hire=${e.hire_date_norm}`);
}

// (2) 이 인원들 중 7월 confirmed_attendance record 존재 여부 (rare, 정상이면 없음)
console.log('\n[검증] 이 인원들의 7월 confirmed_attendance 기록:');
for (const e of futureHires) {
  const c = await pool.query(`
    SELECT COUNT(*) as cnt FROM confirmed_attendance
    WHERE year_month = $1 AND employee_type = '정규직'
      AND (employee_name = $2 OR REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g') = REGEXP_REPLACE($3, '[-\\s]', '', 'g'))
  `, [yearMonth, e.name, e.phone || '']);
  console.log(`  ${e.name}: ${c.rows[0].cnt}건`);
}

// (3) employment_periods 로 재검증 — period_start > 7월말인 인원
console.log('\n[periods] employment_periods 로 재검증 (period_start > 2026-07-31):');
const r3 = await pool.query(`
  SELECT ep.employee_ref_id, ep.period_start, ep.period_end, re.name, re.phone, re.hire_date, re.is_active
  FROM employment_periods ep
  JOIN regular_employees re ON ep.employee_ref_id = re.id
  WHERE ep.employee_type = 'regular'
  ORDER BY ep.period_start DESC
`);
let futurePeriods = [];
for (const p of r3.rows) {
  const s = toYMD(p.period_start);
  if (s && s > monthEnd) futurePeriods.push({ ...p, start_norm: s });
}
console.log(`8월+ 시작 period 인원: ${futurePeriods.length}건`);
for (const p of futurePeriods.slice(0, 20)) {
  console.log(`  #${p.employee_ref_id} ${p.name} | period=${p.start_norm} ~ ${toYMD(p.period_end)||'없음'} | hire=${toYMD(p.hire_date)}`);
}

// (4) 파견/알바 (workers) 도 확인
console.log('\n=== 파견/알바: 8월+ 입사자 스캔 (참고용) ===');
try {
  const r4 = await pool.query(`
    SELECT id, name, phone, department, worker_type, hire_date, is_active
    FROM workers
    WHERE is_active = 1
      AND hire_date IS NOT NULL AND hire_date <> ''
    ORDER BY hire_date DESC LIMIT 500
  `);
  let workerFuture = [];
  for (const emp of r4.rows) {
    const hd = toYMD(emp.hire_date);
    if (hd && hd > monthEnd) workerFuture.push({ ...emp, hire_date_norm: hd });
  }
  console.log(`workers is_active=1 & hire_date > 2026-07-31: ${workerFuture.length}명`);
  for (const e of workerFuture.slice(0, 20)) {
    console.log(`  #${e.id} ${e.name} | dept=${e.department} | type=${e.worker_type} | hire=${e.hire_date_norm}`);
  }
} catch (e) {
  console.log('workers 조회 실패:', e.message);
}

await pool.end();
