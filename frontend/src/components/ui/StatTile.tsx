"use client";

import { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "./cn";

interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: number | null;
  deltaLabel?: string;
  icon?: ReactNode;
  iconTone?: "brand" | "success" | "warning" | "danger" | "info" | "neutral";
  hint?: ReactNode;
  trend?: ReactNode;
  invertDelta?: boolean;
  className?: string;
}

const ICON_TONE: Record<NonNullable<StatTileProps["iconTone"]>, string> = {
  brand: "bg-[rgba(94,106,210,0.14)] text-[#C4CAFF]",
  success: "bg-[var(--success-bg)] text-[var(--success-fg)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  danger: "bg-[var(--danger-bg)] text-[var(--danger-fg)]",
  info: "bg-[var(--info-bg)] text-[var(--info-fg)]",
  neutral: "bg-white/[0.05] text-[var(--text-2)]",
};

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  icon,
  iconTone = "neutral",
  hint,
  trend,
  invertDelta,
  className,
}: StatTileProps) {
  const numericDelta = typeof delta === "number" && Number.isFinite(delta) ? delta : null;
  const isPositive = numericDelta !== null && numericDelta > 0;
  const isNegative = numericDelta !== null && numericDelta < 0;
  const goodWhenUp = !invertDelta;
  const isGood = (isPositive && goodWhenUp) || (isNegative && !goodWhenUp);
  const isBad = (isNegative && goodWhenUp) || (isPositive && !goodWhenUp);

  return (
    <div
      className={cn(
        "relative rounded-[var(--r-xl)] border border-[var(--border-1)] bg-[var(--bg-1)]",
        "px-4 pt-3.5 pb-4 surface-bevel overflow-hidden",
        "transition-colors hover:border-[var(--border-2)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-eyebrow truncate">{label}</div>
        {icon && (
          <div
            className={cn(
              "shrink-0 w-7 h-7 rounded-[8px] flex items-center justify-center",
              ICON_TONE[iconTone]
            )}
          >
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5 tabular">
        <span className="text-[26px] leading-none font-semibold tracking-[-0.022em] text-[var(--text-1)]">
          {value}
        </span>
        {unit && (
          <span className="text-[12px] text-[var(--text-3)] font-medium">{unit}</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 min-h-[18px]">
        <div className="flex items-center gap-1.5">
          {numericDelta !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular px-1.5 py-0.5 rounded-[5px]",
                isGood
                  ? "text-[var(--success-fg)] bg-[var(--success-bg)]"
                  : isBad
                  ? "text-[var(--danger-fg)] bg-[var(--danger-bg)]"
                  : "text-[var(--text-3)] bg-white/[0.04]"
              )}
            >
              {isPositive ? (
                <ArrowUpRight size={12} />
              ) : isNegative ? (
                <ArrowDownRight size={12} />
              ) : (
                <Minus size={12} />
              )}
              {Math.abs(numericDelta).toFixed(1)}%
            </span>
          )}
          {deltaLabel && (
            <span className="text-[11px] text-[var(--text-3)]">{deltaLabel}</span>
          )}
          {hint && !numericDelta && (
            <span className="text-[11px] text-[var(--text-3)]">{hint}</span>
          )}
        </div>
        {trend && <div className="shrink-0 opacity-80">{trend}</div>}
      </div>
    </div>
  );
}
