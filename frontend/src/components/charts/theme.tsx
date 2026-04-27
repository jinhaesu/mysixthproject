"use client";

import { ReactNode } from "react";
import { CHART_COLORS, CHART_GRADIENTS, GradientKey } from "@/lib/chartColors";

/**
 * Chart theme — single source of truth for axis, grid, tooltip, legend, gradients.
 * Use these primitives inside Recharts compositions to keep all charts visually consistent.
 */

export const CHART_AXIS_PROPS = {
  stroke: "var(--border-2)",
  tickLine: false,
  axisLine: { stroke: "var(--border-2)" },
  tick: { fill: "var(--text-3)", fontSize: 11, letterSpacing: -0.1 },
} as const;

export const CHART_GRID_PROPS = {
  stroke: "var(--border-1)",
  strokeDasharray: "3 4",
  vertical: false,
} as const;

/** Custom tooltip — premium, dark, restrained. */
export interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
  unit?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipPayloadItem[];
  formatter?: (value: number | string, name: string, item: TooltipPayloadItem) => ReactNode;
  labelFormatter?: (label: string | number) => ReactNode;
  unit?: string;
  hideLabel?: boolean;
}

export function ChartTooltip({
  active,
  label,
  payload,
  formatter,
  labelFormatter,
  unit,
  hideLabel,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-[var(--r-lg)] border border-[var(--border-2)] bg-[var(--bg-2)] shadow-[var(--elev-pop)] px-3 py-2 min-w-[120px] max-w-[280px]"
      style={{ pointerEvents: "none" }}
    >
      {!hideLabel && label !== undefined && (
        <div className="text-[11.5px] font-medium text-[var(--text-2)] mb-1.5 leading-snug border-b border-[var(--border-1)] pb-1.5">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => {
          const v =
            typeof p.value === "number"
              ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : p.value;
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 text-[12px]"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block w-2 h-2 rounded-[2px] shrink-0"
                  style={{ background: p.color }}
                />
                <span className="text-[var(--text-3)] truncate">{p.name}</span>
              </div>
              <span className="text-[var(--text-1)] font-medium tabular shrink-0">
                {formatter ? formatter(p.value ?? 0, p.name ?? "", p) : v}
                {unit && <span className="text-[var(--text-3)] ml-0.5">{unit}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const CHART_LEGEND_PROPS = {
  iconType: "circle" as const,
  iconSize: 8,
  wrapperStyle: {
    fontSize: 11.5,
    color: "var(--text-2)",
    paddingTop: 12,
  },
};

/**
 * Inline gradient defs for AreaChart fills.
 * Usage:
 *   <defs>{ChartGradients(['brand', 'green'])}</defs>
 *   <Area fill="url(#grad-brand)" stroke="#7070FF" />
 */
export function ChartGradients({ keys = [] as GradientKey[] }: { keys?: GradientKey[] }) {
  return (
    <>
      {keys.map((k) => {
        const g = CHART_GRADIENTS[k];
        if (!g) return null;
        return (
          <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={g.from} stopOpacity={0.45} />
            <stop offset="100%" stopColor={g.to} stopOpacity={0.02} />
          </linearGradient>
        );
      })}
    </>
  );
}

/** All-in-one defs block for area+bar charts. Render inside <svg>'s <defs>. */
export function ChartDefs({ index = 8 }: { index?: number }) {
  const keys = (Object.keys(CHART_GRADIENTS) as GradientKey[]).slice(0, index);
  return <ChartGradients keys={keys} />;
}

/** Fixed-color cycle for series. Use lib/chartColors.getColor for raw hex. */
export const seriesColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];
