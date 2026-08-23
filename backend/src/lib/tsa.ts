/**
 * RFC3161 TSA(Time-Stamp Authority) 클라이언트 — freetsa.org 무료 TSA 사용.
 * 계약서 서명 시점 해시(sha256)를 제3자 타임스탬프로 고정해 사후 위변조 반박력을 높임.
 *
 * ASN.1 DER 인코딩은 외부 라이브러리 없이 수동 buffer 조립 (요청 구조가 고정적이라 충분).
 */
import { dbRun } from '../db';
import { logAudit, contractTable, type ContractKind } from './contractAudit';

const TSA_URL = process.env.TSA_URL || 'https://freetsa.org/tsr';

// ─────────────────────────────────────────────────────────────────────────
// DER encoding helpers
// ─────────────────────────────────────────────────────────────────────────

function derLen(len: number): Buffer {
  if (len <= 127) return Buffer.from([len]);
  if (len <= 255) return Buffer.from([0x81, len]);
  if (len <= 65535) return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
  throw new Error('DER length too long');
}

function derTLV(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}

// SHA-256 OID: 2.16.840.1.101.3.4.2.1
const SHA256_OID = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
const DER_NULL = Buffer.from([0x05, 0x00]);

/**
 * RFC3161 TimeStampReq (DER) 구성:
 *   SEQUENCE {
 *     INTEGER 1,                              -- version
 *     SEQUENCE {                              -- messageImprint
 *       SEQUENCE { OID sha256, NULL },
 *       OCTET STRING <32-byte hash>
 *     },
 *     BOOLEAN TRUE                            -- certReq
 *   }
 */
export function buildTsRequest(hashHex: string): Buffer {
  const hashBuf = Buffer.from(hashHex, 'hex');
  if (hashBuf.length !== 32) {
    throw new Error(`buildTsRequest: hashHex must be 32-byte sha256 hex (got ${hashBuf.length} bytes)`);
  }

  const algId = derTLV(0x30, Buffer.concat([SHA256_OID, DER_NULL]));       // AlgorithmIdentifier SEQUENCE
  const hashOctet = derTLV(0x04, hashBuf);                                  // OCTET STRING
  const messageImprint = derTLV(0x30, Buffer.concat([algId, hashOctet]));   // MessageImprint SEQUENCE
  const version = derTLV(0x02, Buffer.from([0x01]));                        // INTEGER 1
  const certReq = derTLV(0x01, Buffer.from([0xff]));                        // BOOLEAN TRUE

  return derTLV(0x30, Buffer.concat([version, messageImprint, certReq]));   // TimeStampReq SEQUENCE
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP call
// ─────────────────────────────────────────────────────────────────────────

export interface StampResult {
  ok: boolean;
  token?: string;   // base64 of raw TimeStampToken response body
  server: string;
  error?: string;
}

export async function stampHash(hashHex: string, timeoutMs = 3000): Promise<StampResult> {
  const server = TSA_URL;
  try {
    const body = buildTsRequest(hashHex);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/timestamp-query',
          'Accept': 'application/timestamp-reply',
        },
        body,
        signal: controller.signal,
      });
      if (!resp.ok) {
        return { ok: false, server, error: `TSA HTTP ${resp.status}` };
      }
      const arrBuf = await resp.arrayBuffer();
      const token = Buffer.from(arrBuf).toString('base64');
      return { ok: true, token, server };
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    return { ok: false, server, error: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DB-integrated stamping — inline (fast path) + background retry
// ─────────────────────────────────────────────────────────────────────────

async function updateTsaOk(kind: ContractKind, contractId: number, r: StampResult): Promise<void> {
  const table = contractTable(kind);
  await dbRun(
    `UPDATE ${table} SET tsa_token = ?, tsa_server = ?, tsa_signed_time = NOW(), tsa_status = 'ok' WHERE id = ?`,
    r.token || '', r.server, contractId,
  );
}

async function updateTsaStatus(kind: ContractKind, contractId: number, status: 'pending' | 'failed'): Promise<void> {
  const table = contractTable(kind);
  await dbRun(`UPDATE ${table} SET tsa_status = ? WHERE id = ?`, status, contractId);
}

/**
 * 서명 직후 호출 — 3초 내 1회만 시도. 성공하면 즉시 DB 반영 + tsa_stamped 감사로그.
 * 실패하면 tsa_status='pending' 으로 두고 백그라운드 재시도로 넘긴다 (요청 흐름은 절대 막지 않음).
 */
export async function stampInline(kind: ContractKind, contractId: number, hashHex: string): Promise<void> {
  try {
    const r = await stampHash(hashHex, 3000);
    if (r.ok) {
      await updateTsaOk(kind, contractId, r);
      await logAudit({
        kind, contractId, event: 'tsa_stamped', actorType: 'system',
        documentHash: hashHex, metadata: { server: r.server },
      });
      return;
    }
    console.warn(`[tsa] inline stamp failed (kind=${kind} id=${contractId}): ${r.error} — falling back to background retry`);
    await updateTsaStatus(kind, contractId, 'pending');
  } catch (e: any) {
    console.error(`[tsa] stampInline unexpected error (kind=${kind} id=${contractId}):`, e?.message || e);
    try { await updateTsaStatus(kind, contractId, 'pending'); } catch {}
  }
  // fire-and-forget — 호출자를 기다리게 하지 않음
  stampInBackground(kind, contractId, hashHex).catch((e) => {
    console.error(`[tsa] stampInBackground uncaught (kind=${kind} id=${contractId}):`, e?.message || e);
  });
}

const RETRY_DELAYS_MS = [5000, 15000, 60000];

/**
 * 3회 재시도 (5s/15s/60s 대기). 모두 실패하면 tsa_status='failed' + tsa_failed 감사로그.
 * 모든 에러를 내부에서 흡수 — 프로세스를 절대 죽이지 않음.
 */
export async function stampInBackground(kind: ContractKind, contractId: number, hashHex: string): Promise<void> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    try {
      const r = await stampHash(hashHex, 3000);
      if (r.ok) {
        await updateTsaOk(kind, contractId, r);
        await logAudit({
          kind, contractId, event: 'tsa_stamped', actorType: 'system',
          documentHash: hashHex, metadata: { server: r.server, retried: attempt + 1 },
        });
        return;
      }
      console.warn(`[tsa] background retry ${attempt + 1}/${RETRY_DELAYS_MS.length} failed (kind=${kind} id=${contractId}): ${r.error}`);
    } catch (e: any) {
      console.error(`[tsa] background retry ${attempt + 1} threw (kind=${kind} id=${contractId}):`, e?.message || e);
    }
  }
  try {
    await updateTsaStatus(kind, contractId, 'failed');
    await logAudit({ kind, contractId, event: 'tsa_failed', actorType: 'system', documentHash: hashHex });
  } catch (e: any) {
    console.error(`[tsa] final failure bookkeeping error (kind=${kind} id=${contractId}):`, e?.message || e);
  }
}
