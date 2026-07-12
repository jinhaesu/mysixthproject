"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, ArrowLeft, Send, Users, TrendingUp } from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Textarea, useToast,
  Table, THead, TBody, TR, TH, TD,
} from "@/components/ui";
import {
  getPolicyDocument, patchPolicy, publishPolicy,
  getPolicyCompliance, getPolicyAcks,
  type PolicyComplianceResponse, type PolicyAcknowledgment,
} from "@/lib/api";

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "policy", label: "경영방침" },
  { value: "goal", label: "연간 목표" },
  { value: "regulation", label: "안전보건관리규정" },
  { value: "manual", label: "매뉴얼" },
];

const TARGET_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "전 임직원" },
  { value: "production", label: "생산·물류" },
  { value: "cafe", label: "카페" },
  { value: "office", label: "사무직" },
];

function PolicyEditInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const id = params ? Number(params.get("id") || 0) : 0;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("draft");
  const [kind, setKind] = useState("policy");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [contentHtml, setContentHtml] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [targetRole, setTargetRole] = useState("all");
  const [requiresAck, setRequiresAck] = useState(1);
  const [ceoSignatureName, setCeoSignatureName] = useState("");

  const [compliance, setCompliance] = useState<PolicyComplianceResponse | null>(null);
  const [acks, setAcks] = useState<PolicyAcknowledgment[]>([]);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getPolicyDocument(id);
      const d = res.document;
      setStatus(d.status);
      setKind(d.kind);
      setTitle(d.title);
      setVersion(d.version || "1.0");
      setContentHtml(d.content_html || "");
      setAttachmentUrl(d.attachment_url || "");
      setEffectiveFrom(d.effective_from || "");
      setTargetRole(d.target_role || "all");
      setRequiresAck(Number(d.requires_acknowledgment ?? 1));
      setCeoSignatureName(d.ceo_signature_name || "");

      // 발행중이면 확인 이력·확인율도 fetch
      if (d.status === "published") {
        try {
          const c = await getPolicyCompliance(id);
          setCompliance(c);
        } catch {}
        try {
          const a = await getPolicyAcks(id);
          setAcks(a.acknowledgments);
        } catch {}
      }
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const doSave = async () => {
    if (!id) return;
    try {
      await patchPolicy(id, {
        kind,
        title,
        version,
        content_html: contentHtml,
        attachment_url: attachmentUrl,
        effective_from: effectiveFrom || null,
        target_role: targetRole,
        requires_acknowledgment: requiresAck,
        ceo_signature_name: ceoSignatureName,
      });
      toast.success("저장 완료");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doPublish = async () => {
    if (!id) return;
    if (!confirm("현재 문서를 발행 상태로 게시하시겠습니까?\n같은 분류의 기존 발행 문서는 자동 보관 처리됩니다.")) return;
    try {
      await patchPolicy(id, {
        kind, title, version,
        content_html: contentHtml,
        attachment_url: attachmentUrl,
        effective_from: effectiveFrom || null,
        target_role: targetRole,
        requires_acknowledgment: requiresAck,
        ceo_signature_name: ceoSignatureName,
      });
      await publishPolicy(id, {
        effective_from: effectiveFrom || undefined,
        ceo_signature_name: ceoSignatureName || undefined,
      });
      toast.success("발행 완료");
      router.push("/admin/policy-management");
    } catch (e: any) { toast.error(e.message); }
  };

  if (!id) {
    return (
      <div className="p-6">
        <Card>
          <div className="p-6 text-center text-[var(--text-3)]">
            문서 id 가 지정되지 않았습니다.
            <div className="mt-3">
              <Link href="/admin/policy-management">
                <Button variant="secondary" size="sm">
                  <ArrowLeft className="w-4 h-4" /> 목록으로
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        eyebrow="안전보건 방침·규정 문서"
        title="문서 편집"
        description={`문서 id=${id} · 상태=${status}`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/policy-management">
              <Button variant="secondary">
                <ArrowLeft className="w-4 h-4" /> 목록
              </Button>
            </Link>
            <Button variant="secondary" onClick={doSave}>
              <Save className="w-4 h-4" /> 저장
            </Button>
            {status !== "published" && (
              <Button onClick={doPublish}>
                <Send className="w-4 h-4" /> 발행
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <Card>
          <div className="p-12 text-center text-[var(--text-3)]">
            <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="분류">
                  <Select value={kind} onChange={(e) => setKind((e.target as HTMLSelectElement).value)}>
                    {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label="버전">
                  <Input value={version} onChange={(e) => setVersion((e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="발효일">
                  <Input type="date" value={effectiveFrom || ""} onChange={(e) => setEffectiveFrom((e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="대상">
                  <Select value={targetRole} onChange={(e) => setTargetRole((e.target as HTMLSelectElement).value)}>
                    {TARGET_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="제목">
                <Input value={title} onChange={(e) => setTitle((e.target as HTMLInputElement).value)} />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="대표이사 서명명(발행 승인)">
                  <Input value={ceoSignatureName} onChange={(e) => setCeoSignatureName((e.target as HTMLInputElement).value)} placeholder="진해수" />
                </Field>
                <Field label="근로자 확인 서명 필요">
                  <Select value={String(requiresAck)} onChange={(e) => setRequiresAck(Number((e.target as HTMLSelectElement).value))}>
                    <option value="1">필요</option>
                    <option value="0">불필요</option>
                  </Select>
                </Field>
              </div>
              <Field label="첨부 URL (외부 문서 링크)">
                <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl((e.target as HTMLInputElement).value)} placeholder="https://..." />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone="brand">본문(HTML)</Badge>
                <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
                  h2 / h3 / p / ul / li / ol 태그를 허용합니다.
                </div>
              </div>
              <Textarea
                rows={20}
                value={contentHtml}
                onChange={(e) => setContentHtml((e.target as HTMLTextAreaElement).value)}
                placeholder="<h2>제목</h2><p>본문…</p>"
              />
            </div>
          </Card>

          <Card>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Badge tone="neutral">미리보기</Badge>
              </div>
              <div
                className="prose prose-invert max-w-none text-[var(--text-1)]"
                dangerouslySetInnerHTML={{ __html: contentHtml || "<p>내용이 비어있습니다.</p>" }}
              />
            </div>
          </Card>

          {status === "published" && compliance && (
            <Card>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--brand-400)]" />
                  <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">확인 이행 현황</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <div className="p-4">
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)]">확인율</div>
                      <div className="text-[var(--fs-h4)] font-bold text-[var(--brand-400)]">{compliance.summary.rate_pct}%</div>
                    </div>
                  </Card>
                  <Card>
                    <div className="p-4">
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)]">대상</div>
                      <div className="text-[var(--fs-h4)] font-bold text-[var(--text-1)]">{compliance.summary.target_total}</div>
                    </div>
                  </Card>
                  <Card>
                    <div className="p-4">
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)]">확인 완료</div>
                      <div className="text-[var(--fs-h4)] font-bold text-[var(--success-fg)]">{compliance.summary.acknowledged_count}</div>
                    </div>
                  </Card>
                  <Card>
                    <div className="p-4">
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)]">미확인</div>
                      <div className="text-[var(--fs-h4)] font-bold text-[var(--warning-fg)]">{compliance.summary.missing_count}</div>
                    </div>
                  </Card>
                </div>

                {compliance.by_department.length > 0 && (
                  <Card padding="none">
                    <Table>
                      <THead>
                        <TR>
                          <TH>부서</TH>
                          <TH>대상</TH>
                          <TH>확인</TH>
                          <TH>미확인</TH>
                          <TH>확인율</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {compliance.by_department.map((r) => (
                          <TR key={r.dept}>
                            <TD>{r.dept}</TD>
                            <TD>{r.total}</TD>
                            <TD>{r.done}</TD>
                            <TD>{r.missing}</TD>
                            <TD>{r.total > 0 ? Math.round((r.done / r.total) * 1000) / 10 : 0}%</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </Card>
                )}
              </div>
            </Card>
          )}

          {status === "published" && acks.length > 0 && (
            <Card>
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[var(--brand-400)]" />
                  <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">확인 이력 ({acks.length}건)</h3>
                </div>
                <Card padding="none">
                  <Table>
                    <THead>
                      <TR>
                        <TH>일시</TH>
                        <TH>이름</TH>
                        <TH>부서</TH>
                        <TH>팀</TH>
                        <TH>메모</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {acks.map((a) => (
                        <TR key={a.id}>
                          <TD>{a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleString("ko-KR") : ""}</TD>
                          <TD>{a.employee_name || `#${a.employee_id}`}</TD>
                          <TD>{a.department || ""}</TD>
                          <TD>{a.team || ""}</TD>
                          <TD>{a.signature_notes || ""}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function PolicyEditPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[var(--text-3)]">Loading…</div>}>
      <PolicyEditInner />
    </Suspense>
  );
}
