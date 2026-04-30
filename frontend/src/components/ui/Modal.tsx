"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  hideClose?: boolean;
}

const SIZE = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  hideClose,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const overlay = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 fade-in">
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full bg-[var(--bg-2)] rounded-[var(--r-xl)]",
          "border border-[var(--border-2)] shadow-[var(--elev-pop)]",
          "max-h-[88vh] overflow-hidden flex flex-col surface-bevel",
          SIZE[size],
          className
        )}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--border-1)]">
            <div className="min-w-0">
              {title && (
                <div className="text-[15px] font-semibold tracking-[-0.012em] text-[var(--text-1)]">
                  {title}
                </div>
              )}
              {description && (
                <div className="text-[12.5px] text-[var(--text-3)] mt-0.5 leading-snug">
                  {description}
                </div>
              )}
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                className="shrink-0 -m-1 p-1 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-white/[0.05] rounded-[6px] transition-colors"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4 flex-1 scrollbar-thin">
          {children}
        </div>
        {footer && (
          <div className="px-5 py-3 border-t border-[var(--border-1)] flex items-center justify-end gap-2 bg-[var(--bg-1)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
