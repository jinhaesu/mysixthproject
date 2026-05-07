import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});

async function main() {
  // 같은 직원에게 signed + pending 둘 다 있는 케이스
  const dual = await pool.query(`
    SELECT employee_id, COUNT(*) FILTER (WHERE status='signed') AS signed_n,
           COUNT(*) FILTER (WHERE status='pending') AS pending_n,
           STRING_AGG(DISTINCT worker_name, ' / ') AS names
    FROM regular_labor_contracts
    WHERE employee_id IS NOT NULL
    GROUP BY employee_id
    HAVING COUNT(*) FILTER (WHERE status='signed') >= 1
       AND COUNT(*) FILTER (WHERE status='pending') >= 1
    ORDER BY signed_n DESC, pending_n DESC
  `);
  console.log(`=== signed + pending 둘 다 있는 직원: ${dual.rowCount}명 ===`);
  for (const r of dual.rows) {
    const detail = await pool.query(`
      SELECT id, status, contract_start, contract_end, work_start_date, created_at
      FROM regular_labor_contracts
      WHERE employee_id = $1
      ORDER BY created_at DESC
    `, [r.employee_id]);
    console.log(`\n  [#${r.employee_id}] ${r.names}  (signed=${r.signed_n}, pending=${r.pending_n})`);
    detail.rows.forEach(c => {
      const tag = c.status === 'signed' ? '✓ 서명' : '· 발송';
      console.log(`    ${tag} #${c.id} ${c.contract_start}~${c.contract_end} created=${c.created_at?.toISOString?.()?.slice(0,16) ?? c.created_at}`);
    });
  }

  // 최신 row 가 pending이지만 옛 signed가 있는 경우 (현재 latest 로직 기준 잘못 표시되는 케이스)
  console.log(`\n=== 최신 row 가 pending이라 '발송됨'으로 표시되는데, 같은 직원에게 옛 signed 가 있는 경우 ===`);
  const wrong = await pool.query(`
    WITH ranked AS (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY created_at DESC) AS rn
      FROM regular_labor_contracts
      WHERE employee_id IS NOT NULL
    )
    SELECT r1.employee_id, r1.worker_name, r1.id AS latest_id, r1.status AS latest_status,
           r1.contract_start, r1.created_at,
           (SELECT id FROM regular_labor_contracts r2
            WHERE r2.employee_id = r1.employee_id AND r2.status = 'signed'
            ORDER BY r2.created_at DESC LIMIT 1) AS prev_signed_id
    FROM ranked r1
    WHERE r1.rn = 1 AND r1.status = 'pending'
      AND EXISTS (SELECT 1 FROM regular_labor_contracts r2
                  WHERE r2.employee_id = r1.employee_id AND r2.status = 'signed')
    ORDER BY r1.worker_name
  `);
  console.log(`  ${wrong.rowCount}건`);
  wrong.rows.forEach(r => console.log(`  #${r.employee_id} ${r.worker_name}: 최신=${r.latest_id}(pending) but signed=${r.prev_signed_id} 존재`));

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
