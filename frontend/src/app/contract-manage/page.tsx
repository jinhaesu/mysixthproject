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
import { Search, FileText, History, Paperclip } from "lucide-react";

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
        setHistoryEmployee((prev) => prev ? { ...prev, name: data.employee.name } : prev);
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
              <div>
                <p className="text-xs text-[var(--text-3)] mb-1.5">첨부 파일</p>
                {viewModal.scanned_file_data.startsWith("data:image") ? (
                  <div className="border border-[var(--border-1)] rounded-[var(--r-md)] overflow-hidden bg-white">
                    <img src={viewModal.scanned_file_data} alt="계약서 스캔" className="w-full object-contain max-h-[480px]" />
                  </div>
                ) : viewModal.scanned_file_data.startsWith("data:application/pdf") ? (
                  <a
                    href={viewModal.scanned_file_data}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--bg-1)] text-[12.5px] text-[var(--brand-400)] hover:bg-[var(--bg-2)]"
                  >
                    <FileText size={14} />
                    PDF 열기
                  </a>
                ) : (
                  <a
                    href={viewModal.scanned_file_data}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--bg-1)] text-[12.5px] text-[var(--brand-400)] hover:bg-[var(--bg-2)]"
                  >
                    <FileText size={14} />
                    파일 열기
                  </a>
                )}
              </div>
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
              <div>
                <p className="text-xs text-[var(--text-3)] mb-1.5">서명</p>
                <div className="border border-[var(--border-1)] rounded-[var(--r-md)] overflow-hidden bg-white">
                  <img src={viewModal.signature_data} alt="서명" className="w-full object-contain max-h-48" />
                </div>
              </div>
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
    </div>
  );
}
