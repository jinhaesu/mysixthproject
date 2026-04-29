"use client";

import { ReactNode } from "react";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet";
type Size = "xs" | "sm" | "md";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--bg-3)] text-[var(--text-2)] border-[var(--border-2)]",
  brand:   "bg-[#5E6AD220] text-[var(--brand-400)] border-[#5E6AD244]",
  success: "bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-border)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning-fg)] border-[var(--warning-border)]",
  danger:  "bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[var(--danger-border)]",
  info:    "bg-[var(--info-bg)] text-[var(--info-fg)] border-[var(--info-border)]",
  violet:  "bg-[#A855F720] text-[#C084FC] border-[#A855F744]",
};

const SIZE: Record<Size, string> = {
  xs: "px-1.5 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

interface BadgeProps {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", size = "sm", dot, pulse, children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border font-medium tabular whitespace-nowrap",
        TONE[tone],
        SIZE[size],
        className,
      ].join(" ")}
    >
      {dot && (
        <span
          className={[
            "inline-block w-1.5 h-1.5 rounded-full",
            tone === "neutral" ? "bg-[var(--text-3)]" :
            tone === "brand"   ? "bg-[var(--brand-400)]" :
            tone === "success" ? "bg-[var(--success-fg)]" :
            tone === "warning" ? "bg-[var(--warning-fg)]" :
            tone === "danger"  ? "bg-[var(--danger-fg)]" :
            tone === "info"    ? "bg-[var(--info-fg)]" :
            "bg-[#C084FC]",
            pulse ? "pulse-dot" : "",
          ].join(" ")}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
