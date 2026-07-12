"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Loader2, Plus, Award, RefreshCw, Save, PenLine, CheckCircle, ExternalLink, Zap, Info,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Textarea, Modal, useToast,
} from "@/components/ui";
import {
  listCdpaReviews, getCdpaReview, createCdpaReview, patchCdpaReview,
  patchCdpaReviewItem, signCdpaReview,
  autoRecomputeCdpaReview, overrideCdpaItem,
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

function autoStatusBadge(s: string | undefined) {
  if (!s) return <Badge tone="neutral">자동 계산 대기</Badge>;
  if (s === "done") return <Badge tone="success">자동: 완료</Badge>;
  if (s === "in_progress") return <Badge tone="warning">자동: 진행 중</Badge>;
  if (s === "not_applicable") return <Badge tone="neutral">자동: 해당 없음</Badge>;
  return <Badge tone="danger">자동: 미충족</Badge>;
}

// evidence_module_key 별 요약 문자열 렌더링
function summarizeEvidence(key: string | undefined, s: Record<string, any> | undefined): string {
  if (!s) return "";
  try {
    if (key === "policy") {
      return `방침 문서 게시 ${s.published || 0}건, draft ${s.draft || 0}건`;
    }
    if (key === "org") {
      return `필수 ${s.required_total || 0}직위 중 ${s.filled_count || 0}배치 완료${(s.empty_positions || []).length ? `, 미배치: ${(s.empty_positions || []).join(",")}` : ""}`;
    }
    if (key === "risk_assessment") {
      return `${s.year}년 정기 평가 ${s.total_regular || 0}건 (완료 ${s.completed || 0}) · '상' 미조치 ${s.high_open || 0}건`;
    }
    if (key === "budget") {
      return `편성 ${(s.planned_amount || 0).toLocaleString()}원, 집행 ${(s.executed_amount || 0).toLocaleString()}원 (집행률 ${s.execution_rate_pct || 0}%)`;
    }
    if (key === "manager_activity") {
      return `반기 목표 ${s.total_target_hours || 0}h, 실적 ${s.total_actual_hours || 0}h (달성률 ${s.overall_rate_pct || 0}%)`;
    }
    if (key === "appointment_hours") {
      return `필수 배치 ${s.filled_positions || 0}/${s.required_positions || 0}${(s.missing_positions || []).length ? `, 미배치: ${(s.missing_positions || []).join(",")}` : ""} · 시간 달성률 ${s.hours_rate_pct || 0}%`;
    }
    if (key === "stakeholder_input") {
      return `위원회 ${s.committee_held || 0}회 · 의견설문 응답률 ${s.opinion_rate_pct || 0}% (${s.opinion_responses || 0}/${s.opinion_target || 0}) · 신고 처리율 ${s.hazard_close_rate_pct || 0}%`;
    }
    if (key === "manual_drill") {
      return `중대재해 매뉴얼 게시 ${s.critical_manual_published || 0}/${s.critical_manual_total || 0} · 반기 훈련 ${s.drills_half || 0}회`;
    }
    if (key === "contractor") {
      if ((s.active_contractors || 0) === 0) return "활성 도급·용역 계약 없음 (해당 없음)";
      return `활성 계약 ${s.active_contractors}건 · 반기 작업허가 ${s.permits_half || 0}건 · 합동점검 ${s.inspections_half || 0}회`;
    }
    return JSON.stringify(s);
  } catch { return ""; }
}

function evidenceCountLabel(key: string | undefined, s: Record<string, any> | undefined): string {
  if (!s) return "근거 데이터 0건";
  try {
    if (key === "policy") return `근거 데이터 ${(s.published || 0) + (s.draft || 0)}건`;
    if (key === "org") return `근거 데이터 ${s.filled_count || 0}/${s.required_total || 0}건`;
    if (key === "risk_assessment") return `근거 데이터 ${s.total_regular || 0}건`;
    if (key === "budget") return `집행률 ${s.execution_rate_pct || 0}%`;
    if (key === "manager_activity") return `실적 ${s.total_actual_hours || 0}h`;
    if (key === "appointment_hours") return `배치 ${s.filled_positions || 0}/${s.required_positions || 0}`;
    if (key === "stakeholder_input") return `근거 데이터 ${(s.committee_held || 0) + (s.opinion_responses || 0) + (s.hazard_total || 0)}건`;
    if (key === "manual_drill") return `근거 데이터 ${(s.critical_manual_published || 0) + (s.drills_half || 0)}건`;
    if (key === "contractor") return `근거 데이터 ${(s.active_contractors || 0) + (s.permits_half || 0) + (s.inspections_half || 0)}건`;
  } catch {}
  return "근거 데이터 0건";
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
  const [recomputing, setRecomputing] = useState(false);
  const [openEvidenceId, setOpenEvidenceId] = useState<number | null>(null);

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

  const doAutoRecompute = async () => {
    if (!detail) return;
    setRecomputing(true);
    try {
      const res = await autoRecomputeCdpaReview(detail.review.id);
      const byId = new Map(res.items.map(i => [i.id, i]));
      setDetail({
        ...detail,
        items: detail.items.map(x => {
          const u = byId.get(x.id);
          return u ? { ...x, evidence_module_key: u.evidence_module_key, module_link: u.module_link, auto_status: u.auto_status, auto_status_summary: u.auto_status_summary } : x;
        }),
      });
      toast.success(`자동 재계산 완료 (${res.updated}개 항목)`);
    } catch (e: any) { toast.error(e.message || "재계산 실패"); }
    finally { setRecomputing(false); }
  };

  const overrideStatus = async (item: CdpaReviewItem, status: string) => {
    if (!detail) return;
    setSaving(item.id);
    try {
      await overrideCdpaItem(detail.review.id, item.id, { status });
      setDetail({
        ...detail,
        items: detail.items.map(i => i.id === item.id ? { ...i, status } : i),
      });
      toast.success("관리자 수동 오버라이드 저장");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(null); }
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
            <div className="flex items-center gap-3 flex-wrap">
              {statusBadge(detail.review.status)}
              {detail.review.ceo_signed_at ? (
                <span className="text-[var(--fs-caption)] text-[var(--success-fg)]">
                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                  {detail.review.ceo_signature_name} 서명 {new Date(detail.review.ceo_signed_at).toLocaleString("ko-KR")}
                </span>
              ) : null}
              <div className="ml-auto">
                <Button size="sm" variant="secondary" onClick={doAutoRecompute} disabled={recomputing}>
                  {recomputing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  자동 재계산
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[var(--r-md)] border border-[var(--border-1)]">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="bg-[var(--bg-1)] text-[var(--text-3)] text-[var(--fs-caption)]">
                  <tr>
                    <th className="text-left px-3 py-2 w-10">#</th>
                    <th className="text-left px-3 py-2">의무 항목 · 자동 근거</th>
                    <th className="text-left px-3 py-2 w-40">자동 상태</th>
                    <th className="text-left px-3 py-2 w-40">최종 상태(관리자)</th>
                    <th className="text-left px-3 py-2 w-52">근거·증빙 출처</th>
                    <th className="text-left px-3 py-2 w-52">노트·개선조치</th>
                    <th className="text-left px-3 py-2 w-32">모듈 이동</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => (
                    <Fragment key={it.id}>
                      <tr className="border-t border-[var(--border-1)] align-top">
                        <td className="px-3 py-2 tabular text-[var(--text-3)]">{it.item_no}</td>
                        <td className="px-3 py-2">
                          <div className="text-[var(--text-1)] font-medium">{it.obligation_name}</div>
                          <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1 flex items-center gap-2 flex-wrap">
                            <span>{evidenceCountLabel(it.evidence_module_key, it.auto_status_summary)}</span>
                            <button
                              type="button"
                              onClick={() => setOpenEvidenceId(openEvidenceId === it.id ? null : it.id)}
                              className="inline-flex items-center gap-1 text-[var(--brand-400)] hover:underline"
                            >
                              <Info className="w-3 h-3" /> 근거 상세
                            </button>
                          </div>
                          <div className="text-[var(--fs-caption)] text-[var(--text-2)] mt-1">
                            {summarizeEvidence(it.evidence_module_key, it.auto_status_summary)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {autoStatusBadge(it.auto_status)}
                        </td>
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
                          {it.auto_status && it.auto_status === "done" && it.status !== "done" && detail.review.status !== "signed" && (
                            <Button size="sm" variant="secondary" onClick={() => overrideStatus(it, "done")} className="mt-1">
                              <PenLine className="w-3 h-3" /> 자동값으로 확정
                            </Button>
                          )}
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
                        <td className="px-3 py-2">
                          {it.module_link ? (
                            <a
                              href={it.module_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--brand-400)] hover:underline text-[var(--fs-caption)]"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> 이 모듈로 이동
                            </a>
                          ) : (
                            <span className="text-[var(--fs-caption)] text-[var(--text-3)]">-</span>
                          )}
                        </td>
                      </tr>
                      {openEvidenceId === it.id && (
                        <tr className="border-t border-dashed border-[var(--border-1)] bg-[var(--bg-1)]">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-[var(--fs-caption)] text-[var(--text-2)] mb-1">
                              자동 계산 근거 (evidence_module_key = <b>{it.evidence_module_key || "-"}</b>)
                            </div>
                            <pre className="text-[11px] whitespace-pre-wrap text-[var(--text-2)] bg-[var(--bg-0)] p-2 rounded-[var(--r-sm)] overflow-x-auto">
{JSON.stringify(it.auto_status_summary || {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
