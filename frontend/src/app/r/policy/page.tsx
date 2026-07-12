"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CheckCircle,
  FileText,
  ChevronRight,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface PolicyItem {
  id: number;
  kind: string;
  title: string;
  version: string;
  effective_from: string | null;
  target_role: string;
  published_at: string | null;
  ceo_signature_name: string;
  acknowledged_at: string | null;
}

interface PendingResponse {
  employee: {
    id: number;
    name: string;
    department: string;
    team: string;
    role: string;
    classified_role: string;
  };
  pending: PolicyItem[];
  acknowledged: PolicyItem[];
}

const KIND_LABEL: Record<string, string> = {
  policy: "경영방침",
  goal: "연간 목표",
  regulation: "안전보건관리규정",
  manual: "매뉴얼",
};

function PolicyListContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PendingResponse | null>(null);

  const load = useCallback(async () => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/policy/pending`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "로드 실패");
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

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
        </div>
      </div>
    );
  }
  if (!data) return null;

  const renderCard = (doc: PolicyItem, isPending: boolean) => (
    <Link
      key={doc.id}
      href={`/r/policy/view?token=${token}&id=${doc.id}`}
      className={`flex items-center gap-3 px-4 py-3 rounded-[var(--r-xl)] border transition-transform hover:scale-[1.01] ${
        isPending
          ? "bg-[var(--warning-bg)] border-[var(--warning-border)]"
          : "bg-[var(--success-bg)] border-[var(--success-border)]"
      }`}
    >
      {isPending ? (
        <FileText className="w-5 h-5 shrink-0 text-[var(--warning-fg)]" />
      ) : (
        <CheckCircle className="w-5 h-5 shrink-0 text-[var(--success-fg)]" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-[var(--r-pill)] ${
              isPending
                ? "bg-[var(--warning-fg)] text-white"
                : "bg-[var(--success-fg)] text-white"
            }`}
          >
            {KIND_LABEL[doc.kind] || doc.kind}
          </span>
          <span className="text-[var(--fs-caption)] text-[var(--text-3)] tabular">
            v{doc.version}
          </span>
        </div>
        <p
          className={`text-[var(--fs-base)] font-semibold mt-1 truncate ${
            isPending ? "text-[var(--warning-fg)]" : "text-[var(--success-fg)]"
          }`}
        >
          {doc.title}
        </p>
        {isPending && doc.effective_from && (
          <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] opacity-80 mt-0.5">
            발효 {doc.effective_from}
            {doc.ceo_signature_name ? ` · 승인 ${doc.ceo_signature_name}` : ""}
          </p>
        )}
        {!isPending && doc.acknowledged_at && (
          <p className="text-[var(--fs-caption)] text-[var(--success-fg)] opacity-80 mt-0.5">
            확인일 {new Date(doc.acknowledged_at).toLocaleDateString("ko-KR")}
          </p>
        )}
      </div>
      <ChevronRight
        className={`w-4 h-4 shrink-0 ${
          isPending ? "text-[var(--warning-fg)]" : "text-[var(--success-fg)]"
        }`}
      />
    </Link>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-16">
      <div
        className="text-white px-4 py-5"
        style={{ background: "linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)" }}
      >
        <button
          onClick={() => router.push(`/r?token=${token}`)}
          className="flex items-center gap-1 text-white/80 hover:text-white text-[var(--fs-caption)] mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> 홈으로
        </button>
        <h1 className="text-[var(--fs-h4)] font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> 안전보건 방침·규정
        </h1>
        <p className="text-white/80 text-[var(--fs-body)] mt-1">
          {data.employee.name} · {data.employee.department} {data.employee.team}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {data.pending.length === 0 && data.acknowledged.length === 0 && (
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] border border-[var(--border-1)] p-6 text-center">
            <p className="text-[var(--text-2)] text-[var(--fs-body)]">
              현재 발행된 방침·규정 문서가 없습니다.
            </p>
          </div>
        )}

        {data.pending.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--warning-fg)]" />
              확인이 필요합니다 ({data.pending.length})
            </h2>
            <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
              대표이사가 승인·발행한 문서입니다. 열람 후 확인 서명을 남겨주세요.
            </p>
            {data.pending.map((d) => renderCard(d, true))}
          </div>
        )}

        {data.acknowledged.length > 0 && (
          <div className="space-y-2 pt-2">
            <h2 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[var(--success-fg)]" />
              확인 완료 ({data.acknowledged.length})
            </h2>
            {data.acknowledged.map((d) => renderCard(d, false))}
          </div>
        )}

        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] border border-[var(--border-1)] p-4 text-[var(--fs-caption)] text-[var(--text-3)] leading-relaxed">
          <p>· 중대재해처벌법 시행령 §4-1에 근거한 안전보건 경영방침·목표·규정 공지 절차입니다.</p>
          <p>· 확인 서명은 근태·급여 정산과 무관하며 법령상 인지 증빙 목적으로 기록됩니다.</p>
        </div>
      </div>
    </div>
  );
}

export default function PolicyListPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" />
        </div>
      }
    >
      <PolicyListContent />
    </Suspense>
  );
}
