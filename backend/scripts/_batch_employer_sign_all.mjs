// 완료된 계약서 187건에 사업주(대표이사 진해수) 서명 일괄 처리.
// 조인앤조인 법인 도장(base64) 사용, 각 계약서마다 API 순차 호출.
// 실패 시 리스트업, 성공 카운터, 진행률 표시.

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

// 도장 base64 data URL 로드 (backend/src/assets/companyStamp.ts 에서 export 값 추출)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stampSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'companyStamp.ts'), 'utf8');
const stampMatch = stampSrc.match(/COMPANY_STAMP_DATA_URL\s*=\s*`(data:image\/[^`]+)`/);
if (!stampMatch) {
  console.error('❌ companyStamp.ts 에서 도장 data URL 추출 실패');
  process.exit(1);
}
const STAMP_DATA_URL = stampMatch[1];
console.log(`✅ 도장 로드 완료 (${STAMP_DATA_URL.length} 자)`);

const API = 'https://mysixthproject-557811875995.asia-northeast3.run.app';
const JWT_SECRET = '345faadda6f42b2ddc115ace70ce78c5f765b757485f2ed67cb6339ea424c9a1';
const SIGNER_NAME = '진해수';
const SIGNER_EMAIL = 'lion9080@joinandjoin.com';

const token = jwt.sign(
  { type: 'auth', id: 1, email: SIGNER_EMAIL, role: 'admin', name: '진해수 (대표이사)' },
  JWT_SECRET, { expiresIn: '3h' },
);

async function signOne(url, body, label) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) {
      return { ok: false, error: data.error || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  // 정규직 168건 조회
  const regList = await pool.query(`
    SELECT id, worker_name, contract_kind
    FROM regular_labor_contracts
    WHERE status = 'signed'
      AND signature_data IS NOT NULL AND signature_data != ''
      AND employer_signed_at IS NULL
      AND superseded_by IS NULL
    ORDER BY id ASC
  `);
  console.log(`\n[정규직] 대상 ${regList.rowCount}건`);

  // 알바 19건 조회
  const albaList = await pool.query(`
    SELECT id, worker_name, worker_type
    FROM labor_contracts
    WHERE worker_type IN ('alba', 'cafe_alba')
      AND status = 'signed'
      AND signature_data IS NOT NULL AND signature_data != ''
      AND employer_signed_at IS NULL
      AND superseded_by IS NULL
    ORDER BY id ASC
  `);
  console.log(`[알바] 대상 ${albaList.rowCount}건`);

  const total = regList.rowCount + albaList.rowCount;
  console.log(`\n=== 총 ${total}건 사업주 서명 처리 시작 ===\n`);

  const results = { success: [], failed: [] };
  let idx = 0;

  // 정규직 처리
  for (const row of regList.rows) {
    idx++;
    const label = `[${idx}/${total}] regular id=${row.id} ${row.worker_name} (${row.contract_kind})`;
    const res = await signOne(
      `${API}/api/regular/contracts/${row.id}/employer-sign`,
      { signature_data: STAMP_DATA_URL, signer_name: SIGNER_NAME },
      label,
    );
    if (res.ok) {
      results.success.push({ kind: 'regular', id: row.id, name: row.worker_name });
      process.stdout.write(`✅ ${label}\n`);
    } else {
      results.failed.push({ kind: 'regular', id: row.id, name: row.worker_name, error: res.error });
      process.stdout.write(`❌ ${label} — ${res.error}\n`);
    }
    // TSA 서버 부하 완화 — 300ms 간격
    await new Promise((r) => setTimeout(r, 300));
  }

  // 알바 처리
  for (const row of albaList.rows) {
    idx++;
    const kindForApi = row.worker_type === 'cafe_alba' ? 'cafe' : 'alba';
    const label = `[${idx}/${total}] ${row.worker_type} id=${row.id} ${row.worker_name}`;
    const res = await signOne(
      `${API}/api/contracts/${row.id}/employer-sign`,
      { signature_data: STAMP_DATA_URL, signer_name: SIGNER_NAME, kind: kindForApi },
      label,
    );
    if (res.ok) {
      results.success.push({ kind: kindForApi, id: row.id, name: row.worker_name });
      process.stdout.write(`✅ ${label}\n`);
    } else {
      results.failed.push({ kind: kindForApi, id: row.id, name: row.worker_name, error: res.error });
      process.stdout.write(`❌ ${label} — ${res.error}\n`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n\n=== 완료: 성공 ${results.success.length}건 / 실패 ${results.failed.length}건 ===`);
  if (results.failed.length > 0) {
    console.log('\n[실패 리스트]');
    results.failed.forEach((r) => console.log(`  ${r.kind} id=${r.id} ${r.name} — ${r.error}`));
  }

  // 결과를 파일로 저장 (추후 재시도용)
  const outFile = path.join(__dirname, '..', '..', 'scratchpad_batch_sign_result.json');
  try {
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`\n결과 저장: ${outFile}`);
  } catch { /* 실패해도 무시 */ }

  await pool.end();
}

main().catch((e) => {
  console.error('❌ 스크립트 실행 실패:', e);
  process.exit(1);
});
