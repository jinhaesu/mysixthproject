import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const DEPARTMENT = '물류';
const WORKED_DATE = '2026-07-19';
const ORIGINAL_DATE = '2026-07-16';
const YEAR_MONTH = '2026-07';
const EMPLOYEE_TYPE = '정규직';

async function main() {
  console.log(`\n=== 대체근무 처리: ${DEPARTMENT} · ${WORKED_DATE} → ${ORIGINAL_DATE} ===\n`);

  // 1) 물류 부서 + 7/19 confirmed_attendance records 조회
  const targets = await pool.query(
    `SELECT * FROM confirmed_attendance
     WHERE date = $1 AND year_month = $2 AND employee_type = $3 AND department = $4`,
    [WORKED_DATE, YEAR_MONTH, EMPLOYEE_TYPE, DEPARTMENT]
  );
  console.log(`대상 records: ${targets.rowCount}건\n`);
  if (targets.rowCount === 0) {
    console.log('물류 7/19 근무 records 없음. department 컬럼이 비었을 수 있으니 이름 기준으로 확장 조회 시도...\n');
    // department 비어있을 수 있으므로 regular_employees 조인해서 물류 부서 사람만 필터
    const alt = await pool.query(
      `SELECT ca.* FROM confirmed_attendance ca
       WHERE ca.date = $1 AND ca.year_month = $2 AND ca.employee_type = $3
         AND EXISTS (
           SELECT 1 FROM regular_employees re
           WHERE re.department = $4
             AND (re.name = ca.employee_name
                  OR REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g')
                     = REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g'))
         )`,
      [WORKED_DATE, YEAR_MONTH, EMPLOYEE_TYPE, DEPARTMENT]
    );
    console.log(`이름/전화 매칭 확장 결과: ${alt.rowCount}건\n`);
    targets.rows = alt.rows;
    targets.rowCount = alt.rowCount;
  }

  let recalcedCount = 0;
  let dummyInsertedCount = 0;
  const affected = [];

  for (const r of targets.rows) {
    console.log(`- ${r.employee_name} (${r.employee_phone || '(no phone)'}): in=${r.confirmed_clock_in} out=${r.confirmed_clock_out}`);

    // (1) worked_date record 평일 기준 재계산
    if (r.confirmed_clock_in && r.confirmed_clock_out) {
      const [h1, m1] = r.confirmed_clock_in.split(':').map(Number);
      const [h2, m2] = r.confirmed_clock_out.split(':').map(Number);
      if (!isNaN(h1) && !isNaN(h2)) {
        const startMin = Math.ceil((h1 * 60 + (m1 || 0)) / 30) * 30;
        let endMin = Math.floor((h2 * 60 + (m2 || 0)) / 30) * 30;
        if (endMin <= startMin) endMin += 1440;
        const totalH = (endMin - startMin) / 60;
        const parsedBreak = parseFloat(r.break_hours);
        const breakH = !isNaN(parsedBreak) ? parsedBreak : (totalH >= 8 ? 1 : totalH >= 4 ? 0.5 : 0);
        const workH = Math.max(totalH - breakH, 0);
        let nightMin = 0;
        for (let min = startMin; min < endMin; min++) {
          const h = Math.floor(min / 60) % 24;
          if (h >= 22 || h < 6) nightMin++;
        }
        const nightH = Math.round(nightMin / 60 * 10) / 10;
        const dayWork = Math.max(workH - nightH, 0);
        // 평일 취급
        const regularH = Math.round(Math.min(dayWork, 8) * 10) / 10;
        const overtimeH = Math.round(Math.max(dayWork - 8, 0) * 10) / 10;
        const newMemo = ((r.memo || '') + ` [대체근무 · 원 소정: ${ORIGINAL_DATE}]`).trim();
        await pool.query(
          `UPDATE confirmed_attendance
             SET regular_hours = $1, overtime_hours = $2, night_hours = $3,
                 holiday_work = 0, memo = $4
           WHERE id = $5`,
          [regularH, overtimeH, nightH, newMemo, r.id]
        );
        console.log(`    → 재계산: regular=${regularH}, overtime=${overtimeH}, night=${nightH}`);
        recalcedCount++;
      }
    }

    // (2) 원 소정일에 대체휴무 dummy record INSERT (없을 때만)
    const existing = await pool.query(
      `SELECT id FROM confirmed_attendance
       WHERE employee_type = $1 AND employee_name = $2 AND date = $3`,
      [EMPLOYEE_TYPE, r.employee_name, ORIGINAL_DATE]
    );
    if (existing.rowCount === 0) {
      await pool.query(
        `INSERT INTO confirmed_attendance
           (employee_type, employee_name, employee_phone, date, confirmed_clock_in, confirmed_clock_out,
            source, regular_hours, overtime_hours, night_hours, break_hours, holiday_work, memo, year_month, department)
         VALUES ($1, $2, $3, $4, '대체휴무', '대체휴무', 'substitute', 8, 0, 0, 0, 0, $5, $6, $7)`,
        [EMPLOYEE_TYPE, r.employee_name, r.employee_phone || '', ORIGINAL_DATE,
         `대체휴무 (${WORKED_DATE} 근무로 대체)`, YEAR_MONTH, r.department || DEPARTMENT]
      );
      console.log(`    → 대체휴무 dummy insert: ${ORIGINAL_DATE} regular=8`);
      dummyInsertedCount++;
    } else {
      console.log(`    → 대체휴무 skip: ${ORIGINAL_DATE} 이미 record 존재`);
    }

    affected.push({ name: r.employee_name, phone: r.employee_phone || '' });
  }

  console.log(`\n=== 결과 ===`);
  console.log(`재계산: ${recalcedCount}건`);
  console.log(`대체휴무 dummy 삽입: ${dummyInsertedCount}건`);
  console.log(`영향받은 인원: ${affected.length}명 [${affected.map(a => a.name).join(', ')}]`);

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
