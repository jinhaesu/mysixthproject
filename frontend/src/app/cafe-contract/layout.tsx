import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "널담은공간 카페팀 근로계약서",
  description: "본인 전용 근로계약서 — 외부 공유 금지",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  referrer: "no-referrer",
};

export default function CafeContractLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
