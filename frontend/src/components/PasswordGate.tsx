"use client";

import { useState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";

interface PasswordGateProps {
  onVerified: () => void;
  verifyPassword: (pw: string) => Promise<boolean>;
  title?: string;
}

export default function PasswordGate({ onVerified, verifyPassword, title = "접근 비밀번호를 입력해주세요" }: PasswordGateProps) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.trim()) return;
    setChecking(true);
    setError("");
    try {
      const ok = await verifyPassword(pw);
      if (ok) {
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

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-[#0F1011] rounded-xl border border-[#23252A] p-8 w-full max-w-sm shadow-[0px_1px_3px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-full bg-[#5E6AD2]/10 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-[#7070FF]" />
          </div>
          <h2 className="text-lg font-semibold text-[#F7F8F8]">{title}</h2>
        </div>
        <input
          ref={inputRef}
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="비밀번호 입력"
          className="w-full px-4 py-3 border border-[#23252A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
          autoComplete="off"
        />
        {error && <p className="text-xs text-[#EB5757] mb-3">{error}</p>}
        <button
          type="submit"
          disabled={checking || !pw.trim()}
          className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-[#28282C] disabled:cursor-not-allowed transition-colors"
        >
          {checking ? "확인 중..." : "확인"}
        </button>
      </form>
    </div>
  );
}
