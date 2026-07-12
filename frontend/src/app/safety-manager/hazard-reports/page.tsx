"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, ShieldAlert, MessageSquare, Filter, Save, Send } from "lucide-react";
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
  listHazardReports,
  assessHazardReport,
  replyToHazardReport,
  patchHazardReport,
  type HazardReport,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  reported: "미판정",
  assessed: "판정 완료",
  in_progress: "조치 중",
  closed: "종결",
};

const HAZARD_TYPE_LABEL: Record<string, string> = {
  burn: "화상·고온",
  cut: "베임·절단",
  slip: "미끄러짐·넘어짐",
  electric: "감전·전기",
  cold: "동상·저온",
  machine: "기계 협착·끼임",
  fall: "추락·낙하",
  chemical: "유해가스·화학물질",
  pest: "이물·해충",
  other: "기타",
};

function statusBadge(s: string) {
  if (s === "closed") return <Badge tone="success">종결</Badge>;
  if (s === "in_progress") return <Badge tone="brand">조치 중</Badge>;
  if (s === "assessed") return <Badge tone="warning">판정 완료</Badge>;
  return <Badge tone="danger">미판정</Badge>;
}
function gradeBadge(g: string | null) {
  if (!g) return <Badge tone="neutral">미판정</Badge>;
  if (g === "high") return <Badge tone="danger">고위험</Badge>;
  if (g === "mid") return <Badge tone="warning">중위험</Badge>;
  return <Badge tone="success">저위험</Badge>;
}

export default function HazardReportsPage() {
  const toast = useToast();
  const [reports, setReports] = useState<HazardReport[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusF, setStatusF] = useState("");
  const [selected, setSelected] = useState<HazardReport | null>(null);
  const [mode, setMode] = useState<"assess" | "reply" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHazardReports({ status: statusF || undefined });
      setReports(res.reports);
      setSummary(res.summary);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusF, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="아차사고·위험요인 처리"
        description="근로자 신고 접수 → 빈도·강도 3×3 매트릭스 판정 → 조치 티켓 자동 생성 → 신고자 회신 통보."
      />

      {/* Filter */}
      <Card>
        <div className="p-5 flex flex-wrap items-end gap-3">
          <Field label="상태">
            <Select value={statusF} onChange={(e) => setStatusF((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              <option value="reported">미판정</option>
              <option value="assessed">판정 완료</option>
              <option value="in_progress">조치 중</option>
              <option value="closed">종결</option>
            </Select>
          </Field>
          <Button onClick={load} variant="secondary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            새로고침
          </Button>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="전체" value={summary.total} tone="neutral" />
          <SummaryTile label="미판정" value={summary.reported} tone="danger" />
          <SummaryTile label="판정 완료" value={summary.assessed} tone="warning" />
          <SummaryTile label="조치 중" value={summary.in_progress} tone="brand" />
          <SummaryTile label="종결" value={summary.closed} tone="success" />
        </div>
      )}

      {/* List */}
      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">조회된 신고가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <div key={r.id} className="border border-[var(--border-1)] rounded-[var(--r-lg)] p-4 hover:bg-[var(--bg-2)]/30">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className={`w-5 h-5 shrink-0 mt-0.5 ${r.status === "reported" ? "text-[var(--danger-fg)]" : "text-[var(--text-3)]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">
                          {HAZARD_TYPE_LABEL[r.hazard_type] || r.hazard_type}
                        </h4>
                        {statusBadge(r.status)}
                        {gradeBadge(r.grade)}
                        {r.is_anonymous ? <Badge tone="neutral">익명</Badge> : null}
                      </div>
                      <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1">{r.description || "설명 없음"}</p>
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-2 flex flex-wrap items-center gap-3">
                        <span>{new Date(r.created_at).toLocaleString("ko-KR")}</span>
                        {r.area_name && <span>구역: {r.area_name}</span>}
                        {!r.is_anonymous && r.reporter_name && <span>신고자: {r.reporter_name}</span>}
                        {r.ticket_id && <span>티켓 #{r.ticket_id} · {r.ticket_status || "-"}</span>}
                      </div>
                      {r.photo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photo_url} alt="첨부 사진" className="mt-2 max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
                      )}
                      {r.response_to_reporter && (
                        <div className="mt-2 pt-2 border-t border-[var(--border-1)] text-[var(--fs-caption)] text-[var(--text-2)]">
                          <span className="font-medium text-[var(--brand-400)]">회신 완료: </span>{r.response_to_reporter}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => { setSelected(r); setMode("assess"); }}
                        variant={r.status === "reported" ? "primary" : "secondary"}
                      >
                        판정
                      </Button>
                      {!r.is_anonymous && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setSelected(r); setMode("reply"); }}
                        >
                          회신
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {mode === "assess" && selected && (
        <AssessModal
          report={selected}
          onClose={() => { setSelected(null); setMode(null); }}
          onSaved={() => { setSelected(null); setMode(null); load(); }}
        />
      )}
      {mode === "reply" && selected && (
        <ReplyModal
          report={selected}
          onClose={() => { setSelected(null); setMode(null); }}
          onSaved={() => { setSelected(null); setMode(null); load(); }}
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

function AssessModal({ report, onClose, onSaved }: { report: HazardReport; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [freq, setFreq] = useState<number>(report.freq_score || 0);
  const [intensity, setIntensity] = useState<number>(report.intensity_score || 0);
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const product = freq && intensity ? freq * intensity : 0;
  const grade = product >= 6 ? "high" : product >= 3 ? "mid" : product > 0 ? "low" : null;

  const save = async () => {
    if (!freq || !intensity) {
      toast.error("빈도와 강도를 모두 선택해주세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await assessHazardReport(report.id, {
        freq_score: freq, intensity_score: intensity,
        assignee_name: assignee, due_date: dueDate || undefined,
      });
      toast.success(`판정 완료. 티켓 #${res.ticket_id} 생성.`);
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
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">위험도 판정 (3×3 매트릭스)</h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            #{report.id} · {HAZARD_TYPE_LABEL[report.hazard_type] || report.hazard_type} · {report.description || "설명 없음"}
          </p>
        </div>
        <div className="space-y-4">
          {/* 매트릭스 */}
          <div>
            <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)] mb-2">등급 매트릭스</p>
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="w-24 text-[var(--fs-caption)] text-[var(--text-3)] p-2">빈도 ↓ / 강도 →</th>
                    {[1, 2, 3].map((i) => (
                      <th key={i} className="w-20 text-[var(--fs-caption)] text-[var(--text-3)] p-2">
                        {i === 1 ? "경미" : i === 2 ? "중대" : "치명"}<br/>({i})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[3, 2, 1].map((f) => (
                    <tr key={f}>
                      <td className="text-[var(--fs-caption)] text-[var(--text-3)] p-2 text-right">
                        {f === 3 ? "자주" : f === 2 ? "가끔" : "드물게"}<br/>({f})
                      </td>
                      {[1, 2, 3].map((i) => {
                        const p = f * i;
                        const g = p >= 6 ? "high" : p >= 3 ? "mid" : "low";
                        const active = freq === f && intensity === i;
                        const cellBg = g === "high" ? "bg-[var(--danger-bg)] hover:bg-[var(--danger-fg)] hover:text-white"
                          : g === "mid" ? "bg-[var(--warning-bg)] hover:bg-[var(--warning-fg)] hover:text-white"
                          : "bg-[var(--success-bg)] hover:bg-[var(--success-fg)] hover:text-white";
                        const activeCls = active ? (g === "high" ? "bg-[var(--danger-fg)] text-white" : g === "mid" ? "bg-[var(--warning-fg)] text-white" : "bg-[var(--success-fg)] text-white") : cellBg;
                        return (
                          <td key={i} className="p-1">
                            <button
                              type="button"
                              onClick={() => { setFreq(f); setIntensity(i); }}
                              className={`w-full py-4 rounded-[var(--r-md)] border border-[var(--border-2)] font-semibold text-[var(--fs-body)] transition-colors ${activeCls}`}
                            >
                              {p}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {grade && (
              <div className="mt-3 p-3 rounded-[var(--r-md)] bg-[var(--bg-2)] flex items-center gap-2">
                <span className="text-[var(--fs-body)] text-[var(--text-2)]">최종 등급:</span>
                {gradeBadge(grade)}
                <span className="text-[var(--fs-caption)] text-[var(--text-3)]">
                  · 기본 기한: {grade === "high" ? "3일" : grade === "mid" ? "7일" : "14일"}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="담당자 (선택)">
              <Input placeholder="예: 홍길동" value={assignee} onChange={(e) => setAssignee((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="완료 기한 (선택)">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
            저장 시 조치 티켓이 자동 생성되며, 티켓 페이지에서 이행 여부를 추적합니다.
          </p>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving || !grade}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 판정 저장 & 티켓 생성</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReplyModal({ report, onClose, onSaved }: { report: HazardReport; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(report.response_to_reporter || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) { toast.error("회신 내용을 입력해주세요."); return; }
    setSaving(true);
    try {
      await replyToHazardReport(report.id, text.trim());
      toast.success("회신 내용이 저장되었습니다.");
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
            <MessageSquare className="w-4 h-4 text-[var(--brand-400)]" />
            신고자 회신
          </h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            수신: {report.reporter_name || "익명"} {report.reporter_phone ? `(${report.reporter_phone})` : ""}
          </p>
        </div>
        <Field label="회신 문구">
          <Textarea
            value={text}
            onChange={(e) => setText((e.target as HTMLTextAreaElement).value)}
            rows={5}
            placeholder="예: 오븐존 미끄럼 방지 매트 교체 완료. 신고 감사드립니다."
          />
        </Field>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Send className="w-4 h-4" /> 회신 저장</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
