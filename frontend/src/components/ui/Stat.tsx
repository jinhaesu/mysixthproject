"use client";

import { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_RING: Record<Tone, string> = {
  neutral: "from-[#9CA3AF20] to-transparent text-[var(--text-2)]",
  brand:   "from-[#828FFF22] to-transparent text-[var(--brand-400)]",
  success: "from-[#34D39922] to-transparent text-[var(--success-fg)]",
  warning: "from-[#F5BB4222] to-transparent text-[var(--warning-fg)]",
  danger:  "from-[#F8717122] to-transparent text-[var(--danger-fg)]",
  info:    "from-[#60A5FA22] to-transparent text-[var(--info-fg)]",
};

const TONE_ICON_BG: Record<Tone, string> = {
  neutral: "bg-[var(--bg-3)] text-[var(--text-2)]",
  brand:   "bg-[#5E6AD220] text-[var(--brand-400)]",
  success: "bg-[var(--success-bg)] text-[var(--success-fg)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
  danger:  "bg-[var(--danger-bg)] text-[var(--danger-fg)]",
  info:    "bg-[var(--info-bg)] text-[var(--info-fg)]",
};

const TONE_LINE: Record<Tone, string> = {
  neutral: "#9CA3AF",
  brand:   "#828FFF",
  success: "#34D399",
  warning: "#F5BB42",
  danger:  "#F87171",
  info:    "#60A5FA",
};

interface StatProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  tone?: Tone;
  /** Recent trend, used to draw a small sparkline */
  trend?: number[];
  /** Delta vs previous period (e.g. +12, -3.4); rendered as small chip */
  delta?: { value: number; format?: (v: number) => string; positiveIsGood?: boolean };
  hint?: string;
}

export function Stat({ label, value, unit, icon, tone = "neutral", trend, delta, hint }: StatProps) {
  const trendId = `t-${label.replace(/\s+/g, "")}-${tone}`;
  const stroke = TONE_LINE[tone];
  const sparkData = (trend && trend.length > 0)
    ? trend.map((v, i) => ({ i, v }))
    : null;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-1)]",
        "bg-[var(--bg-1)] p-4 hover-lift",
      ].join(" ")}
    >
      {/* Top accent gradient */}
      <div
        className={`absolute inset-x-0 top-0 h-12 bg-gradient-to-b pointer-events-none opacity-60 ${TONE_RING[tone]}`}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon && (
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${TONE_ICON_BG[tone]}`}>
                {icon}
              </span>
            )}
            <p className="text-[var(--fs-micro)] uppercase tracking-wider text-[var(--text-3)] font-medium">{label}</p>
          </div>
          <p className="mt-2.5 tabular text-[var(--fs-h2)] font-semibold leading-none text-[var(--text-1)]">
            {value}
            {unit && <span className="ml-1 text-[var(--fs-caption)] text-[var(--text-3)] font-medium">{unit}</span>}
          </p>
          {hint && <p className="mt-1.5 text-[var(--fs-caption)] text-[var(--text-3)]">{hint}</p>}
          {delta && <DeltaChip {...delta} />}
        </div>
        {sparkData && (
          <div className="w-20 h-12 -mr-1 -mt-1 opacity-90">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id={trendId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} fill={`url(#${trendId})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function DeltaChip({ value, format, positiveIsGood = true }: { value: number; format?: (v: number) => string; positiveIsGood?: boolean }) {
  if (!isFinite(value) || value === 0) return null;
  const isUp = value > 0;
  const good = positiveIsGood ? isUp : !isUp;
  const cls = good
    ? "bg-[var(--success-bg)] text-[var(--success-fg)] border-[var(--success-border)]"
    : "bg-[var(--danger-bg)] text-[var(--danger-fg)] border-[var(--danger-border)]";
  const arrow = isUp ? "▲" : "▼";
  return (
    <span className={`mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[var(--fs-micro)] font-medium tabular ${cls}`}>
      <span className="text-[10px]">{arrow}</span>
      {format ? format(Math.abs(value)) : Math.abs(value).toFixed(1)}
    </span>
  );
}
