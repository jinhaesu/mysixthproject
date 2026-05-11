// Direct SQL timing audit of every list/summary query on common pages
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function T(label, q, ...p) {
  const t = Date.now();
  try { const r = await pool.query(q, p); console.log(`${(Date.now()-t).toString().padStart(6)}ms  ${label}  rows=${r.rowCount}`); }
  catch (e) { console.log(`  ERR  ${label}  ${e.message.slice(0,100)}`); }
}
async function main() {
  await pool.query('SELECT 1');

  console.log('=== 정규직 노무비 미확정 캘린더 (attendance-summary) ===');
  await T('regular_employees active', "SELECT id, name, phone, department, team FROM regular_employees WHERE is_active = 1 ORDER BY department, team, name");
  await T('regular_attendance month', "SELECT employee_id, date, clock_in_time, clock_out_time FROM regular_attendance WHERE date >= '2026-05-01' AND date <= '2026-05-31'");
  await T('regular_shifts', "SELECT rsa.employee_id, rs.planned_clock_in, rs.planned_clock_out, rs.days_of_week, rs.day_of_week, rs.month, rs.week_number FROM regular_shift_assignments rsa JOIN regular_shifts rs ON rsa.shift_id = rs.id WHERE rs.is_active = 1 AND (rs.month = 0 OR rs.month = $1)", 5);
  await T('regular vacations approved', "SELECT vr.*, re.name as employee_name, re.department, re.team, re.phone FROM regular_vacation_requests vr JOIN regular_employees re ON vr.employee_id = re.id WHERE vr.status = 'approved' ORDER BY vr.created_at DESC");

  console.log('\n=== confirmed-list (정규직 노무비 확정 리스트) ===');
  await T('confirmed_attendance 2026-05 grouped', "SELECT employee_name, employee_phone, date, regular_hours, overtime_hours, night_hours FROM confirmed_attendance WHERE year_month = '2026-05' AND employee_type = '정규직' ORDER BY employee_name");

  console.log('\n=== 사업소득/파견 노무비 ===');
  await T('confirmed_list 종합 dispatch+alba', "SELECT * FROM confirmed_attendance WHERE year_month = '2026-05' ORDER BY employee_name, date");

  console.log('\n=== 출근/퇴근 설문 출퇴근 ===');
  await T('survey_requests 2026-05', "SELECT * FROM survey_requests WHERE date >= '2026-05-01' AND date <= '2026-05-31' ORDER BY date DESC LIMIT 100");
  await T('survey_responses count', "SELECT COUNT(*) FROM survey_responses");

  console.log('\n=== Dashboard 통계 ===');
  await T('dashboard regular', "SELECT employee_type, COUNT(*) FROM confirmed_attendance WHERE year_month = '2026-05' GROUP BY employee_type");

  console.log('\n=== 휴가 / 인덱스 확인 ===');
  await T('regular_shift_assignments size', "SELECT pg_size_pretty(pg_total_relation_size('regular_shift_assignments'::regclass)) as size, COUNT(*) FROM regular_shift_assignments");
  const ind = await pool.query(`SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('regular_attendance','regular_shifts','regular_shift_assignments','regular_vacation_requests')`);
  for (const r of ind.rows) console.log(`  idx ${r.tablename}.${r.indexname}`);

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
