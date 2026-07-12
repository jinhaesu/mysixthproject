"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Plus, Award, RefreshCw, Save, PenLine, CheckCircle,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Textarea, Modal, useToast,
} from "@/components/ui";
import {
  listCdpaReviews, getCdpaReview, createCdpaReview, patchCdpaReview,
  patchCdpaReviewItem, signCdpaReview,
  type CdpaReview, type CdpaReviewItem,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  in_progress: "이행 진행 중",
  ready_for_sign: "서명 대기",
  signed: "확정·서명 완료",
};
const ITEM_STATUS_LABEL: Record<string, string> = {
  not_started: "미시작",
  in_progress: "진행 중",
  done: "완료",
  not_applicable: "해당 없음",
};

function statusBadge(s: string) {
  if (s === "signed") return <Badge tone="success">확정·서명 완료</Badge>;
  if (s === "ready_for_sign") return <Badge tone="brand">서명 대기</Badge>;
  if (s === "in_progress") return <Badge tone="warning">이행 진행 중</Badge>;
  return <Badge tone="neutral">작성 중</Badge>;
}

function itemStatusBadge(s: string) {
  if (s === "done") return <Badge tone="success">완료</Badge>;
  if (s === "in_progress") return <Badge tone="warning">진행 중</Badge>;
  if (s === "not_applicable") return <Badge tone="neutral">해당 없음</Badge>;
  return <Badge tone="danger">미시작</Badge>;
}

export default function HalfYearReviewPage() {
  const toast = useToast();
  const [items, setItems] = useState<CdpaReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [createOpen, setCreateOpen] = useState(false);
  const [createHalf, setCreateHalf] = useState<"1" | "2">(new Date().getMonth() + 1 <= 6 ? "1" : "2");
  const [detail, setDetail] = useState<{ review: CdpaReview; items: CdpaReviewItem[] } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [signName, setSignName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCdpaReviews(year ? Number(year) : undefined);
      setItems(res.items);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally { setLoading(false); }
  }, [year, toast]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: number) => {
    try {
      const res = await getCdpaReview(id);
      setDetail(res);
      setSignName(res.review.ceo_signature_name || "");
    } catch (e: any) { toast.error(e.message); }
  };

  const doCreate = async () => {
    try {
      await createCdpaReview({ year: Number(year), half: Number(createHalf) as 1 | 2 });
      setCreateOpen(false);
      toast.success("반기 이행점검이 생성되었습니다 (9개 의무 시드 완료)");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const patchItem = async (item: CdpaReviewItem, patch: Partial<CdpaReviewItem>) => {
    if (!detail) return;
    setSaving(item.id);
    try {
      await patchCdpaReviewItem(detail.review.id, item.id, patch);
      setDetail({
        ...detail,
        items: detail.items.map(i => i.id === item.id ? { ...i, ...patch } : i),
      });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
  };

  const patchReview = async (patch: Partial<CdpaReview>) => {
    if (!detail) return;
    try {
      await patchCdpaReview(detail.review.id, patch as any);
      setDetail({ ...detail, review: { ...detail.review, ...patch } as CdpaReview });
      toast.success("저장됨");
    } catch (e: any) { toast.error(e.message); }
  };

  const doSign = async () => {
    if (!detail) return;
    if (!signName.trim()) { toast.error("서명 이름 입력"); return; }
    try {
      const res = await signCdpaReview(detail.review.id, signName.trim());
      setDetail({
        ...detail,
        review: { ...detail.review, ceo_signature_name: signName.trim(), ceo_signed_at: res.signed_at, status: "signed" },
      });
      toast.success("대표이사 서명 완료");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="대표이사"
        title="중대재해처벌법 반기 이행점검"
        description="중처법 시행령 4조(사업주와 경영책임자의 안전보건 확보의무) 9개 항목을 반기별로 점검·서명. 확정본은 대표이사 서명 후 형사·행정 대응 근거로 사용."
        actions={
          <div className="flex gap-2">
            <Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} className="w-24" placeholder="연도" />
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> 반기 점검 생성
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2].map((h) => {
          const found = items.find(i => i.half === h);
          return (
            <Card key={h}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-[var(--brand-400)]" />
                    <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{year}년 {h}반기</h3>
                  </div>
                  {found ? statusBadge(found.status) : <Badge tone="warning">미생성</Badge>}
                </div>
                {found ? (
                  <>
                    <div className="text-[var(--fs-caption)] text-[var(--text-3)] mb-2">
                      항목 {found.item_count || 0}개 / 완료 {found.done_count || 0}개
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-3">
                      <div
                        className="h-full bg-[var(--brand-400)]"
                        style={{ width: `${found.item_count ? Math.round(((found.done_count || 0) / found.item_count) * 100) : 0}%` }}
                      />
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openDetail(found.id)}>
                      <PenLine className="w-3.5 h-3.5" /> 상세·편집·서명
                    </Button>
                    {found.ceo_signed_at && (
                      <div className="mt-2 text-[var(--fs-caption)] text-[var(--success-fg)]">
                        <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                        {found.ceo_signature_name || "-"} 서명 {new Date(found.ceo_signed_at).toLocaleDateString("ko-KR")}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[var(--fs-caption)] text-[var(--text-3)]">아직 생성된 이행점검이 없습니다.</div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 생성 모달 */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="반기 이행점검 생성" size="sm">
        <div className="space-y-4">
          <Field label="연도"><Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} /></Field>
          <Field label="반기">
            <Select value={createHalf} onChange={(e) => setCreateHalf((e.target as HTMLSelectElement).value as "1" | "2")}>
              <option value="1">상반기 (1-6월)</option>
              <option value="2">하반기 (7-12월)</option>
            </Select>
          </Field>
          <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
            생성 시 중처법 시행령 4조 9개 의무 항목이 자동으로 시드됩니다.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>취소</Button>
            <Button onClick={doCreate}>생성</Button>
          </div>
        </div>
      </Modal>

      {/* 상세·편집·서명 모달 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.review.year}년 ${detail.review.half}반기 중처법 이행점검` : ""} size="xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {statusBadge(detail.review.status)}
              {detail.review.ceo_signed_at ? (
                <span className="text-[var(--fs-caption)] text-[var(--success-fg)]">
                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                  {detail.review.ceo_signature_name} 서명 {new Date(detail.review.ceo_signed_at).toLocaleString("ko-KR")}
                </span>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border-1)]">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="bg-[var(--bg-1)] text-[var(--text-3)] text-[var(--fs-caption)]">
                  <tr>
                    <th className="text-left px-3 py-2 w-10">#</th>
                    <th className="text-left px-3 py-2">의무 항목</th>
                    <th className="text-left px-3 py-2 w-32">상태</th>
                    <th className="text-left px-3 py-2 w-56">근거·증빙 출처</th>
                    <th className="text-left px-3 py-2 w-56">노트·개선조치</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <tr key={it.id} className="border-t border-[var(--border-1)]">
                      <td className="px-3 py-2 tabular text-[var(--text-3)]">{it.item_no}</td>
                      <td className="px-3 py-2 text-[var(--text-1)]">{it.obligation_name}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={it.status}
                          onChange={(e) => patchItem(it, { status: (e.target as HTMLSelectElement).value })}
                          disabled={detail.review.status === "signed" || saving === it.id}
                        >
                          <option value="not_started">미시작</option>
                          <option value="in_progress">진행 중</option>
                          <option value="done">완료</option>
                          <option value="not_applicable">해당 없음</option>
                        </Select>
                        <div className="mt-1">{itemStatusBadge(it.status)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={it.evidence_source || ""}
                          onChange={(e) => setDetail({ ...detail, items: detail.items.map(x => x.id === it.id ? { ...x, evidence_source: (e.target as HTMLInputElement).value } : x) })}
                          onBlur={(e) => patchItem(it, { evidence_source: (e.target as HTMLInputElement).value })}
                          placeholder="예: 조치 티켓 #123, 회의록 2026Q2"
                          disabled={detail.review.status === "signed"}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Textarea
                          value={it.notes || ""}
                          onChange={(e) => setDetail({ ...detail, items: detail.items.map(x => x.id === it.id ? { ...x, notes: (e.target as HTMLTextAreaElement).value } : x) })}
                          onBlur={(e) => patchItem(it, { notes: (e.target as HTMLTextAreaElement).value })}
                          placeholder="개선 계획·후속조치"
                          rows={2}
                          disabled={detail.review.status === "signed"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="요약 (반기 종합 평가)">
                <Textarea
                  value={detail.review.summary}
                  onChange={(e) => setDetail({ ...detail, review: { ...detail.review, summary: (e.target as HTMLTextAreaElement).value } })}
                  rows={4}
                  disabled={detail.review.status === "signed"}
                />
                <Button size="sm" variant="secondary" onClick={() => patchReview({ summary: detail.review.summary })} disabled={detail.review.status === "signed"} className="mt-2">
                  <Save className="w-3.5 h-3.5" /> 요약 저장
                </Button>
              </Field>
              <Field label="개선 계획">
                <Textarea
                  value={detail.review.improvement_plan}
                  onChange={(e) => setDetail({ ...detail, review: { ...detail.review, improvement_plan: (e.target as HTMLTextAreaElement).value } })}
                  rows={4}
                  disabled={detail.review.status === "signed"}
                />
                <Button size="sm" variant="secondary" onClick={() => patchReview({ improvement_plan: detail.review.improvement_plan })} disabled={detail.review.status === "signed"} className="mt-2">
                  <Save className="w-3.5 h-3.5" /> 계획 저장
                </Button>
              </Field>
            </div>

            {/* 대표이사 서명 */}
            {detail.review.status !== "signed" ? (
              <div className="rounded-[var(--r-md)] border border-[var(--brand-400)]/40 bg-[rgba(94,106,210,0.06)] p-4 space-y-3">
                <div className="flex items-center gap-2 text-[var(--text-1)] font-semibold">
                  <CheckCircle className="w-4 h-4 text-[var(--brand-400)]" /> 대표이사 서명·확정
                </div>
                <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
                  서명 완료 후 항목 편집이 불가능해집니다. 근거·증빙과 개선 계획을 모두 채운 뒤 서명해주세요.
                </p>
                <div className="flex gap-2 items-end">
                  <Field label="서명 이름" className="flex-1">
                    <Input value={signName} onChange={(e) => setSignName((e.target as HTMLInputElement).value)} placeholder="예: 진해수" />
                  </Field>
                  <Button onClick={doSign} disabled={!signName.trim()}>
                    <PenLine className="w-4 h-4" /> 서명·확정
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-[var(--r-md)] border border-[var(--success-fg)]/40 bg-[var(--success-bg)] p-4 text-[var(--success-fg)]">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle className="w-4 h-4" /> 확정 완료
                </div>
                <div className="text-[var(--fs-caption)] mt-1">
                  {detail.review.ceo_signature_name} · {detail.review.ceo_signed_at && new Date(detail.review.ceo_signed_at).toLocaleString("ko-KR")}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
