import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 진해수 attendance_records 전체
const r1 = await pool.query(`SELECT * FROM attendance_records WHERE name='진해수' ORDER BY date DESC LIMIT 30`);
console.log(`=== 진해수 attendance_records (${r1.rows.length}건) ===`);
r1.rows.forEach(r => console.log(`  ${r.date} | ${r.clock_in}~${r.clock_out} | ${r.category}/${r.department}/${r.workplace} | ${r.shift}`));

// 진해수 worker 전체 정보
const w = await pool.query(`SELECT * FROM workers WHERE name_ko='진해수'`);
console.log('\n=== workers 진해수 ===', w.rows[0]);

// survey_requests / survey_responses 확인 — 진해수 관련
const sq = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='survey_requests' AND table_schema='public'`);
console.log('\n=== survey_requests columns ===', sq.rows.map(r=>r.column_name).join(','));

const sr = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='survey_responses' AND table_schema='public'`);
console.log('=== survey_responses columns ===', sr.rows.map(r=>r.column_name).join(','));

// confirmed_attendance 컬럼
const cac = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='confirmed_attendance' AND table_schema='public' ORDER BY ordinal_position`);
console.log('\n=== confirmed_attendance columns ===', cac.rows.map(r=>r.column_name).join(','));

// confirmed_attendance 알바/파견 중 진해수와 비슷한 표본 확인 - employee_type 종류 확인
const et = await pool.query(`SELECT DISTINCT employee_type FROM confirmed_attendance`);
console.log('\n=== employee_type 종류 ===', et.rows.map(r=>r.employee_type).join(','));

await pool.end();
