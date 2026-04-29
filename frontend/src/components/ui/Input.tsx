"use client";

import {
  forwardRef,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "./cn";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[12.5px] rounded-[6px]",
  md: "h-9 px-3 text-[13px] rounded-[8px]",
  lg: "h-10 px-3.5 text-[14px] rounded-[8px]",
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: Size;
  invalid?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = "md", invalid, iconLeft, iconRight, className, ...rest },
  ref
) {
  if (iconLeft || iconRight) {
    return (
      <div
        className={cn(
          "relative inline-flex items-center w-full",
          className
        )}
      >
        {iconLeft && (
          <span className="absolute left-2.5 text-[var(--text-3)] pointer-events-none">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            "w-full bg-[var(--bg-2)] text-[var(--text-1)] border",
            invalid ? "border-[var(--danger-fg)]" : "border-[var(--border-2)]",
            "placeholder:text-[var(--text-4)]",
            "focus:outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.18)]",
            "transition-colors",
            SIZE[inputSize],
            iconLeft ? "pl-8" : null,
            iconRight ? "pr-8" : null
          )}
          {...rest}
        />
        {iconRight && (
          <span className="absolute right-2.5 text-[var(--text-3)] pointer-events-none">
            {iconRight}
          </span>
        )}
      </div>
    );
  }
  return (
    <input
      ref={ref}
      className={cn(
        "bg-[var(--bg-2)] text-[var(--text-1)] border",
        invalid ? "border-[var(--danger-fg)]" : "border-[var(--border-2)]",
        "placeholder:text-[var(--text-4)]",
        "focus:outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.18)]",
        "transition-colors w-full",
        SIZE[inputSize],
        className
      )}
      {...rest}
    />
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: Size;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { inputSize = "md", invalid, className, children, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "bg-[var(--bg-2)] text-[var(--text-1)] border",
        invalid ? "border-[var(--danger-fg)]" : "border-[var(--border-2)]",
        "focus:outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.18)]",
        "transition-colors w-full",
        SIZE[inputSize],
        className
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "bg-[var(--bg-2)] text-[var(--text-1)] border rounded-[8px] px-3 py-2 text-[13px]",
        invalid ? "border-[var(--danger-fg)]" : "border-[var(--border-2)]",
        "placeholder:text-[var(--text-4)]",
        "focus:outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.18)]",
        "transition-colors w-full resize-vertical",
        className
      )}
      {...rest}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-[12px] font-medium text-[var(--text-2)]">
          {label}
          {required && <span className="text-[var(--danger-fg)] ml-0.5">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="text-[11.5px] text-[var(--danger-fg)]">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-[var(--text-3)]">{hint}</span>
      ) : null}
    </label>
  );
}
