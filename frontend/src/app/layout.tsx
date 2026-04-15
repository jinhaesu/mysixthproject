import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "근태 관리 시스템",
  description: "엑셀 기반 근태 관리 및 분석 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-[#08090A] text-[#F7F8F8]">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
