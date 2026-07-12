"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Loader2, Ticket, Filter, Calendar, Save, Camera } from "lucide-react";
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
  listSafetyAreas,
  listTickets,
  patchTicket,
  type SafetyArea,
  type SafetyTicket,
} from "@/lib/api";

const SEVERITY_LABEL: Record<string, string> = {
  low: "낮음", mid: "보통", high: "높음", critical: "치명",
};
const STATUS_LABEL: Record<string, string> = {
  open: "미착수", in_progress: "진행중", done: "완료",
};

function severityBadge(s: string) {
  if (s === "critical") return <Badge tone="danger">치명</Badge>;
  if (s === "high") return <Badge tone="danger">높음</Badge>;
  if (s === "mid") return <Badge tone="warning">보통</Badge>;
  return <Badge tone="neutral">낮음</Badge>;
}
function statusBadge(s: string, overdue: boolean) {
  if (s === "done") return <Badge tone="success">완료</Badge>;
  if (s === "in_progress") return overdue ? <Badge tone="danger">진행중 · 지연</Badge> : <Badge tone="brand">진행중</Badge>;
  return overdue ? <Badge tone="danger">지연</Badge> : <Badge tone="warning">미착수</Badge>;
}

export default function TicketsPage() {
  const toast = useToast();
  const [areas, setAreas] = useState<SafetyArea[]>([]);
  const [tickets, setTickets] = useState<SafetyTicket[]>([]);
  const [summary, setSummary] = useState<{ total: number; open: number; in_progress: number; done: number; overdue: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusF, setStatusF] = useState<string>("");
  const [severityF, setSeverityF] = useState<string>("");
  const [areaF, setAreaF] = useState<string>("");
  const [overdueF, setOverdueF] = useState<boolean>(false);
  const [selected, setSelected] = useState<SafetyTicket | null>(null);

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
      const res = await listTickets({
        status: statusF || undefined,
        severity: severityF || undefined,
        area_id: areaF ? Number(areaF) : undefined,
        overdue: overdueF,
      });
      setTickets(res.tickets);
      setSummary(res.summary);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusF, severityF, areaF, overdueF, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="조치 티켓"
        description="아차사고·순회점검·셀프체크 이상 등 모든 조치 요구 사항의 이행 상태를 관리합니다."
      />

      {/* Filters */}
      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-3">
          <Field label="상태">
            <Select value={statusF} onChange={(e) => setStatusF((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              <option value="open">미착수</option>
              <option value="in_progress">진행중</option>
              <option value="done">완료</option>
            </Select>
          </Field>
          <Field label="심각도">
            <Select value={severityF} onChange={(e) => setSeverityF((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              <option value="critical">치명</option>
              <option value="high">높음</option>
              <option value="mid">보통</option>
              <option value="low">낮음</option>
            </Select>
          </Field>
          <Field label="구역">
            <Select value={areaF} onChange={(e) => setAreaF((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={overdueF} onChange={(e) => setOverdueF(e.target.checked)} className="w-4 h-4" />
              <span className="text-[var(--fs-body)] text-[var(--text-2)]">기한 초과만</span>
            </label>
          </div>
          <div className="flex items-end">
            <Button onClick={load} variant="secondary" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
              새로고침
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="전체" value={summary.total} tone="neutral" />
          <SummaryTile label="미착수" value={summary.open} tone="warning" />
          <SummaryTile label="진행중" value={summary.in_progress} tone="brand" />
          <SummaryTile label="완료" value={summary.done} tone="success" />
          <SummaryTile label="기한 초과" value={summary.overdue} tone="danger" />
        </div>
      )}

      {/* List */}
      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">조회된 티켓이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">제목</th>
                    <th className="text-left py-2 pr-3">출처</th>
                    <th className="text-left py-2 pr-3">구역</th>
                    <th className="text-left py-2 pr-3">심각도</th>
                    <th className="text-left py-2 pr-3">담당</th>
                    <th className="text-left py-2 pr-3">기한</th>
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3">
                        <p className="font-medium text-[var(--text-1)]">{t.title}</p>
                        {t.description && <p className="text-[var(--fs-caption)] text-[var(--text-3)] truncate max-w-md">{t.description}</p>}
                      </td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] text-[var(--text-2)]">
                        {t.source_type === "hazard" ? "아차사고" : t.source_type === "inspection" ? "순회점검" : t.source_type}
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{t.area_name || "-"}</td>
                      <td className="py-2 pr-3">{severityBadge(t.severity)}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{t.assignee_name || <span className="text-[var(--text-4)]">미지정</span>}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{t.due_date || "-"}</td>
                      <td className="py-2 pr-3">{statusBadge(t.status, !!t.is_overdue)}</td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => setSelected(t)}
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

      {/* Edit modal */}
      {selected && (
        <TicketEditModal
          ticket={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
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

function TicketEditModal({ ticket, onClose, onSaved }: { ticket: SafetyTicket; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description || "");
  const [severity, setSeverity] = useState(ticket.severity);
  const [status, setStatus] = useState(ticket.status);
  const [assignee, setAssignee] = useState(ticket.assignee_name || "");
  const [dueDate, setDueDate] = useState(ticket.due_date || "");
  const [completionNotes, setCompletionNotes] = useState(ticket.completion_notes || "");
  const [completionPhoto, setCompletionPhoto] = useState(ticket.completion_photo_url || "");
  const [saving, setSaving] = useState(false);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("사진은 5MB 이하만 첨부 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => setCompletionPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchTicket(ticket.id, {
        title,
        description,
        severity,
        status,
        assignee_name: assignee,
        due_date: dueDate || undefined,
        completion_notes: completionNotes,
        completion_photo_url: completionPhoto,
      });
      toast.success("티켓이 업데이트되었습니다.");
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
            <Ticket className="w-4 h-4 text-[var(--brand-400)]" />
            티켓 #{ticket.id} 편집
          </h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            출처: {ticket.source_type === "hazard" ? "아차사고" : ticket.source_type === "inspection" ? "순회점검" : ticket.source_type}
            {ticket.area_name && ` · ${ticket.area_name}`}
          </p>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="제목">
            <Input value={title} onChange={(e) => setTitle((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="설명">
            <Textarea value={description} onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="심각도">
              <Select value={severity} onChange={(e) => setSeverity((e.target as HTMLSelectElement).value)}>
                <option value="low">낮음</option>
                <option value="mid">보통</option>
                <option value="high">높음</option>
                <option value="critical">치명</option>
              </Select>
            </Field>
            <Field label="상태">
              <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
                <option value="open">미착수</option>
                <option value="in_progress">진행중</option>
                <option value="done">완료</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="담당자">
              <Input placeholder="예: 홍길동" value={assignee} onChange={(e) => setAssignee((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="완료 기한">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          {(status === "done" || status === "in_progress") && (
            <>
              <Field label="완료 사진 (증거)">
                <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer hover:bg-[var(--bg-2)] w-fit">
                  <Camera className="w-4 h-4 text-[var(--text-3)]" />
                  <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{completionPhoto ? "사진 교체" : "사진 업로드"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </label>
                {completionPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={completionPhoto} alt="완료 증거" className="mt-2 max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
                )}
              </Field>
              <Field label="완료·조치 노트">
                <Textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes((e.target as HTMLTextAreaElement).value)}
                  rows={3}
                  placeholder="어떤 조치를 했는지, 재발 방지 대책"
                />
              </Field>
            </>
          )}
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
