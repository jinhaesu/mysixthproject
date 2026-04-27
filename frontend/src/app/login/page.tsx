"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, AlertCircle, KeyRound, ArrowLeft } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const startCountdown = () => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "인증 코드 발송에 실패했습니다.");
        return;
      }

      setChallengeToken(data.challengeToken);
      setStep("code");
      startCountdown();
    } catch (err: any) {
      console.error("Send code error:", err, "API_URL:", API_URL);
      setError(`서버에 연결할 수 없습니다. (${err?.message || "네트워크 오류"})`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "인증에 실패했습니다.");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/");
    } catch (err: any) {
      console.error("Verify error:", err, "API_URL:", API_URL);
      setError(`서버에 연결할 수 없습니다. (${err?.message || "네트워크 오류"})`);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "재발송에 실패했습니다.");
        return;
      }

      setChallengeToken(data.challengeToken);
      startCountdown();
    } catch (err: any) {
      console.error("Resend error:", err, "API_URL:", API_URL);
      setError(`서버에 연결할 수 없습니다. (${err?.message || "네트워크 오류"})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08090A]">
      <div className="w-full max-w-md">
        <div className="bg-[#0F1011] rounded-2xl shadow-[0px_7px_32px_rgba(0,0,0,0.35)] p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#4EA7FC]/15 rounded-full flex items-center justify-center mx-auto mb-4">
              {step === "email" ? (
                <Mail size={32} className="text-[#7070FF]" />
              ) : (
                <KeyRound size={32} className="text-[#7070FF]" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-[#F7F8F8]">근태 관리 시스템</h1>
            <p className="text-[#8A8F98] mt-2">
              {step === "email" ? "이메일로 로그인하세요" : "인증 코드를 입력하세요"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-lg flex items-center gap-3">
              <AlertCircle size={20} className="text-[#EB5757] shrink-0" />
              <p className="text-sm text-[#EB5757]">{error}</p>
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#D0D6E0] mb-1">
                  이메일
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#62666D]" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="이메일을 입력하세요"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none transition-colors text-[#F7F8F8]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#5E6AD2] text-white font-medium rounded-lg hover:bg-[#828FFF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "발송 중..." : "인증 코드 발송"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="p-3 bg-[#4EA7FC]/10 rounded-lg mb-2">
                <p className="text-sm text-[#828FFF]">
                  <span className="font-medium">{email}</span>로 인증 코드를 발송했습니다.
                </p>
              </div>
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-[#D0D6E0] mb-1">
                  인증 코드 (6자리)
                </label>
                <div className="relative">
                  <KeyRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#62666D]" />
                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    required
                    maxLength={6}
                    className="w-full pl-10 pr-4 py-3 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none transition-colors text-[#F7F8F8] text-center text-xl tracking-[0.5em] font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 bg-[#5E6AD2] text-white font-medium rounded-lg hover:bg-[#828FFF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "확인 중..." : "확인"}
              </button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setCode(""); setError(""); }}
                  className="text-sm text-[#8A8F98] hover:text-[#D0D6E0] flex items-center gap-1"
                >
                  <ArrowLeft size={14} />
                  이메일 변경
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0 || loading}
                  className="text-sm text-[#7070FF] hover:text-[#828FFF] disabled:text-[#62666D] disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `재발송 (${countdown}초)` : "코드 재발송"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
