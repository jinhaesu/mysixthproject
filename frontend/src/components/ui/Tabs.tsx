"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

interface Tab<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: "underline" | "pill";
  size?: "sm" | "md";
  className?: string;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = "underline",
  size = "md",
  className,
}: TabsProps<T>) {
  if (variant === "pill") {
    return (
      <div
        role="tablist"
        className={cn(
          "inline-flex items-center gap-1 p-1 rounded-[10px] border border-[var(--border-1)] bg-[var(--bg-1)]",
          className
        )}
      >
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-colors",
                "disabled:opacity-50 disabled:pointer-events-none",
                size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
                active
                  ? "bg-[var(--bg-3)] text-[var(--text-1)] shadow-[var(--elev-1)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-white/[0.03]"
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "ml-0.5 text-[10.5px] tabular px-1.5 py-0.5 rounded-[4px]",
                    active
                      ? "bg-[var(--brand-500)]/22 text-[#C4CAFF]"
                      : "bg-white/[0.05] text-[var(--text-3)]"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // underline
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-stretch gap-1 border-b border-[var(--border-1)]",
        className
      )}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex items-center gap-2 px-3 font-medium transition-colors",
              "disabled:opacity-40 disabled:pointer-events-none",
              size === "sm" ? "h-9 text-[12.5px]" : "h-10 text-[13px]",
              active
                ? "text-[var(--text-1)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "text-[10.5px] tabular px-1.5 py-0.5 rounded-[4px]",
                  active
                    ? "bg-[rgba(94,106,210,0.18)] text-[#C4CAFF]"
                    : "bg-white/[0.05] text-[var(--text-3)]"
                )}
              >
                {t.count}
              </span>
            )}
            {active && (
              <span
                className="absolute bottom-[-1px] left-1.5 right-1.5 h-[2px] rounded-t-full bg-[var(--brand-400)]"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
