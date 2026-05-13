/**
 * 일회성 마이그레이션 — base64 *_data → Supabase Storage *_path.
 *
 * 동작:
 *   1. 대상 테이블의 row 들 중 *_data 가 있고 *_path 가 비어있는 것 선별
 *   2. 각 row 의 base64 디코드 → Storage 업로드 (employees/{id}/bank_slip.jpg 등)
 *   3. *_path = uploaded path 로 UPDATE (*_data 는 그대로 유지 → 다음 단계에서 일괄 검증 후 clear)
 *   4. --verify 옵션: Storage download 후 byte 단위로 base64 와 일치 확인
 *   5. --clear-base64 옵션: 검증 통과한 row 의 *_data = '' 처리 (별도 실행)
 *   6. --vacuum 옵션: VACUUM FULL <table> — 실제 디스크 회수
 *
 * 사용:
 *   node scripts/migrate_blobs_to_storage.cjs --dry-run         # 변경 없이 계획만
 *   node scripts/migrate_blobs_to_storage.cjs                   # upload + path 저장
 *   node scripts/migrate_blobs_to_storage.cjs --verify          # 검증
 *   node scripts/migrate_blobs_to_storage.cjs --clear-base64    # base64 NULL 처리
 *   node scripts/migrate_blobs_to_storage.cjs --vacuum          # 디스크 회수
 *
 * 환경변수 필수:
 *   DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STORAGE_BUCKET
 */

require('dotenv').config();
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const VERIFY      = args.includes('--verify');
const CLEAR_BASE64 = args.includes('--clear-base64');
const VACUUM      = args.includes('--vacuum');
const SCOPE       = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || ''; // optional: --only=employees

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET       = process.env.STORAGE_BUCKET || 'employee-docs';

if (!DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const supa = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { buf: Buffer.from(dataUrl, 'base64'), contentType: 'application/octet-stream' };
  return { buf: Buffer.from(m[2], 'base64'), contentType: m[1] };
}
function inferExtension(ct) {
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('heic')) return 'heic';
  return 'bin';
}

/**
 * 단일 (table, idColumn, blobColumn, pathColumn, scope, fieldName) 마이그레이션.
 */
async function migrateColumn({ table, idCol, dataCol, pathCol, scope, field }) {
  console.log(`\n=== ${table}.${dataCol} → ${scope}/{id}/${field} ===`);

  // 대상 row 선별
  const rows = await pool.query(
    `SELECT ${idCol} AS id, LENGTH(COALESCE(${dataCol}, '')) AS len
       FROM ${table}
      WHERE COALESCE(${dataCol}, '') <> ''
        AND COALESCE(${pathCol}, '') = ''
        AND LENGTH(${dataCol}) >= 1000  -- 너무 작으면 skip (sig 등)
      ORDER BY ${idCol}`
  );
  console.log(`  대상: ${rows.rowCount} rows`);

  let uploaded = 0, failed = 0;
  for (const r of rows.rows) {
    const detail = await pool.query(
      `SELECT ${dataCol} AS data FROM ${table} WHERE ${idCol} = $1`,
      [r.id],
    );
    const base64 = detail.rows[0].data;
    const { buf, contentType } = dataUrlToBuffer(base64);
    const ext = inferExtension(contentType);
    const objectPath = `${scope}/${r.id}/${field}.${ext}`;

    if (DRY_RUN) {
      console.log(`  [dry-run] #${r.id} → ${objectPath} (${(buf.length/1024).toFixed(0)} KB, ${contentType})`);
      continue;
    }

    try {
      const { error } = await supa.storage.from(BUCKET).upload(objectPath, buf, {
        contentType,
        upsert: true,
        cacheControl: '3600',
      });
      if (error) throw new Error(error.message);
      await pool.query(
        `UPDATE ${table} SET ${pathCol} = $1 WHERE ${idCol} = $2`,
        [objectPath, r.id],
      );
      uploaded++;
      if (uploaded % 10 === 0) process.stdout.write(`  ... ${uploaded}/${rows.rowCount}\r`);
    } catch (e) {
      console.error(`  ✗ #${r.id}: ${e.message}`);
      failed++;
    }
  }
  console.log(`  완료: 업로드 ${uploaded}, 실패 ${failed}, dry-run ${DRY_RUN ? rows.rowCount : 0}`);
}

async function verifyColumn({ table, idCol, dataCol, pathCol }) {
  console.log(`\n=== verify ${table}.${dataCol} ↔ ${pathCol} ===`);
  const rows = await pool.query(
    `SELECT ${idCol} AS id, ${pathCol} AS path
       FROM ${table}
      WHERE COALESCE(${pathCol}, '') <> ''
        AND COALESCE(${dataCol}, '') <> ''
      ORDER BY ${idCol}`
  );
  let ok = 0, mismatch = 0, missing = 0;
  for (const r of rows.rows) {
    const detail = await pool.query(`SELECT ${dataCol} AS data FROM ${table} WHERE ${idCol} = $1`, [r.id]);
    const { buf: dbBuf } = dataUrlToBuffer(detail.rows[0].data);
    const { data: blob, error } = await supa.storage.from(BUCKET).download(r.path);
    if (error || !blob) { missing++; console.error(`  ✗ #${r.id}: missing in storage (${r.path})`); continue; }
    const arrayBuf = await blob.arrayBuffer();
    const stBuf = Buffer.from(arrayBuf);
    if (stBuf.length !== dbBuf.length || !stBuf.equals(dbBuf)) {
      mismatch++;
      console.error(`  ✗ #${r.id}: byte mismatch (db=${dbBuf.length}, st=${stBuf.length})`);
    } else {
      ok++;
    }
  }
  console.log(`  검증: ok ${ok}, mismatch ${mismatch}, missing ${missing} (총 ${rows.rowCount})`);
  return { ok, mismatch, missing };
}

async function clearBase64Column({ table, idCol, dataCol, pathCol }) {
  console.log(`\n=== clear ${table}.${dataCol} (path 있는 row 만) ===`);
  const before = await pool.query(`SELECT COUNT(*) AS c, SUM(LENGTH(${dataCol}))/1024/1024 AS mb FROM ${table} WHERE COALESCE(${pathCol}, '') <> '' AND COALESCE(${dataCol}, '') <> ''`);
  console.log(`  대상: ${before.rows[0].c} rows, ${before.rows[0].mb} MB`);
  if (DRY_RUN) return;
  const r = await pool.query(`UPDATE ${table} SET ${dataCol} = '' WHERE COALESCE(${pathCol}, '') <> '' AND COALESCE(${dataCol}, '') <> ''`);
  console.log(`  업데이트: ${r.rowCount} rows`);
}

async function vacuum(table) {
  console.log(`\n=== VACUUM FULL ${table} ===`);
  if (DRY_RUN) return;
  await pool.query(`VACUUM FULL ${table}`);
  console.log(`  done`);
}

const TARGETS = [
  // regular_employees
  { table: 'regular_employees',       idCol: 'id', dataCol: 'bank_slip_data',         pathCol: 'bank_slip_path',         scope: 'employees',   field: 'bank_slip' },
  { table: 'regular_employees',       idCol: 'id', dataCol: 'foreign_id_card_data',   pathCol: 'foreign_id_card_path',   scope: 'employees',   field: 'foreign_id_card' },
  { table: 'regular_employees',       idCol: 'id', dataCol: 'family_register_data',   pathCol: 'family_register_path',   scope: 'employees',   field: 'family_register' },
  { table: 'regular_employees',       idCol: 'id', dataCol: 'resident_register_data', pathCol: 'resident_register_path', scope: 'employees',   field: 'resident_register' },
  // regular_labor_contracts
  { table: 'regular_labor_contracts', idCol: 'id', dataCol: 'bank_slip_data',         pathCol: 'bank_slip_path',         scope: 'contracts',   field: 'bank_slip' },
  { table: 'regular_labor_contracts', idCol: 'id', dataCol: 'foreign_id_card_data',   pathCol: 'foreign_id_card_path',   scope: 'contracts',   field: 'foreign_id_card' },
  { table: 'regular_labor_contracts', idCol: 'id', dataCol: 'scanned_file_data',      pathCol: 'scanned_file_path',      scope: 'contracts',   field: 'scanned_file' },
  // employee_offboardings
  { table: 'employee_offboardings',   idCol: 'id', dataCol: 'resignation_letter_data', pathCol: 'resignation_letter_path', scope: 'offboardings', field: 'resignation_letter' },
];

(async () => {
  try {
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : (VERIFY ? 'VERIFY' : (CLEAR_BASE64 ? 'CLEAR-BASE64' : (VACUUM ? 'VACUUM' : 'UPLOAD')))}`);
    console.log(`Bucket: ${BUCKET}`);

    for (const t of TARGETS) {
      if (SCOPE && t.scope !== SCOPE) continue;
      if (VERIFY) {
        await verifyColumn(t);
      } else if (CLEAR_BASE64) {
        await clearBase64Column(t);
      } else if (VACUUM) {
        // no-op per column
      } else {
        await migrateColumn(t);
      }
    }
    if (VACUUM) {
      const tables = Array.from(new Set(TARGETS.map(t => t.table)));
      for (const tbl of tables) await vacuum(tbl);
    }

    // 최종 DB 크기 출력
    const sz = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS s");
    console.log(`\n현재 DB 크기: ${sz.rows[0].s}`);
  } catch (e) {
    console.error('FATAL:', e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
