"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Users, Filter, Save, Edit3 } from "lucide-react";
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
  listCommitteeMinutes,
  createCommitteeMinute,
  patchCommitteeMinute,
  type CommitteeMinute,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  finalized: "확정",
  posted: "게시 완료",
};

function statusBadge(s: string) {
  if (s === "posted") return <Badge tone="success">게시 완료</Badge>;
  if (s === "finalized") return <Badge tone="brand">확정</Badge>;
  return <Badge tone="neutral">작성 중</Badge>;
}

export default function CommitteePage() {
  const toast = useToast();
  const [items, setItems] = useState<CommitteeMinute[]>([]);
  const [loading, setLoading] = useState(false);
  const [yearF, setYearF] = useState<string>(String(new Date().getFullYear()));
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CommitteeMinute | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCommitteeMinutes(yearF ? Number(yearF) : undefined);
      setItems(res.items);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [yearF, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="산업안전보건위원회"
        description="산업안전보건법 24조 위원회 회의록 — 분기별 개최, 노사 동수 참여, 보고사항·의결사항·근로자 대표 의견 기록."
      />

      {/* Filter */}
      <Card>
        <div className="p-5 flex flex-wrap items-end gap-3">
          <Field label="연도">
            <Input value={yearF} onChange={(e) => setYearF((e.target as HTMLInputElement).value)} className="w-24" />
          </Field>
          <Button onClick={load} variant="secondary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            새로고침
          </Button>
          <div className="ml-auto">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> 회의록 등록
            </Button>
          </div>
        </div>
      </Card>

      {/* Quarterly grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((q) => {
          const m = items.find(i => i.quarter === q);
          return (
            <Card key={q}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--brand-400)]" />
                    <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{yearF}년 {q}분기</h3>
                  </div>
                  {m ? statusBadge(m.status) : <Badge tone="warning">미개최</Badge>}
                </div>
                {m ? (
                  <div className="space-y-2">
                    <div className="text-[var(--fs-body)] text-[var(--text-2)]">
                      개최: {new Date(m.held_at).toLocaleString("ko-KR")}
                    </div>
                    {m.location && (
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)]">장소: {m.location}</div>
                    )}
                    <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
                      참석: 사용자 측 {(m.participants_employer || "").split(",").filter(Boolean).length}명 · 근로자 측 {(m.participants_worker || "").split(",").filter(Boolean).length}명
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                      <Edit3 className="w-3.5 h-3.5" /> 상세·편집
                    </Button>
                  </div>
                ) : (
                  <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
                    아직 등록된 회의록이 없습니다.
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-6 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
      )}

      {createOpen && (
        <MinuteModal
          mode="create"
          initial={null}
          defaultYear={Number(yearF) || new Date().getFullYear()}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); }}
        />
      )}
      {editing && (
        <MinuteModal
          mode="edit"
          initial={editing}
          defaultYear={editing.year}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function MinuteModal({ mode, initial, defaultYear, onClose, onSaved }: {
  mode: "create" | "edit";
  initial: CommitteeMinute | null;
  defaultYear: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const nowIso = (() => {
    const d = initial ? new Date(initial.held_at) : new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  })();
  const [year, setYear] = useState<string>(String(initial?.year || defaultYear));
  const [quarter, setQuarter] = useState<string>(String(initial?.quarter || 1));
  const [heldAt, setHeldAt] = useState(nowIso);
  const [location, setLocation] = useState(initial?.location || "");
  const [agendaReported, setAgendaReported] = useState(initial?.agenda_reported || "");
  const [agendaDecided, setAgendaDecided] = useState(initial?.agenda_decided || "");
  const [decisions, setDecisions] = useState(initial?.decisions || "");
  const [workerRepInput, setWorkerRepInput] = useState(initial?.worker_rep_input || "");
  const [participantsEmp, setParticipantsEmp] = useState(initial?.participants_employer || "");
  const [participantsWkr, setParticipantsWkr] = useState(initial?.participants_worker || "");
  const [status, setStatus] = useState(initial?.status || "draft");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!heldAt) { toast.error("개최 일시를 입력해주세요."); return; }
    setSaving(true);
    try {
      if (mode === "create") {
        await createCommitteeMinute({
          year: Number(year), quarter: Number(quarter),
          held_at: new Date(heldAt).toISOString(),
          location, agenda_reported: agendaReported, agenda_decided: agendaDecided,
          decisions, worker_rep_input: workerRepInput,
          participants_employer: participantsEmp,
          participants_worker: participantsWkr,
        });
        toast.success("회의록 등록");
      } else if (initial) {
        await patchCommitteeMinute(initial.id, {
          held_at: new Date(heldAt).toISOString(),
          location, agenda_reported: agendaReported, agenda_decided: agendaDecided,
          decisions, worker_rep_input: workerRepInput,
          participants_employer: participantsEmp,
          participants_worker: participantsWkr,
          status,
        });
        toast.success("저장 완료");
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
            <Users className="w-4 h-4 text-[var(--brand-400)]" />
            {mode === "create" ? "회의록 등록" : `회의록 #${initial?.id} 편집`}
          </h3>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <Field label="연도">
              <Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} disabled={mode === "edit"} />
            </Field>
            <Field label="분기">
              <Select value={quarter} onChange={(e) => setQuarter((e.target as HTMLSelectElement).value)} disabled={mode === "edit"}>
                <option value="1">1분기</option>
                <option value="2">2분기</option>
                <option value="3">3분기</option>
                <option value="4">4분기</option>
              </Select>
            </Field>
            <Field label="개최 일시 *">
              <Input type="datetime-local" value={heldAt} onChange={(e) => setHeldAt((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <Field label="장소">
            <Input value={location} onChange={(e) => setLocation((e.target as HTMLInputElement).value)} placeholder="예: 본사 2층 회의실" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="참석자 (사용자 측, 쉼표 구분)">
              <Textarea value={participantsEmp} onChange={(e) => setParticipantsEmp((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="대표이사, 공장장, 안전보건관리자" />
            </Field>
            <Field label="참석자 (근로자 측, 쉼표 구분)">
              <Textarea value={participantsWkr} onChange={(e) => setParticipantsWkr((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="근로자 대표, 조장A, 조장B" />
            </Field>
          </div>
          <Field label="보고사항 (전 분기 이행실적·재해·순회점검 등)">
            <Textarea value={agendaReported} onChange={(e) => setAgendaReported((e.target as HTMLTextAreaElement).value)} rows={4} />
          </Field>
          <Field label="심의·의결 안건">
            <Textarea value={agendaDecided} onChange={(e) => setAgendaDecided((e.target as HTMLTextAreaElement).value)} rows={4} />
          </Field>
          <Field label="의결 결과">
            <Textarea value={decisions} onChange={(e) => setDecisions((e.target as HTMLTextAreaElement).value)} rows={3} />
          </Field>
          <Field label="근로자 대표 의견">
            <Textarea value={workerRepInput} onChange={(e) => setWorkerRepInput((e.target as HTMLTextAreaElement).value)} rows={3} />
          </Field>
          {mode === "edit" && (
            <Field label="상태">
              <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </Select>
            </Field>
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
