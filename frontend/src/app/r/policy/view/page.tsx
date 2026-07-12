"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  BookOpen,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CheckCircle,
  PenLine,
  FileText,
  ExternalLink,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface PolicyView {
  employee: { id: number; name: string; department: string; team: string };
  document: {
    id: number;
    kind: string;
    title: string;
    version: string;
    content_html: string;
    attachment_url: string;
    status: string;
    effective_from: string | null;
    target_role: string;
    requires_acknowledgment: number;
    published_at: string | null;
    ceo_signed_at: string | null;
    ceo_signature_name: string;
  };
  acknowledgment: {
    id: number;
    acknowledged_at: string;
    signature_notes: string;
  } | null;
}

const KIND_LABEL: Record<string, string> = {
  policy: "경영방침",
  goal: "연간 목표",
  regulation: "안전보건관리규정",
  manual: "매뉴얼",
};

function PolicyViewContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const id = Number(params.get("id") || 0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PolicyView | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);

  const load = useCallback(async () => {
    if (!token || !id) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/policy/view?id=${id}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "로드 실패");
      setData(body);
      if (body.acknowledgment?.signature_notes) setNotes(body.acknowledgment.signature_notes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  const handleAcknowledge = async () => {
    if (!agreementChecked) {
      alert("문서 내용을 확인했다는 체크박스에 동의해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/policy/${id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_notes: notes }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "저장 실패");
      alert("확인 서명이 저장되었습니다.");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-2)] border border-[var(--border-1)] p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-[var(--danger-fg)] mx-auto" />
          <h2 className="mt-4 text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">오류</h2>
          <p className="mt-2 text-[var(--text-3)]">{error}</p>
          <button
            onClick={() => router.push(`/r/policy?token=${token}`)}
            className="mt-4 inline-flex items-center gap-1 text-[var(--fs-caption)] text-[var(--brand-400)]"
          >
            <ArrowLeft className="w-4 h-4" /> 목록으로
          </button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const doc = data.document;
  const isAcknowledged = !!data.acknowledgment;
  const needsAck = doc.requires_acknowledgment === 1;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-16">
      <div
        className="text-white px-4 py-5"
        style={{ background: "linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)" }}
      >
        <button
          onClick={() => router.push(`/r/policy?token=${token}`)}
          className="flex items-center gap-1 text-white/80 hover:text-white text-[var(--fs-caption)] mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> 목록으로
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-[var(--r-pill)]">
            {KIND_LABEL[doc.kind] || doc.kind}
          </span>
          <span className="text-white/80 text-[var(--fs-caption)] tabular">v{doc.version}</span>
        </div>
        <h1 className="text-[var(--fs-h4)] font-bold mt-1 flex items-center gap-2">
          <BookOpen className="w-6 h-6 shrink-0" />
          <span>{doc.title}</span>
        </h1>
        <p className="text-white/80 text-[var(--fs-caption)] mt-1">
          {doc.effective_from ? `발효일 ${doc.effective_from} · ` : ""}
          {doc.ceo_signature_name ? `대표이사 ${doc.ceo_signature_name}` : ""}
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {isAcknowledged && (
          <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-xl)] p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-[var(--success-fg)] shrink-0" />
            <div>
              <p className="text-[var(--fs-body)] font-semibold text-[var(--success-fg)]">
                이 문서를 이미 확인했습니다.
              </p>
              <p className="text-[var(--fs-caption)] text-[var(--success-fg)] opacity-80 mt-0.5">
                확인일{" "}
                {new Date(data.acknowledgment!.acknowledged_at).toLocaleString("ko-KR")}
              </p>
            </div>
          </div>
        )}

        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-[var(--brand-400)]" />
            <span className="text-[var(--fs-caption)] text-[var(--text-3)]">본문</span>
          </div>
          <div
            className="prose prose-invert max-w-none text-[var(--text-1)] text-[var(--fs-body)] leading-relaxed"
            style={{ wordBreak: "break-word" }}
            dangerouslySetInnerHTML={{ __html: doc.content_html || "<p>본문이 비어 있습니다.</p>" }}
          />
          {doc.attachment_url && (
            <a
              href={doc.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-4 text-[var(--brand-400)] hover:underline text-[var(--fs-caption)]"
            >
              <ExternalLink className="w-4 h-4" /> 첨부 문서 열기
            </a>
          )}
        </div>

        {needsAck && !isAcknowledged && (
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5 space-y-3">
            <div className="flex items-center gap-2 text-[var(--brand-400)]">
              <PenLine className="w-5 h-5" />
              <h2 className="font-semibold text-[var(--text-1)]">확인 서명</h2>
            </div>
            <p className="text-[var(--fs-caption)] text-[var(--text-3)] leading-relaxed">
              본 문서의 내용을 충분히 이해하였음을 확인합니다. 서명 정보(일시·IP·브라우저)는 법령상 인지 증빙 목적으로 기록됩니다.
            </p>
            <div>
              <label className="block text-[var(--fs-body)] font-medium text-[var(--text-2)] mb-1">
                의견(선택)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="궁금한 점이나 의견을 남겨주세요 (선택)"
                className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] text-[var(--fs-base)] bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--brand-500)] transition-colors placeholder:text-[var(--text-4)]"
              />
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreementChecked}
                onChange={(e) => setAgreementChecked(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-[var(--border-2)] accent-[var(--brand-500)]"
              />
              <span className="text-[var(--fs-body)] font-medium text-[var(--text-1)]">
                위 문서의 내용을 모두 확인하였으며, 관련 규정을 준수할 것에 동의합니다.
              </span>
            </label>
            <button
              onClick={handleAcknowledge}
              disabled={submitting || !agreementChecked}
              className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> 저장 중...
                </>
              ) : (
                <>
                  <PenLine className="w-4 h-4" /> 확인 서명 제출
                </>
              )}
            </button>
          </div>
        )}

        {needsAck && isAcknowledged && (
          <button
            onClick={() => router.push(`/r/policy?token=${token}`)}
            className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> 목록으로 돌아가기
          </button>
        )}
      </div>
    </div>
  );
}

export default function PolicyViewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" />
        </div>
      }
    >
      <PolicyViewContent />
    </Suspense>
  );
}
