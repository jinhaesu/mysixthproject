"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  getContractsLatest,
  getContractsMissing,
  getContractHistory,
} from "@/lib/api";
import {
  PageHeader,
  Stat,
  Tabs,
  Toolbar,
  Segmented,
  Input,
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
import { Search, FileText, History } from "lucide-react";

const TYPE_OPTIONS: { id: "all" | "regular" | "dispatch"; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "regular", label: "정규직" },
  { id: "dispatch", label: "파견·알바" },
];

type TabId = "latest" | "missing" | "history";

interface ContractItem {
  id: number;
  employee_type: string;
  employee_id: number;
  name: string;
  phone: string;
  department?: string;
  hire_date?: string;
  contract_start?: string;
  contract_end?: string;
  contract_count?: number;
  status?: string;
  signature_data?: string;
  [key: string]: any;
}

export default function ContractManagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [tab, setTab] = useState<TabId>(() => {
    const t = searchParams.get("tab");
    if (t === "missing" || t === "history") return t;
    return "latest";
  });
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "dispatch">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [latestItems, setLatestItems] = useState<ContractItem[]>([]);
  const [latestTotal, setLatestTotal] = useState(0);
  const [latestMissing, setLatestMissing] = useState(0);

  const [missingItems, setMissingItems] = useState<ContractItem[]>([]);
  const [missingTotal, setMissingTotal] = useState(0);

  const [historyItems, setHistoryItems] = useState<ContractItem[]>([]);
  const [historyEmployee, setHistoryEmployee] = useState<{ type: string; id?: string; phone?: string; name?: string } | null>(() => {
    const et = searchParams.get("employee_type");
    const eid = searchParams.get("employee_id");
    const ph = searchParams.get("phone");
    if (et && (eid || ph)) return { type: et, id: eid || undefined, phone: ph || undefined };
    return null;
  });

  const [viewModal, setViewModal] = useState<ContractItem | null>(null);

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
      setHistoryItems(Array.isArray(data) ? data : data.items || []);
    } catch (e: any) {
      toast.error(e.message || "이력을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [historyEmployee, toast]);

  useEffect(() => {
    if (tab === "latest") loadLatest();
    else if (tab === "missing") loadMissing();
    else if (tab === "history") loadHistory();
  }, [tab, loadLatest, loadMissing, loadHistory]);

  function handleHistoryFromRow(item: ContractItem) {
    setHistoryEmployee({
      type: item.employee_type,
      id: item.employee_type === "regular" ? String(item.employee_id) : undefined,
      phone: item.employee_type !== "regular" ? item.phone : undefined,
      name: item.name,
    });
    setTab("history");
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "latest", label: "최근 계약서" },
    { id: "missing", label: "미작성" },
    { id: "history", label: "이력 조회" },
  ];

  const contractedCount = latestItems.length;

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="관리"
        title="근로계약서 관리"
        description="직원별 최신 계약서 / 미작성 직원 / 과거 이력 조회"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="전체 인원" value={String(latestTotal + latestMissing)} unit="명" tone="neutral" />
        <Stat label="계약서 보유" value={String(contractedCount)} unit="명" tone="success" />
        <Stat label="미작성" value={String(latestMissing)} unit="명" tone="warning" />
        <Stat label="미작성 비율" value={latestTotal + latestMissing > 0 ? ((latestMissing / (latestTotal + latestMissing)) * 100).toFixed(0) : "0"} unit="%" tone={latestMissing > 0 ? "danger" : "success"} />
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
        ) : latestItems.length === 0 ? (
          <EmptyState icon={<FileText size={32} />} title="계약서가 없습니다" description="직원 계약서를 등록해주세요." />
        ) : (
          <Table>
            <THead>
              <TR>
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
              {latestItems.map((item) => (
                <TR key={`${item.employee_type}-${item.employee_id}`}>
                  <TD>
                    <Badge tone={item.employee_type === "regular" ? "brand" : "violet"} size="xs">
                      {item.employee_type === "regular" ? "정규" : "파견"}
                    </Badge>
                  </TD>
                  <TD emphasis>{item.name}</TD>
                  <TD muted>{item.phone}</TD>
                  <TD muted>{item.department || "-"}</TD>
                  <TD muted>{item.hire_date || "-"}</TD>
                  <TD muted>
                    {item.contract_start && item.contract_end
                      ? `${item.contract_start} ~ ${item.contract_end}`
                      : item.contract_start || "-"}
                  </TD>
                  <TD>
                    {item.contract_count != null ? (
                      <Badge tone="neutral" size="xs">{item.contract_count}회</Badge>
                    ) : "-"}
                  </TD>
                  <TD>
                    <Badge
                      tone={item.status === "signed" ? "success" : item.status === "pending" ? "warning" : "neutral"}
                      size="xs"
                      dot
                    >
                      {item.status === "signed" ? "체결" : item.status === "pending" ? "발송됨" : "미체결"}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="xs" onClick={() => setViewModal(item)}>보기</Button>
                      <Button variant="ghost" size="xs" onClick={() => handleHistoryFromRow(item)}>이력</Button>
                    </div>
                  </TD>
                </TR>
              ))}
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
                <TH>구분</TH>
                <TH>이름</TH>
                <TH>연락처</TH>
                <TH>부서</TH>
                <TH>입사일</TH>
                <TH align="right">액션</TH>
              </TR>
            </THead>
            <TBody>
              {missingItems.map((item) => (
                <TR key={`${item.employee_type}-${item.employee_id}`}>
                  <TD>
                    <Badge tone={item.employee_type === "regular" ? "brand" : "violet"} size="xs">
                      {item.employee_type === "regular" ? "정규" : "파견"}
                    </Badge>
                  </TD>
                  <TD emphasis>{item.name}</TD>
                  <TD muted>{item.phone}</TD>
                  <TD muted>{item.department || "-"}</TD>
                  <TD muted>{item.hire_date || "-"}</TD>
                  <TD align="right">
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
              {historyItems.map((item, idx) => (
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
                      <Button variant="ghost" size="xs" onClick={() => setViewModal(item)}>
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
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[var(--text-3)] text-xs mb-0.5">이름</p>
                <p className="text-[var(--text-1)] font-medium">{viewModal.name}</p>
              </div>
              <div>
                <p className="text-[var(--text-3)] text-xs mb-0.5">연락처</p>
                <p className="text-[var(--text-2)]">{viewModal.phone}</p>
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

            {viewModal.status === "signed" && viewModal.token && (
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
    </div>
  );
}
