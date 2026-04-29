// 권민경/진해수 2026-03-30 ~ 2026-04-24 영업일 출퇴근 기록 생성
// 출근 08:45~09:15, 퇴근 20:00~22:00 (랜덤)
import 'dotenv/config';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const HOLIDAYS_2026 = new Set(['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25']);
const WORKPLACE_ID = 2; // 조인앤조인 공장

function* eachWorkday(start, end) {
  const cur = new Date(start + 'T00:00:00+09:00');
  const e = new Date(end + 'T00:00:00+09:00');
  while (cur <= e) {
    const dow = cur.getDay();
    const ds = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    if (dow !== 0 && dow !== 6 && !HOLIDAYS_2026.has(ds)) yield ds;
    cur.setDate(cur.getDate() + 1);
  }
}

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function randomTime(date, hStart, hEnd, minStart = 0, minEnd = 59) {
  const h = randInt(hStart, hEnd);
  const m = randInt(minStart, minEnd);
  return new Date(`${date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+09:00`).toISOString();
}

const TOKEN_EXPIRY_HOURS = 24 * 30;

async function ensureWorker(name, phone, category) {
  const existing = (await pool.query('SELECT id, phone, name_ko, category FROM workers WHERE name_ko = $1', [name])).rows[0];
  if (existing) return existing;
  const ins = await pool.query(
    `INSERT INTO workers (phone, name_ko, name_en, category, agency)
     VALUES ($1, $2, '', $3, '')
     RETURNING id, phone, name_ko, category`,
    [phone, name, category]
  );
  console.log(`   + workers 신규 등록: ${name} (id=${ins.rows[0].id}, phone='${phone || '미지정'}')`);
  return ins.rows[0];
}

async function insertOne(worker, date) {
  // 출근: 08:45 ~ 09:15 (08시 45~59분 또는 09시 0~15분)
  const inIso = (() => {
    const inEarly = Math.random() < 0.5;
    return inEarly ? randomTime(date, 8, 8, 45, 59) : randomTime(date, 9, 9, 0, 15);
  })();
  // 퇴근: 20:00 ~ 22:00
  const outIso = randomTime(date, 20, 21, 0, 59);

  // 중복 방지: 동일 날짜+phone 이미 있으면 건너뜀
  const dup = await pool.query(
    `SELECT sr.id FROM survey_requests sr WHERE sr.phone = $1 AND sr.date = $2 LIMIT 1`,
    [worker.phone || '', date]
  );
  if (dup.rows.length > 0) {
    console.log(`   = ${worker.name_ko} ${date} 이미 존재, 건너뜀`);
    return false;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const reqRes = await pool.query(
    `INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at, department, status)
     VALUES ($1, $2, $3, $4, 'manual', $5, '', 'manual')
     RETURNING id`,
    [token, worker.phone || '', WORKPLACE_ID, date, expiresAt]
  );
  const requestId = reqRes.rows[0].id;

  let workerType = '';
  const cat = (worker.category || '').toLowerCase();
  if (cat.includes('파견') || cat === 'dispatch') workerType = 'dispatch';
  else if (cat.includes('알바') || cat.includes('아르바이트') || cat.includes('사업소득') || cat === 'alba') workerType = 'alba';

  await pool.query(
    `INSERT INTO survey_responses (request_id, clock_in_time, clock_out_time, worker_name_ko, worker_name_en, worker_type, bank_name, bank_account, id_number, emergency_contact)
     VALUES ($1, $2, $3, $4, '', $5, '', '', '', '')`,
    [requestId, inIso, outIso, worker.name_ko, workerType]
  );
  return true;
}

async function main() {
  console.log('=== Step 1. 직원 확인/등록 ===');
  const jin = await ensureWorker('진해수', '010-3487-6451', '아르바이트');
  console.log(`   - 진해수: id=${jin.id}, phone=${jin.phone}, category=${jin.category}`);
  const kwon = await ensureWorker('권민경', '', '아르바이트');
  console.log(`   - 권민경: id=${kwon.id}, phone='${kwon.phone || '미지정 — 추후 업데이트 권장'}', category=${kwon.category}`);

  console.log('\n=== Step 2. 영업일 출퇴근 기록 INSERT ===');
  const dates = [...eachWorkday('2026-03-30', '2026-04-24')];
  console.log(`   영업일 ${dates.length}일: ${dates[0]} ~ ${dates[dates.length-1]}`);
  console.log(`   대상: ${dates.join(', ')}`);

  let total = 0;
  for (const w of [jin, kwon]) {
    let cnt = 0;
    for (const d of dates) {
      if (await insertOne(w, d)) cnt++;
    }
    console.log(`   ✓ ${w.name_ko}: ${cnt}/${dates.length}건 삽입`);
    total += cnt;
  }
  console.log(`\n총 ${total}건 삽입 완료.`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
