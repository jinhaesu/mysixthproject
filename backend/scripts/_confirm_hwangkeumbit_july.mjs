import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

// 공휴일 (isHolidayOrWeekend 동일)
const HOLIDAYS = {
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-07-17','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
};
function isHolidayOrWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}

async function main() {
  console.log('\n=== 황금빛(카페 해방촌) 7월 regular_attendance → confirmed_attendance 이관 ===\n');

  // 대상 조회
  const emp = await pool.query(`SELECT id, name, phone, department FROM regular_employees WHERE name = '황금빛' LIMIT 1`);
  if (!emp.rowCount) { console.log('황금빛 정규직 마스터 없음'); process.exit(1); }
  const E = emp.rows[0];
  console.log(`대상: #${E.id} ${E.name} (${E.phone}) ${E.department}\n`);

  const ras = await pool.query(`
    SELECT id, date, clock_in_time, clock_out_time
    FROM regular_attendance
    WHERE employee_id = $1 AND date >= '2026-07-01' AND date <= '2026-07-31'
    ORDER BY date
  `, [E.id]);
  console.log(`regular_attendance: ${ras.rowCount}건\n`);

  const fmtTime = (t) => {
    if (!t) return '';
    const d = new Date(t);
    // KST 로 시:분 반환
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(11, 16);
  };

  let inserted = 0, skipped = 0;
  for (const r of ras.rows) {
    // 이미 confirmed_attendance 있으면 skip
    const exists = await pool.query(
      `SELECT id FROM confirmed_attendance
       WHERE employee_type = '정규직' AND employee_name = $1 AND date = $2`,
      [E.name, r.date]
    );
    if (exists.rowCount > 0) {
      console.log(`  ${r.date} skip (이미 확정됨)`);
      skipped++;
      continue;
    }

    const clockIn = fmtTime(r.clock_in_time);
    const clockOut = fmtTime(r.clock_out_time);
    if (!clockIn || !clockOut) {
      console.log(`  ${r.date} skip (clock_in/out 없음: in=${r.clock_in_time} out=${r.clock_out_time})`);
      skipped++;
      continue;
    }

    // 시간 계산 (recalc-confirmed 로직 동일)
    const [h1, m1] = clockIn.split(':').map(Number);
    const [h2, m2] = clockOut.split(':').map(Number);
    const startMin = Math.ceil((h1 * 60 + (m1 || 0)) / 30) * 30;
    let endMin = Math.floor((h2 * 60 + (m2 || 0)) / 30) * 30;
    if (endMin <= startMin) endMin += 1440;
    const totalH = (endMin - startMin) / 60;
    const breakH = totalH >= 8 ? 1 : totalH >= 4 ? 0.5 : 0;
    const workH = Math.max(totalH - breakH, 0);
    let nightMin = 0;
    for (let min = startMin; min < endMin; min++) {
      const h = Math.floor(min / 60) % 24;
      if (h >= 22 || h < 6) nightMin++;
    }
    const nightH = Math.round(nightMin / 60 * 10) / 10;
    const dayWork = Math.max(workH - nightH, 0);
    const isHoliday = isHolidayOrWeekend(r.date);
    const regularH = isHoliday ? 0 : Math.round(Math.min(dayWork, 8) * 10) / 10;
    const overtimeH = isHoliday ? Math.round(dayWork * 10) / 10 : Math.round(Math.max(dayWork - 8, 0) * 10) / 10;

    await pool.query(
      `INSERT INTO confirmed_attendance
        (employee_type, employee_name, employee_phone, date, confirmed_clock_in, confirmed_clock_out,
         source, regular_hours, overtime_hours, night_hours, break_hours, holiday_work, memo, year_month, department)
       VALUES ('정규직', $1, $2, $3, $4, $5, 'gps', $6, $7, $8, $9, $10, $11, '2026-07', $12)`,
      [E.name, E.phone || '', r.date, clockIn, clockOut,
       regularH, overtimeH, nightH, breakH, isHoliday ? 1 : 0,
       'regular_attendance GPS 자동 확정 이관',
       E.department || '카페(해방촌)']
    );
    console.log(`  ${r.date} ${isHoliday ? '(휴일)' : '(평일)'} ${clockIn}~${clockOut} → reg=${regularH} ot=${overtimeH} night=${nightH}`);
    inserted++;
  }

  console.log(`\n=== 결과 ===`);
  console.log(`이관 완료: ${inserted}건, skip: ${skipped}건`);

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
