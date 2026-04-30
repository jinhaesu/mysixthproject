import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

function normalizeDate(s) {
  if (!s) return null;
  // Accept 'YYYY-MM-DD' or full ISO timestamp; return YYYY-MM-DD or null
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function main() {
  const resigned = await pool.query(`
    SELECT id, name, phone, department, hire_date, resigned_at, resign_date
    FROM regular_employees
    WHERE (is_active = 0 OR (resigned_at IS NOT NULL AND resigned_at <> '') OR (resign_date IS NOT NULL AND resign_date <> ''))
    ORDER BY id
  `);
  console.log(`퇴사자 ${resigned.rowCount}명 발견\n`);

  let created = 0, skipped = 0;
  for (const r of resigned.rows) {
    const exists = await pool.query(
      `SELECT id FROM employee_offboardings WHERE employee_type='regular' AND employee_ref_id=$1`,
      [r.id]
    );
    if (exists.rowCount > 0) { console.log(`- ${r.name}: 이미 등록됨 (스킵)`); skipped++; continue; }

    const rawResign = r.resign_date || r.resigned_at;
    const resignDate = normalizeDate(rawResign) || new Date().toISOString().slice(0,10);
    const hireDate = normalizeDate(r.hire_date) || '';
    const d = new Date(resignDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const lossDate = d.toISOString().slice(0,10);

    await pool.query(`
      INSERT INTO employee_offboardings
        (employee_type, employee_ref_id, employee_name, employee_phone, department, hire_date, resign_date, loss_date, reason_code, reason_detail, status, notes)
      VALUES ('regular', $1, $2, $3, $4, $5, $6, $7, '', '시스템 도입 전 처리 — 사유 코드 추후 지정 필요', 'in_progress', '근무자 DB 퇴사 처리 backfill (자동)')
    `, [r.id, r.name, r.phone || '', r.department || '', hireDate, resignDate, lossDate]);
    console.log(`✓ ${r.name} hire=${hireDate} resign=${resignDate} loss=${lossDate}`);
    created++;
  }

  console.log(`\n총 ${created}건 생성, ${skipped}건 스킵`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
