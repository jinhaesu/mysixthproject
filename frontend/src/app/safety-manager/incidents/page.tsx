"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, AlertOctagon, Filter, Save, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  listIncidents,
  createIncident,
  listSafetyAreas,
  type Incident,
  type SafetyArea,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  reported: "발생 접수",
  investigating: "원인 조사 중",
  reported_to_labor: "산재 신고 완료",
  closed: "종결",
};

const SEVERITY_OPTIONS: Array<[string, string]> = [
  ["minor", "경상 (1일 미만)"],
  ["moderate", "중경상 (3일 미만 휴업)"],
  ["serious", "중상 (3일 이상 휴업)"],
  ["fatal", "사망"],
];

function statusBadge(s: string) {
  if (s === "closed") return <Badge tone="success">종결</Badge>;
  if (s === "reported_to_labor") return <Badge tone="brand">산재 신고 완료</Badge>;
  if (s === "investigating") return <Badge tone="warning">원인 조사 중</Badge>;
  return <Badge tone="danger">발생 접수</Badge>;
}

export default function IncidentsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Incident[]>([]);
  const [areas, setAreas] = useState<SafetyArea[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [yearF, setYearF] = useState<string>(String(new Date().getFullYear()));
  const [statusF, setStatusF] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await listSafetyAreas();
        setAreas(res.areas);
      } catch (e: any) {
        toast.error(e.message);
      }
    })();
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listIncidents({
        year: yearF ? Number(yearF) : undefined,
        status: statusF || undefined,
      });
      setItems(res.items);
      setSummary(res.summary);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [yearF, statusF, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="산업재해 (Incidents)"
        description="산업재해 발생 등록 → 원인 분석 → 재발방지 대책 → 산업재해조사표 제출. 중대재해 자동 판별 (사망·3개월 이상 요양) · 조사표 제출 기한 카운트다운."
      />

      {/* Filter */}
      <Card>
        <div className="p-5 flex flex-wrap items-end gap-3">
          <Field label="연도">
            <Input value={yearF} onChange={(e) => setYearF((e.target as HTMLInputElement).value)} className="w-24" />
          </Field>
          <Field label="상태">
            <Select value={statusF} onChange={(e) => setStatusF((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </Select>
          </Field>
          <Button onClick={load} variant="secondary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            새로고침
          </Button>
          <div className="ml-auto">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> 재해 등록
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="전체" value={summary.total} tone="neutral" />
          <SummaryTile label="중대재해" value={summary.critical} tone="danger" />
          <SummaryTile label="조사표 제출 필요" value={summary.requires_report} tone="warning" />
          <SummaryTile label="조사표 지연" value={summary.report_overdue} tone="danger" />
          <SummaryTile label="종결" value={summary.closed} tone="success" />
        </div>
      )}

      {/* List */}
      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">등록된 재해가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {items.map((i) => (
                <Link
                  key={i.id}
                  href={`/safety-manager/incidents/detail?id=${i.id}`}
                  className="block border border-[var(--border-1)] rounded-[var(--r-lg)] p-4 hover:bg-[var(--bg-2)]/40"
                >
                  <div className="flex items-start gap-3">
                    <AlertOctagon className={`w-5 h-5 shrink-0 mt-0.5 ${i.is_critical ? "text-[var(--danger-fg)]" : "text-[var(--warning-fg)]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">
                          {i.injured_name || "미기재"} · {i.injury_body_part || "부위 미기재"}
                        </h4>
                        {i.is_critical ? <Badge tone="danger">중대재해</Badge> : null}
                        {statusBadge(i.status)}
                        {i.requires_report && !i.report_submitted_at && (
                          i.is_report_overdue
                            ? <Badge tone="danger">조사표 지연</Badge>
                            : <Badge tone="warning">조사표 제출 필요 (D-{i.days_until_deadline ?? "?"})</Badge>
                        )}
                        {i.report_submitted_at && <Badge tone="success">조사표 제출</Badge>}
                      </div>
                      <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1 truncate">{i.description || "-"}</p>
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-2 flex flex-wrap items-center gap-3">
                        <span>발생: {new Date(i.occurred_at).toLocaleString("ko-KR")}</span>
                        {(i.area_name || i.area_name_lookup) && <span>구역: {i.area_name || i.area_name_lookup}</span>}
                        {i.hospitalization_days > 0 && <span>휴업: {i.hospitalization_days}일</span>}
                        {i.report_deadline && <span>조사표 기한: {i.report_deadline}</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      {createOpen && (
        <CreateModal
          areas={areas}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" | "brand" }) {
  const toneClass = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
    brand: "bg-[#5E6AD220] border-[#5E6AD244] text-[var(--brand-400)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-lg)] border p-4 ${toneClass}`}>
      <div className="text-[var(--fs-caption)] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
    </div>
  );
}

function CreateModal({ areas, onClose, onSaved }: { areas: SafetyArea[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const now = new Date();
  const nowIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [occurredAt, setOccurredAt] = useState(nowIso);
  const [areaId, setAreaId] = useState("");
  const [injuredName, setInjuredName] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [hospDays, setHospDays] = useState("0");
  const [description, setDescription] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [firstAid, setFirstAid] = useState("");
  const [hospitalTransfer, setHospitalTransfer] = useState(false);
  const [saving, setSaving] = useState(false);

  const days = Number(hospDays) || 0;
  const willBeCritical = severity === "fatal" || days >= 90;
  const willNeedReport = willBeCritical || severity === "serious" || days >= 3;

  const save = async () => {
    if (!occurredAt || !description) { toast.error("발생 시각과 설명은 필수입니다."); return; }
    setSaving(true);
    try {
      const res = await createIncident({
        occurred_at: new Date(occurredAt).toISOString(),
        area_id: areaId ? Number(areaId) : undefined,
        injured_name: injuredName,
        injury_body_part: bodyPart,
        injury_severity: severity,
        hospitalization_days: days,
        description,
        witnesses,
        first_aid_notes: firstAid,
        hospital_transfer: hospitalTransfer,
      });
      if (res.is_critical) {
        toast.error(`중대재해로 자동 판정 · 조사표 기한 ${res.report_deadline}`);
      } else if (res.requires_report) {
        toast.success(`재해 등록 · 산업재해조사표 제출 필요 (기한 ${res.report_deadline})`);
      } else {
        toast.success("재해 등록");
      }
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
        <div className="pb-4 border-b border-[var(--border-1)] mb-4">
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-[var(--danger-fg)]" />
            새 재해 등록
          </h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            심각도·휴업일에 따라 중대재해·산업재해조사표 제출 필요 여부가 자동 판별됩니다.
          </p>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="발생 시각 *">
              <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="구역">
              <Select value={areaId} onChange={(e) => setAreaId((e.target as HTMLSelectElement).value)}>
                <option value="">-</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="재해자">
              <Input value={injuredName} onChange={(e) => setInjuredName((e.target as HTMLInputElement).value)} placeholder="이름" />
            </Field>
            <Field label="상해 부위">
              <Input value={bodyPart} onChange={(e) => setBodyPart((e.target as HTMLInputElement).value)} placeholder="예: 오른손 검지" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="심각도">
              <Select value={severity} onChange={(e) => setSeverity((e.target as HTMLSelectElement).value)}>
                {SEVERITY_OPTIONS.map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </Select>
            </Field>
            <Field label="예상 휴업일(요양)">
              <Input type="number" value={hospDays} onChange={(e) => setHospDays((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          {(willBeCritical || willNeedReport) && (
            <div className={`p-3 rounded-[var(--r-md)] border flex items-start gap-2 ${willBeCritical ? "border-[var(--danger-border)] bg-[var(--danger-bg)]" : "border-[var(--warning-border)] bg-[var(--warning-bg)]"}`}>
              <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${willBeCritical ? "text-[var(--danger-fg)]" : "text-[var(--warning-fg)]"}`} />
              <div className="text-[var(--fs-caption)]">
                {willBeCritical
                  ? "중대재해로 판정 예정 — 지방고용노동관서 즉시 신고 대상."
                  : "3일 이상 휴업 재해 — 산업재해조사표 30일 이내 제출 대상."}
              </div>
            </div>
          )}
          <Field label="발생 경위 *">
            <Textarea value={description} onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)} rows={4} placeholder="언제·어디서·무엇을 하다가·어떻게 다쳤는지 구체적으로" />
          </Field>
          <Field label="목격자 (쉼표 구분)">
            <Input value={witnesses} onChange={(e) => setWitnesses((e.target as HTMLInputElement).value)} placeholder="홍길동, 김OO" />
          </Field>
          <Field label="응급조치 내용">
            <Textarea value={firstAid} onChange={(e) => setFirstAid((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="예: 세척·지혈·냉찜질 후 근처 의원 이송" />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={hospitalTransfer} onChange={(e) => setHospitalTransfer(e.target.checked)} className="w-4 h-4" />
            <span className="text-[var(--fs-body)] text-[var(--text-2)]">병원 이송 실시</span>
          </label>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 등록</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
