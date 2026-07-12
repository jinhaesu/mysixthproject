"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";

// 근로자·외부 사용자용 공개 페이지 prefix.
// SECURITY: startsWith 매칭이라 서브 페이지(예: /r/hazard-report, /r/safety-check, /r/training)도 모두 공개로 판정.
// 이전에 includes 정확일치를 사용해 /r 하위 서브페이지들이 관리자 사이드바로 렌더되던 보안 결함 수정.
const PUBLIC_PREFIXES = [
  "/login",
  "/s",
  "/r",
  "/report",
  "/report-regular",
  "/contract",
  "/regular-contract",
  "/resignation-letter",
  "/onboarding-info",
  "/cafe-contract",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = isPublicPath(pathname);

  if (isPublicPage) return <ToastProvider>{children}</ToastProvider>;

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-[var(--bg-canvas)]">
        <Sidebar />
        <main className="flex-1 ml-64 min-w-0">
          <div className="px-6 lg:px-8 py-7 max-w-[1480px] w-full mx-auto fade-in">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
