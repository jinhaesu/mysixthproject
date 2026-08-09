import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const HOLIDAYS = {
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-07-17','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26','2026-09-28','2026-10-03','2026-10-05','2026-10-09','2026-12-25'],
};
function isHolidayOrWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}

async function main() {
  const yearMonth = '2026-07';
  const monthStart = '2026-07-01';
  const monthEnd = '2026-07-31';

  const norm = (p) => (p || '').replace(/[-\s]/g, '').trim();
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

  // periods load
  const periodsByPhone = new Map();
  const periodsByName = new Map();
  const periodsRows = await pool.query(`
    SELECT ep.employee_ref_id, ep.period_start, ep.period_end, re.name, re.phone
    FROM employment_periods ep
    JOIN regular_employees re ON ep.employee_ref_id = re.id
    WHERE ep.employee_type = 'regular'
  `);
  for (const p of periodsRows.rows) {
    const s = toYMD(p.period_start);
    const e = toYMD(p.period_end);
    if (!s) continue;
    const period = { start: s, end: e };
    const np = norm(p.phone || '');
    if (np) {
      if (!periodsByPhone.has(np)) periodsByPhone.set(np, []);
      periodsByPhone.get(np).push(period);
    }
    if (p.name) {
      if (!periodsByName.has(p.name)) periodsByName.set(p.name, []);
      periodsByName.get(p.name).push(period);
    }
  }
  const getPeriods = (name, phone) => {
    const np = norm(phone || '');
    return (np && periodsByPhone.get(np)) || periodsByName.get(name);
  };
  const isInAnyPeriod = (date, periods) => {
    if (!periods || periods.length === 0) return true;
    return periods.some(p => date >= p.start && (!p.end || date <= p.end));
  };

  // 티늉 시뮬
  console.log('\n=== 티늉 payroll-calc 시뮬 (7월) ===\n');
  const tinungPeriods = getPeriods('TRAN THI NHUNG(티늉)', '01041181293');
  console.log('티늉 periods:', tinungPeriods);

  // Tinung records
  const recs = await pool.query(`
    SELECT date, regular_hours, overtime_hours, night_hours
    FROM confirmed_attendance
    WHERE year_month = '2026-07' AND employee_type = '정규직' AND employee_name = 'TRAN THI NHUNG(티늉)'
    ORDER BY date
  `);
  console.log(`\n티늉 7월 records: ${recs.rowCount}건`);
  let counted = 0, skipped = 0;
  for (const r of recs.rows) {
    const inPeriod = isInAnyPeriod(r.date, tinungPeriods);
    if (inPeriod) { counted++; console.log(`  ✓ ${r.date} reg=${r.regular_hours} ot=${r.overtime_hours}`); }
    else { skipped++; console.log(`  ✗ ${r.date} SKIP (period 밖)`); }
  }
  console.log(`\n counted=${counted} skipped=${skipped}`);

  // activePeriod for July
  const activePeriod = tinungPeriods && tinungPeriods.find(p =>
    p.start <= monthEnd && (!p.end || p.end >= monthStart)
  );
  console.log('\n7월 activePeriod:', activePeriod);
  const hireDate = activePeriod ? activePeriod.start : '';
  const resignDate = activePeriod && activePeriod.end ? activePeriod.end : '';
  console.log(`hireDate=${hireDate}, resignDate=${resignDate}`);

  // totalScheduledDays 시뮬
  let totalScheduledDays = 0;
  for (let day = 1; day <= 31; day++) {
    const ds = `2026-07-${String(day).padStart(2, '0')}`;
    if (isHolidayOrWeekend(ds)) continue;
    if (hireDate && ds < hireDate) continue;
    if (resignDate && resignDate >= monthStart && resignDate <= monthEnd && ds > resignDate) continue;
    totalScheduledDays++;
  }
  console.log(`totalScheduledDays (7월): ${totalScheduledDays}`);
  console.log(`\n → 티늉은 7/01~7/20 (period1) 근무 기준. 소정근로일 ${totalScheduledDays}일, 확정근태 ${counted}건 반영.`);

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
