"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`relative overflow-hidden rounded-[var(--r-lg)] border border-dashed border-[var(--border-2)] bg-[var(--bg-1)] py-12 px-6 text-center ${className}`}>
      <div className="absolute inset-0 bg-grid opacity-50 pointer-events-none" aria-hidden />
      <div className="relative">
        {icon && (
          <div className="mx-auto mb-4 inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--bg-2)] text-[var(--text-3)] ring-1 ring-[var(--border-2)]">
            {icon}
          </div>
        )}
        <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">{title}</h3>
        {description && <p className="mt-1.5 text-[var(--fs-caption)] text-[var(--text-3)] max-w-sm mx-auto">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
