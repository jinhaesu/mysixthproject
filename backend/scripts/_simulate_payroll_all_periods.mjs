import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-07-17','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26','2026-09-28','2026-10-03','2026-10-05','2026-10-09','2026-12-25'] };
function isHolidayOrWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}

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

async function main() {
  const yearMonth = '2026-07';
  const monthStart = '2026-07-01';
  const monthEnd = '2026-07-31';

  console.log('\n=== fix 코드 시뮬 (7월 payroll-calc) ===\n');

  // periods 로드
  const periodsByPhone = new Map();
  const periodsByName = new Map();
  const rows = await pool.query(`
    SELECT ep.employee_ref_id, ep.period_start, ep.period_end, re.name, re.phone
    FROM employment_periods ep JOIN regular_employees re ON ep.employee_ref_id = re.id
    WHERE ep.employee_type = 'regular'
  `);
  for (const p of rows.rows) {
    const s = toYMD(p.period_start);
    const e = toYMD(p.period_end);
    if (!s) continue;
    const period = { start: s, end: e };
    const np = norm(p.phone);
    if (np) { if (!periodsByPhone.has(np)) periodsByPhone.set(np, []); periodsByPhone.get(np).push(period); }
    if (p.name) { if (!periodsByName.has(p.name)) periodsByName.set(p.name, []); periodsByName.get(p.name).push(period); }
  }
  console.log(`periods 로드: ${rows.rowCount}건 (${periodsByPhone.size} phones, ${periodsByName.size} names)`);

  const getPeriods = (name, phone) => {
    const np = norm(phone || '');
    return (np && periodsByPhone.get(np)) || periodsByName.get(name);
  };
  const isInAnyPeriod = (date, periods) => {
    if (!periods || periods.length === 0) return true;
    return periods.some(p => date >= p.start && (!p.end || date <= p.end));
  };

  // 정규직 근태 record 별 필터 시뮬 (샘플)
  console.log('\n▶ 티늉 (재입사 case) 시뮬 - period 참조하면 3/30~7/20 만 통과');
  const tinungPhone = '01041181293';
  const tinungName = 'TRAN THI NHUNG(늉)'; // confirmed_attendance 저장명
  const tinungRecs = await pool.query(`
    SELECT date, regular_hours, overtime_hours
    FROM confirmed_attendance
    WHERE year_month = '2026-07' AND employee_type = '정규직'
      AND REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g') = $1
    ORDER BY date
  `, [tinungPhone]);
  const tinungPeriods = getPeriods(tinungName, tinungPhone);
  console.log(`  periods: ${JSON.stringify(tinungPeriods)}`);
  let counted = 0, skipped = 0;
  for (const r of tinungRecs.rows) {
    if (isInAnyPeriod(r.date, tinungPeriods)) counted++;
    else skipped++;
  }
  console.log(`  7월 records ${tinungRecs.rowCount}건 → counted=${counted}, skipped=${skipped}`);

  console.log('\n▶ 정연화 (병합 후) 시뮬');
  const jyhPhone = '01073107988';
  const jyhName = '정연화';
  const jyhRecs = await pool.query(`
    SELECT date FROM confirmed_attendance
    WHERE year_month = '2026-07' AND employee_type = '정규직'
      AND (REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g') = $1 OR employee_name = $2)
    ORDER BY date
  `, [jyhPhone, jyhName]);
  const jyhPeriods = getPeriods(jyhName, jyhPhone);
  console.log(`  periods: ${JSON.stringify(jyhPeriods)}`);
  let c2 = 0, s2 = 0;
  for (const r of jyhRecs.rows) {
    if (isInAnyPeriod(r.date, jyhPeriods)) c2++;
    else s2++;
  }
  console.log(`  7월 records ${jyhRecs.rowCount}건 → counted=${c2}, skipped=${s2}`);

  // 8월도
  console.log('\n▶ 정연화 8월 시뮬 (재입사 period 확인)');
  const jyhAugRecs = await pool.query(`
    SELECT date FROM confirmed_attendance
    WHERE year_month = '2026-08' AND employee_type = '정규직'
      AND (REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g') = $1 OR employee_name = $2)
    ORDER BY date
  `, [jyhPhone, jyhName]);
  let c3 = 0, s3 = 0;
  for (const r of jyhAugRecs.rows) {
    if (isInAnyPeriod(r.date, jyhPeriods)) c3++;
    else s3++;
  }
  console.log(`  8월 records ${jyhAugRecs.rowCount}건 → counted=${c3}, skipped=${s3}`);

  // 전체 정규직 다른 인원 sanity check (기존 hire_date fallback)
  console.log('\n▶ 다른 정규직 sanity check (100명 이상 정상 처리되어야 함)');
  const allEmps = await pool.query(`
    SELECT employee_name, employee_phone, COUNT(*) as cnt
    FROM confirmed_attendance WHERE year_month = '2026-07' AND employee_type = '정규직'
    GROUP BY employee_name, employee_phone
  `);
  let normalCount = 0, zeroCount = 0;
  for (const e of allEmps.rows) {
    const p = getPeriods(e.employee_name, e.employee_phone);
    if (!p || p.length === 0) { normalCount++; continue; } // periods 없으면 fallback (통과)
    let valid = 0;
    // sample dates
    const dates = await pool.query(`SELECT date FROM confirmed_attendance WHERE year_month='2026-07' AND employee_type='정규직' AND employee_name=$1 AND employee_phone=$2`, [e.employee_name, e.employee_phone]);
    for (const d of dates.rows) if (isInAnyPeriod(d.date, p)) valid++;
    if (valid > 0) normalCount++;
    else zeroCount++;
  }
  console.log(`  정상 매칭: ${normalCount}명, 모든 records skip 되는 인원: ${zeroCount}명 (0이어야 정상)`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
