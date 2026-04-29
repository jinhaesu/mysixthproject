"use client";

import { ReactNode, HTMLAttributes } from "react";

type Tone = "default" | "elevated" | "ghost";
type Padding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  padding?: Padding;
  interactive?: boolean;
}

const TONE: Record<Tone, string> = {
  default:  "bg-[var(--bg-1)] border border-[var(--border-1)]",
  elevated: "bg-[var(--bg-2)] border border-[var(--border-1)] shadow-[var(--elev-1)]",
  ghost:    "bg-transparent border border-[var(--border-1)]",
};

const PAD: Record<Padding, string> = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-5",
};

export function Card({
  tone = "default",
  padding = "md",
  interactive,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={[
        "rounded-[var(--r-lg)]",
        TONE[tone],
        PAD[padding],
        interactive ? "hover-lift cursor-pointer" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, actions, className = "" }: CardHeaderProps) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] tracking-[var(--tracking-tight)]">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-[var(--fs-caption)] text-[var(--text-3)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
