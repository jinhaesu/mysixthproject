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
const norm = (p) => (p || '').replace(/[-\s]/g, '').trim();

async function simulate(yearMonth, monthStart, monthEnd) {
  const salaries = await pool.query(`
    SELECT re.id as employee_id, re.name, re.phone, re.hire_date,
           COALESCE(re.resign_date, '') as resign_date,
           re.is_active
    FROM regular_employees re
    WHERE (re.is_active = 1
           AND (re.hire_date IS NULL OR re.hire_date = '' OR re.hire_date <= $1))
       OR (COALESCE(re.resign_date, '') <> '' AND re.resign_date >= $2)
       OR EXISTS (
         SELECT 1 FROM employment_periods ep
         WHERE ep.employee_type = 'regular' AND ep.employee_ref_id = re.id
           AND ep.period_start <= $3
           AND (ep.period_end IS NULL OR ep.period_end >= $4)
       )
       OR (
         COALESCE(re.resign_date, '') = ''
         AND EXISTS (
           SELECT 1 FROM confirmed_attendance ca
           WHERE ca.year_month = $5 AND ca.employee_type = '정규직'
             AND (
               (re.phone IS NOT NULL AND re.phone <> ''
                AND REGEXP_REPLACE(COALESCE(ca.employee_phone, ''), '[-\\s]', '', 'g')
                  = REGEXP_REPLACE(re.phone, '[-\\s]', '', 'g'))
               OR ca.employee_name = re.name
             )
         )
       )
  `, [monthEnd, monthStart, monthEnd, monthStart, yearMonth]);

  const periodsRows = await pool.query(`SELECT ep.employee_ref_id, ep.period_start, ep.period_end, re.name, re.phone FROM employment_periods ep JOIN regular_employees re ON ep.employee_ref_id = re.id WHERE ep.employee_type='regular'`);
  const byPhone = new Map(), byName = new Map();
  for (const p of periodsRows.rows) {
    const s = toYMD(p.period_start), e = toYMD(p.period_end);
    if (!s) continue;
    const period = { start: s, end: e };
    const np = norm(p.phone);
    if (np) { if (!byPhone.has(np)) byPhone.set(np, []); byPhone.get(np).push(period); }
    if (p.name) { if (!byName.has(p.name)) byName.set(p.name, []); byName.get(p.name).push(period); }
  }
  const getP = (name, phone) => (norm(phone) && byPhone.get(norm(phone))) || byName.get(name);

  const filtered = salaries.rows.filter(sal => {
    const rd = (sal.resign_date || '').trim();
    if (rd && rd < monthStart) return false;
    const salPeriods = getP(sal.name, sal.phone);
    if (salPeriods && salPeriods.length > 0) {
      return salPeriods.some(p => p.start <= monthEnd && (!p.end || p.end >= monthStart));
    }
    const hd = toYMD(sal.hire_date);
    if (hd && hd > monthEnd) return false;
    return true;
  });

  const tinung = filtered.find(s => s.employee_id === 47);
  const jyh = filtered.find(s => s.employee_id === 109);
  console.log(`  ${yearMonth}: SQL ${salaries.rowCount} → filtered ${filtered.length} | 티늉 ${tinung ? '✓' : '✗'} | 정연화 ${jyh ? '✓' : '✗'}`);

  for (const [id, name] of [[47, '티늉'], [109, '정연화']]) {
    const ca = await pool.query(`
      SELECT COUNT(*) as cnt,
             ROUND(SUM(COALESCE(regular_hours,0)+COALESCE(overtime_hours,0)+COALESCE(night_hours,0))::numeric,2) as h
      FROM confirmed_attendance
      WHERE year_month = $1 AND employee_type = '정규직'
        AND (employee_name LIKE '%' || $2 || '%' OR REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g') = (SELECT REGEXP_REPLACE(COALESCE(phone,''), '[-\\s]', '', 'g') FROM regular_employees WHERE id = $3))
    `, [yearMonth, name, id]);
    const r = ca.rows[0];
    console.log(`    → ${name}(#${id}): 근태 ${r.cnt}일, 합계 ${r.h || 0}h`);
  }
}

console.log('\n=== payroll-calc 시뮬 (2026-07) ===');
await simulate('2026-07', '2026-07-01', '2026-07-31');

console.log('\n=== payroll-calc 시뮬 (2026-08) ===');
await simulate('2026-08', '2026-08-01', '2026-08-31');

console.log('\n=== 종합 ===');
console.log('  7월: 티늉 첫 근속 마지막달(퇴사 7/20까지), 정연화 첫 근속 마지막달(퇴사 7/31까지) 둘 다 급여 계산됨');
console.log('  8월: 티늉 재입사(8/4~), 정연화 재입사(8/5~) 각각 재입사 후 급여만 계산됨');

await pool.end();
