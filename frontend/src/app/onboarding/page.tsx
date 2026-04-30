"use client";

import { useEffect, useState, useCallback } from "react";
import SessionPasswordGate from "@/components/SessionPasswordGate";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Section,
  Stat,
  Tabs,
  Toolbar,
  ToolbarSpacer,
  Modal,
  EmptyState,
  SkeletonTable,
  useToast,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  SegmentedControl,
} from "@/components/ui";
import {
  getOnboardings,
  getOnboarding,
  patchOnboarding,
  sendOnboardingEmail,
  getOnboardingDashboard,
  getOnboardingRecipients,
  setOnboardingRecipients,
  sendRegularLink,
} from "@/lib/api";
import {
  Search,
  Send,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  FileText,
  Download,
} from "lucide-react";

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

// ── Field label map ──────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  name: "이름",
  phone: "연락처",
  email: "이메일",
  address: "주소",
  id_number: "주민등록번호",
  birth_date: "생년월일",
  department: "부서",
  team: "팀",
  role: "직책",
  employment_type: "고용형태",
  hire_date: "입사일",
  monthly_salary: "월 급여(보수월액)",
  job_code: "직종코드",
  weekly_work_hours: "소정근로시간",
  business_registration_no: "사업장관리번호",
  bank_name: "은행명",
  bank_account: "계좌번호",
  bank_slip_data: "통장사본",
  family_register_data: "가족관계증명서",
  resident_register_data: "주민등록등본",
  signed_contract_url: "근로계약서 서명본",
  nationality: "국적",
  visa_type: "비자종류",
  visa_expiry: "비자만료일",
  foreign_id_card_data: "외국인등록증 사본",
};

function labelFields(fields: string[]): string {
  return fields.map((f) => FIELD_LABELS[f] || f).join(", ");
}

type OnboardingTab = "pending" | "ready" | "completed" | "all" | "settings";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function completionColor(pct: number) {
  if (pct >= 100) return "bg-[var(--success-fg)]";
  if (pct >= 70) return "bg-[var(--warning-fg)]";
  return "bg-[var(--danger-fg)]";
}

// ── File Upload Cell ─────────────────────────────────────────────
function FileUploadCell({
  label,
  fieldKey,
  value,
  onChange,
}: {
  label: string;
  fieldKey: string;
  value: string | null | undefined;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[var(--fs-caption)] font-medium text-[var(--text-2)]">{label}</p>
      {value ? (
        <div className="space-y-1">
          <img src={value} alt={label} style={{ maxHeight: 200 }} className="rounded-[var(--r-md)] border border-[var(--border-1)]" />
          <label className="inline-block cursor-pointer">
            <span className="text-[var(--fs-caption)] text-[var(--brand-400)] underline">교체</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const b64 = await fileToBase64(file);
                onChange(fieldKey, b64);
              }}
            />
          </label>
        </div>
      ) : (
        <label
          className="flex flex-col items-center justify-center gap-2 p-4 rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-2)] bg-grid cursor-pointer hover:border-[var(--brand-400)] transition-colors"
          style={{ minHeight: 80 }}
        >
          <FileText className="w-5 h-5 text-[var(--text-4)]" />
          <span className="text-[var(--fs-caption)] text-[var(--text-4)]">파일 첨부 (클릭 또는 드래그)</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const b64 = await fileToBase64(file);
              onChange(fieldKey, b64);
            }}
          />
        </label>
      )}
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────
function DetailModal({
  id,
  open,
  onClose,
  onSaved,
}: {
  id: number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

  const loadDetail = useCallback(async () => {
    if (!open || !id) return;
    setLoading(true);
    try {
      const d = await getOnboarding(id);
      setDetail(d);
      setForm({
        email: d.email ?? "",
        address: d.address ?? "",
        nationality: d.nationality ?? "KR",
        visa_type: d.visa_type ?? "",
        visa_expiry: d.visa_expiry ?? "",
        business_registration_no: d.business_registration_no ?? "",
        monthly_salary: d.monthly_salary ?? "",
        non_taxable_meal: d.non_taxable_meal ?? "",
        non_taxable_vehicle: d.non_taxable_vehicle ?? "",
        job_code: d.job_code ?? "",
        weekly_work_hours: d.weekly_work_hours ?? "40",
        employment_type: d.employment_type ?? "정규",
        bank_slip_data: d.bank_slip_data ?? "",
        foreign_id_card_data: d.foreign_id_card_data ?? "",
        family_register_data: d.family_register_data ?? "",
        resident_register_data: d.resident_register_data ?? "",
        signed_contract_url: d.signed_contract_url ?? "",
        id_number: d.id_number ?? "",
        birth_date: d.birth_date ?? "",
      });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, open]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const set = (key: string, val: any) => setForm((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await patchOnboarding(id, form);
      toast.success("저장되었습니다.");
      await loadDetail();
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      const res = await sendOnboardingEmail(id);
      toast.success(`취득신고 메일이 발송되었습니다. (${(res.sent_to || []).join(", ")})`);
      await loadDetail();
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    try {
      const name = detail?.name ?? "입사자";
      const date = (detail?.hire_date ?? "").replace(/-/g, "");
      await downloadAuthed(
        `${API_URL}/api/onboarding/${id}/export.csv`,
        `취득신고_${name}_${date}.csv`
      );
    } catch (e: any) {
      toast.error(e.message || "CSV 다운로드 실패");
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleSendCollectLinkFromModal = async () => {
    if (!detail) return;
    if (!confirm(`${detail.name} 님에게 정보 입력용 웹링크 SMS를 발송할까요?`)) return;
    setSendingLink(true);
    try {
      await sendRegularLink(id);
      toast.success(`${detail.name} 님에게 SMS 발송됨. 정보 입력 후 입사자관리에 자동 반영됩니다.`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "SMS 발송 실패");
    } finally {
      setSendingLink(false);
    }
  };

  const taxable = (() => {
    const s = Number(form.monthly_salary) || 0;
    const m = Number(form.non_taxable_meal) || 0;
    const v = Number(form.non_taxable_vehicle) || 0;
    return Math.max(0, s - m - v);
  })();

  const isComplete = detail?.missing_fields?.length === 0;
  const hasMissing = (detail?.missing_fields?.length ?? 0) > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={loading ? "로딩 중..." : `${detail?.name ?? ""} — 입사자 상세`}
      description={loading ? undefined : `${detail?.department ?? ""}${detail?.team ? " / " + detail.team : ""}${detail?.position_title ? " · " + detail.position_title : ""}`}
      footer={
        <div className="flex items-center gap-2 w-full flex-wrap">
          <Button variant="ghost" size="sm" onClick={onClose}>닫기</Button>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Download size={14} />}
            loading={downloadingCsv}
            disabled={downloadingCsv}
            onClick={handleDownloadCsv}
          >
            4INSURE 취득신고 양식 (CSV)
          </Button>
          {hasMissing && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Send size={13} />}
              loading={sendingLink}
              disabled={sendingLink}
              onClick={handleSendCollectLinkFromModal}
            >
              근로자에게 정보 입력 SMS 발송
            </Button>
          )}
          <ToolbarSpacer />
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>저장</Button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded-[var(--r-md)] bg-[var(--bg-3)] animate-pulse" />
          ))}
        </div>
      ) : !detail ? null : (
        <div className="space-y-6">
          {/* Header summary */}
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{detail.name}</span>
                {detail.nationality === "FOREIGN" && <Badge tone="violet" size="sm">외국인</Badge>}
              </div>
              <p className="text-[var(--fs-body)] text-[var(--text-3)]">
                입사일: {detail.hire_date ?? "-"} · {detail.department ?? ""}{detail.team ? " / " + detail.team : ""}
              </p>
            </div>
            <div className="text-right min-w-[100px]">
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mb-1">완성도</p>
              <div className="w-full h-2 rounded-full bg-[var(--bg-3)] overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all ${completionColor(detail.completion_pct ?? 0)}`}
                  style={{ width: `${detail.completion_pct ?? 0}%` }}
                />
              </div>
              <p className="text-[var(--fs-caption)] tabular text-[var(--text-2)] font-medium">{detail.completion_pct ?? 0}%</p>
            </div>
          </div>

          {/* Missing fields notice / send button */}
          {isComplete ? (
            <div className="rounded-[var(--r-lg)] bg-[var(--success-bg)] border border-[var(--success-border)] p-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[var(--success-fg)] shrink-0" />
                <div>
                  <p className="text-[var(--fs-body)] font-medium text-[var(--success-fg)]">모든 정보 입력 완료</p>
                  <p className="text-[var(--fs-caption)] text-[var(--success-fg)] opacity-80">취득신고 메일 발송이 가능합니다.</p>
                  {detail.last_email_sent_at && (
                    <p className="text-[var(--fs-caption)] text-[var(--success-fg)] opacity-70 mt-0.5">
                      마지막 발송: {new Date(detail.last_email_sent_at).toLocaleString("ko-KR")}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Send size={13} />}
                loading={sending}
                onClick={handleSendEmail}
              >
                취득신고 메일 발송
              </Button>
            </div>
          ) : (
            <div className="rounded-[var(--r-lg)] bg-[var(--warning-bg)] border border-[var(--warning-border)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-[var(--warning-fg)] shrink-0" />
                <p className="text-[var(--fs-body)] font-medium text-[var(--warning-fg)]">
                  누락된 항목 {detail.missing_fields.length}개
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.missing_fields.map((f: string) => (
                  <span key={f} className="px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--warning-fg)] text-white text-[var(--fs-caption)] font-medium">
                    {FIELD_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 개인정보 */}
          <Section title="개인정보">
            <div className="grid grid-cols-1 gap-3">
              <Field label="이름">
                <Input inputSize="sm" value={detail.name ?? ""} disabled />
              </Field>
              <Field label="주민등록번호" hint="4대보험 신고 목적으로만 사용됩니다.">
                <Input inputSize="sm" type="password" value={form.id_number} onChange={(e) => set("id_number", e.target.value)} placeholder="000000-0000000" />
              </Field>
              <Field label="생년월일">
                <Input inputSize="sm" type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
              </Field>
              <Field label="주소">
                <Input inputSize="sm" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="전북 전주시 덕진구 ..." />
              </Field>
              <Field label="연락처">
                <Input inputSize="sm" value={detail.phone ?? ""} disabled />
              </Field>
              <Field label="이메일">
                <Input inputSize="sm" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="example@email.com" />
              </Field>
              <Field label="국적">
                <SegmentedControl
                  value={form.nationality as "KR" | "FOREIGN"}
                  options={[
                    { value: "KR", label: "한국" },
                    { value: "FOREIGN", label: "외국인" },
                  ]}
                  onChange={(v) => set("nationality", v)}
                  size="sm"
                />
              </Field>
              {form.nationality === "FOREIGN" && (
                <>
                  <Field label="비자종류">
                    <Input inputSize="sm" value={form.visa_type} onChange={(e) => set("visa_type", e.target.value)} placeholder="E-9, H-2 등" />
                  </Field>
                  <Field label="비자만료일">
                    <Input inputSize="sm" type="date" value={form.visa_expiry} onChange={(e) => set("visa_expiry", e.target.value)} />
                  </Field>
                </>
              )}
            </div>
          </Section>

          {/* 근로 정보 */}
          <Section title="근로 정보">
            <div className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-3 gap-2">
                <Field label="부서">
                  <Input inputSize="sm" value={detail.department ?? ""} disabled />
                </Field>
                <Field label="팀">
                  <Input inputSize="sm" value={detail.team ?? ""} disabled />
                </Field>
                <Field label="직책">
                  <Input inputSize="sm" value={detail.position_title ?? ""} disabled />
                </Field>
              </div>
              <Field label="고용형태">
                <Select
                  inputSize="sm"
                  value={form.employment_type}
                  onChange={(e) => set("employment_type", e.target.value)}
                >
                  <option value="정규">정규</option>
                  <option value="계약">계약</option>
                  <option value="일용">일용</option>
                </Select>
              </Field>
              <Field label="입사일">
                <Input inputSize="sm" value={detail.hire_date ?? ""} disabled />
              </Field>
              <Field label="사업장관리번호" hint="11자리 숫자">
                <Input inputSize="sm" value={form.business_registration_no} onChange={(e) => set("business_registration_no", e.target.value)} placeholder="00000000000" />
              </Field>
              <Field label="직종코드" hint="고용·산재 신고용 6자리 코드">
                <Input inputSize="sm" value={form.job_code} onChange={(e) => set("job_code", e.target.value)} placeholder="123456" />
              </Field>
              <Field label="소정근로시간/주">
                <Input inputSize="sm" type="number" value={form.weekly_work_hours} onChange={(e) => set("weekly_work_hours", e.target.value)} placeholder="40" />
              </Field>
            </div>
          </Section>

          {/* 급여 */}
          <Section title="급여">
            <div className="grid grid-cols-1 gap-3">
              <Field label="월 급여">
                <Input inputSize="sm" type="number" value={form.monthly_salary} onChange={(e) => set("monthly_salary", e.target.value)} placeholder="0" />
              </Field>
              <Field label="비과세 식대">
                <Input inputSize="sm" type="number" value={form.non_taxable_meal} onChange={(e) => set("non_taxable_meal", e.target.value)} placeholder="0" />
              </Field>
              <Field label="비과세 차량유지비">
                <Input inputSize="sm" type="number" value={form.non_taxable_vehicle} onChange={(e) => set("non_taxable_vehicle", e.target.value)} placeholder="0" />
              </Field>
              <div className="rounded-[var(--r-md)] bg-[var(--bg-0)] border border-[var(--border-1)] px-3 py-2 flex items-center justify-between">
                <span className="text-[var(--fs-caption)] text-[var(--text-3)]">보수월액(과세분)</span>
                <span className="tabular text-[var(--fs-body)] font-medium text-[var(--text-1)]">
                  {taxable.toLocaleString("ko-KR")} 원
                </span>
              </div>
            </div>
          </Section>

          {/* 계좌 및 첨부 서류 */}
          <Section title="계좌 및 첨부 서류">
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-2">
                <Field label="은행명">
                  <Input inputSize="sm" value={detail.bank_name ?? ""} disabled />
                </Field>
                <Field label="계좌번호">
                  <Input inputSize="sm" value={detail.bank_account ?? ""} disabled />
                </Field>
              </div>
              <FileUploadCell
                label="통장사본"
                fieldKey="bank_slip_data"
                value={form.bank_slip_data}
                onChange={set}
              />
              <FileUploadCell
                label="주민등록등본"
                fieldKey="resident_register_data"
                value={form.resident_register_data}
                onChange={set}
              />
              <FileUploadCell
                label="가족관계증명서"
                fieldKey="family_register_data"
                value={form.family_register_data}
                onChange={set}
              />
              {form.nationality === "FOREIGN" && (
                <FileUploadCell
                  label="외국인등록증"
                  fieldKey="foreign_id_card_data"
                  value={form.foreign_id_card_data}
                  onChange={set}
                />
              )}
              <Field label="서명 계약서 URL">
                <Input inputSize="sm" value={form.signed_contract_url} onChange={(e) => set("signed_contract_url", e.target.value)} placeholder="https://..." />
              </Field>
            </div>
          </Section>

          {/* 계약서 정보 */}
          {detail.latest_contract && (
            <Section title="계약서 정보">
              <div className="rounded-[var(--r-lg)] border border-[var(--border-1)] bg-[var(--bg-0)] p-4 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[var(--fs-caption)]">
                  <div>
                    <p className="text-[var(--text-3)]">계약 시작</p>
                    <p className="font-medium text-[var(--text-1)]">{detail.latest_contract.contract_start ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-[var(--text-3)]">계약 종료</p>
                    <p className="font-medium text-[var(--text-1)]">{detail.latest_contract.contract_end ?? "정함 없음"}</p>
                  </div>
                </div>
                {detail.latest_contract.signature_data && (
                  <div className="pt-2 border-t border-[var(--border-1)]">
                    <p className="text-[var(--fs-caption)] text-[var(--text-3)] mb-1">서명</p>
                    <div className="bg-white rounded-[var(--r-sm)] border p-1 inline-block">
                      <img src={detail.latest_contract.signature_data} alt="서명" className="max-h-16" />
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────
function SettingsTab() {
  const toast = useToast();
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    getOnboardingRecipients()
      .then((r) => setEmails(r.emails ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setOnboardingRecipients(emails);
      toast.success("이메일 수신처가 저장되었습니다.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed || emails.includes(trimmed)) return;
    setEmails((prev) => [...prev, trimmed]);
    setNewEmail("");
  };

  const removeEmail = (e: string) => setEmails((prev) => prev.filter((x) => x !== e));

  if (loading) return <div className="py-8 text-center text-[var(--text-3)] text-[var(--fs-body)]">불러오는 중...</div>;

  return (
    <Card padding="md" tone="default" className="max-w-xl">
      <Section title="취득신고 이메일 수신처">
        <p className="text-[var(--fs-body)] text-[var(--text-3)] mb-4">
          입사자 취득신고 메일을 수신할 이메일 주소를 등록합니다.
        </p>
        <div className="space-y-2 mb-4">
          {emails.length === 0 ? (
            <p className="text-[var(--fs-caption)] text-[var(--text-4)] py-2">등록된 이메일이 없습니다.</p>
          ) : (
            emails.map((e) => (
              <div key={e} className="flex items-center justify-between px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg-0)] border border-[var(--border-1)]">
                <span className="text-[var(--fs-body)] text-[var(--text-1)]">{e}</span>
                <Button variant="ghost" size="xs" onClick={() => removeEmail(e)} leadingIcon={<Trash2 size={12} />}>삭제</Button>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input
            inputSize="sm"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="추가할 이메일 주소"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
            className="flex-1"
          />
          <Button variant="secondary" size="sm" onClick={addEmail} leadingIcon={<Plus size={13} />}>추가</Button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>저장</Button>
        </div>
      </Section>
    </Card>
  );
}

// ── List Tab ─────────────────────────────────────────────────────
function ListTab({
  status,
  search,
  onOpenDetail,
  onListChanged,
}: {
  status: string;
  search: string;
  onOpenDetail: (id: number) => void;
  onListChanged?: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status !== "all") params.status = status;
      if (search) params.search = search;
      const res = await getOnboardings(params);
      setItems(res.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const handleSendCollectLink = async (item: any) => {
    if (!confirm(`${item.name} 님에게 정보 입력용 웹링크 SMS를 발송할까요?`)) return;
    setSendingId(item.id);
    try {
      await sendRegularLink(item.id);
      toast.success(`${item.name} 님에게 SMS 발송됨. 정보 입력 후 입사자관리에 자동 반영됩니다.`);
      onListChanged?.();
    } catch (e: any) {
      toast.error(e.message || "SMS 발송 실패");
    } finally {
      setSendingId(null);
    }
  };

  if (loading) return <SkeletonTable rows={6} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Users className="w-6 h-6" />}
        title="입사자가 없습니다"
        description="해당 조건에 맞는 입사자가 없습니다."
      />
    );
  }

  return (
    <>
      <div className="mb-3 p-3 rounded-[var(--r-md)] bg-[var(--info-bg)] border border-[var(--info-border)] text-[12px] text-[var(--info-fg)]">
        <div className="font-medium mb-1">사용 방법</div>
        <ul className="space-y-1 text-[var(--text-2)] list-disc pl-4">
          <li><b>상세</b> — 누락된 정보(이메일·주소·통장사본·외국인 정보 등)를 관리자가 직접 입력하거나 첨부 파일을 업로드하는 화면을 엽니다.</li>
          <li><b>정보수집 링크</b> — 직원에게 SMS로 정보 입력 웹페이지 링크를 발송합니다. 직원이 본인 휴대폰에서 직접 입력 → 자동으로 입사자 관리에 반영됩니다.</li>
          <li>모든 정보가 완료되면 <b>발송 가능</b> 탭으로 이동하며, 거기서 <b>4대보험 취득신고 메일 발송</b> 버튼이 활성화됩니다.</li>
        </ul>
      </div>
      <Table>
      <THead>
        <TR>
          <TH>이름</TH>
          <TH>연락처</TH>
          <TH>부서 / 팀</TH>
          <TH>입사일</TH>
          <TH>계약서</TH>
          <TH>정보 완성도</TH>
          <TH>메일</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {items.map((item) => (
          <TR key={item.id}>
            <TD>
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--text-1)]">{item.name}</span>
                {item.nationality === "FOREIGN" && <Badge tone="violet" size="xs">외국인</Badge>}
              </div>
            </TD>
            <TD muted>{item.phone}</TD>
            <TD muted>
              {item.department ?? "-"}
              {item.team ? ` / ${item.team}` : ""}
            </TD>
            <TD muted>{item.hire_date ?? "-"}</TD>
            <TD>
              {item.has_signed_contract ? (
                <Badge tone="success" size="xs">서명완료</Badge>
              ) : (
                <Badge tone="warning" size="xs">미체결</Badge>
              )}
            </TD>
            <TD>
              <div className="space-y-0.5 min-w-[100px]">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${completionColor(item.completion_pct ?? 0)}`}
                      style={{ width: `${item.completion_pct ?? 0}%` }}
                    />
                  </div>
                  <span className="tabular text-[var(--fs-caption)] text-[var(--text-3)] w-8 text-right">{item.completion_pct ?? 0}%</span>
                </div>
                {(item.missing_fields?.length ?? 0) > 0 && (
                  <p
                    className="text-[var(--fs-micro)] text-[var(--danger-fg)] truncate max-w-[280px]"
                    title={labelFields(item.missing_fields)}
                  >
                    {item.missing_fields.length}개 누락 — {labelFields(item.missing_fields)}
                  </p>
                )}
              </div>
            </TD>
            <TD>
              {item.onboarding_email_sent ? (
                <Badge tone="success" size="xs">발송됨</Badge>
              ) : (
                <Badge tone="neutral" size="xs">대기</Badge>
              )}
            </TD>
            <TD>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  title="누락된 정보를 관리자가 직접 입력/업로드"
                  onClick={() => {
                    try { onOpenDetail(item.id); }
                    catch (e: any) { console.error("상세 버튼 오류:", e); }
                  }}
                >
                  상세
                </Button>
                {(item.missing_fields?.length ?? 0) > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<Send size={13} />}
                    title="직원에게 정보 입력 웹페이지 SMS 발송"
                    onClick={() => handleSendCollectLink(item)}
                    loading={sendingId === item.id}
                  >
                    정보수집 링크
                  </Button>
                )}
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [authorized, setAuthorized] = useState(false);

  const [tab, setTab] = useState<OnboardingTab>("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!authorized) return;
    getOnboardingDashboard()
      .then(setDashboard)
      .catch(() => {});
  }, [authorized, listKey]);

  const refreshList = () => setListKey((k) => k + 1);

  const TABS = [
    { id: "pending" as const, label: "대기 (정보 수집 중)", count: dashboard?.pending_count },
    { id: "ready" as const, label: "발송 가능 (정보 완료)", count: dashboard?.ready_count },
    { id: "completed" as const, label: "완료" },
    { id: "all" as const, label: "전체" },
    { id: "settings" as const, label: "설정" },
  ];

  if (!authorized) {
    return (
      <SessionPasswordGate
        title="입사자 관리 접근"
        onVerified={() => setAuthorized(true)}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="HR"
        title="입사자 관리"
        description="정규직 입사자 정보 수집 현황 · 4대보험 취득신고 안내"
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Stat
          label="정보 수집 대기"
          value={String(dashboard?.pending_count ?? "—")}
          unit="명"
          tone="warning"
          icon={<Clock size={14} />}
        />
        <Stat
          label="정보 완료 (발송 대기)"
          value={String(dashboard?.ready_count ?? "—")}
          unit="명"
          tone="brand"
          icon={<CheckCircle size={14} />}
        />
        <Stat
          label="이번 달 완료"
          value={String(dashboard?.completed_this_month ?? "—")}
          unit="명"
          tone="success"
          icon={<Users size={14} />}
        />
      </div>

      {/* Tabs */}
      <Card padding="none" tone="default" className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            tabs={TABS}
            value={tab}
            onChange={setTab}
            variant="underline"
          />
        </div>

        {tab !== "settings" && (
          <div className="px-4 py-3 border-b border-[var(--border-1)]">
            <Toolbar>
              <Input
                inputSize="sm"
                iconLeft={<Search size={13} />}
                placeholder="이름·연락처 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
            </Toolbar>
          </div>
        )}

        <div className="p-4">
          {tab === "settings" ? (
            <SettingsTab />
          ) : (
            <ListTab
              key={`${tab}-${debouncedSearch}-${listKey}`}
              status={tab}
              search={debouncedSearch}
              onOpenDetail={(id) => setDetailId(id)}
              onListChanged={refreshList}
            />
          )}
        </div>
      </Card>

      {/* Always mounted, guarded by open prop */}
      <DetailModal
        id={detailId ?? 0}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        onSaved={refreshList}
      />
    </>
  );
}
