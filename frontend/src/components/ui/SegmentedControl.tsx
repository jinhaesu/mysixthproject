"use client";

import { ReactNode } from "react";

interface Option<T> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value, options, onChange, size = "sm", className = "", ariaLabel,
}: SegmentedControlProps<T>) {
  const pad = size === "sm" ? "px-2.5 py-1.5 text-[var(--fs-caption)]" : "px-3 py-2 text-[var(--fs-body)]";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex p-0.5 gap-0.5 rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--bg-2)] ${className}`}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={[
              "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] font-medium transition-all ring-focus",
              pad,
              active
                ? "bg-[var(--bg-3)] text-[var(--text-1)] shadow-[var(--elev-1)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]",
            ].join(" ")}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
