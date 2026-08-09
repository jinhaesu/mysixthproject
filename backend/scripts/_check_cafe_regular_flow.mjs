import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

const TARGETS = [
  { name: '신아름누리', phone: '01092359802', dept: '카페(경복궁)' },
  { name: '전서현', phone: '01087657026', dept: '카페(경복궁)' },
  { name: '황금빛', phone: '01099358741', dept: '카페(해방촌)' },
];

async function main() {
  const norm = (p) => (p || '').replace(/[-\s]/g, '');
  console.log('\n=== 카페 정규직 3명 근태 흐름 진단 (2026-07) ===\n');

  for (const t of TARGETS) {
    console.log(`\n▶ ${t.name} (${t.phone}) - ${t.dept}`);
    const np = norm(t.phone);

    // 1) survey_requests / responses 실측 데이터
    const sr = await pool.query(`
      SELECT sr.date, sr.department, sr.planned_clock_in, sr.planned_clock_out,
             resp.clock_in_time, resp.clock_out_time, resp.worker_type, resp.worker_name_ko
      FROM survey_requests sr
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE REGEXP_REPLACE(sr.phone, '[-\\s]', '', 'g') = $1
        AND sr.date >= '2026-07-01' AND sr.date <= '2026-07-31'
      ORDER BY sr.date
    `, [np]);
    console.log(`  survey_requests 7월: ${sr.rowCount}건`);
    for (const r of sr.rows.slice(0, 5)) {
      console.log(`    ${r.date} dept=${r.department} plan=${r.planned_clock_in}~${r.planned_clock_out} actual=${r.clock_in_time || '-'}~${r.clock_out_time || '-'} type=${r.worker_type || '?'}`);
    }
    if (sr.rowCount > 5) console.log(`    ... 외 ${sr.rowCount - 5}건`);

    // 2) confirmed_attendance 저장 상태
    const ca = await pool.query(`
      SELECT date, employee_type, department, confirmed_clock_in, confirmed_clock_out, regular_hours, overtime_hours, night_hours
      FROM confirmed_attendance
      WHERE year_month = '2026-07'
        AND (REGEXP_REPLACE(COALESCE(employee_phone, ''), '[-\\s]', '', 'g') = $1
             OR employee_name = $2)
      ORDER BY date
    `, [np, t.name]);
    console.log(`  confirmed_attendance 7월: ${ca.rowCount}건`);
    for (const r of ca.rows.slice(0, 5)) {
      console.log(`    ${r.date} type=${r.employee_type} dept=${r.department || '(none)'} ${r.confirmed_clock_in}~${r.confirmed_clock_out} reg=${r.regular_hours} ot=${r.overtime_hours} night=${r.night_hours}`);
    }
    if (ca.rowCount > 5) console.log(`    ... 외 ${ca.rowCount - 5}건`);

    // 3) 판정
    const asRegular = ca.rows.filter(r => r.employee_type === '정규직').length;
    const asAlba = ca.rows.filter(r => r.employee_type === '알바').length;
    const asOther = ca.rows.length - asRegular - asAlba;
    console.log(`  → 확정 분류: 정규직 ${asRegular}건 / 알바 ${asAlba}건 / 기타 ${asOther}건`);
    if (asAlba > 0 && asRegular === 0) {
      console.log(`  ⚠  실제 정규직인데 카페 SMS 발송 경로로 인해 알바 타입으로 저장됨 → 정규직 노무비 화면에서 누락`);
    }
    if (sr.rowCount > 0 && ca.rowCount === 0) {
      console.log(`  ⚠  survey_requests 는 있는데 confirmed_attendance 없음 → 관리자가 확정 처리 안 함`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
