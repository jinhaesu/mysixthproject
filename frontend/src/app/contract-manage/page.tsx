"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getContractsLatest,
  getContractsMissing,
  getContractHistory,
  uploadLegacyContract,
} from "@/lib/api";
import SessionPasswordGate from "@/components/SessionPasswordGate";
import { FilePreview } from "@/components/FilePreview";
import {
  PageHeader,
  Stat,
  Tabs,
  Toolbar,
  Segmented,
  Input,
  Field,
  Badge,
  Button,
  Card,
  EmptyState,
  SkeletonTable,
  Modal,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  useToast,
} from "@/components/ui";
import { Search, FileText, History, Paperclip, ShieldCheck, Download } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function authHeader(): Promise<Record<string, string>> {
  try {
    const t = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

async function fetchAudit(kind: 'regular' | 'alba' | 'cafe', id: number) {
  const h = await authHeader();
  const r = await fetch(`${API_URL}/api/contracts/audit/${kind}/${id}`, { headers: h });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b as { contract: Record<string, any>; events: any[] };
}

async function fetchSnapshotHtml(kind: 'regular' | 'alba' | 'cafe', id: number): Promise<string> {
  const h = await authHeader();
  const r = await fetch(`${API_URL}/api/contracts/audit/${kind}/${id}/snapshot.html`, { headers: h });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j.error) msg = j.error; } catch { /* not json */ }
    throw new Error(msg);
  }
  return r.text();
}

function sanitizeFilename(s: string): string {
  return String(s || 'contract').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 숨겨진 iframe 에 완전 문서를 srcdoc 으로 로드한 뒤 iframe.contentWindow.print() 호출.
 * - 팝업 차단 회피 (새 창이 아닌 iframe)
 * - 이미지·폰트 로드 완료 대기 후 인쇄 트리거
 * - 사용자는 인쇄 다이얼로그에서 "PDF로 저장" 선택
 */
async function openPrintableFromHtml(html: string, title: string): Promise<void> {
  const printStyle = `<style>
    @media print {
      @page { size: A4; margin: 12mm; }
      body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    html, body { background: #ffffff; color: #000000; }
    body { font-family: "Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif; }
    table { page-break-inside: auto; }
    tr, .page-break-avoid { page-break-inside: avoid; page-break-after: auto; }
    img { max-width: 100%; }
  </style>`;

  let finalHtml: string;
  if (/<html[\s>]/i.test(html)) {
    finalHtml = html;
    if (/<title>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
    } else if (/<head[^>]*>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<head[^>]*>/i, (m) => `${m}<title>${escapeHtml(title)}</title>`);
    }
    if (/<\/head>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<\/head>/i, `${printStyle}</head>`);
    } else {
      finalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${printStyle}</head><body>${html}</body></html>`;
    }
  } else {
    finalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${printStyle}</head><body>${html}</body></html>`;
  }

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    let fired = false;
    const trigger = async () => {
      if (fired) return;
      fired = true;
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          const imgs = Array.from(doc.images);
          await Promise.all(imgs.map((img) => img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); }),
          ));
        }
        // 페인트 여유
        await new Promise((r) => setTimeout(r, 200));
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('[print] trigger failed', e);
      } finally {
        // 인쇄 다이얼로그가 닫힐 시간을 주고 iframe 제거 (60초 후)
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch { /* 이미 제거됨 */ }
        }, 60000);
        resolve();
      }
    };
    iframe.addEventListener('load', trigger);
    // srcdoc 을 나중에 설정 → load 이벤트 확실히 발생
    iframe.srcdoc = finalHtml;
    // 안전장치
    setTimeout(trigger, 5000);
  });
}

function buildAuditPdfHtml(opts: {
  employeeName: string;
  contractId: number | string;
  kind: string;
  contract: Record<string, any>;
  events: any[];
}): string {
  const { employeeName, contractId, kind, contract, events } = opts;
  const now = new Date().toLocaleString('ko-KR');
  const kindLabel: Record<string, string> = { regular: '정규직', alba: '알바', cafe: '카페' };
  const eventLabel: Record<string, string> = {
    created: '생성', sms_sent: 'SMS 발송', link_opened: '링크 열람',
    worker_signed: '근로자 서명', employer_signed: '사업주 서명',
    amended: '정보 수정', resent: '재발송(supersede)',
    tsa_stamped: 'TSA 인증', tsa_failed: 'TSA 실패',
    downloaded: '다운로드', legacy_uploaded: '스캔 업로드',
  };
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rows = (events || []).map((e: any, idx: number) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;">${idx + 1}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;white-space:nowrap;">${esc(new Date(e.created_at).toLocaleString('ko-KR'))}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;"><b>${esc(eventLabel[e.event] || e.event)}</b></td>
      <td style="padding:6px 8px;border:1px solid #ccc;">${esc(e.actor_name || e.actor_type || '-')}${e.actor_email ? `<div style="font-size:10px;color:#666;">${esc(e.actor_email)}</div>` : ''}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-family:monospace;font-size:11px;">${esc(e.client_ip || '-')}</td>
      <td style="padding:6px 8px;border:1px solid #ccc;font-size:10px;color:#555;word-break:break-all;">${esc((e.user_agent || '').slice(0, 80))}</td>
    </tr>`).join('');

  return `
  <div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#000;padding:20px;">
    <h1 style="font-size:20px;border-bottom:2px solid #000;padding-bottom:8px;margin:0 0 12px 0;">전자근로계약 감사증적(Audit Trail)</h1>
    <div style="display:table;width:100%;margin-bottom:16px;font-size:12px;">
      <div style="display:table-row;">
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;width:20%;font-weight:bold;">근로자</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;width:30%;">${esc(employeeName)}</div>
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;width:20%;font-weight:bold;">계약 ID</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;width:30%;">#${esc(contractId)} (${esc(kindLabel[kind] || kind)})</div>
      </div>
      <div style="display:table-row;">
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">문서 버전</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;">v${esc(contract.document_version || 1)}${contract.parent_contract_id ? ` (parent #${esc(contract.parent_contract_id)})` : ''}</div>
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">supersede</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;">${contract.superseded_by ? `→ #${esc(contract.superseded_by)}` : '현재 유효'}</div>
      </div>
      <div style="display:table-row;">
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">TSA 상태</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;">${esc(contract.tsa_status || '-')} ${contract.tsa_server ? `<span style="font-size:10px;color:#666;">${esc(contract.tsa_server)}</span>` : ''}</div>
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">스냅샷 보존</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;">${contract.has_document_snapshot ? '✓ 보존됨' : '없음'}</div>
      </div>
      <div style="display:table-row;">
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">근로자 서명</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;">${contract.worker_signed_at ? esc(new Date(contract.worker_signed_at).toLocaleString('ko-KR')) : '미서명'}${contract.worker_signed_ip ? ` <span style="font-size:10px;color:#666;">IP ${esc(contract.worker_signed_ip)}</span>` : ''}</div>
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">사업주 서명</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;">${contract.employer_signed_at ? esc(new Date(contract.employer_signed_at).toLocaleString('ko-KR')) : '미서명'}${contract.employer_signed_by_email ? `<div style="font-size:10px;color:#666;">by ${esc(contract.employer_signed_by_email)}</div>` : ''}</div>
      </div>
      <div style="display:table-row;">
        <div style="display:table-cell;padding:4px 8px;background:#f5f5f5;border:1px solid #ccc;font-weight:bold;">문서 해시</div>
        <div style="display:table-cell;padding:4px 8px;border:1px solid #ccc;font-family:monospace;font-size:10px;word-break:break-all;" colspan="3">${esc(contract.document_hash || '(미생성)')}</div>
      </div>
    </div>

    <h2 style="font-size:15px;margin:16px 0 8px 0;border-bottom:1px solid #666;padding-bottom:4px;">이벤트 로그 (총 ${events.length}건)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#e8e8e8;">
          <th style="padding:6px 8px;border:1px solid #ccc;width:5%;">#</th>
          <th style="padding:6px 8px;border:1px solid #ccc;width:18%;text-align:left;">시각</th>
          <th style="padding:6px 8px;border:1px solid #ccc;width:15%;text-align:left;">이벤트</th>
          <th style="padding:6px 8px;border:1px solid #ccc;width:20%;text-align:left;">Actor</th>
          <th style="padding:6px 8px;border:1px solid #ccc;width:12%;text-align:left;">IP</th>
          <th style="padding:6px 8px;border:1px solid #ccc;width:30%;text-align:left;">User-Agent</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" style="padding:12px;text-align:center;color:#888;border:1px solid #ccc;">이벤트 없음</td></tr>'}
      </tbody>
    </table>

    <div style="margin-top:20px;padding:10px;background:#f9f9f9;border:1px solid #ccc;font-size:10.5px;color:#333;">
      ※ 본 감사증적은 근로기준법 및 전자문서법에 따른 전자근로계약의 신빙성을 입증하는 자료입니다.<br>
      ※ 서명 시각·IP·User-Agent·문서 해시(SHA-256)·RFC3161 타임스탬프가 자동 기록됩니다.<br>
      ※ 발행일시: ${esc(now)} · 조인앤조인 HR 시스템
    </div>
  </div>`;
}

function resolveKind(item: { employee_type: string; contract?: any }): 'regular' | 'alba' | 'cafe' {
  if (item.employee_type === 'regular') return 'regular';
  if (item.contract?.worker_type === 'cafe_alba' || item.contract?.store_name) return 'cafe';
  return 'alba';
}

const EVENT_LABEL: Record<string, string> = {
  created: '생성', sms_sent: 'SMS 발송', link_opened: '링크 열람',
  worker_signed: '근로자 서명', employer_signed: '사업주 서명',
  amended: '정보 수정', resent: '재발송(supersede)',
  tsa_stamped: 'TSA 인증', tsa_failed: 'TSA 실패',
  downloaded: '다운로드', legacy_uploaded: '스캔 업로드',
};
const EVENT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'> = {
  created: 'info', sms_sent: 'brand', link_opened: 'neutral',
  worker_signed: 'success', employer_signed: 'success',
  amended: 'warning', resent: 'warning',
  tsa_stamped: 'success', tsa_failed: 'danger',
  downloaded: 'neutral', legacy_uploaded: 'info',
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const TYPE_OPTIONS: { id: "all" | "regular" | "alba" | "dispatch"; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "regular", label: "정규직" },
  { id: "alba", label: "알바" },
  { id: "dispatch", label: "파견" },
];

type TabId = "latest" | "missing" | "history";

interface ContractItem {
  employee_type: "regular" | "alba" | "dispatch";
  employee_id: number;
  employee_name: string;
  employee_phone: string;
  department?: string;
  team?: string;
  hire_date?: string;
  resigned_at?: string;
  is_active?: number;
  contract: {
    id: number;
    contract_start?: string;
    contract_end?: string;
    status?: string;
    signature_data?: string;
    created_at?: string;
    position_title?: string;
    annual_salary?: string;
    base_pay?: string;
    meal_allowance?: string;
    other_allowance?: string;
    work_hours?: string;
    department?: string;
    token?: string;
    is_legacy_scan?: number;
    legacy_filename?: string;
    scanned_file_data?: string;
  } | null;
  contract_count?: number;
  [key: string]: any;
}

/** Shape used for the view modal — always flat after spreading */
interface ViewModalItem {
  employee_name?: string;
  employee_phone?: string;
  department?: string;
  id?: number;
  contract_start?: string;
  contract_end?: string;
  status?: string;
  signature_data?: string;
  created_at?: string;
  position_title?: string;
  annual_salary?: string;
  base_pay?: string;
  meal_allowance?: string;
  other_allowance?: string;
  work_hours?: string;
  work_start_date?: string;
  work_place?: string;
  token?: string;
  is_legacy_scan?: number;
  legacy_filename?: string;
  scanned_file_data?: string;
  [key: string]: any;
}

export default function ContractManagePage() {
  return (
    <Suspense fallback={<div className="py-12 flex items-center justify-center text-[var(--text-3)] text-[12.5px]">불러오는 중…</div>}>
      <ContractManageInner />
    </Suspense>
  );
}

function ContractManageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);

  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get("tab");
    if (t === "missing" || t === "history") return t;
    return "latest";
  });
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "alba" | "dispatch">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [latestItems, setLatestItems] = useState<ContractItem[]>([]);
  const [latestTotal, setLatestTotal] = useState(0);
  const [latestMissing, setLatestMissing] = useState(0);

  const [missingItems, setMissingItems] = useState<ContractItem[]>([]);
  const [missingTotal, setMissingTotal] = useState(0);

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyEmployee, setHistoryEmployee] = useState<{ type: string; id?: string; phone?: string; name?: string } | null>(() => {
    const et = searchParams.get("employee_type");
    const eid = searchParams.get("employee_id");
    const ph = searchParams.get("phone");
    if (et && (eid || ph)) return { type: et, id: eid || undefined, phone: ph || undefined };
    return null;
  });

  const [viewModal, setViewModal] = useState<ViewModalItem | null>(null);
  const [auditModal, setAuditModal] = useState<{
    open: boolean;
    loading: boolean;
    error?: string;
    label: string;
    kind?: 'regular' | 'alba' | 'cafe';
    contractId?: number;
    employeeName?: string;
    contract?: Record<string, any>;
    events?: any[];
  }>({ open: false, loading: false, label: '' });
  const [downloading, setDownloading] = useState<'snapshot' | 'audit' | null>(null);

  const openAudit = async (item: ContractItem) => {
    const c = item.contract;
    if (!c?.id) { toast.info('감사이력 조회 대상이 없습니다 (계약 id 없음).'); return; }
    const kind = resolveKind(item);
    setAuditModal({ open: true, loading: true, label: `${item.employee_name} · #${c.id}`, kind, contractId: c.id, employeeName: item.employee_name });
    try {
      const data = await fetchAudit(kind, c.id);
      setAuditModal({
        open: true, loading: false,
        label: `${item.employee_name} · #${c.id} (${kind})`,
        kind, contractId: c.id, employeeName: item.employee_name,
        contract: data.contract, events: data.events,
      });
    } catch (e: any) {
      setAuditModal({
        open: true, loading: false, error: e.message || '조회 실패',
        label: `${item.employee_name} · #${c.id}`,
        kind, contractId: c.id, employeeName: item.employee_name,
      });
    }
  };

  const downloadSnapshotPdf = async () => {
    if (!auditModal.kind || !auditModal.contractId || !auditModal.employeeName) return;
    setDownloading('snapshot');
    try {
      const html = await fetchSnapshotHtml(auditModal.kind, auditModal.contractId);
      const title = `근로계약서_${sanitizeFilename(auditModal.employeeName)}_#${auditModal.contractId}`;
      await openPrintableFromHtml(html, title);
      toast.success('인쇄 창에서 "PDF로 저장"을 선택해주세요.');
      // downloaded 이벤트가 서버에 기록되었으므로 감사 데이터 새로고침
      try {
        const data = await fetchAudit(auditModal.kind, auditModal.contractId);
        setAuditModal((prev) => ({ ...prev, contract: data.contract, events: data.events }));
      } catch { /* 새로고침 실패는 무시 */ }
    } catch (e: any) {
      toast.error(e.message || '계약서 다운로드 실패');
    } finally {
      setDownloading(null);
    }
  };

  const downloadAuditPdf = async () => {
    if (!auditModal.kind || !auditModal.contractId || !auditModal.employeeName || !auditModal.contract) return;
    setDownloading('audit');
    try {
      const html = buildAuditPdfHtml({
        employeeName: auditModal.employeeName,
        contractId: auditModal.contractId,
        kind: auditModal.kind,
        contract: auditModal.contract,
        events: auditModal.events || [],
      });
      const title = `감사이력_${sanitizeFilename(auditModal.employeeName)}_#${auditModal.contractId}`;
      await openPrintableFromHtml(html, title);
      toast.success('인쇄 창에서 "PDF로 저장"을 선택해주세요.');
    } catch (e: any) {
      toast.error(e.message || '감사이력 다운로드 실패');
    } finally {
      setDownloading(null);
    }
  };

  // Legacy contract attach state
  const [attachTarget, setAttachTarget] = useState<ContractItem | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachContractStart, setAttachContractStart] = useState("");
  const [attachContractEnd, setAttachContractEnd] = useState("");
  const [attaching, setAttaching] = useState(false);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== "all") params.type = typeFilter;
      if (search) params.search = search;
      const data = await getContractsLatest(params);
      setLatestItems(data.items || []);
      setLatestTotal(data.total || 0);
      setLatestMissing(data.missing_count || 0);
    } catch (e: any) {
      toast.error(e.message || "계약서 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, toast]);

  const loadMissing = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== "all") params.type = typeFilter;
      if (search) params.search = search;
      const data = await getContractsMissing(params);
      setMissingItems(data.items || []);
      setMissingTotal(data.total || 0);
    } catch (e: any) {
      toast.error(e.message || "미작성 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search, toast]);

  const loadHistory = useCallback(async () => {
    if (!historyEmployee) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { employee_type: historyEmployee.type };
      if (historyEmployee.id) params.employee_id = historyEmployee.id;
      if (historyEmployee.phone) params.phone = historyEmployee.phone;
      const data = await getContractHistory(params);
      // Backend returns { employee: {...}, contracts: [...] }
      setHistoryItems(Array.isArray(data) ? data : data.contracts || []);
      if (!Array.isArray(data) && data.employee?.name) {
        // name 이 이미 같으면 setState 를 아예 호출하지 않아 참조 유지 → useCallback 재생성 방지
        // (이전 버그: 매번 새 객체를 만들어 historyEmployee dependency 변경 → 무한 loop → 화면 깜빡)
        setHistoryEmployee((prev) => {
          if (!prev) return prev;
          if (prev.name === data.employee.name) return prev;
          return { ...prev, name: data.employee.name };
        });
      }
    } catch (e: any) {
      toast.error(e.message || "이력을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [historyEmployee, toast]);

  const handleAttach = async () => {
    if (!attachTarget || !attachFile) return;
    setAttaching(true);
    try {
      const file_data = await fileToBase64(attachFile);
      const body: Parameters<typeof uploadLegacyContract>[0] = {
        employee_type: attachTarget.employee_type,
        filename: attachFile.name,
        file_data,
        contract_start: attachContractStart || undefined,
        contract_end: attachContractEnd || undefined,
      };
      if (attachTarget.employee_type === "regular") body.employee_id = attachTarget.employee_id;
      else body.phone = attachTarget.employee_phone;

      await uploadLegacyContract(body);
      toast.success(`${attachTarget.employee_name} 님 계약서 파일 첨부 완료`);
      setAttachTarget(null);
      setAttachFile(null);
      setAttachContractStart("");
      setAttachContractEnd("");
      if (tab === "latest") loadLatest();
      else if (tab === "missing") loadMissing();
    } catch (e: any) {
      toast.error(e.message || "첨부 실패");
    } finally {
      setAttaching(false);
    }
  };

  useEffect(() => {
    if (!authorized) return;
    if (tab === "latest") loadLatest();
    else if (tab === "missing") loadMissing();
    else if (tab === "history") loadHistory();
  }, [authorized, tab, loadLatest, loadMissing, loadHistory]);

  function handleHistoryFromRow(item: ContractItem) {
    setHistoryEmployee({
      type: item.employee_type,
      id: item.employee_type === "regular" ? String(item.employee_id) : undefined,
      phone: item.employee_type !== "regular" ? item.employee_phone : undefined,
      name: item.employee_name,
    });
    setTab("history");
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "latest", label: "계약서 작성됨" },
    { id: "missing", label: "계약서 미작성" },
    { id: "history", label: "이력 조회" },
  ];

  // KPI: latestTotal already includes all employees (with + without contract)
  // KPI는 정규직 + 알바 대상 (파견만 제외 — 파견은 인력 회사가 따로 계약)
  const kpiItems = latestItems.filter((i) => i.employee_type !== "dispatch");
  const kpiTotal = kpiItems.length;
  const kpiContracted = kpiItems.filter((i) => i.contract != null).length;
  const kpiMissing = kpiTotal - kpiContracted;
  const missingRatio = kpiTotal > 0 ? Math.round((kpiMissing / kpiTotal) * 100) : 0;

  // Latest tab shows only rows WITH a contract
  const latestWithContract = latestItems.filter((i) => i.contract != null);

  if (!authorized) {
    return (
      <SessionPasswordGate
        title="근로계약서 관리 접근"
        onVerified={() => setAuthorized(true)}
      />
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="관리"
        title="근로계약서 관리"
        description="직원별 최신 계약서 / 미작성 직원 / 과거 이력 조회"
      />

      <div className="mb-3 text-[12.5px] text-[var(--text-3)]">
        계약서 체결 직원과 미작성 직원을 분리해서 확인할 수 있습니다.
        계약서 작성은 <b className="text-[var(--text-1)]">근무자 DB → 계약서</b> 버튼으로 진행합니다. 시스템 도입 전 종이 계약서는 <b className="text-[var(--text-1)]">미작성 탭의 파일 첨부</b> 버튼으로 등록할 수 있습니다.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="전체 인원" value={String(kpiTotal)} unit="명" tone="neutral" hint="파견 제외 (정규직 + 알바)" />
        <Stat label="작성됨" value={String(kpiContracted)} unit="명" tone="success" />
        <Stat label="미작성" value={String(kpiMissing)} unit="명" tone="warning" />
        <Stat label="미작성 비율" value={String(missingRatio)} unit="%" tone={kpiMissing > 0 ? "danger" : "success"} />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} variant="underline" />
      </div>

      <Toolbar className="mb-4">
        <Segmented
          options={TYPE_OPTIONS}
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); }}
        />
        <div className="flex-1 max-w-xs">
          <Input
            placeholder="이름·연락처 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { if (tab === "latest") loadLatest(); else if (tab === "missing") loadMissing(); } }}
            iconLeft={<Search size={14} />}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => { if (tab === "latest") loadLatest(); else if (tab === "missing") loadMissing(); }}>
          검색
        </Button>
      </Toolbar>

      {tab === "latest" && (
        loading ? (
          <SkeletonTable />
        ) : latestWithContract.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="계약서가 없습니다" description="직원 계약서를 등록해주세요." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH align="right">No.</TH>
                <TH>구분</TH>
                <TH>이름</TH>
                <TH>연락처</TH>
                <TH>부서/팀</TH>
                <TH>입사일</TH>
                <TH>계약 기간</TH>
                <TH>횟수</TH>
                <TH>상태</TH>
                <TH align="right">액션</TH>
              </TR>
            </THead>
            <TBody>
              {latestWithContract.map((item, idx) => {
                const c = item.contract;
                const status = c?.status ?? "";
                return (
                  <TR key={`${item.employee_type}-${item.employee_id}`}>
                    <TD align="right" muted className="tabular">{idx + 1}</TD>
                    <TD>
                      <Badge tone={item.employee_type === "regular" ? "brand" : item.employee_type === "alba" ? "info" : "violet"} size="xs">
                        {item.employee_type === "regular" ? "정규" : item.employee_type === "alba" ? "알바" : "파견"}
                      </Badge>
                    </TD>
                    <TD emphasis>{item.employee_name}</TD>
                    <TD muted>{item.employee_phone}</TD>
                    <TD muted>{item.department || "-"}</TD>
                    <TD muted>{item.hire_date || "-"}</TD>
                    <TD muted>
                      {c?.contract_start && c?.contract_end
                        ? `${c.contract_start} ~ ${c.contract_end}`
                        : c?.contract_start || "—"}
                    </TD>
                    <TD>
                      {item.contract_count != null ? (
                        <Badge tone="neutral" size="xs">{item.contract_count}회</Badge>
                      ) : "-"}
                    </TD>
                    <TD>
                      <Badge
                        tone={status === "signed" ? "success" : status === "pending" ? "warning" : "neutral"}
                        size="xs"
                        dot
                      >
                        {status === "signed" ? "체결" : status === "pending" ? "발송됨" : "미체결"}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('보기 click', item);
                            const c = item.contract;
                            if (!c) {
                              toast.info("계약서가 없습니다.");
                              return;
                            }
                            // Legacy scan → open Base64 in new tab
                            if (c.is_legacy_scan === 1 && c.scanned_file_data) {
                              const win = window.open();
                              if (!win) { toast.error("팝업이 차단되었습니다."); return; }
                              if (c.scanned_file_data.startsWith('data:image')) {
                                win.document.write(`<title>${item.employee_name} 계약서</title><img src="${c.scanned_file_data}" style="max-width:100%;height:auto">`);
                              } else if (c.scanned_file_data.startsWith('data:application/pdf')) {
                                win.location.href = c.scanned_file_data;
                              } else {
                                win.location.href = c.scanned_file_data;
                              }
                              return;
                            }
                            // Regular contract with token → open contract page in new tab
                            if (item.employee_type === 'regular' && c.token) {
                              window.open(`/regular-contract?token=${c.token}`, '_blank');
                              return;
                            }
                            // Fallback: open in-page modal
                            setViewModal({
                              employee_name: item.employee_name,
                              employee_phone: item.employee_phone,
                              department: item.department,
                              ...c,
                            });
                          }}
                        >
                          보기
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => handleHistoryFromRow(item)}>이력</Button>
                        <Button
                          variant="ghost" size="xs"
                          onClick={(e) => { e.stopPropagation(); openAudit(item); }}
                          title="감사이력 (서명·발송·해시·TSA 등)"
                        >
                          <ShieldCheck size={12} className="inline mr-0.5" />감사
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )
      )}

      {tab === "missing" && (
        loading ? (
          <SkeletonTable />
        ) : missingItems.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="미작성 직원이 없습니다" description="모든 직원이 계약서를 보유하고 있습니다." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH align="right">No.</TH>
                <TH>구분</TH>
                <TH>이름</TH>
                <TH>연락처</TH>
                <TH>부서</TH>
                <TH>입사일</TH>
                <TH align="right">액션</TH>
              </TR>
            </THead>
            <TBody>
              {missingItems.map((item, idx) => (
                <TR key={`${item.employee_type}-${item.employee_id}`}>
                  <TD align="right" muted className="tabular">{idx + 1}</TD>
                  <TD>
                    <Badge tone={item.employee_type === "regular" ? "brand" : item.employee_type === "alba" ? "info" : "violet"} size="xs">
                      {item.employee_type === "regular" ? "정규" : item.employee_type === "alba" ? "알바" : "파견"}
                    </Badge>
                  </TD>
                  <TD emphasis>{item.employee_name}</TD>
                  <TD muted>{item.employee_phone}</TD>
                  <TD muted>{item.department || "-"}</TD>
                  <TD muted>{item.hire_date || "-"}</TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          if (item.employee_type === "regular") {
                            router.push(`/regular-workers`);
                          }
                        }}
                      >
                        계약서 작성
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        leadingIcon={<Paperclip size={12} />}
                        onClick={() => setAttachTarget(item)}
                      >
                        파일 첨부
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      )}

      {tab === "history" && (
        <div>
          {!historyEmployee ? (
            <EmptyState
              icon={<History size={32} />}
              title="직원을 선택하세요"
              description="최근 계약서 탭에서 '이력' 버튼을 클릭하거나, URL에 employee_type과 employee_id를 지정해주세요."
            />
          ) : loading ? (
            <SkeletonTable />
          ) : historyItems.length === 0 ? (
            <EmptyState icon={<History size={32} />} title="이력이 없습니다" description={`${historyEmployee.name || ''} 직원의 계약 이력이 없습니다.`} />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-[var(--text-3)]">
                  {historyEmployee.name ? `${historyEmployee.name} 님` : ""} 계약 이력 — {historyItems.length}건
                </span>
                <Button variant="ghost" size="xs" onClick={() => { setHistoryEmployee(null); setHistoryItems([]); }}>초기화</Button>
              </div>
              {historyItems.map((item: any, idx: number) => (
                <Card key={item.id || idx} padding="md">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={item.status === "signed" ? "success" : item.status === "pending" ? "warning" : "neutral"} size="xs">
                          {item.status === "signed" ? "체결" : item.status === "pending" ? "발송됨" : "미체결"}
                        </Badge>
                        <span className="text-sm font-medium text-[var(--text-1)]">
                          {item.contract_start && item.contract_end
                            ? `${item.contract_start} ~ ${item.contract_end}`
                            : item.contract_start || "-"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-3)]">
                        부서: {item.department || "-"} / 계약 #
                        {historyItems.length - idx}
                      </p>
                    </div>
                    {item.status === "signed" && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setViewModal({
                          employee_name: historyEmployee?.name,
                          employee_phone: historyEmployee?.phone,
                          ...item,
                        })}
                      >
                        보기
                      </Button>
                    )}
                  </div>
                  {item.signature_data && (
                    <div className="mt-3 border border-[var(--border-1)] rounded-[var(--r-md)] overflow-hidden bg-white" style={{ maxHeight: 120 }}>
                      <img src={item.signature_data} alt="서명" className="w-full object-contain" style={{ maxHeight: 120 }} />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!viewModal}
        onClose={() => setViewModal(null)}
        title="계약서 상세"
        size="lg"
      >
        {viewModal && (
          <div className="space-y-4">
            {viewModal.is_legacy_scan === 1 && (
              <div className="flex items-center gap-2">
                <Badge tone="violet" size="xs">스캔 첨부본</Badge>
                {viewModal.legacy_filename && (
                  <span className="text-[11.5px] text-[var(--text-3)]">{viewModal.legacy_filename}</span>
                )}
              </div>
            )}

            {viewModal.is_legacy_scan === 1 && viewModal.scanned_file_data && (
              <FilePreview
                label="계약서 스캔본"
                data={viewModal.scanned_file_data}
                filenamePrefix={`계약서_${viewModal.employee_name || ''}`}
                maxHeight={480}
              />
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[var(--text-3)] text-xs mb-0.5">이름</p>
                <p className="text-[var(--text-1)] font-medium">{viewModal.employee_name}</p>
              </div>
              <div>
                <p className="text-[var(--text-3)] text-xs mb-0.5">연락처</p>
                <p className="text-[var(--text-2)]">{viewModal.employee_phone}</p>
              </div>
              <div>
                <p className="text-[var(--text-3)] text-xs mb-0.5">부서</p>
                <p className="text-[var(--text-2)]">{viewModal.department || "-"}</p>
              </div>
              <div>
                <p className="text-[var(--text-3)] text-xs mb-0.5">계약 기간</p>
                <p className="text-[var(--text-2)]">
                  {viewModal.contract_start && viewModal.contract_end
                    ? `${viewModal.contract_start} ~ ${viewModal.contract_end}`
                    : viewModal.contract_start || "-"}
                </p>
              </div>
            </div>

            {viewModal.signature_data && (
              <FilePreview
                label="서명"
                data={viewModal.signature_data}
                filenamePrefix={`서명_${viewModal.employee_name || ''}`}
                maxHeight={192}
              />
            )}

            <div className="border border-[var(--border-1)] rounded-[var(--r-md)] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[var(--bg-1)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">항목</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">내용</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-1)]">
                  {[
                    ["상태", viewModal.status === "signed" ? "체결" : viewModal.status === "pending" ? "발송됨" : "미체결"],
                    ["근로 시작", viewModal.work_start_date || viewModal.contract_start || "-"],
                    ["기본급", viewModal.base_pay ? `${Number(viewModal.base_pay).toLocaleString()}원` : "-"],
                    ["식대", viewModal.meal_allowance ? `${Number(viewModal.meal_allowance).toLocaleString()}원` : "-"],
                    ["연봉 총액", viewModal.annual_salary ? `${Number(viewModal.annual_salary).toLocaleString()}원` : "-"],
                    ["근무시간", viewModal.work_hours || "-"],
                    ["직책", viewModal.position_title || "-"],
                    ["근무장소", viewModal.work_place || "-"],
                  ].map(([k, v]) => (
                    <tr key={k} className="hover:bg-[var(--bg-2)]">
                      <td className="px-3 py-2 text-[var(--text-3)]">{k}</td>
                      <td className="px-3 py-2 text-[var(--text-1)]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {viewModal.status === "signed" && viewModal.token && viewModal.is_legacy_scan !== 1 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(`/regular-contract?token=${viewModal.token}`, "_blank")}
              >
                원본 계약서 열람
              </Button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!attachTarget}
        onClose={() => setAttachTarget(null)}
        title="기존 계약서 파일 첨부"
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAttachTarget(null)}>취소</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAttach}
              loading={attaching}
              disabled={!attachFile}
            >
              업로드
            </Button>
          </>
        }
      >
        {attachTarget && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[var(--text-3)]">
              {attachTarget.employee_name} ({attachTarget.employee_phone})
            </p>
            <Field label="계약서 스캔 파일" required>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
                className="w-full text-[13px] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[var(--brand-500)] file:text-white file:cursor-pointer"
              />
              {attachFile && (
                <p className="text-[11.5px] text-[var(--text-3)] mt-1.5">
                  {attachFile.name} ({(attachFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="계약 시작일">
                <Input
                  type="date"
                  inputSize="sm"
                  value={attachContractStart}
                  onChange={(e) => setAttachContractStart(e.target.value)}
                />
              </Field>
              <Field label="계약 종료일">
                <Input
                  type="date"
                  inputSize="sm"
                  value={attachContractEnd}
                  onChange={(e) => setAttachContractEnd(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-[11.5px] text-[var(--text-3)] bg-[var(--info-bg)] border border-[var(--info-border)] rounded-md p-2">
              시스템 도입 전 종이 또는 외부 양식으로 작성된 계약서를 첨부하면 시스템에 보관됩니다.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={auditModal.open}
        onClose={() => setAuditModal({ open: false, loading: false, label: '' })}
        title={`감사이력 · ${auditModal.label}`}
        size="lg"
      >
        {auditModal.loading ? (
          <div className="p-6 text-center text-[var(--text-3)]">불러오는 중...</div>
        ) : auditModal.error ? (
          <div className="p-4 text-[var(--danger-fg)]">{auditModal.error}</div>
        ) : auditModal.contract ? (
          <div className="space-y-4">
            <div className="pb-3 border-b border-[var(--border-2)]">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={downloadSnapshotPdf}
                  disabled={!auditModal.contract.has_document_snapshot || downloading !== null}
                  title={auditModal.contract.has_document_snapshot ? '서명 시점 스냅샷을 인쇄 창으로 열어 PDF로 저장' : '스냅샷 없음 — 서명 완료 후 생성됩니다'}
                >
                  <Download size={14} className="inline mr-1" />
                  {downloading === 'snapshot' ? '여는 중...' : '계약서 PDF'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={downloadAuditPdf}
                  disabled={downloading !== null}
                >
                  <Download size={14} className="inline mr-1" />
                  {downloading === 'audit' ? '여는 중...' : '감사이력 PDF'}
                </Button>
                {!auditModal.contract.has_document_snapshot && (
                  <span className="text-[10.5px] text-[var(--text-4)] ml-1">
                    ※ 서명 완료 전에는 계약서 스냅샷이 아직 없습니다
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-[var(--text-4)] mt-1.5">
                버튼을 누르면 인쇄 창이 열립니다. <b>대상 → "PDF로 저장"</b>을 선택하면 다운로드됩니다.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div><span className="text-[var(--text-4)]">문서 버전 </span><b>v{auditModal.contract.document_version || 1}</b>{auditModal.contract.parent_contract_id && <span className="text-[var(--text-4)]"> (parent #{auditModal.contract.parent_contract_id})</span>}</div>
              <div><span className="text-[var(--text-4)]">supersede </span>{auditModal.contract.superseded_by ? <Badge tone="warning" size="xs">→ #{auditModal.contract.superseded_by}</Badge> : <span className="text-[var(--text-4)]">현재 유효</span>}</div>
              <div><span className="text-[var(--text-4)]">문서 해시 </span><code className="text-[10px] break-all">{auditModal.contract.document_hash || '(미생성)'}</code></div>
              <div><span className="text-[var(--text-4)]">스냅샷 </span>{auditModal.contract.has_document_snapshot ? <Badge tone="success" size="xs">보존됨</Badge> : <span className="text-[var(--text-4)]">없음</span>}</div>
              <div><span className="text-[var(--text-4)]">TSA 상태 </span>{auditModal.contract.tsa_status === 'ok' ? <Badge tone="success" size="xs">✓ RFC3161 인증</Badge> : auditModal.contract.tsa_status === 'failed' ? <Badge tone="danger" size="xs">실패</Badge> : auditModal.contract.tsa_status === 'pending' ? <Badge tone="warning" size="xs">대기</Badge> : <span className="text-[var(--text-4)]">-</span>}</div>
              <div><span className="text-[var(--text-4)]">TSA 서버 </span><span className="text-[11px]">{auditModal.contract.tsa_server || '-'}</span></div>
              <div><span className="text-[var(--text-4)]">근로자 서명 </span>{auditModal.contract.worker_signed_at ? <><Badge tone="success" size="xs">서명</Badge> <span className="text-[10px] text-[var(--text-4)]">{new Date(auditModal.contract.worker_signed_at).toLocaleString('ko-KR')}</span></> : <span className="text-[var(--text-4)]">미서명</span>}{auditModal.contract.worker_signed_ip && <span className="text-[10px] text-[var(--text-4)]"> IP {auditModal.contract.worker_signed_ip}</span>}</div>
              <div><span className="text-[var(--text-4)]">사업주 서명 </span>{auditModal.contract.employer_signed_at ? <><Badge tone="success" size="xs">서명</Badge> <span className="text-[10px] text-[var(--text-4)]">{new Date(auditModal.contract.employer_signed_at).toLocaleString('ko-KR')}</span></> : <span className="text-[var(--text-4)]">미서명</span>}{auditModal.contract.employer_signed_by_email && <div className="text-[10px] text-[var(--text-4)]">by {auditModal.contract.employer_signed_by_email}</div>}</div>
            </div>

            <div>
              <div className="text-[13px] font-semibold mb-2">이벤트 로그 <span className="text-[var(--text-4)] font-normal">({auditModal.events?.length || 0}건)</span></div>
              <div className="overflow-y-auto max-h-[400px] border border-[var(--border-2)] rounded-md">
                <table className="w-full text-[11.5px]">
                  <thead className="sticky top-0 bg-[var(--bg-2)] border-b border-[var(--border-2)]">
                    <tr>
                      <th className="text-left px-2 py-1.5">시각</th>
                      <th className="text-left px-2 py-1.5">이벤트</th>
                      <th className="text-left px-2 py-1.5">Actor</th>
                      <th className="text-left px-2 py-1.5">IP</th>
                      <th className="text-left px-2 py-1.5">UA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditModal.events || []).map((e: any) => (
                      <tr key={e.id} className="border-t border-[var(--border-1)]">
                        <td className="px-2 py-1 tabular text-[var(--text-3)]">{new Date(e.created_at).toLocaleString('ko-KR')}</td>
                        <td className="px-2 py-1"><Badge tone={EVENT_TONE[e.event] || 'neutral'} size="xs">{EVENT_LABEL[e.event] || e.event}</Badge></td>
                        <td className="px-2 py-1"><div className="text-[var(--text-2)]">{e.actor_name || e.actor_type}</div>{e.actor_email && <div className="text-[10px] text-[var(--text-4)]">{e.actor_email}</div>}</td>
                        <td className="px-2 py-1 text-[var(--text-3)]">{e.client_ip || '-'}</td>
                        <td className="px-2 py-1 text-[var(--text-4)] truncate max-w-[200px]" title={e.user_agent}>{e.user_agent || '-'}</td>
                      </tr>
                    ))}
                    {(auditModal.events || []).length === 0 && (
                      <tr><td colSpan={5} className="text-center py-4 text-[var(--text-4)]">이벤트 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10.5px] text-[var(--text-4)] bg-[var(--info-bg)] border border-[var(--info-border)] rounded p-2">
              ※ 감사이력은 노동청·분쟁 시 전자계약 신빙성 입증 자료로 사용됩니다. 서명 시각·IP·UA·문서 해시·RFC3161 타임스탬프가 자동 기록됩니다.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
