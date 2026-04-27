"use client";

import { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, meta, className = "" }: PageHeaderProps) {
  return (
    <header className={`mb-6 ${className}`}>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-1.5 inline-flex items-center gap-1.5 text-[var(--fs-micro)] uppercase tracking-wider text-[var(--text-3)] font-medium">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[var(--fs-h2)] font-semibold tracking-[var(--tracking-tight)] text-[var(--text-1)]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[var(--fs-body)] text-[var(--text-3)] max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[var(--fs-caption)] text-[var(--text-3)]">{meta}</div>}
    </header>
  );
}

interface SectionProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, subtitle, actions, children, className = "" }: SectionProps) {
  return (
    <section className={`mb-6 ${className}`}>
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            {title && <h2 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] tracking-[var(--tracking-tight)]">{title}</h2>}
            {subtitle && <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
