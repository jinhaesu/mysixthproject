"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, ShieldAlert, Filter, FileText, Save } from "lucide-react";
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
  listRiskAssessments,
  createRiskAssessment,
  type RiskAssessment,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  in_review: "검토 중",
  posted: "게시(공람)",
  reported: "대표자 보고",
  closed: "종결",
};

const KIND_LABEL: Record<string, string> = {
  initial: "최초",
  regular: "정기(연 1회)",
  ad_hoc: "수시(사고·설비 변경)",
};

function statusBadge(s: string) {
  if (s === "closed") return <Badge tone="success">종결</Badge>;
  if (s === "reported") return <Badge tone="success">대표자 보고</Badge>;
  if (s === "posted") return <Badge tone="brand">게시</Badge>;
  if (s === "in_review") return <Badge tone="warning">검토 중</Badge>;
  return <Badge tone="neutral">작성 중</Badge>;
}

export default function RiskAssessmentListPage() {
  const toast = useToast();
  const [items, setItems] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [yearF, setYearF] = useState<string>(String(new Date().getFullYear()));
  const [statusF, setStatusF] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRiskAssessments({
        year: yearF ? Number(yearF) : undefined,
        status: statusF || undefined,
      });
      setItems(res.items);
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
        title="위험성평가"
        description="산업안전보건법 36조 위험성평가 — 정기(연1회) / 최초 / 수시(사고 발생·설비 변경) 등록 → 유해요인 3×3 매트릭스 판정 → 조치 티켓 → 근로자 서명 → 게시·대표자 보고까지 5단계 워크플로."
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
              <option value="draft">작성 중</option>
              <option value="in_review">검토 중</option>
              <option value="posted">게시</option>
              <option value="reported">대표자 보고</option>
              <option value="closed">종결</option>
            </Select>
          </Field>
          <Button onClick={load} variant="secondary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            새로고침
          </Button>
          <div className="ml-auto">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> 새 위험성평가 등록
            </Button>
          </div>
        </div>
      </Card>

      {/* List */}
      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">등록된 위험성평가가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {items.map((r) => (
                <Link
                  key={r.id}
                  href={`/safety-manager/risk-assessment/detail?id=${r.id}`}
                  className="block border border-[var(--border-1)] rounded-[var(--r-lg)] p-4 hover:bg-[var(--bg-2)]/40"
                >
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-[var(--brand-400)]" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">{r.title}</h4>
                        {statusBadge(r.status)}
                        <Badge tone="neutral">{KIND_LABEL[r.kind] || r.kind}</Badge>
                        <Badge tone="brand">{r.year}년</Badge>
                      </div>
                      {r.triggered_by && (
                        <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1">계기: {r.triggered_by}</p>
                      )}
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-2 flex flex-wrap items-center gap-3">
                        <span>등록: {new Date(r.created_at).toLocaleDateString("ko-KR")}</span>
                        <span>유해요인: {r.item_count || 0}건</span>
                        <span>참여자: {r.signed_count || 0}/{r.participant_count || 0}명 서명</span>
                        {r.posted_at && <span>게시: {new Date(r.posted_at).toLocaleDateString("ko-KR")}</span>}
                        {r.ceo_reported_at && <span>대표자 보고: {new Date(r.ceo_reported_at).toLocaleDateString("ko-KR")}</span>}
                      </div>
                    </div>
                    <FileText className="w-4 h-4 text-[var(--text-4)] shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      {createOpen && (
        <CreateModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
    </div>
  );
}

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [kind, setKind] = useState<string>("regular");
  const [title, setTitle] = useState<string>(`${new Date().getFullYear()}년 정기 위험성평가`);
  const [triggeredBy, setTriggeredBy] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error("제목을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await createRiskAssessment({
        year: Number(year), kind, title, triggered_by: triggeredBy,
      });
      toast.success(`위험성평가 #${res.id} 등록 완료.`);
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
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">새 위험성평가 등록</h3>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="연도">
              <Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="종류">
              <Select value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value)}>
                <option value="initial">최초</option>
                <option value="regular">정기(연 1회)</option>
                <option value="ad_hoc">수시(사고·설비 변경)</option>
              </Select>
            </Field>
          </div>
          <Field label="제목">
            <Input value={title} onChange={(e) => setTitle((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="실시 계기 (수시 평가일 경우)">
            <Textarea value={triggeredBy} onChange={(e) => setTriggeredBy((e.target as HTMLTextAreaElement).value)} rows={2} placeholder="예: 2026-07-05 성형기 협착 아차사고 발생" />
          </Field>
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
