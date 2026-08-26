/**
 * 근로자 서명 완료 직후 사업주(대표이사) 자동 서명 처리 헬퍼.
 * - 조인앤조인 법인 도장 이미지로 서명 이미지 설정
 * - employer_* 필드 UPDATE + 스냅샷 재생성 + SHA-256 해시 + RFC3161 TSA + audit log
 * - 감사이력에는 actor_email='system@joinandjoin.com' 로 자동 처리임을 명시
 *
 * 근로자 서명 처리 로직 안에서 stampInline() 직후에 호출한다.
 * 실패해도 근로자 서명 자체는 유지되도록 try/catch — 감사만 기록.
 */
import { dbGet, dbRun } from '../db';
import {
  logAudit, sha256, canonicalizeContract, renderSnapshotHtml, contractTable,
  type ContractKind,
} from './contractAudit';
import { stampInline } from './tsa';
import { COMPANY_STAMP_DATA_URL } from '../assets/companyStamp';

const AUTO_SIGNER_NAME = '진해수';
const AUTO_SIGNER_EMAIL = 'system@joinandjoin.com';

export async function autoEmployerSign(
  kind: ContractKind,
  contractId: number,
  workerIp?: string,
  workerUa?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const table = contractTable(kind);

    // 이미 사업주 서명 완료면 스킵 (중복 방지)
    const cur = await dbGet(
      `SELECT id, status, employer_signed_at, document_version FROM ${table} WHERE id = ?`,
      contractId,
    ) as any;
    if (!cur) return { ok: false, error: 'contract_not_found' };
    if (cur.employer_signed_at) return { ok: true }; // 이미 완료

    // 근로자 서명 완료 상태여야만 진행 (안전장치)
    if (cur.status !== 'signed') return { ok: false, error: 'worker_not_signed' };

    // employer 필드 UPDATE — IP/UA 는 근로자 서명 시점의 값을 참고용으로 저장 (자동 처리임 명시)
    await dbRun(
      `UPDATE ${table}
       SET employer_signed_at = NOW(),
           employer_signed_ip = ?,
           employer_signed_ua = ?,
           employer_signed_by_email = ?,
           employer_signed_name = ?,
           employer_signature_data = ?
       WHERE id = ?`,
      workerIp || 'auto:server',
      workerUa || 'auto:sign-on-worker-signed',
      AUTO_SIGNER_EMAIL,
      AUTO_SIGNER_NAME,
      COMPANY_STAMP_DATA_URL,
      contractId,
    );

    // 스냅샷/해시 재생성
    const fresh = await dbGet(`SELECT * FROM ${table} WHERE id = ?`, contractId) as any;
    const contractHash = sha256(canonicalizeContract(fresh));
    const contractSnapshot = renderSnapshotHtml(fresh, kind);
    await dbRun(
      `UPDATE ${table} SET document_hash = ?, document_snapshot_html = ? WHERE id = ?`,
      contractHash, contractSnapshot, contractId,
    );

    // audit log — 자동 서명 표시
    await logAudit({
      kind, contractId, event: 'employer_signed', actorType: 'system',
      actorEmail: AUTO_SIGNER_EMAIL, actorName: AUTO_SIGNER_NAME,
      documentHash: contractHash, documentVersion: fresh.document_version,
      metadata: { auto: true, trigger: 'worker_signed' },
    });

    // TSA (실패는 감사에만 기록, 근로자 서명은 유지)
    await stampInline(kind, contractId, contractHash);

    return { ok: true };
  } catch (e: any) {
    console.error(`[autoEmployerSign] failed kind=${kind} id=${contractId}:`, e?.message || e);
    return { ok: false, error: e?.message || 'unknown' };
  }
}
