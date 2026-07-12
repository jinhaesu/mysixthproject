"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Save, AlertOctagon, AlertTriangle, FileText, CheckCircle } from "lucide-react";
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
  getIncident,
  patchIncident,
  submitIncidentReport,
  type Incident,
} from "@/lib/api";

const SEVERITY_LABEL: Record<string, string> = {
  minor: "경상",
  moderate: "중경상",
  serious: "중상 (3일↑ 휴업)",
  fatal: "사망",
};

const STATUS_LABEL: Record<string, string> = {
  reported: "발생 접수",
  investigating: "원인 조사 중",
  reported_to_labor: "산재 신고 완료",
  closed: "종결",
};

function statusBadge(s: string) {
  if (s === "closed") return <Badge tone="success">종결</Badge>;
  if (s === "reported_to_labor") return <Badge tone="brand">산재 신고 완료</Badge>;
  if (s === "investigating") return <Badge tone="warning">원인 조사 중</Badge>;
  return <Badge tone="danger">발생 접수</Badge>;
}

export default function IncidentDetailPage() {
  const params = useSearchParams();
  const id = Number(params?.get("id") || 0);
  const toast = useToast();
  const [inc, setInc] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Editable state
  const [causeState, setCauseState] = useState("");
  const [causeAction, setCauseAction] = useState("");
  const [causeManagerial, setCauseManagerial] = useState("");
  const [mitigation, setMitigation] = useState("");
  const [status, setStatus] = useState("reported");
  const [hospDays, setHospDays] = useState("0");
  const [severity, setSeverity] = useState("minor");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getIncident(id);
      setInc(res.item);
      setCauseState(res.item.cause_unsafe_state || "");
      setCauseAction(res.item.cause_unsafe_action || "");
      setCauseManagerial(res.item.cause_managerial || "");
      setMitigation(res.item.mitigation || "");
      setStatus(res.item.status || "reported");
      setHospDays(String(res.item.hospitalization_days || 0));
      setSeverity(res.item.injury_severity || "minor");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const save = async () => {
    setSaving(true);
    try {
      await patchIncident(id, {
        cause_unsafe_state: causeState,
        cause_unsafe_action: causeAction,
        cause_managerial: causeManagerial,
        mitigation,
        status,
        hospitalization_days: Number(hospDays) || 0,
        injury_severity: severity,
      });
      toast.success("저장 완료");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !inc) {
    return <div className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>;
  }
  if (!inc) return null;

  const overdueBanner = inc.is_report_overdue;
  const needReport = inc.requires_report && !inc.report_submitted_at;

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/safety-manager/incidents" className="text-[var(--fs-caption)] text-[var(--text-3)] hover:text-[var(--text-1)] flex items-center gap-1 mb-3">
          <ArrowLeft className="w-3 h-3" /> 재해 목록
        </Link>
        <PageHeader
          eyebrow={`재해 #${inc.id}`}
          title={`${inc.injured_name || "미기재"} · ${inc.injury_body_part || "부위 미기재"}`}
          description={`발생 ${new Date(inc.occurred_at).toLocaleString("ko-KR")} · ${inc.area_name || inc.area_name_lookup || "구역 미기재"}`}
        />
      </div>

      {/* 중대재해·조사표 배너 */}
      {(inc.is_critical || needReport) && (
        <div className={`rounded-[var(--r-lg)] border p-4 ${overdueBanner ? "border-[var(--danger-border)] bg-[var(--danger-bg)]" : inc.is_critical ? "border-[var(--danger-border)] bg-[var(--danger-bg)]" : "border-[var(--warning-border)] bg-[var(--warning-bg)]"}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-[var(--text-1)]">
                {inc.is_critical
                  ? "중대재해 (중대재해처벌법 §2 · 산안법 §54) — 지방고용노동관서 즉시 신고 대상"
                  : "3일 이상 휴업 재해 — 산업재해조사표 제출 대상"}
              </p>
              <p className="text-[var(--fs-caption)] text-[var(--text-2)] mt-1">
                조사표 기한: <span className="font-semibold tabular">{inc.report_deadline || "-"}</span>
                {inc.days_until_deadline != null && (
                  <span className={`ml-2 font-semibold ${overdueBanner ? "text-[var(--danger-fg)]" : "text-[var(--warning-fg)]"}`}>
                    {inc.days_until_deadline < 0
                      ? `${Math.abs(inc.days_until_deadline)}일 지연`
                      : inc.days_until_deadline === 0
                      ? "오늘 마감"
                      : `D-${inc.days_until_deadline}`}
                  </span>
                )}
              </p>
              {inc.report_submitted_at ? (
                <div className="mt-2 flex items-center gap-2 text-[var(--fs-caption)]">
                  <CheckCircle className="w-4 h-4 text-[var(--success-fg)]" />
                  <span>제출 완료: {new Date(inc.report_submitted_at).toLocaleString("ko-KR")}</span>
                </div>
              ) : (
                <Button size="sm" className="mt-2" onClick={() => setReportOpen(true)}>
                  <FileText className="w-3.5 h-3.5" /> 조사표 제출 등록
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 개요 */}
      <Card>
        <div className="p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {inc.is_critical ? <Badge tone="danger">중대재해</Badge> : null}
            {statusBadge(inc.status)}
            <Badge tone="neutral">심각도: {SEVERITY_LABEL[inc.injury_severity] || inc.injury_severity || "-"}</Badge>
            <Badge tone="neutral">휴업일: {inc.hospitalization_days}일</Badge>
          </div>
          <div>
            <p className="text-[var(--fs-caption)] text-[var(--text-3)]">발생 경위</p>
            <p className="text-[var(--fs-body)] text-[var(--text-1)] mt-1 whitespace-pre-wrap">{inc.description || "-"}</p>
          </div>
          {inc.witnesses && (
            <div>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)]">목격자</p>
              <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1">{inc.witnesses}</p>
            </div>
          )}
          {inc.first_aid_notes && (
            <div>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)]">응급조치</p>
              <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1">{inc.first_aid_notes}</p>
            </div>
          )}
        </div>
      </Card>

      {/* 원인 분석 (4M) + 재발방지 */}
      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">원인 분석 (재해통계원인 3분류)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="심각도 재판정">
              <Select value={severity} onChange={(e) => setSeverity((e.target as HTMLSelectElement).value)}>
                {Object.entries(SEVERITY_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </Select>
            </Field>
            <Field label="휴업일 (요양) 재입력">
              <Input type="number" value={hospDays} onChange={(e) => setHospDays((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="불안전한 상태 (설비·환경)">
            <Textarea value={causeState} onChange={(e) => setCauseState((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="예: 안전문 인터록 미작동" />
          </Field>
          <Field label="불안전한 행동 (작업자)">
            <Textarea value={causeAction} onChange={(e) => setCauseAction((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="예: 안전문 열고 손 삽입" />
          </Field>
          <Field label="관리적 원인">
            <Textarea value={causeManagerial} onChange={(e) => setCauseManagerial((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="예: 작업 절차서 미비, 안전교육 부족" />
          </Field>
          <Field label="재발 방지 대책">
            <Textarea value={mitigation} onChange={(e) => setMitigation((e.target as HTMLTextAreaElement).value)} rows={3} placeholder="예: 인터록 재점검·재교육·LOTO 절차 강화" />
          </Field>
          <Field label="상태">
            <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
            </Button>
          </div>
        </div>
      </Card>

      {reportOpen && (
        <ReportSubmitModal
          incidentId={id}
          onClose={() => setReportOpen(false)}
          onSaved={() => { setReportOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function ReportSubmitModal({ incidentId, onClose, onSaved }: { incidentId: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [receiptUrl, setReceiptUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await submitIncidentReport(incidentId, { report_receipt_url: receiptUrl });
      toast.success("산업재해조사표 제출 완료");
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
        <div className="pb-4 border-b border-[var(--border-1)] mb-4">
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--brand-400)]" />
            산업재해조사표 제출 등록
          </h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            제출한 조사표 접수증 URL(선택)을 함께 기록하세요.
          </p>
        </div>
        <Field label="접수증 URL (선택)">
          <Input value={receiptUrl} onChange={(e) => setReceiptUrl((e.target as HTMLInputElement).value)} placeholder="https://..." />
        </Field>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 제출 완료</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
