"use client";

import { Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui";

// 통합 SSO 자동 전환 — 로그인 페이지 진입 시 즉시 중앙 인증 허브로 리다이렉트.
// static export(output:'export') 이므로 100% 클라이언트 사이드로만 동작한다.
// (이메일 OTP UI 제거. 백엔드 OTP 엔드포인트는 그대로 유지됨.)
function LoginRedirect() {
  useEffect(() => {
    window.location.href =
      "https://auth.nuldam.com/authorize?app=aisystem&return=" +
      encodeURIComponent("https://aisystem.nuldam.com/sso");
  }, []);

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
            <div className="mt-6 flex items-center justify-center gap-2 text-[var(--text-3)]">
              <Loader2 size={18} className="animate-spin" />
              <p className="text-[var(--fs-body)]">회사 계정 로그인으로 이동 중...</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
          <Loader2 size={20} className="animate-spin text-[var(--text-3)]" />
        </div>
      }
    >
      <LoginRedirect />
    </Suspense>
  );
}
