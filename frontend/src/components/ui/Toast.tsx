"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastApi {
  push: (t: Omit<ToastItem, "id" | "duration"> & { duration?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback<ToastApi["push"]>((t) => {
    const id = ++_id;
    const item: ToastItem = { id, duration: t.duration ?? 3500, ...t };
    setItems((s) => [...s, item]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), item.duration);
  }, []);

  const api: ToastApi = {
    push,
    success: (title, description) => push({ tone: "success", title, description }),
    error: (title, description) => push({ tone: "error", title, description, duration: 5000 }),
    info: (title, description) => push({ tone: "info", title, description }),
    warning: (title, description) => push({ tone: "warning", title, description, duration: 4500 }),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={(id) => setItems((s) => s.filter((x) => x.id !== id))} />
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // Fallback to console so missing provider does not crash a page; never null.
    return {
      push: (t) => console.log("[toast]", t),
      success: (t, d) => console.log("[toast:success]", t, d),
      error: (t, d) => console.error("[toast:error]", t, d),
      info: (t, d) => console.log("[toast:info]", t, d),
      warning: (t, d) => console.warn("[toast:warn]", t, d),
    };
  }
  return ctx;
}

const TONE_ICON = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
};

const TONE_CLASS = {
  success: "text-[var(--success-fg)] bg-[var(--success-bg)] border-[var(--success-border)]",
  error: "text-[var(--danger-fg)] bg-[var(--danger-bg)] border-[var(--danger-border)]",
  info: "text-[var(--info-fg)] bg-[var(--info-bg)] border-[var(--info-border)]",
  warning: "text-[var(--warning-fg)] bg-[var(--warning-bg)] border-[var(--warning-border)]",
};

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[320px] pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-[10px] border shadow-[var(--elev-pop)] backdrop-blur",
            "bg-[var(--bg-2)]/95 border-[var(--border-2)]",
            "p-3 flex items-start gap-2.5 fade-in"
          )}
        >
          <span
            className={cn(
              "shrink-0 w-7 h-7 rounded-[7px] inline-flex items-center justify-center border",
              TONE_CLASS[t.tone]
            )}
          >
            {TONE_ICON[t.tone]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--text-1)] leading-snug">{t.title}</div>
            {t.description && (
              <div className="text-[12px] text-[var(--text-3)] mt-0.5 leading-snug">{t.description}</div>
            )}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 p-1 -m-1 text-[var(--text-3)] hover:text-[var(--text-1)] rounded-[5px] transition-colors"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
