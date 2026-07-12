"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, ArrowLeft, Save, ShieldAlert, Users, CheckCircle, FileText } from "lucide-react";
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
  getRiskAssessment,
  patchRiskAssessment,
  addRiskAssessmentItem,
  addRiskAssessmentParticipant,
  patchRiskAssessmentParticipant,
  type RiskAssessment,
  type RiskAssessmentItem,
  type RiskAssessmentParticipant,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  in_review: "검토 중",
  posted: "게시(공람)",
  reported: "대표자 보고",
  closed: "종결",
};

function gradeBadge(g: string | null) {
  if (!g) return <Badge tone="neutral">-</Badge>;
  if (g === "high") return <Badge tone="danger">고위험</Badge>;
  if (g === "mid") return <Badge tone="warning">중위험</Badge>;
  return <Badge tone="success">저위험</Badge>;
}
function statusBadge(s: string) {
  if (s === "closed") return <Badge tone="success">종결</Badge>;
  if (s === "reported") return <Badge tone="success">대표자 보고</Badge>;
  if (s === "posted") return <Badge tone="brand">게시</Badge>;
  if (s === "in_review") return <Badge tone="warning">검토 중</Badge>;
  return <Badge tone="neutral">작성 중</Badge>;
}

export default function RiskAssessmentDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const toast = useToast();
  const [ra, setRa] = useState<RiskAssessment | null>(null);
  const [items, setItems] = useState<RiskAssessmentItem[]>([]);
  const [participants, setParticipants] = useState<RiskAssessmentParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [partOpen, setPartOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRiskAssessment(id);
      setRa(res.assessment);
      setItems(res.items);
      setParticipants(res.participants);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { if (id) load(); }, [id, load]);

  const doWorkflow = async (action: "in_review" | "posted" | "reported" | "closed") => {
    try {
      const body: any = { status: action };
      if (action === "posted") body.posted = true;
      if (action === "reported") body.ceo_reported = true;
      await patchRiskAssessment(id, body);
      toast.success("상태 업데이트");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading && !ra) {
    return <div className="p-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>;
  }
  if (!ra) return null;

  const signedCount = participants.filter(p => p.signed_at).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/safety-manager/risk-assessment" className="text-[var(--fs-caption)] text-[var(--text-3)] hover:text-[var(--text-1)] flex items-center gap-1 mb-3">
          <ArrowLeft className="w-3 h-3" /> 위험성평가 목록
        </Link>
        <PageHeader
          eyebrow={`위험성평가 #${ra.id}`}
          title={ra.title}
          description={`${ra.year}년 · ${ra.kind === "regular" ? "정기" : ra.kind === "ad_hoc" ? "수시" : "최초"} · ${ra.triggered_by || "계기 미기입"}`}
        />
      </div>

      {/* 워크플로 5단계 */}
      <Card>
        <div className="p-5">
          <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)] mb-3">진행 상태</p>
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(ra.status)}
            <div className="flex gap-1 ml-auto flex-wrap">
              {ra.status === "draft" && (
                <Button size="sm" variant="secondary" onClick={() => doWorkflow("in_review")}>검토 요청</Button>
              )}
              {(ra.status === "draft" || ra.status === "in_review") && (
                <Button size="sm" variant="secondary" onClick={() => doWorkflow("posted")}>게시(공람) 완료</Button>
              )}
              {ra.status === "posted" && (
                <Button size="sm" onClick={() => doWorkflow("reported")}>대표자 보고 완료</Button>
              )}
              {ra.status === "reported" && (
                <Button size="sm" variant="secondary" onClick={() => doWorkflow("closed")}>종결</Button>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[var(--fs-caption)] text-[var(--text-3)]">
            <div>등록: {new Date(ra.created_at).toLocaleDateString("ko-KR")}</div>
            <div>게시: {ra.posted_at ? new Date(ra.posted_at).toLocaleDateString("ko-KR") : "-"}</div>
            <div>대표자 보고: {ra.ceo_reported_at ? new Date(ra.ceo_reported_at).toLocaleDateString("ko-KR") : "-"}</div>
          </div>
        </div>
      </Card>

      {/* 유해요인·조치 항목 */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">유해요인·조치 항목 ({items.length})</h3>
            </div>
            <Button size="sm" onClick={() => setItemOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> 항목 추가
            </Button>
          </div>
          {items.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">아직 등록된 유해요인이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">공정 / 작업</th>
                    <th className="text-left py-2 pr-3">유해요인</th>
                    <th className="text-left py-2 pr-3">빈도×강도</th>
                    <th className="text-left py-2 pr-3">등급</th>
                    <th className="text-left py-2 pr-3">대책</th>
                    <th className="text-left py-2 pr-3">담당</th>
                    <th className="text-left py-2 pr-3">기한</th>
                    <th className="text-left py-2 pr-3">티켓</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-[var(--border-1)]">
                      <td className="py-2 pr-3 text-[var(--text-2)]">
                        <div className="font-medium text-[var(--text-1)]">{it.process}</div>
                        {it.task && <div className="text-[var(--fs-caption)]">{it.task}</div>}
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-1)]">{it.hazard}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{it.freq_score} × {it.intensity_score} = {it.freq_score * it.intensity_score}</td>
                      <td className="py-2 pr-3">{gradeBadge(it.risk_grade)}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)] max-w-xs truncate">{it.mitigation || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{it.assignee_name || "-"}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{it.due_date || "-"}</td>
                      <td className="py-2 pr-3">
                        {it.ticket_id ? (
                          <Link href={`/safety-manager/tickets`} className="text-[var(--brand-500)] hover:text-[var(--brand-400)] text-[var(--fs-caption)] underline">
                            #{it.ticket_id}
                          </Link>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* 참여자 서명 */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">참여자 서명 ({signedCount}/{participants.length})</h3>
            </div>
            <Button size="sm" onClick={() => setPartOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> 참여자 추가
            </Button>
          </div>
          {participants.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">등록된 참여자가 없습니다. 위험성평가는 근로자 참여가 법적 의무입니다.</div>
          ) : (
            <div className="space-y-2">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border border-[var(--border-1)] rounded-[var(--r-md)] p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-1)]">{p.participant_name}</span>
                      <Badge tone="neutral">
                        {p.role === "worker_rep" ? "근로자 대표" : p.role === "manager" ? "관리자" : "근로자"}
                      </Badge>
                      {p.signed_at ? (
                        <Badge tone="success">서명 완료</Badge>
                      ) : (
                        <Badge tone="warning">서명 대기</Badge>
                      )}
                    </div>
                    {p.signature_notes && <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">{p.signature_notes}</p>}
                    {p.signed_at && <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">서명 시각: {new Date(p.signed_at).toLocaleString("ko-KR")}</p>}
                  </div>
                  {!p.signed_at && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await patchRiskAssessmentParticipant(id, p.id, { signed: true });
                          toast.success("서명 처리");
                          load();
                        } catch (e: any) { toast.error(e.message); }
                      }}
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> 서명 처리
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {itemOpen && (
        <AddItemModal
          assessmentId={id}
          onClose={() => setItemOpen(false)}
          onSaved={() => { setItemOpen(false); load(); }}
        />
      )}
      {partOpen && (
        <AddParticipantModal
          assessmentId={id}
          onClose={() => setPartOpen(false)}
          onSaved={() => { setPartOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function AddItemModal({ assessmentId, onClose, onSaved }: { assessmentId: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [process, setProcess] = useState("");
  const [task, setTask] = useState("");
  const [hazard, setHazard] = useState("");
  const [freq, setFreq] = useState<number>(0);
  const [intensity, setIntensity] = useState<number>(0);
  const [mitigation, setMitigation] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const product = freq && intensity ? freq * intensity : 0;
  const grade = product >= 6 ? "high" : product >= 3 ? "mid" : product > 0 ? "low" : null;

  const save = async () => {
    if (!process || !hazard) { toast.error("공정과 유해요인은 필수입니다."); return; }
    if (!freq || !intensity) { toast.error("빈도와 강도를 선택해주세요."); return; }
    setSaving(true);
    try {
      const res = await addRiskAssessmentItem(assessmentId, {
        process, task, hazard,
        freq_score: freq, intensity_score: intensity,
        mitigation, assignee_name: assigneeName, due_date: dueDate || undefined,
      });
      toast.success(`항목 등록 · 조치 티켓 #${res.ticket_id} 생성`);
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
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">유해요인·조치 항목 추가</h3>
        </div>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="공정 *">
              <Input value={process} onChange={(e) => setProcess((e.target as HTMLInputElement).value)} placeholder="예: 성형·충전" />
            </Field>
            <Field label="세부 작업">
              <Input value={task} onChange={(e) => setTask((e.target as HTMLInputElement).value)} placeholder="예: 금형 청소" />
            </Field>
          </div>
          <Field label="유해요인 *">
            <Textarea value={hazard} onChange={(e) => setHazard((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="예: 금형 협착 위험 · 화상 위험" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="발생 빈도 *">
              <Select value={freq} onChange={(e) => setFreq(Number((e.target as HTMLSelectElement).value))}>
                <option value={0}>선택</option>
                <option value={1}>1 · 드물게</option>
                <option value={2}>2 · 가끔</option>
                <option value={3}>3 · 자주</option>
              </Select>
            </Field>
            <Field label="피해 강도 *">
              <Select value={intensity} onChange={(e) => setIntensity(Number((e.target as HTMLSelectElement).value))}>
                <option value={0}>선택</option>
                <option value={1}>1 · 경미</option>
                <option value={2}>2 · 중대</option>
                <option value={3}>3 · 치명</option>
              </Select>
            </Field>
          </div>
          {grade && (
            <div className="p-3 rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--bg-2)]/40 flex items-center gap-3">
              <span className="text-[var(--fs-caption)] text-[var(--text-3)]">위험도 = {freq} × {intensity} = {product} →</span>
              {gradeBadge(grade)}
            </div>
          )}
          <Field label="개선 대책 (조치 티켓 설명에 자동 반영)">
            <Textarea value={mitigation} onChange={(e) => setMitigation((e.target as HTMLTextAreaElement).value)} rows={3} placeholder="예: 성형기 안전문 인터록 재점검 + 작업 절차서 개정" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="담당자">
              <Input value={assigneeName} onChange={(e) => setAssigneeName((e.target as HTMLInputElement).value)} placeholder="예: 김OO 반장" />
            </Field>
            <Field label="조치 기한 (미입력 시 등급별 자동)">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
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

function AddParticipantModal({ assessmentId, onClose, onSaved }: { assessmentId: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState("worker");
  const [notes, setNotes] = useState("");
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("참여자 이름을 입력해주세요."); return; }
    setSaving(true);
    try {
      await addRiskAssessmentParticipant(assessmentId, {
        participant_name: name, role, signature_notes: notes, signed,
      });
      toast.success("참여자 등록");
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
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">참여자 추가</h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            산업안전보건법 36조 4항: 위험성평가는 근로자 참여 · 서명이 법적 의무입니다.
          </p>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="이름 *">
              <Input value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} placeholder="예: 홍길동" />
            </Field>
            <Field label="역할">
              <Select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value)}>
                <option value="worker">근로자</option>
                <option value="worker_rep">근로자 대표</option>
                <option value="manager">관리자</option>
              </Select>
            </Field>
          </div>
          <Field label="서명 노트 (선택)">
            <Textarea value={notes} onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)} rows={2} />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} className="w-4 h-4" />
            <span className="text-[var(--fs-body)] text-[var(--text-2)]">즉시 서명 처리</span>
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
