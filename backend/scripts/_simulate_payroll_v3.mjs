// 실제 payroll-calc 백엔드 로직을 정확히 시뮬해서 문제 찾기
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); }
function norm(p) { return (p || '').replace(/[-\s]/g, '').trim(); }

async function main() {
  const ym = '2026-04';
  const monthStart = `${ym}-01`;

  // EXACT replica of payroll-calc backend
  const recs = (await pool.query(`SELECT * FROM confirmed_attendance WHERE year_month = $1 AND employee_type = '정규직' ORDER BY employee_name, date`, [ym])).rows;

  const keyFor = r => norm(r.employee_phone) || r.employee_name;
  const empMap = new Map();
  for (const rec of recs) {
    const key = keyFor(rec);
    if (!empMap.has(key)) {
      empMap.set(key, { employee_name: rec.employee_name, employee_phone: rec.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
    }
    const emp = empMap.get(key);
    emp.work_days++;
    const regH = parseFloat(rec.regular_hours)||0;
    const otH = parseFloat(rec.overtime_hours)||0;
    const nightH = parseFloat(rec.night_hours)||0;
    const totalH = regH + otH;
    if (isHolidayOrWeekend(rec.date)) {
      emp.holiday_days++;
      emp.holiday_hours += totalH;
    } else {
      emp.total_regular += regH;
      emp.total_overtime += otH;
    }
    emp.total_night += nightH;
  }

  console.log(`empMap groups: ${empMap.size}`);
  console.log(`group totals (sum across all groups):`);
  let gOt = 0, gHol = 0;
  for (const [k, e] of empMap) { gOt += e.total_overtime; gHol += e.holiday_hours; }
  console.log(`  연장: ${gOt.toFixed(1)}, 휴일: ${gHol.toFixed(1)}`);

  // Now match against regular_employees (same logic as backend)
  const sals = (await pool.query(`SELECT name, phone FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= $1)`, [monthStart])).rows;

  const confirmedWithVacation = [...empMap.values()];
  let matchedOt = 0, matchedHol = 0;
  let matchedGroups = new Set();
  let salHits = new Map();  // 어느 sal이 어떤 group을 잡았나
  for (const sal of sals) {
    const salPhone = norm(sal.phone);
    const att = confirmedWithVacation.find(c => (salPhone && norm(c.employee_phone) === salPhone) || c.employee_name === sal.name);
    if (att) {
      matchedOt += att.total_overtime;
      matchedHol += att.holiday_hours;
      const gKey = norm(att.employee_phone) || att.employee_name;
      matchedGroups.add(gKey);
      salHits.set(sal.name, gKey);
    }
  }
  console.log(`\nsal 결과 매칭:`);
  console.log(`  matched 연장: ${matchedOt.toFixed(1)}, matched 휴일: ${matchedHol.toFixed(1)}`);
  console.log(`  unique groups matched: ${matchedGroups.size} (out of ${empMap.size} groups)`);
  console.log(`  sals: ${sals.length}`);

  // 중복 그룹 매칭 확인
  const groupMatchCount = new Map();
  for (const gk of salHits.values()) {
    groupMatchCount.set(gk, (groupMatchCount.get(gk)||0) + 1);
  }
  const dupes = [...groupMatchCount.entries()].filter(([_, c]) => c > 1);
  if (dupes.length > 0) {
    console.log(`\n!! 중복 매칭 발견 (한 group이 여러 sal에 잡힘):`);
    for (const [gk, c] of dupes) {
      const grp = empMap.get(gk);
      console.log(`  group "${grp.employee_name}" (phone=${grp.employee_phone}) → ${c}명의 sal에 잡힘. 연장 ${grp.total_overtime}h, 휴일 ${grp.holiday_hours}h 가 ${c}배 카운트됨`);
      const matchingSals = [...salHits.entries()].filter(([_, v]) => v === gk).map(([n]) => n);
      console.log(`    매칭된 sal 직원들: ${matchingSals.join(', ')}`);
    }
    let dupOt = 0, dupHol = 0;
    for (const [gk, c] of dupes) {
      const grp = empMap.get(gk);
      dupOt += grp.total_overtime * (c - 1);  // c-1 만큼 추가로 누적됨
      dupHol += grp.holiday_hours * (c - 1);
    }
    console.log(`  중복 카운트로 인한 inflation: 연장 +${dupOt.toFixed(1)}, 휴일 +${dupHol.toFixed(1)}`);
  }

  // sal에 phone이 빈 경우 — name fallback이 잘못 매칭할 수 있음
  const salsWithNoPhone = sals.filter(s => !norm(s.phone));
  console.log(`\nphone이 없는 sal 직원: ${salsWithNoPhone.length}명`);

  // 같은 name을 가진 sal 직원이 여러 명 (재등록 등)
  const salNameCount = new Map();
  for (const s of sals) salNameCount.set(s.name, (salNameCount.get(s.name)||0)+1);
  const dupSalNames = [...salNameCount.entries()].filter(([_, c]) => c > 1);
  if (dupSalNames.length > 0) {
    console.log(`\nregular_employees에 동일 이름 중복: ${dupSalNames.length}건`);
    for (const [n, c] of dupSalNames) console.log(`  "${n}" × ${c}`);
  }

  // 같은 phone을 가진 sal 직원이 여러 명
  const salPhoneCount = new Map();
  for (const s of sals) {
    const np = norm(s.phone); if (np) salPhoneCount.set(np, (salPhoneCount.get(np)||0)+1);
  }
  const dupSalPhones = [...salPhoneCount.entries()].filter(([_, c]) => c > 1);
  if (dupSalPhones.length > 0) {
    console.log(`\nregular_employees에 동일 phone 중복: ${dupSalPhones.length}건`);
    for (const [p, c] of dupSalPhones) console.log(`  phone ${p} × ${c} (이름들: ${sals.filter(s => norm(s.phone) === p).map(s => s.name).join(', ')})`);
  }

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
