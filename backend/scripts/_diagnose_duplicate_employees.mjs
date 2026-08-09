import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });

async function main() {
  console.log('\n=== 정연화 관련 모든 entries ===\n');

  const jy = await pool.query(`
    SELECT id, name, phone, department, team, role, hire_date, resign_date, is_active, created_at, updated_at
    FROM regular_employees
    WHERE name LIKE '%정연화%'
    ORDER BY id
  `);
  console.log(`regular_employees 정연화: ${jy.rowCount}건`);
  for (const r of jy.rows) {
    console.log(`  #${r.id} ${r.name} (${r.phone}) ${r.department} ${r.team} hire=${r.hire_date} resign=${r.resign_date || '-'} active=${r.is_active} | created=${r.created_at?.toISOString?.().slice(0,10)}`);
  }

  console.log('\n각 정연화의 관련 데이터:');
  for (const r of jy.rows) {
    console.log(`\n▶ #${r.id} ${r.name}`);

    // salary_settings
    const ss = await pool.query(`SELECT base_pay, meal_allowance, bonus FROM regular_salary_settings WHERE employee_id = $1`, [r.id]);
    if (ss.rowCount) console.log(`  salary_settings: base=${ss.rows[0].base_pay} meal=${ss.rows[0].meal_allowance} bonus=${ss.rows[0].bonus}`);
    else console.log('  salary_settings: 없음');

    // regular_attendance (GPS 근태)
    const ra = await pool.query(`SELECT COUNT(*) as cnt, MIN(date) as first, MAX(date) as last FROM regular_attendance WHERE employee_id = $1`, [r.id]);
    console.log(`  regular_attendance(GPS): ${ra.rows[0].cnt}건 (${ra.rows[0].first || '-'}~${ra.rows[0].last || '-'})`);

    // confirmed_attendance
    const ca = await pool.query(`
      SELECT year_month, COUNT(*) as cnt
      FROM confirmed_attendance
      WHERE employee_type='정규직'
        AND (employee_name = $1
             OR REGEXP_REPLACE(COALESCE(employee_phone,''), '[-\\s]', '', 'g')
                = REGEXP_REPLACE(COALESCE($2,''), '[-\\s]', '', 'g'))
      GROUP BY year_month ORDER BY year_month
    `, [r.name, r.phone]);
    console.log(`  confirmed_attendance: ${ca.rowCount ? ca.rows.map(x => `${x.year_month}(${x.cnt})`).join(', ') : '없음'}`);

    // employment_periods
    const ep = await pool.query(`SELECT period_start, period_end, reason_start, reason_end FROM employment_periods WHERE employee_ref_id = $1`, [r.id]);
    console.log(`  employment_periods: ${ep.rowCount ? ep.rows.map(x => `${String(x.period_start).slice(0,10)}~${x.period_end ? String(x.period_end).slice(0,10) : '재직중'}[${x.reason_start}/${x.reason_end || '-'}]`).join(', ') : '없음'}`);

    // 근로계약서 (테이블명 다양성 대비)
    try {
      const cn = await pool.query(`SELECT COUNT(*) as cnt FROM labor_contracts WHERE employee_id = $1 OR phone = $2`, [r.id, r.phone]);
      console.log(`  labor_contracts: ${cn.rows[0].cnt}건`);
    } catch {
      console.log('  labor_contracts: 조회불가');
    }

    // offboardings
    const off = await pool.query(`SELECT resign_date, reason_code, reason_detail FROM employee_offboardings WHERE employee_type='regular' AND employee_ref_id = $1`, [r.id]);
    console.log(`  offboardings: ${off.rowCount ? off.rows.map(x => `${x.resign_date} [${x.reason_code}] ${x.reason_detail || ''}`).join(', ') : '없음'}`);
  }

  // === 유사 케이스 스캔: 같은 phone 으로 여러 entries ===
  console.log('\n\n=== 유사 케이스: 같은 phone 으로 정규직 여러 등록 ===\n');
  const dup1 = await pool.query(`
    SELECT phone, COUNT(*) as cnt, ARRAY_AGG(id ORDER BY id) as ids, ARRAY_AGG(name ORDER BY id) as names,
           ARRAY_AGG(is_active::text ORDER BY id) as actives
    FROM regular_employees
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY phone
    HAVING COUNT(*) > 1
  `);
  console.log(`같은 phone 여러 entries: ${dup1.rowCount}건`);
  for (const r of dup1.rows) console.log(`  phone=${r.phone}: ids=[${r.ids.join(',')}] names=[${r.names.join(' / ')}] actives=[${r.actives.join(',')}]`);

  // === 이름 유사도 기반 스캔 (같은 이름 접두어) ===
  console.log('\n=== 유사 케이스: 이름이 서로 substring 관계인 entries (재등록 후보) ===\n');
  const all = await pool.query(`SELECT id, name, phone, is_active FROM regular_employees ORDER BY id`);
  const list = all.rows;
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i].name, b = list[j].name;
      if (!a || !b) continue;
      // 한쪽이 다른쪽의 시작 문자열이거나 (조인) 괄호로 감싸진 케이스
      const aBase = a.replace(/\([^)]*\)/g, '').trim();
      const bBase = b.replace(/\([^)]*\)/g, '').trim();
      if (aBase && bBase && (aBase === bBase || aBase === b || bBase === a) && list[i].phone !== list[j].phone) {
        pairs.push([list[i], list[j]]);
      }
    }
  }
  console.log(`이름 유사 (다른 phone): ${pairs.length}쌍`);
  for (const [a, b] of pairs) {
    console.log(`  #${a.id} "${a.name}" (${a.phone}, active=${a.is_active})  vs  #${b.id} "${b.name}" (${b.phone}, active=${b.is_active})`);
  }

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e); process.exit(1); });
