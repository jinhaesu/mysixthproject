"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getOffboardings,
  getOffboarding,
  patchOffboarding,
  deleteOffboarding,
  recomputeOffboarding,
  sendOffboardingEmail,
  getOffboardingDashboard,
  getOffboardingRecipients,
  setOffboardingRecipients,
} from "@/lib/api";
import SessionPasswordGate from "@/components/SessionPasswordGate";
import {
  PageHeader,
  Stat,
  Tabs,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
  Pill,
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
import { AlertTriangle, Users, Mail, RefreshCw, Trash2, Save, FileDown, Receipt, Download } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function downloadAuthed(url: string, filename: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

const REASON_CODES = [
  { code: "11", label: "11 - 개인사정으로 인한 자진퇴사", hint: "실업급여 X" },
  { code: "22", label: "22 - 근로계약기간만료/공사종료", hint: "실업급여 O" },
  { code: "23", label: "23 - 경영상필요/회사사정 (권고사직 등)", hint: "실업급여 O" },
  { code: "26", label: "26 - 정년퇴직", hint: "실업급여 O" },
  { code: "31", label: "31 - 기타 사용자 사정", hint: "실업급여 O (사례별)" },
  { code: "41", label: "41 - 사망", hint: "유족급여 처리" },
];


const SEVERANCE_METHODS = [
  { value: "avg_3m", label: "직전 3개월 평균임금 기준 (DB 자동)", hint: "기본 산식: (3개월 임금합 / 3개월 일수) × 30 × 근속연수" },
  { value: "fixed", label: "고정 금액 (관리자 입력)", hint: "" },
  { value: "dc", label: "DC형 (확정기여형) — 외부 적립", hint: "" },
  { value: "irp", label: "IRP 이전", hint: "" },
];

const STATUS_OPTIONS = [
  { value: "in_progress", label: "진행중" },
  { value: "completed", label: "완료" },
  { value: "cancelled", label: "취소" },
];

type TabId = "in_progress" | "completed" | "all" | "settings";

interface OffboardingRecord {
  id: number;
  employee_type: string;
  employee_name?: string;
  employee_phone?: string;
  hire_date?: string;
  department?: string;
  resign_date?: string;
  loss_date?: string;
  reason_code?: string;
  status?: string;
  days_to_loss_deadline?: number;
  checklist_done?: number;
  [key: string]: any;
}

function formatDate(s?: string | null): string {
  if (!s) return "-";
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "-";
}

function dBadgeTone(days: number | undefined | null): "success" | "warning" | "danger" {
  if (days == null) return "neutral" as any;
  if (days > 7) return "success";
  if (days > 3) return "warning";
  return "danger";
}

function checklistCount(rec: OffboardingRecord): number {
  const fields = [
    "resignation_letter_received",
    "assets_returned",
    "pension_reported",
    "health_insurance_reported",
    "employment_insurance_reported",
    "industrial_accident_reported",
    "severance_paid",
    "annual_leave_settled",
    "income_tax_reported",
  ];
  return fields.filter((f) => rec[f] === 1 || rec[f] === true).length;
}

export default function OffboardingPage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);

  const [tab, setTab] = useState<TabId>("in_progress");
  const [items, setItems] = useState<OffboardingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const [localDetail, setLocalDetail] = useState<any>(null);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [savingRecipients, setSavingRecipients] = useState(false);

  const tabs: { id: TabId; label: string }[] = [
    { id: "in_progress", label: "진행중" },
    { id: "completed", label: "완료" },
    { id: "all", label: "전체" },
    { id: "settings", label: "설정" },
  ];

  const loadItems = useCallback(async () => {
    if (tab === "settings") return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (tab !== "all") params.status = tab;
      const data = await getOffboardings(params);
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch (e: any) {
      toast.error(e.message || "목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await getOffboardingDashboard();
      setDashboard(data);
    } catch {
      // silent
    }
  }, []);

  const loadRecipients = useCallback(async () => {
    try {
      const data = await getOffboardingRecipients();
      setRecipients(data.emails || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadDashboard();
  }, [authorized, loadDashboard]);

  useEffect(() => {
    if (!authorized) return;
    if (tab === "settings") {
      loadRecipients();
    } else {
      loadItems();
    }
  }, [authorized, tab, loadItems, loadRecipients]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const data = await getOffboarding(id);
      setDetail(data);
      setLocalDetail({ ...data, ...(data.employee || {}) });
    } catch (e: any) {
      toast.error(e.message || "상세 정보를 불러올 수 없습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDetailChange = (field: string, value: any) => {
    setLocalDetail((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleChecklistToggle = async (field: string) => {
    if (!detailId || !localDetail) return;
    const newVal = localDetail[field] === 1 ? 0 : 1;
    setLocalDetail((prev: any) => ({ ...prev, [field]: newVal }));
    try {
      await patchOffboarding(detailId, { [field]: newVal });
    } catch (e: any) {
      toast.error(e.message || "저장 실패");
      setLocalDetail((prev: any) => ({ ...prev, [field]: newVal === 1 ? 0 : 1 }));
    }
  };

  const handleSaveDetail = async () => {
    if (!detailId || !localDetail) return;
    setSavingDetail(true);
    try {
      await patchOffboarding(detailId, {
        resign_date: localDetail.resign_date,
        loss_date: localDetail.loss_date,
        reason_code: localDetail.reason_code,
        reason_detail: localDetail.reason_detail,
        status: localDetail.status,
        notes: localDetail.notes,
        severance_method: localDetail.severance_method,
        severance_final: localDetail.severance_final,
        annual_leave_remaining: localDetail.annual_leave_remaining,
        annual_leave_pay_final: localDetail.annual_leave_pay_final,
        retirement_income_tax: localDetail.retirement_income_tax,
      });
      const refreshed = await getOffboarding(detailId);
      setDetail(refreshed);
      setLocalDetail((prev: any) => ({ ...prev, ...(refreshed.employee || {}), ...refreshed }));
      toast.success("저장되었습니다.");
      loadItems();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.message || "저장 실패");
    } finally {
      setSavingDetail(false);
    }
  };

  const handleRecompute = async () => {
    if (!detailId) return;
    try {
      const data = await recomputeOffboarding(detailId);
      setLocalDetail((prev: any) => ({ ...prev, ...data }));
      toast.success("재계산 완료");
    } catch (e: any) {
      toast.error(e.message || "재계산 실패");
    }
  };

  const handleSendEmail = async () => {
    if (!detailId) return;
    try {
      await sendOffboardingEmail(detailId);
      toast.success("메일이 발송되었습니다.");
    } catch (e: any) {
      toast.error(e.message || "메일 발송 실패");
    }
  };

  const handleDownloadCsv = async () => {
    if (!detailId) return;
    setDownloadingCsv(true);
    try {
      const name = localDetail?.employee_name ?? "퇴직자";
      const date = (localDetail?.resign_date ?? "").replace(/-/g, "");
      await downloadAuthed(
        `${API_URL}/api/offboarding/${detailId}/export.csv`,
        `상실신고_${name}_${date}.csv`
      );
    } catch (e: any) {
      toast.error(e.message || "CSV 다운로드 실패");
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleDeleteDetail = async () => {
    if (!detailId) return;
    if (!confirm("이 퇴사 기록을 삭제하시겠습니까?")) return;
    try {
      await deleteOffboarding(detailId);
      toast.success("삭제되었습니다.");
      setDetailId(null);
      loadItems();
      loadDashboard();
    } catch (e: any) {
      toast.error(e.message || "삭제 실패");
    }
  };

  const handleAddRecipient = () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
      toast.info("올바른 이메일을 입력해주세요.");
      return;
    }
    if (recipients.includes(newEmail.trim())) {
      toast.info("이미 추가된 이메일입니다.");
      return;
    }
    setRecipients((prev) => [...prev, newEmail.trim()]);
    setNewEmail("");
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((e) => e !== email));
  };

  const handleSaveRecipients = async () => {
    setSavingRecipients(true);
    try {
      await setOffboardingRecipients(recipients);
      toast.success("수신자 목록이 저장되었습니다.");
    } catch (e: any) {
      toast.error(e.message || "저장 실패");
    } finally {
      setSavingRecipients(false);
    }
  };

  const CHECKLIST_ITEMS = [
    { field: "resignation_letter_received", label: "사직서 수령", desc: "자필 또는 전자" },
    { field: "assets_returned", label: "자산 회수", desc: "노트북/사원증/유니폼 등" },
    { field: "pension_reported", label: "국민연금 상실신고", desc: "EDI 또는 4INSURE" },
    { field: "health_insurance_reported", label: "건강보험 상실신고", desc: "" },
    { field: "employment_insurance_reported", label: "고용보험 상실신고", desc: "사유코드 정확" },
    { field: "industrial_accident_reported", label: "산재보험 상실신고", desc: "" },
    { field: "severance_paid", label: "퇴직금 지급", desc: "" },
    { field: "annual_leave_settled", label: "연차수당 정산", desc: "" },
    { field: "income_tax_reported", label: "퇴직소득 원천세 신고", desc: "" },
  ];

  if (!authorized) {
    return (
      <SessionPasswordGate
        title="퇴사관리 접근"
        onVerified={() => setAuthorized(true)}
      />
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        eyebrow="HR"
        title="퇴사관리"
        description="퇴사 처리 절차·상실신고·퇴직금/연차수당 정산"
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat label="진행중" value={String(dashboard?.in_progress ?? "-")} unit="건" tone="brand" />
        <Stat label="마감 임박 (≤3일)" value={String(dashboard?.deadline_warning ?? "-")} unit="건" tone="warning" />
        <Stat label="기한 초과" value={String(dashboard?.overdue ?? "-")} unit="건" tone="danger" />
        <Stat label="이번달 완료" value={String(dashboard?.completed_this_month ?? "-")} unit="건" tone="success" />
        <Stat label="퇴직금 미처리" value={String(dashboard?.missing_severance ?? "-")} unit="건" tone="neutral" />
      </div>

      <div className="mb-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} variant="underline" />
      </div>

      {tab !== "settings" && (
        loading ? (
          <SkeletonTable />
        ) : items.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title="해당하는 퇴사 기록이 없습니다" description="새 퇴사 등록은 직원 목록 페이지에서 '퇴사' 버튼을 사용해주세요." />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>구분</TH>
                    <TH>이름</TH>
                    <TH>연락처</TH>
                    <TH>부서</TH>
                    <TH>입사일</TH>
                    <TH>퇴직일</TH>
                    <TH>자격상실일</TH>
                    <TH>D-카운트</TH>
                    <TH>사유</TH>
                    <TH>진행상태</TH>
                    <TH>체크리스트</TH>
                    <TH align="right">액션</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((item) => {
                    const done = checklistCount(item);
                    const dTone = dBadgeTone(item.days_to_loss_deadline);
                    return (
                      <TR key={item.id}>
                        <TD>
                          <Badge tone={item.employee_type === "regular" ? "brand" : "violet"} size="xs">
                            {item.employee_type === "regular" ? "정규" : "파견"}
                          </Badge>
                        </TD>
                        <TD emphasis>{item.employee_name || "-"}</TD>
                        <TD muted>{item.employee_phone || "-"}</TD>
                        <TD muted>{item.department || "-"}</TD>
                        <TD muted>{formatDate(item.hire_date)}</TD>
                        <TD muted>{item.resign_date || "-"}</TD>
                        <TD muted>{item.loss_date || "-"}</TD>
                        <TD>
                          {item.days_to_loss_deadline != null ? (
                            <Badge tone={dTone} size="xs">
                              {item.days_to_loss_deadline > 0
                                ? `D-${item.days_to_loss_deadline}`
                                : item.days_to_loss_deadline === 0
                                ? "오늘"
                                : `D+${Math.abs(item.days_to_loss_deadline)}`}
                            </Badge>
                          ) : "-"}
                        </TD>
                        <TD muted>
                          {item.reason_code
                            ? `${item.reason_code}`
                            : "-"}
                        </TD>
                        <TD>
                          <Badge
                            tone={item.status === "completed" ? "success" : item.status === "cancelled" ? "neutral" : "warning"}
                            size="xs"
                            dot
                          >
                            {item.status === "completed" ? "완료" : item.status === "cancelled" ? "취소" : "진행중"}
                          </Badge>
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular text-[var(--text-2)]">{done}/9</span>
                            <div className="w-16 h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(done / 9) * 100}%`,
                                  background: done === 9 ? "var(--success-fg)" : done >= 5 ? "var(--warning-fg)" : "var(--brand-400)",
                                }}
                              />
                            </div>
                          </div>
                        </TD>
                        <TD align="right">
                          <Button variant="ghost" size="xs" onClick={(e) => {
                            e.stopPropagation();
                            console.log('퇴사 상세 click', item.id, item.employee_name);
                            openDetail(item.id);
                          }}>상세</Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </Card>
        )
      )}

      {tab === "settings" && (
        <div className="space-y-4 max-w-xl">
          <Card padding="md">
            <p className="text-xs text-[var(--text-3)] mb-3">퇴사 등록 시 이 주소들로 메일이 발송됩니다.</p>
            <div className="flex items-center gap-2 mb-3">
              <Input
                type="email"
                placeholder="이메일 주소 입력"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddRecipient(); } }}
                className="flex-1"
              />
              <Button variant="primary" size="sm" onClick={handleAddRecipient}>추가</Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {recipients.map((email) => (
                  <Pill
                    key={email}
                    active
                    onClick={() => handleRemoveRecipient(email)}
                  >
                    {email} ×
                  </Pill>
                ))}
              </div>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveRecipients}
              loading={savingRecipients}
              disabled={savingRecipients}
            >
              저장
            </Button>
          </Card>
        </div>
      )}

      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title="퇴사 상세"
        size="xl"
        footer={
          <>
            <Button variant="danger" size="sm" leadingIcon={<Trash2 size={14} />} onClick={handleDeleteDetail}>삭제</Button>
            <Button variant="secondary" size="sm" leadingIcon={<Mail size={14} />} onClick={handleSendEmail}>메일 재발송</Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<FileDown size={14} />}
              onClick={() => detailId && window.open(`/offboarding/print/severance?id=${detailId}`, "_blank")}
            >
              퇴직금 산정서 (PDF)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Receipt size={14} />}
              onClick={() => detailId && window.open(`/offboarding/print/tax-receipt?id=${detailId}`, "_blank")}
            >
              원천징수영수증 (임시본)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Download size={14} />}
              loading={downloadingCsv}
              disabled={downloadingCsv}
              onClick={handleDownloadCsv}
            >
              4INSURE 양식 (CSV)
            </Button>
            <Button variant="primary" size="sm" leadingIcon={<Save size={14} />} onClick={handleSaveDetail} loading={savingDetail} disabled={savingDetail}>저장</Button>
          </>
        }
      >
        {detailLoading ? (
          <div className="py-10 text-center text-sm text-[var(--text-3)]">로딩중...</div>
        ) : localDetail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="이름" value={localDetail.employee_name || "-"} tone="neutral" />
              <Stat label="부서/팀" value={localDetail.department || "-"} tone="neutral" />
              <Stat label="입사일" value={localDetail.hire_date || "-"} tone="neutral" />
              <Stat label="퇴직일" value={localDetail.resign_date || "-"} tone="warning" />
            </div>

            <div className="rounded-[var(--r-md)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warning-fg)]" />
                <div className="text-xs text-[var(--warning-fg)] leading-relaxed space-y-1">
                  <p className="font-semibold">[확인 필수] 자주 발생하는 실수</p>
                  <ul className="space-y-0.5 list-none">
                    <li>• 자격 상실일은 퇴직일의 다음 날입니다 (퇴직일 = 마지막 근무일).</li>
                    <li>• 사유코드는 정확히 선택해주세요 — 잘못 입력 시 실업급여 수급에 영향이 갈 수 있습니다.</li>
                    <li>• 4대보험 상실신고는 퇴직일로부터 14일 이내에 처리해야 합니다.</li>
                    <li>• 퇴직금 1년 이상 근속자는 의무 지급, 5년치 분리과세 가능.</li>
                    <li>• 연차수당은 미사용 잔여일수 × 평균임금 1일분으로 계산.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="퇴직일 (마지막 근무일)">
                <Input type="date" value={localDetail.resign_date || ""} onChange={(e) => handleDetailChange("resign_date", e.target.value)} />
              </Field>
              <Field label="자격상실일">
                <Input type="date" value={localDetail.loss_date || ""} onChange={(e) => handleDetailChange("loss_date", e.target.value)} />
              </Field>
              <Field label="사유 코드">
                <Select value={localDetail.reason_code || ""} onChange={(e) => handleDetailChange("reason_code", e.target.value)}>
                  <option value="">선택</option>
                  {REASON_CODES.map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </Select>
                {localDetail.reason_code && (
                  <small className="text-[var(--text-3)] text-xs mt-0.5 block">
                    {REASON_CODES.find((r) => r.code === localDetail.reason_code)?.hint}
                  </small>
                )}
              </Field>
              <Field label="진행상태">
                <Select value={localDetail.status || ""} onChange={(e) => handleDetailChange("status", e.target.value)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="사유 상세" className="sm:col-span-2">
                <Textarea value={localDetail.reason_detail || ""} onChange={(e) => handleDetailChange("reason_detail", e.target.value)} rows={2} />
              </Field>
            </div>

            <div>
              <p className="text-[var(--text-3)] text-xs uppercase tracking-wider mb-2">체크리스트</p>
              <div className="space-y-1.5">
                {CHECKLIST_ITEMS.map((ci) => (
                  <Card key={ci.field} padding="sm" tone="default">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={localDetail[ci.field] === 1 || localDetail[ci.field] === true}
                        onChange={() => handleChecklistToggle(ci.field)}
                        className="w-4 h-4 accent-[var(--brand-500)]"
                      />
                      <div>
                        <span className="text-sm font-medium text-[var(--text-1)]">{ci.label}</span>
                        {ci.desc && <span className="text-xs text-[var(--text-3)] ml-2">{ci.desc}</span>}
                      </div>
                    </label>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[var(--text-3)] text-xs uppercase tracking-wider mb-2">퇴직금 정산</p>
              <div className="space-y-3">
                <Field label="정산방식">
                  <Select value={localDetail.severance_method || "avg_3m"} onChange={(e) => handleDetailChange("severance_method", e.target.value)}>
                    {SEVERANCE_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </Select>
                  {localDetail.severance_method && (
                    <small className="text-[var(--text-3)] text-xs mt-0.5 block">
                      {SEVERANCE_METHODS.find((m) => m.value === localDetail.severance_method)?.hint}
                    </small>
                  )}
                </Field>
                <div className="flex items-end gap-2">
                  <Field label="자동 계산 금액" className="flex-1">
                    <Input
                      value={localDetail.severance_auto != null ? Number(localDetail.severance_auto).toLocaleString() + " 원" : "-"}
                      readOnly
                      className="bg-[var(--bg-1)] text-[var(--text-3)]"
                    />
                  </Field>
                  <Button variant="secondary" size="sm" leadingIcon={<RefreshCw size={13} />} onClick={handleRecompute}>재계산</Button>
                </div>
                <Field label="최종 금액 (직접 입력)">
                  <Input
                    type="number"
                    value={localDetail.severance_final ?? ""}
                    onChange={(e) => handleDetailChange("severance_final", e.target.value)}
                    placeholder="원"
                  />
                </Field>
                <Field label="퇴직소득 원천세">
                  <Input
                    type="number"
                    value={localDetail.retirement_income_tax ?? ""}
                    onChange={(e) => handleDetailChange("retirement_income_tax", e.target.value)}
                    placeholder="원"
                  />
                  <small className="text-[var(--text-3)] text-xs mt-0.5 block">정밀 계산은 다음 단계에서 지원 예정</small>
                </Field>

                {localDetail.tax_breakdown && (
                  <div className="rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--bg-1)] p-3 space-y-1.5">
                    <p className="text-[var(--text-3)] text-xs uppercase tracking-wider mb-2">세액 산정 (자동)</p>
                    {[
                      ["퇴직소득금액", localDetail.tax_breakdown.retirement_income],
                      ["근속연수공제", localDetail.tax_breakdown.tenure_deduction],
                      ["환산급여", localDetail.tax_breakdown.annualized_income],
                      ["산출세액", localDetail.tax_breakdown.income_tax],
                      ["지방소득세", localDetail.tax_breakdown.local_income_tax],
                      ["총 원천세", localDetail.tax_breakdown.total_withholding],
                    ].map(([label, val]) =>
                      val != null ? (
                        <div key={String(label)} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--text-3)]">{label}</span>
                          <span className="tabular font-medium text-[var(--text-1)]">
                            {Number(val).toLocaleString()} 원
                            {label === "총 원천세" && (
                              <span className="text-[var(--text-4)] ml-1">(자동값)</span>
                            )}
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-[var(--text-3)] text-xs uppercase tracking-wider mb-2">연차수당 정산</p>
              <div className="space-y-3">
                <Field label="잔여 일수">
                  <Input
                    type="number"
                    value={localDetail.annual_leave_remaining ?? ""}
                    onChange={(e) => handleDetailChange("annual_leave_remaining", e.target.value)}
                    placeholder="일"
                  />
                </Field>
                <Field label="자동 계산 금액">
                  <Input
                    value={localDetail.annual_leave_pay_auto != null ? Number(localDetail.annual_leave_pay_auto).toLocaleString() + " 원" : "-"}
                    readOnly
                    className="bg-[var(--bg-1)] text-[var(--text-3)]"
                  />
                </Field>
                <Field label="최종 금액 (직접 입력)">
                  <Input
                    type="number"
                    value={localDetail.annual_leave_pay_final ?? ""}
                    onChange={(e) => handleDetailChange("annual_leave_pay_final", e.target.value)}
                    placeholder="원"
                  />
                </Field>
              </div>
            </div>

            <Field label="메모">
              <Textarea
                value={localDetail.notes || ""}
                onChange={(e) => handleDetailChange("notes", e.target.value)}
                rows={3}
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
