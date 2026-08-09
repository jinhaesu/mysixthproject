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
  console.log('\n=== 카페 정규직 3명 · 전 기간 근태 있는지 ===\n');

  for (const t of TARGETS) {
    const np = norm(t.phone);
    const anysr = await pool.query(`
      SELECT DATE_TRUNC('month', sr.date::date) as ym, COUNT(*) as cnt
      FROM survey_requests sr
      WHERE REGEXP_REPLACE(sr.phone, '[-\s]', '', 'g') = $1
      GROUP BY ym ORDER BY ym
    `, [np]);
    const anyca = await pool.query(`
      SELECT year_month, employee_type, COUNT(*) as cnt
      FROM confirmed_attendance
      WHERE (REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\s]', '', 'g') = $1
             OR employee_name = $2)
      GROUP BY year_month, employee_type ORDER BY year_month
    `, [np, t.name]);
    const anyra = await pool.query(`
      SELECT DATE_TRUNC('month', date::date) as ym, COUNT(*) as cnt
      FROM regular_attendance
      WHERE employee_id = (SELECT id FROM regular_employees WHERE phone LIKE $1 OR name = $2 LIMIT 1)
      GROUP BY ym ORDER BY ym
    `, [`%${t.phone.slice(-8)}%`, t.name]);

    console.log(`▶ ${t.name} (${t.phone}) - ${t.dept}`);
    console.log(`  survey_requests: ${anysr.rowCount ? anysr.rows.map(r => r.ym.toISOString().slice(0,7) + '(' + r.cnt + ')').join(', ') : '(전기간 없음)'}`);
    console.log(`  confirmed_attendance: ${anyca.rowCount ? anyca.rows.map(r => r.year_month + '/' + r.employee_type + '(' + r.cnt + ')').join(', ') : '(전기간 없음)'}`);
    console.log(`  regular_attendance(자체GPS): ${anyra.rowCount ? anyra.rows.map(r => r.ym.toISOString().slice(0,7) + '(' + r.cnt + ')').join(', ') : '(전기간 없음)'}`);
  }

  // 혹시 다른 phone 으로 등록된 케이스도 있는지 이름 기반 확인
  console.log('\n=== 이름 기반 광범위 확인 (survey_requests) ===\n');
  for (const t of TARGETS) {
    const byName = await pool.query(`
      SELECT DISTINCT sr.phone, resp.worker_name_ko, DATE_TRUNC('month', sr.date::date) as ym
      FROM survey_requests sr
      JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE resp.worker_name_ko = $1
      ORDER BY ym DESC
      LIMIT 10
    `, [t.name]);
    console.log(`▶ ${t.name}: ${byName.rowCount ? byName.rows.map(r => `${r.phone}(${r.ym.toISOString().slice(0,7)})`).join(', ') : '(이름 매칭 없음)'}`);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
