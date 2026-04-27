"use client";

import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Loader2
      size={size}
      className={cn("animate-spin text-[var(--text-3)]", className)}
    />
  );
}

export function CenterSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-3 text-[var(--text-3)] text-[13px]">
      <Spinner size={18} />
      {label || "불러오는 중…"}
    </div>
  );
}
