"use client";
import { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  height?: number;
  actions?: ReactNode;
  legend?: ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  invertDelta?: boolean;
  loading?: boolean;
  empty?: boolean;
  emptyState?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export default function ChartCard({
  title,
  subtitle,
  eyebrow,
  height = 280,
  actions,
  legend,
  delta,
  deltaLabel,
  invertDelta,
  loading,
  empty,
  emptyState,
  footer,
  className = "",
  bodyClassName = "",
  children,
}: Props) {
  const numericDelta =
    typeof delta === "number" && Number.isFinite(delta) ? delta : null;
  const isPositive = numericDelta !== null && numericDelta > 0;
  const isNegative = numericDelta !== null && numericDelta < 0;
  const goodWhenUp = !invertDelta;
  const isGood = (isPositive && goodWhenUp) || (isNegative && !goodWhenUp);
  const isBad = (isNegative && goodWhenUp) || (isPositive && !goodWhenUp);

  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--border-1)] bg-[var(--bg-1)] surface-bevel",
        "flex flex-col overflow-hidden hover-lift",
        className
      )}
    >
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <div className="text-eyebrow mb-1">{eyebrow}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[var(--fs-base)] font-semibold tracking-[var(--tracking-tight)] text-[var(--text-1)] leading-tight">
              {title}
            </h3>
            {numericDelta !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[10.5px] font-medium tabular px-1.5 py-0.5 rounded-[5px]",
                  isGood
                    ? "text-[var(--success-fg)] bg-[var(--success-bg)]"
                    : isBad
                    ? "text-[var(--danger-fg)] bg-[var(--danger-bg)]"
                    : "text-[var(--text-3)] bg-white/[0.04]"
                )}
              >
                {isPositive ? (
                  <ArrowUpRight size={10} />
                ) : isNegative ? (
                  <ArrowDownRight size={10} />
                ) : (
                  <Minus size={10} />
                )}
                {Math.abs(numericDelta).toFixed(1)}%
              </span>
            )}
            {deltaLabel && (
              <span className="text-[10.5px] text-[var(--text-3)]">
                {deltaLabel}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5 leading-snug">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="shrink-0 flex items-center gap-1.5">{actions}</div>
        )}
      </div>

      {legend && (
        <div className="px-4 pb-2 flex items-center gap-3 flex-wrap text-[11.5px] text-[var(--text-3)]">
          {legend}
        </div>
      )}

      <div className={cn("relative px-2 pb-3", bodyClassName)} style={{ width: "100%", height }}>
        {loading ? (
          <div className="absolute inset-0 mx-2 my-1 skeleton rounded-[var(--r-md)]" />
        ) : empty ? (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--text-3)]">
            {emptyState ?? "표시할 데이터가 없습니다"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>

      {footer && (
        <div className="px-4 pt-2 pb-3 border-t border-[var(--border-1)] text-[11.5px] text-[var(--text-3)]">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Tooltip styling 통합 — Recharts contentStyle에 spread해서 사용 */
export const TOOLTIP_STYLE = {
  background: "var(--bg-2)",
  border: "1px solid var(--border-2)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--text-1)",
  boxShadow: "var(--elev-2)",
  padding: "8px 10px",
};
