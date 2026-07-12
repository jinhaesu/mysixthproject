"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Plus, CalendarCheck, Stethoscope, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Textarea,
  Modal,
  useToast,
} from "@/components/ui";
import {
  listHealthCheckups,
  createHealthCheckup,
  patchHealthCheckup,
  getRegularEmployees,
  type HealthCheckup,
} from "@/lib/api";

const TYPE_OPTIONS: Array<[string, string]> = [
  ["general", "일반건강진단"],
  ["special", "특수건강진단"],
  ["placement", "배치전"],
  ["temp", "임시"],
];
function typeLabel(t: string) { return TYPE_OPTIONS.find(([c]) => c === t)?.[1] || t; }

export default function CheckupsPage() {
  const toast = useToast();
  const [items, setItems] = useState<HealthCheckup[]>([]);
  const [summary, setSummary] = useState<{ total: number; received: number; not_received: number; followup: number } | null>(null);
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; department: string; team: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [type, setType] = useState<string>("");
  const [followupOnly, setFollowupOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HealthCheckup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHealthCheckups({
        year: year ? Number(year) : undefined,
        type: type || undefined,
        followup_only: followupOnly,
      });
      setItems(res.checkups);
      setSummary(res.summary);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, type, followupOnly, toast]);

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
        title="건강진단 관리"
        description="산업안전보건법 제129~130조 — 일반·특수건강진단 대상자 및 사후관리 트래킹."
      />

      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-3">
          <Field label="연도">
            <Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} placeholder="2026" />
          </Field>
          <Field label="진단 유형">
            <Select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {TYPE_OPTIONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={followupOnly} onChange={(e) => setFollowupOnly(e.target.checked)} className="w-4 h-4" />
              <span className="text-[var(--fs-body)] text-[var(--text-2)]">사후조치 필요만</span>
            </label>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "새로고침"}
            </Button>
          </div>
          <div className="flex items-end">
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> 대상자 추가
            </Button>
          </div>
        </div>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="전체" value={summary.total} tone="neutral" />
          <SummaryTile label="수검 완료" value={summary.received} tone="success" />
          <SummaryTile label="미수검" value={summary.not_received} tone="warning" />
          <SummaryTile label="사후조치 필요" value={summary.followup} tone="danger" />
        </div>
      )}

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">대상자 / 이력</h3>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-3)]">조회된 대상자가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">직원</th>
                    <th className="text-left py-2 pr-3">부서</th>
                    <th className="text-left py-2 pr-3">유형</th>
                    <th className="text-left py-2 pr-3">예정</th>
                    <th className="text-left py-2 pr-3">수검일</th>
                    <th className="text-left py-2 pr-3">판정</th>
                    <th className="text-left py-2 pr-3">사후조치</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => {
                    const followupOpen = r.followup_required === 1 && !r.followup_completed_at;
                    return (
                      <tr key={r.id} className="border-b border-[var(--border-1)]">
                        <td className="py-2 pr-3 font-medium">{r.employee_name}</td>
                        <td className="py-2 pr-3 text-[var(--text-2)]">
                          {r.employee_department || "-"} {r.employee_team ? ` · ${r.employee_team}` : ""}
                        </td>
                        <td className="py-2 pr-3"><Badge tone="brand">{typeLabel(r.checkup_type)}</Badge></td>
                        <td className="py-2 pr-3 tabular text-[var(--text-2)]">{r.scheduled_year || "-"} / {r.scheduled_month || "-"}</td>
                        <td className="py-2 pr-3 tabular">
                          {r.received_at ? (
                            new Date(r.received_at).toLocaleDateString("ko-KR")
                          ) : (
                            <span className="text-[var(--warning-fg)] font-semibold">미수검</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-[var(--text-2)]">{r.result_grade || "-"}</td>
                        <td className="py-2 pr-3">
                          {r.followup_required ? (
                            followupOpen ? <Badge tone="danger">진행 필요</Badge> : <Badge tone="success">완료</Badge>
                          ) : <span className="text-[var(--text-4)]">-</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            onClick={() => setEditing(r)}
                            className="text-[var(--brand-500)] hover:text-[var(--brand-400)] text-[var(--fs-caption)] underline"
                          >
                            결과 입력
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {creating && (
        <CheckupCreateModal
          employees={employees}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {editing && (
        <CheckupEditModal
          entry={editing}
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

function CheckupCreateModal({
  employees, onClose, onSaved,
}: {
  employees: Array<{ id: number; name: string; department: string; team: string }>;
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [type, setType] = useState<string>("general");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!employeeId) { toast.error("직원을 선택해주세요."); return; }
    setSaving(true);
    try {
      await createHealthCheckup({
        employee_id: employeeId,
        checkup_type: type,
        scheduled_year: year ? Number(year) : undefined,
        scheduled_month: month || undefined,
      });
      toast.success("대상자 등록 완료");
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
          <Stethoscope className="w-5 h-5 text-[var(--brand-400)]" /> 새 건강진단 대상 등록
        </h3>
        <div className="space-y-3">
          <Field label="직원">
            <Select value={employeeId ?? ""} onChange={(e) => setEmployeeId(Number((e.target as HTMLSelectElement).value) || null)}>
              <option value="">직원 선택</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.department}{emp.team ? ` · ${emp.team}` : ""})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="진단 유형">
            <Select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value)}>
              {TYPE_OPTIONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="예정 연도">
              <Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} placeholder="2026" />
            </Field>
            <Field label="예정 월">
              <Input value={month} onChange={(e) => setMonth((e.target as HTMLInputElement).value)} placeholder="예: 05" />
            </Field>
          </div>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving || !employeeId}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CheckupEditModal({ entry, onClose, onSaved }: { entry: HealthCheckup; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [receivedAt, setReceivedAt] = useState(entry.received_at ? entry.received_at.slice(0, 10) : "");
  const [grade, setGrade] = useState(entry.result_grade);
  const [notes, setNotes] = useState(entry.result_notes);
  const [followupRequired, setFollowupRequired] = useState(!!entry.followup_required);
  const [followupActions, setFollowupActions] = useState(entry.followup_actions);
  const [followupCompletedAt, setFollowupCompletedAt] = useState(entry.followup_completed_at ? entry.followup_completed_at.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await patchHealthCheckup(entry.id, {
        received_at: receivedAt || undefined,
        result_grade: grade,
        result_notes: notes,
        followup_required: followupRequired ? 1 : 0,
        followup_actions: followupActions,
        followup_completed_at: followupCompletedAt || undefined,
      });
      toast.success("업데이트 완료");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg">
      <div>
        <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] pb-4 border-b border-[var(--border-1)] mb-4">
          {entry.employee_name} — {typeLabel(entry.checkup_type)} 결과 입력
        </h3>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="수검일">
              <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="판정 결과 (예: A/B/C1/C2/D1/D2/R)">
              <Input value={grade} onChange={(e) => setGrade((e.target as HTMLInputElement).value)} placeholder="A" />
            </Field>
          </div>
          <Field label="결과 노트">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="특이 소견, 재검 사유 등" />
          </Field>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={followupRequired} onChange={(e) => setFollowupRequired(e.target.checked)} className="w-4 h-4" />
            <span className="text-[var(--fs-body)] font-medium text-[var(--danger-fg)]">사후조치 필요 (유소견자)</span>
          </label>

          {followupRequired && (
            <>
              <Field label="사후조치 내용">
                <Textarea rows={2} value={followupActions} onChange={(e) => setFollowupActions((e.target as HTMLTextAreaElement).value)} placeholder="작업전환, 근로시간 단축, 정밀검사 등" />
              </Field>
              <Field label="사후조치 완료일">
                <Input type="date" value={followupCompletedAt} onChange={(e) => setFollowupCompletedAt((e.target as HTMLInputElement).value)} />
              </Field>
              {!followupCompletedAt && (
                <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[var(--r-md)] p-3 flex items-center gap-2 text-[var(--warning-fg)]">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-[var(--fs-caption)]">사후조치 미완료 상태로 저장됩니다.</span>
                </div>
              )}
            </>
          )}
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
