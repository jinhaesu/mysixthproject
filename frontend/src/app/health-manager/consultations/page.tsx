"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, MessageSquare, ShieldAlert } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  listHealthConsultations,
  createHealthConsultation,
  getRegularEmployees,
  type HealthConsultation,
} from "@/lib/api";

const TYPE_OPTIONS: Array<[string, string]> = [
  ["general", "일반 상담"],
  ["injury", "재해·상해"],
  ["chronic", "만성질환 관리"],
  ["stress", "직무 스트레스"],
  ["hearing", "청력 관련"],
  ["MSDS", "화학물질 노출"],
  ["other", "기타"],
];
function typeLabel(t: string) {
  return TYPE_OPTIONS.find(([code]) => code === t)?.[1] || t;
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function HealthConsultationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<HealthConsultation[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: number; name: string; department: string; team: string }>>([]);
  const [loading, setLoading] = useState(false);

  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(todayKST());
  const [type, setType] = useState<string>("general");
  const [complaint, setComplaint] = useState("");
  const [action, setAction] = useState("");
  const [followup, setFollowup] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHealthConsultations();
      setItems(res.consultations);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

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

  const save = async () => {
    if (!employeeId) { toast.error("직원을 선택해주세요."); return; }
    setSaving(true);
    try {
      await createHealthConsultation({
        employee_id: employeeId,
        consultation_date: date,
        consultation_type: type,
        chief_complaint: complaint,
        action_taken: action,
        next_followup_date: followup || null,
      });
      toast.success("상담 기록이 저장되었습니다.");
      setComplaint("");
      setAction("");
      setFollowup("");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="보건관리자 점검"
        title="건강상담 기록"
        description="근로자 건강 상담 이력 관리. 개인정보 접근권한이 있는 보건관리자만 사용해주세요."
      />

      <Card>
        <div className="p-4 bg-[var(--warning-bg)] border-l-4 border-[var(--warning-border)] rounded-[var(--r-md)] flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[var(--warning-fg)] shrink-0 mt-0.5" />
          <div>
            <p className="text-[var(--fs-body)] font-semibold text-[var(--warning-fg)]">개인정보 처리 유의</p>
            <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] mt-1 opacity-90">
              건강상담 기록은 민감정보로 분류됩니다. 산업안전보건법 제132조 및 개인정보보호법에 따라 열람·기록은 보건관리자 및 지정 담당자로 제한됩니다.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">새 상담 기록</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="상담 대상 직원">
              <Select value={employeeId ?? ""} onChange={(e) => setEmployeeId(Number((e.target as HTMLSelectElement).value) || null)}>
                <option value="">직원 선택</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.department}{emp.team ? ` · ${emp.team}` : ""})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="상담일">
              <Input type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="상담 유형">
              <Select value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value)}>
                {TYPE_OPTIONS.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="주 호소 (Chief Complaint)">
            <Textarea rows={2} value={complaint} onChange={(e) => setComplaint((e.target as HTMLTextAreaElement).value)} placeholder="예: 우측 팔목 통증 3일째" />
          </Field>
          <Field label="조치 사항">
            <Textarea rows={2} value={action} onChange={(e) => setAction((e.target as HTMLTextAreaElement).value)} placeholder="예: 냉찜질 안내, 정형외과 진료 권고" />
          </Field>
          <Field label="다음 추적일 (선택)">
            <Input type="date" value={followup} onChange={(e) => setFollowup((e.target as HTMLInputElement).value)} />
          </Field>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !employeeId}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] mb-3">상담 이력</h3>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-3)]">등록된 상담 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">상담일</th>
                    <th className="text-left py-2 pr-3">직원</th>
                    <th className="text-left py-2 pr-3">유형</th>
                    <th className="text-left py-2 pr-3">호소</th>
                    <th className="text-left py-2 pr-3">조치</th>
                    <th className="text-left py-2 pr-3">추적일</th>
                    <th className="text-left py-2 pr-3">담당</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-1)]">
                      <td className="py-2 pr-3 tabular">{r.consultation_date}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.employee_name}</div>
                        <div className="text-[var(--fs-caption)] text-[var(--text-3)]">{r.employee_department || "-"} {r.employee_team || ""}</div>
                      </td>
                      <td className="py-2 pr-3"><Badge tone="brand">{typeLabel(r.consultation_type)}</Badge></td>
                      <td className="py-2 pr-3 text-[var(--text-2)] truncate max-w-xs">{r.chief_complaint || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)] truncate max-w-xs">{r.action_taken || "-"}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-3)]">{r.next_followup_date || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] text-[var(--text-3)]">{r.consulted_by_name || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
