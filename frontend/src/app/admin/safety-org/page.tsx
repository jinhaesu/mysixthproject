"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, RefreshCw, Plus, Save, PenLine, Crown, ShieldCheck,
  Heart, HardHat, Users, Award, Timer, AlertTriangle, CheckCircle,
  Link as LinkIcon, ClipboardList,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast, StatTile,
} from "@/components/ui";
import {
  listSafetyOrgPositions, patchSafetyOrgPosition, createSafetyOrgPosition,
  getSafetyOrgHistory, getSafetyOrgCompliance,
  getRegularEmployees,
  type SafetyOrgPosition, type SafetyOrgComplianceResponse,
  type SafetyOrgHistoryEntry, type SafetyOrgHoursSummary,
} from "@/lib/api";

const POSITION_KEY_LABEL: Record<string, string> = {
  ceo: "대표이사",
  chief: "안전보건관리책임자",
  safety_mgr: "안전관리자",
  health_mgr: "보건관리자",
  worker_rep: "근로자대표",
  supervisor: "관리감독자",
  honor_inspector: "명예감독관",
};

const POSITION_KEY_ICON: Record<string, any> = {
  ceo: Crown,
  chief: ShieldCheck,
  safety_mgr: ShieldCheck,
  health_mgr: Heart,
  worker_rep: Users,
  supervisor: HardHat,
  honor_inspector: Award,
};

// 트리 계층 — 각 position_key 의 depth 계산 (parent_position_id 무관하게 기본 depth 매핑)
const KEY_DEPTH: Record<string, number> = {
  ceo: 0,
  chief: 1,
  safety_mgr: 2,
  health_mgr: 2,
  worker_rep: 2,
  supervisor: 3,
  honor_inspector: 3,
};

const ACTION_LABEL: Record<string, string> = {
  appoint: "선임",
  resign: "해임",
  change: "변경",
  certification_update: "자격 갱신",
};

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return Number(n).toFixed(digits);
}

interface EmpLite { id: number; name: string; phone?: string; department?: string; role?: string; is_active?: number; }

export default function SafetyOrgPage() {
  const toast = useToast();
  const [positions, setPositions] = useState<SafetyOrgPosition[]>([]);
  const [compliance, setCompliance] = useState<SafetyOrgComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // 편집 모달
  const [editing, setEditing] = useState<SafetyOrgPosition | null>(null);
  const [editForm, setEditForm] = useState({
    employee_id: "" as string | number,
    employee_name: "",
    appointed_at: "",
    appointment_doc_url: "",
    certification_name: "",
    certification_no: "",
    department: "",
    is_concurrent: 0 as 0 | 1,
    statutory_min_hours: 0 as number,
    notes: "",
    status: "active",
  });

  // 근로자 검색
  const [empSearch, setEmpSearch] = useState("");
  const [empList, setEmpList] = useState<EmpLite[]>([]);
  const [empLoading, setEmpLoading] = useState(false);

  // 히스토리
  const [historyOpen, setHistoryOpen] = useState<SafetyOrgPosition | null>(null);
  const [history, setHistory] = useState<SafetyOrgHistoryEntry[]>([]);

  // 신규 직위 추가 (관리감독자 등 다중 선임)
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    position_key: "supervisor",
    position_name: "",
    department: "",
    is_concurrent: false,
    statutory_min_hours: 0,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [posRes, compRes] = await Promise.all([
        listSafetyOrgPositions(),
        getSafetyOrgCompliance(),
      ]);
      setPositions(posRes.positions);
      setCompliance(compRes);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const searchEmployees = useCallback(async (q: string) => {
    setEmpLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.search = q;
      const res = await getRegularEmployees(params);
      const arr = Array.isArray(res) ? res : (res.employees || res.items || res.data || []);
      setEmpList(arr.slice(0, 40));
    } catch (e: any) {
      toast.error(e.message || "직원 검색 실패");
    } finally { setEmpLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (editing) {
      searchEmployees("");
    }
  }, [editing, searchEmployees]);

  const openEdit = (p: SafetyOrgPosition) => {
    setEditing(p);
    setEditForm({
      employee_id: p.employee_id ?? "",
      employee_name: p.employee_name || "",
      appointed_at: p.appointed_at || "",
      appointment_doc_url: p.appointment_doc_url || "",
      certification_name: p.certification_name || "",
      certification_no: p.certification_no || "",
      department: p.department || "",
      is_concurrent: p.is_concurrent ? 1 : 0,
      statutory_min_hours: Number(p.statutory_min_hours) || 0,
      notes: p.notes || "",
      status: p.status || "active",
    });
    setEmpSearch("");
  };

  const doSave = async () => {
    if (!editing) return;
    try {
      await patchSafetyOrgPosition(editing.id, {
        employee_id: editForm.employee_id === "" ? null : Number(editForm.employee_id),
        appointed_at: editForm.appointed_at || null,
        appointment_doc_url: editForm.appointment_doc_url,
        certification_name: editForm.certification_name,
        certification_no: editForm.certification_no,
        department: editForm.department,
        is_concurrent: !!editForm.is_concurrent,
        statutory_min_hours: Number(editForm.statutory_min_hours) || 0,
        notes: editForm.notes,
        status: editForm.status,
      });
      toast.success("저장 완료");
      setEditing(null);
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const openHistory = async (p: SafetyOrgPosition) => {
    setHistoryOpen(p);
    setHistory([]);
    try {
      const res = await getSafetyOrgHistory(p.id);
      setHistory(res.history);
    } catch (e: any) { toast.error(e.message); }
  };

  const doAdd = async () => {
    try {
      if (!addForm.position_key) { toast.error("직위 유형 선택"); return; }
      await createSafetyOrgPosition({
        position_key: addForm.position_key,
        position_name: addForm.position_name || undefined,
        department: addForm.department || undefined,
        is_concurrent: addForm.is_concurrent,
        statutory_min_hours: Number(addForm.statutory_min_hours) || 0,
        notes: addForm.notes || undefined,
      });
      toast.success("직위 추가 완료");
      setAddOpen(false);
      setAddForm({
        position_key: "supervisor",
        position_name: "",
        department: "",
        is_concurrent: false,
        statutory_min_hours: 0,
        notes: "",
      });
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  // 트리 구성 — depth 별 그룹
  const grouped = useMemo(() => {
    const buckets: Record<number, SafetyOrgPosition[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const p of positions) {
      const d = KEY_DEPTH[p.position_key] ?? 3;
      (buckets[d] || (buckets[d] = [])).push(p);
    }
    return buckets;
  }, [positions]);

  const hoursByPositionId = useMemo(() => {
    const m = new Map<number, SafetyOrgHoursSummary>();
    for (const h of compliance?.hours_summary || []) m.set(h.position_id, h);
    return m;
  }, [compliance]);

  const requiredMissingCount = compliance?.missing.length || 0;
  const anyShortHours = (compliance?.hours_summary || []).some(h => (h.gauge_pct ?? 0) < 100);
  const complianceOk = !requiredMissingCount && !anyShortHours;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전보건 조직"
        title="안전보건 조직도 · 선임계"
        description="중처법 시행령 §4-2(업무 총괄 조직·인력)와 §4-6(법정 인력 배치·업무시간 보장) 통합 관리. 대표이사·안전보건관리책임자·안전관리자·보건관리자·관리감독자·근로자대표 선임과 겸직 시 업무시간 요건을 여기서 관리한다."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> 직위 추가</Button>
          </div>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile
          label="필수 직위 배치"
          value={compliance ? `${(compliance.required_keys.length - compliance.missing.length)} / ${compliance.required_keys.length}` : "-"}
          unit=""
          hint={requiredMissingCount
            ? `누락 ${requiredMissingCount}건: ${compliance!.missing.map(m => m.position_name).join(", ")}`
            : "5개 필수 직위(대표이사·책임자·안전·보건·근로자대표) 모두 배치"}
          icon={<ShieldCheck size={14} />}
          iconTone={requiredMissingCount ? "danger" : "success"}
        />
        <StatTile
          label={`겸직 관리자 반기 시간 (${compliance?.period.label || "-"})`}
          value={compliance ? fmt((compliance.hours_summary || []).reduce((s, h) => s + h.half_hours, 0)) : "-"}
          unit="시간"
          hint={`목표 대비 부족 ${(compliance?.hours_summary || []).filter(h => (h.gauge_pct ?? 0) < 100).length}명`}
          icon={<Timer size={14} />}
          iconTone={anyShortHours ? "warning" : "success"}
        />
        <StatTile
          label="전체 준수 상태"
          value={complianceOk ? "적합" : "미흡"}
          unit=""
          hint={complianceOk
            ? "필수 배치·법정 시간 모두 충족"
            : "선임 배치 또는 겸직 시간 부족 존재"}
          icon={complianceOk ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          iconTone={complianceOk ? "success" : "danger"}
        />
      </div>

      {/* 조직도 트리 */}
      <Card>
        <div className="p-5 space-y-6">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">조직도</h3>
          </div>

          {loading && positions.length === 0 && (
            <div className="text-center text-[var(--text-3)] py-6">
              <Loader2 className="w-5 h-5 animate-spin inline" /> 불러오는 중…
            </div>
          )}

          {[0, 1, 2, 3].map((depth) => {
            const rows = grouped[depth] || [];
            if (rows.length === 0) return null;
            return (
              <div key={depth} className="space-y-2">
                <div className="text-[var(--fs-caption)] uppercase tracking-wider text-[var(--text-3)]">
                  {depth === 0 && "총괄"}
                  {depth === 1 && "안전보건관리책임자"}
                  {depth === 2 && "법정 선임 인력"}
                  {depth === 3 && "현장 감독·감시"}
                </div>
                <div className={depth === 0
                  ? "grid grid-cols-1 md:grid-cols-1 gap-3"
                  : depth === 1
                  ? "grid grid-cols-1 md:grid-cols-2 gap-3"
                  : "grid grid-cols-1 md:grid-cols-3 gap-3"}>
                  {rows.map((p) => (
                    <PositionCard
                      key={p.id}
                      p={p}
                      hours={hoursByPositionId.get(p.id) || null}
                      onEdit={() => openEdit(p)}
                      onHistory={() => openHistory(p)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 겸직 관리자 시간 요약 표 */}
      {compliance && (compliance.hours_summary || []).length > 0 && (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
                겸직 관리자 시간 요건 ({compliance.period.label})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="text-[var(--fs-caption)] text-[var(--text-3)] border-b border-[var(--border-1)]">
                  <tr>
                    <th className="text-left px-3 py-2">직위</th>
                    <th className="text-left px-3 py-2">선임자</th>
                    <th className="text-right px-3 py-2">반기 실적(h)</th>
                    <th className="text-right px-3 py-2">목표(h)</th>
                    <th className="text-right px-3 py-2">달성률</th>
                    <th className="text-right px-3 py-2">부족(h)</th>
                    <th className="text-center px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.hours_summary.map((h) => {
                    const ok = (h.gauge_pct ?? 0) >= 100;
                    return (
                      <tr key={h.position_id} className="border-t border-[var(--border-1)]">
                        <td className="px-3 py-2">{h.position_name}</td>
                        <td className="px-3 py-2">{h.employee_name || <span className="text-[var(--text-3)]">미배치</span>}</td>
                        <td className="px-3 py-2 text-right tabular">{fmt(h.half_hours)}</td>
                        <td className="px-3 py-2 text-right tabular">{fmt(h.statutory_min_hours)}</td>
                        <td className="px-3 py-2 text-right tabular">{h.gauge_pct !== null ? `${fmt(h.gauge_pct)}%` : "-"}</td>
                        <td className="px-3 py-2 text-right tabular">{h.shortfall_hours > 0 ? fmt(h.shortfall_hours) : "-"}</td>
                        <td className="px-3 py-2 text-center">
                          {ok ? <Badge tone="success">달성</Badge> : <Badge tone="danger">부족</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* 편집 모달 */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.position_name} 선임 정보` : ""} size="lg">
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="선임 근로자 검색">
                <div className="flex gap-2">
                  <Input
                    value={empSearch}
                    onChange={(e) => setEmpSearch((e.target as HTMLInputElement).value)}
                    placeholder="이름/전화 검색"
                  />
                  <Button variant="secondary" onClick={() => searchEmployees(empSearch)}>
                    {empLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "검색"}
                  </Button>
                </div>
              </Field>
              <Field label="선택된 근로자">
                <Select
                  value={String(editForm.employee_id || "")}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    const emp = empList.find(x => String(x.id) === v);
                    setEditForm({
                      ...editForm,
                      employee_id: v ? Number(v) : "",
                      employee_name: emp?.name || "",
                      department: editForm.department || emp?.department || "",
                    });
                  }}
                >
                  <option value="">(미배치)</option>
                  {editForm.employee_id && !empList.some(x => x.id === editForm.employee_id) && (
                    <option value={String(editForm.employee_id)}>{editForm.employee_name} (id={editForm.employee_id})</option>
                  )}
                  {empList.map((e) => (
                    <option key={e.id} value={String(e.id)}>
                      {e.name} · {e.department || "-"} · {e.role || "일반"}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="선임일(배치일)">
                <Input type="date" value={editForm.appointed_at || ""} onChange={(e) => setEditForm({ ...editForm, appointed_at: (e.target as HTMLInputElement).value })} />
              </Field>
              <Field label="부서">
                <Input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: (e.target as HTMLInputElement).value })} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="자격증명">
                <Input value={editForm.certification_name} onChange={(e) => setEditForm({ ...editForm, certification_name: (e.target as HTMLInputElement).value })} placeholder="예: 산업안전산업기사" />
              </Field>
              <Field label="자격번호">
                <Input value={editForm.certification_no} onChange={(e) => setEditForm({ ...editForm, certification_no: (e.target as HTMLInputElement).value })} placeholder="예: 12-345678" />
              </Field>
            </div>

            <Field label="선임계 파일/URL">
              <Input value={editForm.appointment_doc_url} onChange={(e) => setEditForm({ ...editForm, appointment_doc_url: (e.target as HTMLInputElement).value })} placeholder="https://..." />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="겸직 여부">
                <Select
                  value={String(editForm.is_concurrent)}
                  onChange={(e) => setEditForm({ ...editForm, is_concurrent: Number((e.target as HTMLSelectElement).value) === 1 ? 1 : 0 })}
                >
                  <option value="0">전임</option>
                  <option value="1">겸직</option>
                </Select>
              </Field>
              <Field label="법정 최소시간(연/h)">
                <Input
                  type="number"
                  value={editForm.statutory_min_hours}
                  onChange={(e) => setEditForm({ ...editForm, statutory_min_hours: Number((e.target as HTMLInputElement).value) || 0 })}
                  disabled={!editForm.is_concurrent}
                />
              </Field>
              <Field label="상태">
                <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: (e.target as HTMLSelectElement).value })}>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </Select>
              </Field>
            </div>

            <Field label="비고">
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: (e.target as HTMLTextAreaElement).value })} />
            </Field>

            <div className="flex justify-between items-center">
              <Button variant="secondary" onClick={() => openHistory(editing)}>
                <ClipboardList className="w-4 h-4" /> 이력 보기
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>취소</Button>
                <Button onClick={doSave}><Save className="w-4 h-4" /> 저장</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 히스토리 모달 */}
      <Modal open={!!historyOpen} onClose={() => setHistoryOpen(null)} title={historyOpen ? `${historyOpen.position_name} 이력` : ""} size="md">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-center py-6 text-[var(--text-3)]">이력이 없습니다.</div>
          ) : history.map((h) => (
            <div key={h.id} className="border border-[var(--border-1)] rounded-lg p-3">
              <div className="flex items-center justify-between text-[var(--fs-caption)]">
                <Badge tone={h.action === "appoint" ? "success" : h.action === "resign" ? "danger" : "neutral"}>
                  {ACTION_LABEL[h.action] || h.action}
                </Badge>
                <span className="text-[var(--text-3)]">{h.occurred_at?.slice(0, 19).replace("T", " ")}</span>
              </div>
              {h.notes && <div className="text-[var(--fs-body)] text-[var(--text-1)] mt-1">{h.notes}</div>}
              {h.details_json && Object.keys(h.details_json || {}).length > 0 && (
                <pre className="mt-1 text-[10px] text-[var(--text-3)] whitespace-pre-wrap">{JSON.stringify(h.details_json, null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* 직위 추가 모달 */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="직위 추가 (관리감독자 등)" size="md">
        <div className="space-y-3">
          <Field label="직위 유형">
            <Select
              value={addForm.position_key}
              onChange={(e) => {
                const key = (e.target as HTMLSelectElement).value;
                const concurrent = key === "safety_mgr" || key === "health_mgr";
                setAddForm({
                  ...addForm,
                  position_key: key,
                  is_concurrent: concurrent,
                  statutory_min_hours: concurrent ? 685 : 0,
                });
              }}
            >
              <option value="supervisor">관리감독자</option>
              <option value="honor_inspector">명예감독관</option>
              <option value="chief">안전보건관리책임자(추가)</option>
              <option value="safety_mgr">안전관리자(추가)</option>
              <option value="health_mgr">보건관리자(추가)</option>
              <option value="worker_rep">근로자대표(추가)</option>
            </Select>
          </Field>
          <Field label="표시 이름 (미입력 시 기본값 사용)">
            <Input value={addForm.position_name} onChange={(e) => setAddForm({ ...addForm, position_name: (e.target as HTMLInputElement).value })} placeholder={POSITION_KEY_LABEL[addForm.position_key] || ""} />
          </Field>
          <Field label="부서">
            <Input value={addForm.department} onChange={(e) => setAddForm({ ...addForm, department: (e.target as HTMLInputElement).value })} placeholder="예: 생산 A조" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="겸직 여부">
              <Select
                value={addForm.is_concurrent ? "1" : "0"}
                onChange={(e) => setAddForm({ ...addForm, is_concurrent: (e.target as HTMLSelectElement).value === "1" })}
              >
                <option value="0">전임</option>
                <option value="1">겸직</option>
              </Select>
            </Field>
            <Field label="법정 최소시간(연/h)">
              <Input
                type="number"
                value={addForm.statutory_min_hours}
                onChange={(e) => setAddForm({ ...addForm, statutory_min_hours: Number((e.target as HTMLInputElement).value) || 0 })}
                disabled={!addForm.is_concurrent}
              />
            </Field>
          </div>
          <Field label="비고">
            <Textarea rows={3} value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={doAdd}><Plus className="w-4 h-4" /> 추가</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PositionCard({
  p, hours, onEdit, onHistory,
}: {
  p: SafetyOrgPosition;
  hours: SafetyOrgHoursSummary | null;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const Icon = POSITION_KEY_ICON[p.position_key] || Users;
  const assigned = !!p.employee_id || !!p.employee_name;
  const gauge = hours && hours.gauge_pct !== null ? Math.min(150, hours.gauge_pct) : 0;
  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-[var(--brand-400)]">
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{p.position_name}</div>
              {p.is_concurrent ? <Badge tone="warning">겸직</Badge> : <Badge tone="brand">전임</Badge>}
              {p.status !== "active" && <Badge tone="neutral">{p.status}</Badge>}
            </div>
            {p.department && <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5">{p.department}</div>}
          </div>
        </div>

        {assigned ? (
          <div className="text-[var(--fs-body)]">
            <div className="font-medium text-[var(--text-1)]">{p.employee_name || `emp#${p.employee_id}`}</div>
            {p.appointed_at && <div className="text-[var(--fs-caption)] text-[var(--text-3)]">선임 {p.appointed_at}</div>}
            {p.certification_name && (
              <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
                자격 {p.certification_name}{p.certification_no ? ` · ${p.certification_no}` : ""}
              </div>
            )}
            {p.appointment_doc_url && (
              <a
                href={p.appointment_doc_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--fs-caption)] text-[var(--brand-400)] hover:underline mt-1"
              >
                <LinkIcon size={11} /> 선임계
              </a>
            )}
          </div>
        ) : (
          <div className="text-[var(--fs-body)] text-[var(--danger-fg)] flex items-center gap-1">
            <AlertTriangle size={14} /> 미배치 — 선임 필요
          </div>
        )}

        {/* 겸직 관리자 시간 게이지 */}
        {p.is_concurrent && Number(p.statutory_min_hours) > 0 && hours && (
          <div>
            <div className="flex items-center justify-between text-[var(--fs-caption)] text-[var(--text-3)]">
              <span>반기 실적</span>
              <span>{fmt(hours.half_hours)}h / {fmt(hours.statutory_min_hours)}h</span>
            </div>
            <div className="relative w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mt-1">
              <div
                className={`h-full ${gauge >= 100 ? "bg-[var(--success-fg)]" : gauge >= 80 ? "bg-[var(--warning-fg)]" : "bg-[var(--danger-fg)]"}`}
                style={{ width: `${Math.min(150, gauge)}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] text-[var(--text-3)]">
              달성률 {hours.gauge_pct !== null ? `${fmt(hours.gauge_pct)}%` : "-"}
              {hours.shortfall_hours > 0 && ` · 부족 ${fmt(hours.shortfall_hours)}h`}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="xs" onClick={onHistory}>
            <ClipboardList className="w-3.5 h-3.5" /> 이력
          </Button>
          <Button size="xs" onClick={onEdit}>
            <PenLine className="w-3.5 h-3.5" /> 편집
          </Button>
        </div>
      </div>
    </Card>
  );
}
