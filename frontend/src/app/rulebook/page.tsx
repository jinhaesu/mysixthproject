"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, AlertTriangle } from "lucide-react";
import { Card, CenterSpinner, EmptyState } from "@/components/ui";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface RulebookDoc {
  id: number | string;
  title: string;
  version: string;
  content_html: string;
  effective_from?: string;
  published_at?: string;
}

function RulebookContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workerToken = searchParams.get("worker_token") || "";
  const backTo = searchParams.get("back_to") || "";

  const [doc, setDoc] = useState<RulebookDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/policy-public/rulebook`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `취업규칙을 불러올 수 없습니다. (HTTP ${r.status})`);
        return body;
      })
      .then((d: RulebookDoc) => setDoc(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // worker_token 이 있으면 열람 기록을 자동 남긴다.
  // 백엔드에 아직 없을 수도 있는 엔드포인트 — 404 는 조용히 무시하고 페이지 렌더는 막지 않는다.
  useEffect(() => {
    if (!workerToken || !doc) return;
    fetch(`${API_URL}/api/policy-public/rulebook/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worker_token: workerToken, rulebook_id: doc.id }),
    })
      .then((r) => {
        if (r.status === 404) {
          console.log("[rulebook] acknowledge endpoint not implemented yet (404) — skipping");
          return;
        }
        if (!r.ok) {
          console.warn("[rulebook] acknowledge failed", r.status);
        }
      })
      .catch((e) => console.log("[rulebook] acknowledge request failed", e));
  }, [workerToken, doc]);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      {/* 상단 고정 헤더 */}
      <div className="sticky top-0 z-20 border-b border-[var(--border-1)] bg-[var(--bg-1)]/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3.5 flex items-center gap-3">
          {backTo && (
            <button
              onClick={() => router.push(backTo)}
              className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
            >
              <ArrowLeft size={14} />
              계약서로 돌아가기
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-[var(--brand-400)] shrink-0" />
              <h1 className="text-[14.5px] font-semibold text-[var(--text-1)] truncate">
                조인앤조인 취업규칙{doc ? ` v${doc.version}` : ""}
              </h1>
            </div>
            {doc?.effective_from && (
              <p className="text-[11.5px] text-[var(--text-4)] mt-0.5">시행 {doc.effective_from}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <CenterSpinner />
          </div>
        )}

        {!loading && error && (
          <Card padding="lg" tone="default" className="shadow-[var(--elev-2)]">
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6" />}
              title="취업규칙을 불러올 수 없습니다"
              description={error}
            />
          </Card>
        )}

        {!loading && !error && doc && (
          <Card padding="lg" tone="default" className="shadow-[var(--elev-1)]">
            <div
              className={styles.rulebook}
              dangerouslySetInnerHTML={{ __html: doc.content_html }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

export default function RulebookPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
          <CenterSpinner />
        </div>
      }
    >
      <RulebookContent />
    </Suspense>
  );
}
