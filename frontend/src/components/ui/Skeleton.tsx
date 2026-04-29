"use client";

import { CSSProperties } from "react";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  width?: number | string;
  height?: number | string;
  rounded?: "sm" | "md" | "lg" | "full";
}

const RADIUS = { sm: "rounded-[var(--r-sm)]", md: "rounded-[var(--r-md)]", lg: "rounded-[var(--r-lg)]", full: "rounded-full" };

export function Skeleton({ className = "", style, width, height, rounded = "md" }: SkeletonProps) {
  return (
    <span
      className={`block skeleton ${RADIUS[rounded]} ${className}`}
      style={{ width, height: height ?? "0.875rem", ...style }}
      aria-hidden
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height="0.75rem" width={`${85 - (i * 12)}%`} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`p-4 rounded-[var(--r-lg)] border border-[var(--border-1)] bg-[var(--bg-1)] ${className}`}>
      <Skeleton width="40%" height="0.6875rem" className="mb-3" />
      <Skeleton width="60%" height="1.6rem" className="mb-2" />
      <Skeleton width="35%" height="0.75rem" />
    </div>
  );
}

export function SkeletonChart({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-[var(--r-xl)] border border-[var(--border-1)] bg-[var(--bg-1)] p-4">
      <Skeleton width="35%" height="0.875rem" className="mb-2" />
      <Skeleton width="55%" height="0.6875rem" className="mb-4" />
      <Skeleton height={height} />
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-1)] bg-[var(--bg-1)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-1)] flex items-center gap-3 bg-[var(--bg-2)]">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height="0.625rem" width={`${100 / cols - 4}%`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3 flex items-center gap-3 border-b border-[var(--border-1)] last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} height="0.75rem" width={`${100 / cols - 4}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}
