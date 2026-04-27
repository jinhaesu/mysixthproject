"use client";

import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:   "bg-[var(--brand-500)] hover:bg-[var(--brand-600)] active:bg-[var(--brand-700)] text-white border-transparent",
  secondary: "bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-1)] border-[var(--border-2)]",
  ghost:     "bg-transparent hover:bg-[var(--bg-2)] text-[var(--text-2)] border-transparent",
  danger:    "bg-[var(--danger-bg)] hover:bg-[#F8717125] text-[var(--danger-fg)] border-[var(--danger-border)]",
  outline:   "bg-transparent hover:bg-[var(--bg-2)] text-[var(--text-1)] border-[var(--border-2)]",
};

const SIZE: Record<Size, string> = {
  xs: "h-7 px-2 text-[var(--fs-caption)] gap-1.5",
  sm: "h-8 px-3 text-[var(--fs-body)] gap-1.5",
  md: "h-9 px-3.5 text-[var(--fs-base)] gap-2",
  lg: "h-11 px-4 text-[var(--fs-base)] gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "sm", leadingIcon, trailingIcon, loading, className = "", children, disabled, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        {...rest}
        className={[
          "inline-flex items-center justify-center font-medium rounded-[var(--r-md)] border ring-focus",
          "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          VARIANT[variant],
          SIZE[size],
          className,
        ].join(" ")}
      >
        {loading ? (
          <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : leadingIcon}
        {children}
        {trailingIcon}
      </button>
    );
  }
);
Button.displayName = "Button";
