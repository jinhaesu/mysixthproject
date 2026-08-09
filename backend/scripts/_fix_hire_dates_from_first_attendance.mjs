import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== 정규직 hire_date 첫 근태일로 자동 조정 ===\n');

  // 대상: hire_date > 첫 근태일 인 인원 (근태 있는데 hire_date 늦음)
  // 모든 정규직에 대해 min(hire_date, first_attendance_date) 로 갱신
  const targets = await pool.query(`
    WITH first_ca AS (
      SELECT re.id, re.name, re.phone, re.hire_date, re.resign_date,
             MIN(ca.date) as first_att
      FROM regular_employees re
      JOIN confirmed_attendance ca
        ON ca.employee_type = '정규직'
           AND (ca.employee_name = re.name
                OR REGEXP_REPLACE(COALESCE(ca.employee_phone,''), '[-\\s]', '', 'g')
                   = REGEXP_REPLACE(COALESCE(re.phone,''), '[-\\s]', '', 'g'))
      GROUP BY re.id, re.name, re.phone, re.hire_date, re.resign_date
    )
    SELECT * FROM first_ca
    WHERE hire_date > first_att
    ORDER BY hire_date
  `);
  console.log(`대상 인원: ${targets.rowCount}명\n`);

  let updated = 0;
  for (const t of targets.rows) {
    const newHire = t.first_att;
    const oldHire = t.hire_date;
    console.log(`#${t.id} ${t.name}: hire ${oldHire} → ${newHire} (첫 근태일)${t.resign_date ? ` | resign=${t.resign_date}` : ''}`);
    // 티늉 특수 케이스: hire > resign 이면 hire = first_att, resign 유지
    await pool.query(
      `UPDATE regular_employees SET hire_date = $1, updated_at = NOW() WHERE id = $2`,
      [newHire, t.id]
    );
    updated++;
  }

  console.log(`\n=== 결과: ${updated}명 hire_date 조정 완료 ===`);
  console.log('이제 7월 정규직 노무비 재계산하면 급여 정상 반영됨.');

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
