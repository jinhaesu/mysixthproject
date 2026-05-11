const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function main() {
  console.log('=== regular_attendance 5월 clock_in/out null 분포 ===');
  const r = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE clock_in_time IS NULL AND clock_out_time IS NULL) AS both_null,
      COUNT(*) FILTER (WHERE clock_in_time IS NULL AND clock_out_time IS NOT NULL) AS in_null_only,
      COUNT(*) FILTER (WHERE clock_in_time IS NOT NULL AND clock_out_time IS NULL) AS out_null_only,
      COUNT(*) FILTER (WHERE clock_in_time IS NOT NULL AND clock_out_time IS NOT NULL) AS both_set
    FROM regular_attendance WHERE date >= '2026-05-01' AND date <= '2026-05-31'
  `);
  console.log(' ', r.rows[0]);

  console.log('\n=== 미확정으로 잡혀야 하는 5월 actuals 중 황금빛 example ===');
  const ex = await pool.query(`
    SELECT ra.id, ra.date, ra.clock_in_time, ra.clock_out_time, re.name
    FROM regular_attendance ra
    JOIN regular_employees re ON ra.employee_id = re.id
    WHERE re.name = '황금빛' AND ra.date >= '2026-05-01' AND ra.date <= '2026-05-31'
    ORDER BY ra.date
  `);
  for (const row of ex.rows) console.log(`  ${row.date} | in=${row.clock_in_time} | out=${row.clock_out_time}`);

  console.log('\n=== summary 엔드포인트 응답 시뮬레이션 (5월) ===');
  const emps = await pool.query(`SELECT id, name, phone, department, team FROM regular_employees WHERE is_active = 1 ORDER BY name LIMIT 5`);
  for (const e of emps.rows) {
    const actuals = await pool.query(`SELECT date, clock_in_time, clock_out_time FROM regular_attendance WHERE employee_id = $1 AND date >= '2026-05-01' AND date <= '2026-05-31'`, [e.id]);
    const hasTime = actuals.rows.filter(r => r.clock_in_time || r.clock_out_time).length;
    console.log(`  ${e.name}: total=${actuals.rowCount} hasTime=${hasTime}`);
  }

  await pool.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
