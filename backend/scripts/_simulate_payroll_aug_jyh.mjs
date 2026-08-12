import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const yearMonth = '2026-08';
const monthStart = '2026-08-01';
const monthEnd = '2026-08-31';

const toYMD = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  return String(v).slice(0, 10);
};
const norm = (p) => (p || '').replace(/[-\s]/g, '').trim();

const allRecords = await pool.query(`SELECT * FROM confirmed_attendance WHERE year_month = $1 AND employee_type = '정규직' ORDER BY employee_name, date`, [yearMonth]);
console.log('confirmed_attendance rows:', allRecords.rowCount);
const jyhRecords = allRecords.rows.filter(r => (r.employee_name || '').includes('정연화'));
console.log('  정연화 records:', jyhRecords.length, jyhRecords.map(r => `${toYMD(r.date)}/reg=${r.regular_hours}/ot=${r.overtime_hours}`).join(', '));

const salaries = await pool.query(`
  SELECT re.id as employee_id, re.name, re.phone, re.hire_date,
         COALESCE(re.resign_date, '') as resign_date, re.is_active
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
              AND REGEXP_REPLACE(COALESCE(ca.employee_phone, ''), '[-\s]', '', 'g')
                = REGEXP_REPLACE(re.phone, '[-\s]', '', 'g'))
             OR ca.employee_name = re.name
           )
       )
     )
`, [monthEnd, monthStart, monthEnd, monthStart, yearMonth]);
console.log('\nsalaries SQL rows:', salaries.rowCount);
const jyhSalary = salaries.rows.find(s => s.employee_id === 109);
console.log('  정연화(#109) SQL 통과?', jyhSalary ? '✓' : '✗ 미통과');
if (jyhSalary) console.log('    hire_date:', toYMD(jyhSalary.hire_date), '| resign_date:', jyhSalary.resign_date || 'NULL');

// periods
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
const getPeriods = (name, phone) => (norm(phone) && byPhone.get(norm(phone))) || byName.get(name);

const filtered = salaries.rows.filter(sal => {
  const rd = (sal.resign_date || '').trim();
  if (rd && rd < monthStart) return false;
  const salPeriods = getPeriods(sal.name, sal.phone);
  if (salPeriods && salPeriods.length > 0) {
    return salPeriods.some(p => p.start <= monthEnd && (!p.end || p.end >= monthStart));
  }
  const hd = toYMD(sal.hire_date);
  if (hd && hd > monthEnd) return false;
  return true;
});
console.log('\nsalariesFiltered:', filtered.length);
console.log('  정연화(#109) filter 통과?', filtered.find(s => s.employee_id === 109) ? '✓' : '✗ 걸러짐');

// results push 시 근태 매칭
const empMap = new Map();
for (const r of allRecords.rows) {
  const key = norm(r.employee_phone) || r.employee_name;
  if (!empMap.has(key)) empMap.set(key, { employee_name: r.employee_name, employee_phone: r.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0 });
  const e = empMap.get(key);
  e.total_regular += Number(r.regular_hours) || 0;
  e.total_overtime += Number(r.overtime_hours) || 0;
  e.total_night += Number(r.night_hours) || 0;
  e.work_days++;
}
const jyhSal = filtered.find(s => s.employee_id === 109);
if (jyhSal) {
  const salPhone = norm(jyhSal.phone);
  const att = Array.from(empMap.values()).find(c => (salPhone && norm(c.employee_phone) === salPhone) || c.employee_name === jyhSal.name);
  console.log('\n[근태 매칭] 정연화 att 매칭됨?', att ? `✓ (근무일 ${att.work_days}일, ot ${att.total_overtime}h)` : '✗');
}

await pool.end();
