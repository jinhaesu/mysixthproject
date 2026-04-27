"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, AlertCircle, KeyRound, ArrowLeft } from "lucide-react";
import { Button, Input, Field, Card } from "@/components/ui";

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
      if (!res.ok) { setError(data.error || "인증 코드 발송에 실패했습니다."); return; }
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
      if (!res.ok) { setError(data.error || "인증에 실패했습니다."); return; }
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
      if (!res.ok) { setError(data.error || "재발송에 실패했습니다."); return; }
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] px-4 fade-in">
      <div className="w-full max-w-md">
        <Card padding="lg" tone="default" className="shadow-[var(--elev-3)] surface-bevel">
          {/* Brand mark + title */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-[var(--r-xl)] gradient-brand flex items-center justify-center mx-auto mb-5 shadow-[var(--elev-2)]"
                 style={{ background: 'linear-gradient(135deg, var(--brand-500) 0%, var(--brand-400) 100%)' }}>
              <span className="text-white text-[var(--fs-h3)] font-bold select-none">J</span>
            </div>
            <h1 className="text-h2 text-gradient-brand">근태 관리 시스템</h1>
            <p className="text-[var(--text-3)] mt-2 text-[var(--fs-body)]">
              {step === "email" ? "이메일로 로그인하세요" : "인증 코드를 입력하세요"}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-3.5 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] flex items-center gap-3">
              <AlertCircle size={18} className="text-[var(--danger-fg)] shrink-0" />
              <p className="text-[var(--fs-body)] text-[var(--danger-fg)]">{error}</p>
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-5">
              <Field label="이메일" required>
                <Input
                  id="email"
                  type="email"
                  inputSize="lg"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일을 입력하세요"
                  required
                  iconLeft={<Mail size={16} />}
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                className="w-full"
              >
                {loading ? "발송 중..." : "인증 코드 발송"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="p-3 bg-[var(--info-bg)] rounded-[var(--r-md)] border border-[var(--info-border)]">
                <p className="text-[var(--fs-body)] text-[var(--info-fg)]">
                  <span className="font-medium">{email}</span>로 인증 코드를 발송했습니다.
                </p>
              </div>
              <Field label="인증 코드 (6자리)" required>
                <Input
                  id="code"
                  type="text"
                  inputSize="lg"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  maxLength={6}
                  iconLeft={<KeyRound size={16} />}
                  className="text-center text-xl tracking-[0.5em] font-mono tabular"
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                disabled={loading || code.length !== 6}
                className="w-full"
              >
                {loading ? "확인 중..." : "확인"}
              </Button>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => { setStep("email"); setCode(""); setError(""); }}
                  className="text-[var(--fs-body)] text-[var(--text-3)] hover:text-[var(--text-2)] flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft size={14} />
                  이메일 변경
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0 || loading}
                  className="text-eyebrow tabular text-[var(--brand-400)] hover:text-[var(--brand-200)] disabled:text-[var(--text-4)] disabled:cursor-not-allowed transition-colors"
                >
                  {countdown > 0 ? `재발송 (${countdown}초)` : "코드 재발송"}
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
