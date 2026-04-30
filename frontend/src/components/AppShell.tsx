"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";

const PUBLIC_PAGES = [
  "/login",
  "/s",
  "/r",
  "/report",
  "/report-regular",
  "/contract",
  "/regular-contract",
  "/resignation-letter",
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_PAGES.includes(pathname);

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
