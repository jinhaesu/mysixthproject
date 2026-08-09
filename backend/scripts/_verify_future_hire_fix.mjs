import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const yearMonth = '2026-07';
const monthStart = '2026-07-01';
const monthEnd = '2026-07-31';

console.log('\n=== fix 후 payroll-calc salaries WHERE 시뮬 ===\n');

// fix 후 SQL (재현)
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
         WHERE ca.year_month = $5
           AND ca.employee_type = '정규직'
           AND (
             (re.phone IS NOT NULL AND re.phone <> ''
              AND REGEXP_REPLACE(COALESCE(ca.employee_phone, ''), '[-\\s]', '', 'g')
                = REGEXP_REPLACE(re.phone, '[-\\s]', '', 'g'))
             OR ca.employee_name = re.name
           )
       )
     )
  ORDER BY re.id
`, [monthEnd, monthStart, monthEnd, monthStart, yearMonth]);

console.log(`fix 후 candidate: ${salaries.rowCount}명`);

// 8월 입사자만 필터해서 확인
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

// periods
const periodsRows = await pool.query(`
  SELECT ep.employee_ref_id, ep.period_start, ep.period_end, re.name, re.phone
  FROM employment_periods ep JOIN regular_employees re ON ep.employee_ref_id = re.id
  WHERE ep.employee_type = 'regular'
`);
const periodsByPhone = new Map(), periodsByName = new Map();
for (const p of periodsRows.rows) {
  const s = toYMD(p.period_start), e = toYMD(p.period_end);
  if (!s) continue;
  const period = { start: s, end: e };
  const np = norm(p.phone);
  if (np) { if (!periodsByPhone.has(np)) periodsByPhone.set(np, []); periodsByPhone.get(np).push(period); }
  if (p.name) { if (!periodsByName.has(p.name)) periodsByName.set(p.name, []); periodsByName.get(p.name).push(period); }
}
const getPeriods = (name, phone) => (norm(phone) && periodsByPhone.get(norm(phone))) || periodsByName.get(name);

let futureHireLeaks = [];
for (const s of salaries.rows) {
  const hd = toYMD(s.hire_date);
  if (hd && hd > monthEnd) {
    const p = getPeriods(s.name, s.phone);
    const activeP = p && p.find(x => x.start <= monthEnd && (!x.end || x.end >= monthStart));
    futureHireLeaks.push({
      id: s.employee_id, name: s.name, hire_date: hd, resign_date: s.resign_date,
      has_periods: !!(p && p.length),
      overlap_period: activeP ? `${activeP.start}~${activeP.end||'없음'}` : '없음',
    });
  }
}
console.log(`\n[SQL 통과] hire_date > ${monthEnd} 인 인원: ${futureHireLeaks.length}명`);
for (const f of futureHireLeaks) {
  console.log(`  #${f.id} ${f.name} hire=${f.hire_date} | periods=${f.has_periods} | overlap=${f.overlap_period}`);
}

// salariesFiltered 시뮬
console.log('\n=== salariesFiltered (SQL 후 JS 필터) 적용 후 ===');
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
console.log(`최종 salariesFiltered: ${filtered.length}명`);

// 최종에 여전히 미래 입사자가 있는지
const stillLeaked = filtered.filter(s => {
  const hd = toYMD(s.hire_date);
  const p = getPeriods(s.name, s.phone);
  const overlap = p && p.some(x => x.start <= monthEnd && (!x.end || x.end >= monthStart));
  return hd && hd > monthEnd && !overlap;
});
console.log(`최종에 남은 미래 입사자 (버그): ${stillLeaked.length}명 (0이어야 정상)`);
for (const s of stillLeaked) console.log(`  ⚠ #${s.employee_id} ${s.name} hire=${toYMD(s.hire_date)}`);

// 재입사자·퇴사자·정상 정규직 검증
console.log('\n=== 정상 케이스 검증 ===');
const tinung = filtered.find(s => s.employee_id === 47);
const jyh = filtered.find(s => s.employee_id === 109);
console.log(`  #47 티늉 (재입사): ${tinung ? '포함 ✓' : '누락 ✗'}`);
console.log(`  #109 정연화 (재입사): ${jyh ? '포함 ✓' : '누락 ✗'}`);

await pool.end();
