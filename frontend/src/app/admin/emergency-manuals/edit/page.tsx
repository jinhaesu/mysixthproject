"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Save, ArrowLeft, Send } from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Textarea, useToast,
} from "@/components/ui";
import {
  getEmergencyManual, patchEmergencyManual, publishEmergencyManual,
} from "@/lib/api";

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "fire", label: "화재" },
  { value: "gas_leak", label: "냉매·가스누출" },
  { value: "blackout", label: "정전" },
  { value: "critical_incident", label: "중대재해" },
  { value: "chemical", label: "화학사고" },
  { value: "other", label: "기타" },
];

function EmergencyManualEditInner() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const id = params ? Number(params.get("id") || 0) : 0;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("draft");
  const [scenarioKind, setScenarioKind] = useState("fire");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("1.0");
  const [contentHtml, setContentHtml] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getEmergencyManual(id);
      const m = res.manual;
      setStatus(m.status);
      setScenarioKind(m.scenario_kind);
      setTitle(m.title);
      setVersion(m.version || "1.0");
      setContentHtml(m.content_html || "");
      setAttachmentUrl(m.attachment_url || "");
      setEffectiveFrom(m.effective_from || "");
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
      await patchEmergencyManual(id, {
        scenario_kind: scenarioKind,
        title,
        version,
        content_html: contentHtml,
        attachment_url: attachmentUrl,
        effective_from: effectiveFrom || null,
      });
      toast.success("저장 완료");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doPublish = async () => {
    if (!id) return;
    if (!confirm("현재 문서를 발효 상태로 게시하시겠습니까?\n동일 시나리오의 기존 발효 매뉴얼은 자동 폐지됩니다.")) return;
    try {
      await patchEmergencyManual(id, {
        scenario_kind: scenarioKind,
        title,
        version,
        content_html: contentHtml,
        attachment_url: attachmentUrl,
        effective_from: effectiveFrom || null,
      });
      await publishEmergencyManual(id, {
        effective_from: effectiveFrom || undefined,
      });
      toast.success("발효 완료");
      router.push("/admin/emergency-manuals");
    } catch (e: any) { toast.error(e.message); }
  };

  if (!id) {
    return (
      <div className="p-6">
        <Card>
          <div className="p-6 text-center text-[var(--text-3)]">
            매뉴얼 id 가 지정되지 않았습니다.
            <div className="mt-3">
              <Link href="/admin/emergency-manuals">
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
        eyebrow="비상 대응 매뉴얼"
        title="매뉴얼 편집"
        description={`문서 id=${id} · 상태=${status}`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/emergency-manuals">
              <Button variant="secondary">
                <ArrowLeft className="w-4 h-4" /> 목록
              </Button>
            </Link>
            <Button variant="secondary" onClick={doSave}>
              <Save className="w-4 h-4" /> 저장
            </Button>
            {status !== "active" && (
              <Button onClick={doPublish}>
                <Send className="w-4 h-4" /> 발효
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="시나리오">
                  <Select value={scenarioKind} onChange={(e) => setScenarioKind((e.target as HTMLSelectElement).value)}>
                    {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label="버전">
                  <Input value={version} onChange={(e) => setVersion((e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="발효일">
                  <Input type="date" value={effectiveFrom || ""} onChange={(e) => setEffectiveFrom((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              <Field label="제목">
                <Input value={title} onChange={(e) => setTitle((e.target as HTMLInputElement).value)} />
              </Field>
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
        </>
      )}
    </div>
  );
}

export default function EmergencyManualEditPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[var(--text-3)]">Loading…</div>}>
      <EmergencyManualEditInner />
    </Suspense>
  );
}
