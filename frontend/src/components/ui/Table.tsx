"use client";

import { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "./cn";

export function Table({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-auto rounded-[var(--r-lg)] border border-[var(--border-1)] bg-[var(--bg-1)]">
      <table
        className={cn(
          "w-full text-[12.5px] tabular border-separate border-spacing-0",
          className
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

export function THead({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("bg-[var(--bg-2)] sticky top-0 z-[1]", className)} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export function TR({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("hover:bg-white/[0.02] transition-colors", className)}
      {...rest}
    >
      {children}
    </tr>
  );
}

interface ThProps extends ThHTMLAttributes<HTMLTableHeaderCellElement> {
  align?: "left" | "right" | "center";
  numeric?: boolean;
}

export function TH({ align, numeric, className, children, ...rest }: ThProps) {
  const eff = align ?? (numeric ? "right" : "left");
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)]",
        "border-b border-[var(--border-1)] bg-[var(--bg-2)]",
        "whitespace-nowrap",
        eff === "right" && "text-right",
        eff === "center" && "text-center",
        eff === "left" && "text-left",
        numeric && "tabular",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableDataCellElement> {
  align?: "left" | "right" | "center";
  numeric?: boolean;
  muted?: boolean;
  emphasis?: boolean;
}

export function TD({
  align,
  numeric,
  muted,
  emphasis,
  className,
  children,
  ...rest
}: TdProps) {
  const eff = align ?? (numeric ? "right" : "left");
  return (
    <td
      className={cn(
        "px-3 py-2.5 border-b border-[var(--border-1)]",
        muted ? "text-[var(--text-3)]" : emphasis ? "text-[var(--text-1)] font-medium" : "text-[var(--text-2)]",
        eff === "right" && "text-right",
        eff === "center" && "text-center",
        numeric && "tabular",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
