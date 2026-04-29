"use client";

import { ReactNode } from "react";
import { cn } from "./cn";

export function Toolbar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 p-2 rounded-[var(--r-lg)]",
        "border border-[var(--border-1)] bg-[var(--bg-1)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarSpacer() {
  return <div className="flex-1" />;
}

export function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--border-2)] mx-1" />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: { id: T; label: ReactNode; icon?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center p-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--bg-2)]",
        className
      )}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12px]",
              active
                ? "bg-[var(--bg-3)] text-[var(--text-1)] shadow-[var(--elev-1)]"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]"
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
