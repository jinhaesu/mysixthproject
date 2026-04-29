"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

export function SectionHeader({
  title,
  description,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4 mb-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="text-eyebrow mb-1">{eyebrow}</div>}
        <div className="text-[15px] font-semibold tracking-[-0.012em] text-[var(--text-1)] leading-tight">
          {title}
        </div>
        {description && (
          <div className="text-[12px] text-[var(--text-3)] mt-0.5 leading-snug">
            {description}
          </div>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
