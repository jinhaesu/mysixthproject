/**
 * 전자계약 감사증적(audit-trail) 공용 헬퍼.
 * 3개 계약 플로우(정규직 regular_labor_contracts / 알바·카페 labor_contracts) 공통으로 사용.
 *
 * - sha256 / canonicalizeContract  : Feature 2 — 문서 해시
 * - renderSnapshotHtml             : Feature 2 — 서명 시점 스냅샷 HTML
 * - logAudit / clientIp / userAgent: Feature 3 — 감사 로그 기록
 * - contractTable                  : kind → 실제 테이블명 매핑 (Feature 4/5 helper 로도 공유)
 */
import crypto from 'crypto';
import { Request } from 'express';
import { dbRun } from '../db';

export type ContractKind = 'regular' | 'alba' | 'cafe';

/** kind → 실제 DB 테이블명. 'regular' 는 regular_labor_contracts, 'alba'/'cafe' 는 labor_contracts. */
export function contractTable(kind: ContractKind): 'regular_labor_contracts' | 'labor_contracts' {
  return kind === 'regular' ? 'regular_labor_contracts' : 'labor_contracts';
}

// ─────────────────────────────────────────────────────────────────────────
// Feature 2 — 문서 해시
// ─────────────────────────────────────────────────────────────────────────

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

// 정본 직렬화에서 제외할 휘발성/부피 큰 필드. 정렬된 키로 JSON 직렬화 — 결정론적 해시를 위함.
const CANONICALIZE_EXCLUDE = new Set([
  'id', 'created_at', 'updated_at', 'token', 'sms_sent',
  'tsa_token', 'tsa_server', 'tsa_signed_time', 'tsa_status',
  'document_hash', 'document_snapshot_html',
  'employer_signed_ip', 'employer_signed_ua',
  'worker_signed_ip', 'worker_signed_ua',
  'parent_contract_id', 'superseded_by',
  'scanned_file_path', 'bank_slip_path', 'foreign_id_card_path',
]);

export function canonicalizeContract(row: Record<string, any>): string {
  const keys = Object.keys(row).filter((k) => !CANONICALIZE_EXCLUDE.has(k)).sort();
  const obj: Record<string, any> = {};
  for (const k of keys) {
    const v = row[k];
    obj[k] = v instanceof Date ? v.toISOString() : (v ?? '');
  }
  return JSON.stringify(obj);
}

// ─────────────────────────────────────────────────────────────────────────
// Feature 2 — 서명 시점 문서 스냅샷 (self-contained HTML)
// ─────────────────────────────────────────────────────────────────────────

function esc(v: any): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sigImg(dataUrl: any, label: string): string {
  const v = String(dataUrl || '');
  if (!v) return `<p>${esc(label)}: (서명 없음)</p>`;
  const src = v.startsWith('data:') ? v : `data:image/png;base64,${v}`;
  return `<div><p>${esc(label)}</p><img src="${esc(src)}" style="max-width:300px;border:1px solid #ccc;" /></div>`;
}

/**
 * 계약서 row 를 self-contained HTML 스냅샷으로 렌더링.
 * 서명 이미지 포함 — 서명 시점의 "완성본"을 그대로 보존하는 목적 (법적 증빙).
 */
export function renderSnapshotHtml(row: Record<string, any>, kind: ContractKind): string {
  const isRegular = kind === 'regular';
  const title = '근로계약서';
  const workerName = row.worker_name || row.name || '';
  const employerName = '조인앤조인';

  const termsRows: Array<[string, any]> = isRegular
    ? [
        ['계약기간', `${esc(row.contract_start)} ~ ${esc(row.contract_end)}`],
        ['부서', row.department || row.contract_department || ''],
        ['직위', row.position_title || ''],
        ['근무시작일', row.work_start_date || ''],
        ['근무시간', row.work_hours || ''],
        ['근무장소', row.work_place || ''],
        ['담당업무', row.work_duties || ''],
        ['근무일', row.work_days || ''],
        ['휴게시간', row.break_time || ''],
        ['연봉', row.annual_salary || ''],
        ['기본급', row.base_pay || ''],
        ['식대', row.meal_allowance || ''],
        ['기타수당', row.other_allowance || ''],
        ['급여지급일', row.pay_day || ''],
      ]
    : [
        ['계약기간', `${esc(row.contract_start)} ~ ${esc(row.contract_end)}`],
        ['매장', row.store_name || ''],
        ['근무시간', row.work_time_start && row.work_time_end ? `${row.work_time_start}~${row.work_time_end}` : ''],
        ['근무일', row.work_days || ''],
        ['시급', row.hourly_rate ? `${row.hourly_rate}원` : ''],
        ['주소', row.address || ''],
      ];

  const rowsHtml = termsRows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><th style="text-align:left;padding:4px 8px;">${esc(k)}</th><td style="padding:4px 8px;">${esc(v)}</td></tr>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="utf-8" /><title>${esc(title)}</title></head>
<body>
  <h1>${esc(title)}</h1>
  <p>사용자: ${esc(employerName)} / 근로자: ${esc(workerName)}</p>
  <table border="1" cellspacing="0">
    ${rowsHtml}
  </table>
  <h2>서명</h2>
  ${sigImg(row.signature_data, '근로자 서명 (근로계약서)')}
  ${sigImg(row.consent_signature_data, '근로자 서명 (개인정보 동의서)')}
  ${sigImg(row.employer_signature_data, `사용자 서명${row.employer_signed_name ? ` (${esc(row.employer_signed_name)})` : ''}`)}
  <p style="color:#888;font-size:12px;">
    근로자 서명일시: ${esc(row.worker_signed_at || '')} /
    사용자 서명일시: ${esc(row.employer_signed_at || '')} /
    문서버전: v${esc(row.document_version || 1)}
  </p>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Feature 3 — 감사 로그
// ─────────────────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'created' | 'sms_sent' | 'link_opened' | 'worker_signed' | 'employer_signed'
  | 'amended' | 'resent' | 'tsa_stamped' | 'tsa_failed' | 'downloaded' | 'legacy_uploaded';

export type ActorType = 'worker' | 'employer' | 'system';

export interface LogAuditOpts {
  kind: ContractKind;
  contractId: number;
  event: AuditEvent;
  actorType?: ActorType;
  actorId?: number | null;
  actorEmail?: string;
  actorName?: string;
  clientIp?: string;
  userAgent?: string;
  documentHash?: string;
  documentVersion?: number | null;
  metadata?: Record<string, any>;
}

/** policyPublic.ts:153-169 의 검증된 패턴을 그대로 재사용. */
export function clientIp(req: Request): string {
  return String(
    ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() ||
    req.ip || '',
  );
}

export function userAgent(req: Request): string {
  return String(req.headers['user-agent'] || '').slice(0, 500);
}

export async function logAudit(opts: LogAuditOpts): Promise<void> {
  try {
    await dbRun(
      `INSERT INTO contract_audit_logs
        (contract_kind, contract_id, event, actor_type, actor_id, actor_email, actor_name,
         client_ip, user_agent, document_hash, document_version, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      opts.kind,
      opts.contractId,
      opts.event,
      opts.actorType || 'system',
      opts.actorId ?? null,
      opts.actorEmail || '',
      opts.actorName || '',
      opts.clientIp || '',
      opts.userAgent || '',
      opts.documentHash || '',
      opts.documentVersion ?? null,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
    );
  } catch (e: any) {
    // 감사 로그 실패가 본 업무 흐름(서명·발송 등)을 막아서는 안 됨 — 로그만 남기고 무시.
    console.error(`[contractAudit] logAudit failed (kind=${opts.kind} id=${opts.contractId} event=${opts.event}):`, e?.message || e);
  }
}
