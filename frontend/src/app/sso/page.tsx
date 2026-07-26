"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// 회사 계정 SSO 콜백 — 허브가 브라우저를 `#token=<jwt>` 해시로 되돌려보냄.
// static export(output:'export') 이므로 100% 클라이언트 사이드로만 처리한다.
function SsoCallback() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    // 해시에서 token 추출 후, 주소창에서 토큰 흔적 제거
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const token = params.get("token");

    // 히스토리에서 토큰 노출 제거 (뒤로가기/새로고침 시 재사용 방지)
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    if (!token) {
      setError("SSO 토큰을 찾을 수 없습니다. 다시 로그인해주세요.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/sso`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error || "SSO 인증에 실패했습니다.");
          return;
        }
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        router.push("/");
      } catch (err: any) {
        if (!cancelled) {
          console.error("SSO error:", err, "API_URL:", API_URL);
          setError(`서버에 연결할 수 없습니다. (${err?.message || "네트워크 오류"})`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] px-4 fade-in">
      <div className="w-full max-w-md">
        <Card padding="lg" tone="default" className="shadow-[var(--elev-3)] surface-bevel">
          <div className="text-center">
            <div
              className="w-14 h-14 rounded-[var(--r-xl)] gradient-brand flex items-center justify-center mx-auto mb-5 shadow-[var(--elev-2)]"
              style={{ background: "linear-gradient(135deg, var(--brand-500) 0%, var(--brand-400) 100%)" }}
            >
              <span className="text-white text-[var(--fs-h3)] font-bold select-none">J</span>
            </div>
            <h1 className="text-h2 text-gradient-brand">근태 관리 시스템</h1>

            {error ? (
              <>
                <div className="mt-6 mb-6 p-3.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] flex items-center gap-3 text-left">
                  <AlertCircle size={18} className="text-[var(--danger-fg)] shrink-0" />
                  <p className="text-[var(--fs-body)] text-[var(--danger-fg)]">{error}</p>
                </div>
                <Link
                  href="/login"
                  className="text-[var(--fs-body)] text-[var(--brand-400)] hover:text-[var(--brand-200)] transition-colors"
                >
                  로그인 페이지로 돌아가기
                </Link>
              </>
            ) : (
              <div className="mt-6 flex items-center justify-center gap-2 text-[var(--text-3)]">
                <Loader2 size={18} className="animate-spin" />
                <p className="text-[var(--fs-body)]">회사 계정으로 로그인 중...</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
          <Loader2 size={20} className="animate-spin text-[var(--text-3)]" />
        </div>
      }
    >
      <SsoCallback />
    </Suspense>
  );
}
