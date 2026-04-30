"use client";
import { useState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";

const STORAGE_KEY = "secureGate_validUntil";
const TTL_MS = 20 * 60 * 1000; // 20 minutes

function readValidUntil(): number {
  if (typeof window === "undefined") return 0;
  const v = sessionStorage.getItem(STORAGE_KEY);
  return v ? Number(v) : 0;
}
function writeValidUntil(t: number) {
  sessionStorage.setItem(STORAGE_KEY, String(t));
}
export function isSessionAuthorized(): boolean {
  return Date.now() < readValidUntil();
}
export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export default function SessionPasswordGate({
  title = "보안 메뉴 접근",
  onVerified,
}: {
  title?: string;
  onVerified: () => void;
}) {
  const [authorized, setAuthorized] = useState<boolean>(() => false);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial check (after hydration)
  useEffect(() => {
    if (isSessionAuthorized()) {
      setAuthorized(true);
      onVerified();
      const tick = () => {
        const rem = Math.max(0, readValidUntil() - Date.now());
        setRemaining(rem);
        if (rem === 0) {
          setAuthorized(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      };
      tick();
      intervalRef.current = setInterval(tick, 5000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    inputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.trim()) return;
    setChecking(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/regular/verify-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password: pw }),
        }
      );
      const body = await res.json();
      if (body.verified) {
        writeValidUntil(Date.now() + TTL_MS);
        setAuthorized(true);
        onVerified();
      } else {
        setError("비밀번호가 올바르지 않습니다.");
        setPw("");
        inputRef.current?.focus();
      }
    } catch {
      setError("확인 중 오류가 발생했습니다.");
    } finally {
      setChecking(false);
    }
  };

  // Suppress "remaining" unused warning — it may be used for future UI
  void remaining;

  if (authorized) return null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-1)] rounded-[var(--r-xl)] border border-[var(--border-1)] p-8 w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[rgba(94,106,210,0.18)] flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-[var(--brand-400)]" />
          </div>
          <h2 className="text-[var(--fs-h4)] font-semibold text-[var(--text-1)]">
            {title}
          </h2>
          <p className="text-[11.5px] text-[var(--text-3)] mt-1.5">
            한 번 인증하면 20분간 잠긴 메뉴를 자유롭게 사용할 수 있습니다.
          </p>
        </div>
        <input
          ref={inputRef}
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호 입력"
          className="w-full px-4 py-3 border border-[var(--border-2)] rounded-[var(--r-md)] text-sm bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.18)] mb-3"
          autoComplete="off"
        />
        {error && (
          <p className="text-xs text-[var(--danger-fg)] mb-3">{error}</p>
        )}
        <button
          type="submit"
          disabled={checking || !pw.trim()}
          className="w-full py-3 bg-[var(--brand-500)] text-white rounded-[var(--r-md)] text-sm font-medium hover:bg-[var(--brand-400)] disabled:opacity-50 transition-colors"
        >
          {checking ? "확인 중..." : "확인"}
        </button>
      </form>
    </div>
  );
}
