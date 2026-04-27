"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

interface PillProps {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Pill({ active, onClick, icon, children, className }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--r-pill)] text-[12px] font-medium",
        "border transition-colors",
        active
          ? "bg-[rgba(94,106,210,0.18)] text-[#C4CAFF] border-[rgba(130,143,255,0.34)]"
          : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text-1)]",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}
