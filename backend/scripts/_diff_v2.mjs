import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});
const HOLIDAYS = { 2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']};
function isHolidayOrWeekend(s) { const d = new Date(s + 'T00:00:00+09:00'); const dow = d.getDay(); if (dow===0||dow===6) return true; return (HOLIDAYS[d.getFullYear()] || []).includes(s); }
function norm(p) { return (p || '').replace(/[-\s]/g, '').trim(); }

async function main() {
  const ym = '2026-04';

  // 1. confirmed-list-regular 시뮬레이션: 정규직 employee_type 정확 매칭
  const recsListPage = await pool.query(`SELECT * FROM confirmed_attendance WHERE year_month = $1 AND employee_type = '정규직' ORDER BY employee_name, date`, [ym]);
  let listOt = 0, listHol = 0;
  for (const r of recsListPage.rows) {
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    if (isHolidayOrWeekend(r.date)) listHol += reg + ot;
    else listOt += ot;
  }
  console.log(`[근태정보확정 페이지 — employee_type='정규직' 정확 매칭]`);
  console.log(`  연장: ${listOt.toFixed(1)}h, 휴일: ${listHol.toFixed(1)}h`);
  console.log(`  records: ${recsListPage.rows.length}건`);

  // 2. payroll-calc 시뮬레이션 v1 (BEFORE-fix: name 매칭)
  const monthStart = `${ym}-01`;
  const empRows = await pool.query(`SELECT name, phone FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= $1)`, [monthStart]);
  const empNames = new Set(empRows.rows.map(r => r.name));
  const empPhones = new Map();
  for (const e of empRows.rows) {
    const np = norm(e.phone); if (np) empPhones.set(np, e.name);
  }
  let payOt_v1 = 0, payHol_v1 = 0;
  for (const r of recsListPage.rows) {
    if (!empNames.has(r.employee_name)) continue;
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    if (isHolidayOrWeekend(r.date)) payHol_v1 += reg + ot;
    else payOt_v1 += ot;
  }
  console.log(`\n[BEFORE-fix payroll-calc — name 매칭만]`);
  console.log(`  연장: ${payOt_v1.toFixed(1)}h, 휴일: ${payHol_v1.toFixed(1)}h`);

  // 3. payroll-calc 시뮬레이션 v2 (AFTER-fix: phone 매칭 우선, name fallback)
  let payOt_v2 = 0, payHol_v2 = 0;
  for (const r of recsListPage.rows) {
    const np = norm(r.employee_phone);
    const matched = (np && empPhones.has(np)) || empNames.has(r.employee_name);
    if (!matched) continue;
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    if (isHolidayOrWeekend(r.date)) payHol_v2 += reg + ot;
    else payOt_v2 += ot;
  }
  console.log(`\n[AFTER-fix payroll-calc — phone 매칭 + name fallback]`);
  console.log(`  연장: ${payOt_v2.toFixed(1)}h, 휴일: ${payHol_v2.toFixed(1)}h`);

  // 4. confirmed-list 페이지에서도 사실상 phone 기반 그룹화 적용됨 — 이를 시뮬레이션
  // 백엔드 confirmed-list endpoint 의 canonicalIdentity 로직 따라서
  const workers = await pool.query(`SELECT id, name_ko, phone, category FROM workers`);
  const wIdByPhone = new Map();
  for (const w of workers.rows) { const np = norm(w.phone); if (np) wIdByPhone.set(np, w.id); }
  console.log(`\n[근태정보확정 페이지 v2 — backend canonicalIdentity 그룹화 후]`);
  console.log(`  같은 결과여야 함: 합계는 그룹화에 영향 안받음`);

  // 5. 차이 분석
  console.log(`\n=== 사용자 보고 ===`);
  console.log(`  급여계산: 연장 1385h, 휴일 1925.5h`);
  console.log(`  확정: 연장 3430.5h, 휴일 1851h`);

  console.log(`\n=== 우리 DB 현재 시뮬레이션 ===`);
  console.log(`  확정 페이지: 연장 ${listOt.toFixed(1)}h, 휴일 ${listHol.toFixed(1)}h  ← 사용자 ${listOt.toFixed(1)===Math.round(3430.5*10)/10?'일치':'불일치'}`);
  console.log(`  payroll-calc(BEFORE): 연장 ${payOt_v1.toFixed(1)}h, 휴일 ${payHol_v1.toFixed(1)}h`);
  console.log(`  payroll-calc(AFTER): 연장 ${payOt_v2.toFixed(1)}h, 휴일 ${payHol_v2.toFixed(1)}h`);

  console.log(`\n=== 추가 점검: 휴일 1925.5h 가 어디서 나왔을까 ===`);
  // 사용자가 본 휴일 1925.5h 는 우리가 계산한 어떤 값과도 다름
  // payroll-calc 응답의 holiday_hours 필드가 다른 식으로 계산될 가능성
  // 아니면 확정 페이지 totals.holiday vs payroll-calc.holiday_hours 정의가 다른가?
  console.log(`  payroll-calc 백엔드는 isHolidayOrWeekend(rec.date) 일 때 (regular_hours + overtime_hours) 를 holiday_hours 에 누적`);
  console.log(`  확정 페이지 totals.holiday 도 같은 공식 (reg+ot)`);
  console.log(`  → 두 값은 같은 공식. payroll-calc 휴일이 확정보다 더 많으면 계산 어딘가 추가 누적 의심`);

  // payroll-calc 의 floor30 후 합계도 시뮬
  const floor30 = h => Math.floor(h * 2) / 2;
  let payOt_floored = 0, payHol_floored = 0;
  // payroll-calc 는 직원별로 합산한 후 floor30 적용 (per-employee). sum then floor each.
  // 시뮬레이션을 위해 직원별로 그룹
  const empAggOt = new Map(), empAggHol = new Map();
  for (const r of recsListPage.rows) {
    const np = norm(r.employee_phone);
    const key = (np && empPhones.has(np)) ? empPhones.get(np) : (empNames.has(r.employee_name) ? r.employee_name : null);
    if (!key) continue;
    const reg = parseFloat(r.regular_hours)||0, ot = parseFloat(r.overtime_hours)||0;
    if (isHolidayOrWeekend(r.date)) empAggHol.set(key, (empAggHol.get(key) || 0) + reg + ot);
    else empAggOt.set(key, (empAggOt.get(key) || 0) + ot);
  }
  for (const v of empAggOt.values()) payOt_floored += floor30(v);
  for (const v of empAggHol.values()) payHol_floored += floor30(v);
  console.log(`\n[payroll-calc(AFTER) + floor30 per-employee]`);
  console.log(`  연장: ${payOt_floored.toFixed(1)}h, 휴일: ${payHol_floored.toFixed(1)}h`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
