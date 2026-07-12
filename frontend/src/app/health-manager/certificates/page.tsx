"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Plus, ShieldCheck, Camera, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Modal,
  useToast,
} from "@/components/ui";
import {
  listHealthCertificates,
  listExpiringCerts,
  createHealthCertificate,
  patchHealthCertificate,
  getRegularEmployees,
  type HealthCertificate,
} from "@/lib/api";

function hintBadge(h: HealthCertificate["status_hint"], days: number | null) {
  if (h === "expired") return <Badge tone="danger">{days !== null ? `${Math.abs(days)}일 지남` : "만료"}</Badge>;
  if (h === "urgent") return <Badge tone="danger">D-{days}</Badge>;
  if (h === "warning") return <Badge tone="warning">D-{days}</Badge>;
  return <Badge tone="success">유효</Badge>;
}

export default function CertificatesPage() {
  const toast = useToast();
  const [items, setItems] = useState<HealthCertificate[]>([]);
  const [summary, setSummary] = useState<{ total: number; urgent: number; expired: number; warning: number; valid: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; department: string; team: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HealthCertificate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (expiringOnly) {
        const res = await listExpiringCerts();
        setItems(res.items);
        setSummary(null);
      } else {
        const res = await listHealthCertificates();
        setItems(res.certificates);
        setSummary(res.summary);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [expiringOnly, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getRegularEmployees({ include_resigned: "0" });
        const list = Array.isArray(res) ? res : (res.employees || res);
        setEmployees((list as any[]).map((e) => ({
          id: e.id, name: e.name || "", department: e.department || "", team: e.team || "",
        })));
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="보건관리자 점검"
        title="보건증 만료 관리"
        description="식품위생법 제40조 · 시행규칙 제49조 — 식품취급자 보건증 매년 갱신. D-30 이내 근로자는 출퇴근 자동 차단."
      />

      <Card>
        <div className="p-5 flex items-end justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={expiringOnly} onChange={(e) => setExpiringOnly(e.target.checked)} className="w-4 h-4" />
            <span className="text-[var(--fs-body)] text-[var(--text-2)]">만료 D-30 이내만</span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "새로고침"}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> 신규 등록
            </Button>
          </div>
        </div>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="전체" value={summary.total} tone="neutral" />
          <SummaryTile label="유효" value={summary.valid} tone="success" />
          <SummaryTile label="만료 예정 (D-60)" value={summary.warning} tone="warning" />
          <SummaryTile label="만료 임박 (D-30)" value={summary.urgent} tone="danger" />
          <SummaryTile label="만료됨" value={summary.expired} tone="danger" />
        </div>
      )}

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">보건증 대장 ({items.length})</h3>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-3)]">조회된 보건증이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">직원</th>
                    <th className="text-left py-2 pr-3">부서</th>
                    <th className="text-left py-2 pr-3">전화</th>
                    <th className="text-left py-2 pr-3">발급일</th>
                    <th className="text-left py-2 pr-3">만료일</th>
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-1)]">
                      <td className="py-2 pr-3 font-medium">{r.employee_name}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">
                        {r.employee_department || "-"} {r.employee_team ? ` · ${r.employee_team}` : ""}
                      </td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{r.employee_phone || "-"}</td>
                      <td className="py-2 pr-3 tabular">{r.issue_date}</td>
                      <td className="py-2 pr-3 tabular">{r.expiry_date}</td>
                      <td className="py-2 pr-3">{hintBadge(r.status_hint, r.days_until_expiry)}</td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => setEditing(r)}
                          className="text-[var(--brand-500)] hover:text-[var(--brand-400)] text-[var(--fs-caption)] underline"
                        >
                          편집
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {creating && (
        <CertFormModal
          employees={employees}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {editing && (
        <CertFormModal
          entry={editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" }) {
  const toneClass = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-lg)] border p-4 ${toneClass}`}>
      <div className="text-[var(--fs-caption)] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
    </div>
  );
}

function CertFormModal({
  entry, employees, onClose, onSaved,
}: {
  entry?: HealthCertificate;
  employees: Array<{ id: number; name: string; department: string; team: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState<number | null>(entry?.employee_id ?? null);
  const [issue, setIssue] = useState(entry?.issue_date || "");
  const [expiry, setExpiry] = useState(entry?.expiry_date || "");
  const [photo, setPhoto] = useState(entry?.cert_photo_url || "");
  const [status, setStatus] = useState(entry?.status || "valid");
  const [saving, setSaving] = useState(false);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("사진은 5MB 이하만 첨부 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!employeeId || !issue || !expiry) { toast.error("직원·발급일·만료일 필수"); return; }
    setSaving(true);
    try {
      if (entry) {
        await patchHealthCertificate(entry.id, {
          issue_date: issue, expiry_date: expiry, cert_photo_url: photo, status,
        });
      } else {
        await createHealthCertificate({
          employee_id: employeeId, issue_date: issue, expiry_date: expiry,
          cert_photo_url: photo, status,
        });
      }
      toast.success(entry ? "수정 완료" : "등록 완료");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md">
      <div>
        <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] pb-4 border-b border-[var(--border-1)] mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--brand-400)]" /> {entry ? `보건증 #${entry.id} 편집` : "새 보건증 등록"}
        </h3>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="직원">
            <Select
              value={employeeId ?? ""}
              onChange={(e) => setEmployeeId(Number((e.target as HTMLSelectElement).value) || null)}
              disabled={!!entry}
            >
              <option value="">직원 선택</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department}{emp.team ? ` · ${emp.team}` : ""})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="발급일">
              <Input type="date" value={issue} onChange={(e) => setIssue((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="만료일 (통상 1년)">
              <Input type="date" value={expiry} onChange={(e) => setExpiry((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="보건증 사진">
            <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer w-fit">
              <Camera className="w-4 h-4 text-[var(--text-3)]" />
              <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{photo ? "교체" : "업로드"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="보건증" className="mt-2 max-h-32 rounded border border-[var(--border-1)]" />
            )}
          </Field>
          <Field label="상태">
            <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
              <option value="valid">유효</option>
              <option value="pending">발급 대기</option>
              <option value="revoked">폐기·취소</option>
            </Select>
          </Field>
          <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[var(--r-md)] p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--warning-fg)] mt-0.5" />
            <p className="text-[var(--fs-caption)] text-[var(--warning-fg)]">
              만료일이 D-30 이내가 되면 해당 직원의 출퇴근이 자동으로 차단됩니다. 근로자에게 미리 재발급 안내를 보내주세요.
            </p>
          </div>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving || !employeeId || !issue || !expiry}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
