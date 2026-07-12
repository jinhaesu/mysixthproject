"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Loader2, ArrowLeft, CheckCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Question { key: string; text: string; type: "yesno" | "select" | "number" | "text"; choices?: string[] }
interface Form {
  version: string;
  description: string;
  questions: Question[];
  allow_anonymous: boolean;
}
interface Survey { id: number; title: string; description: string; form_json: Form }
interface LoadedData {
  employee: { name: string; department: string; team: string };
  survey: Survey;
  period: string;
  period_end: string;
  already_submitted: boolean;
  already_response: any | null;
}

function OpinionContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LoadedData | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/regular-public/${token}/surveys/opinion`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "로드 실패");
        setData(body);
        if (body.already_submitted && body.already_response) {
          try {
            const prev = typeof body.already_response === "string" ? JSON.parse(body.already_response) : body.already_response;
            if (prev?.response) setAnswers(prev.response);
            if (prev?.anonymous) setAnonymous(true);
          } catch {}
        }
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const submit = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/surveys/opinion/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: answers, anonymous }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "제출 실패");
      setDone(true);
    } catch (e: any) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]"><Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" /></div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-canvas)]"><p className="text-[var(--danger-fg)]">{error || "로드 실패"}</p></div>;

  if (done) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center p-4">
        <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-xl)] p-6 text-center max-w-sm w-full">
          <CheckCircle className="w-16 h-16 text-[var(--success-fg)] mx-auto" />
          <h2 className="text-[var(--fs-h4)] font-bold text-[var(--success-fg)] mt-4">응답 완료</h2>
          <p className="text-[var(--fs-body)] text-[var(--success-fg)] mt-2">소중한 의견 감사합니다.</p>
          <a href={`/r?token=${token}`} className="inline-block mt-4 px-4 py-2 bg-[var(--success-fg)] text-white rounded-[var(--r-md)] font-semibold">
            홈으로
          </a>
        </div>
      </div>
    );
  }

  const form = data.survey.form_json;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <div className="bg-[var(--brand-600)] text-white px-4 py-4" style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
        <a href={`/r?token=${token}`} className="inline-flex items-center gap-1 text-white/80 text-[var(--fs-caption)] hover:text-white">
          <ArrowLeft className="w-4 h-4" /> 홈으로
        </a>
        <h1 className="text-[var(--fs-h4)] font-bold mt-2 flex items-center gap-2">
          <MessageSquare className="w-6 h-6" /> {data.survey.title}
        </h1>
        <p className="text-white/80 text-[var(--fs-caption)] mt-1">{data.period} · 마감 {data.period_end}</p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <p className="text-[var(--fs-body)] text-[var(--text-2)]">{form.description}</p>

        {form.allow_anonymous && (
          <label className="flex items-center gap-2 p-3 bg-[var(--info-bg)] border border-[var(--info-border)] rounded-[var(--r-md)] cursor-pointer">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="w-4 h-4 accent-[var(--brand-500)]"
            />
            <span className="text-[var(--fs-caption)] text-[var(--info-fg)]">
              익명으로 제출 (관리자 화면에서 이름·부서가 노출되지 않습니다)
            </span>
          </label>
        )}

        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4 space-y-4">
          {form.questions.map((q) => (
            <div key={q.key}>
              <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)] mb-2">{q.text}</p>
              {q.type === "yesno" ? (
                <div className="flex gap-2">
                  {["예", "아니오"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setAnswers({ ...answers, [q.key]: c })}
                      className={`flex-1 py-2 rounded-[var(--r-md)] text-[var(--fs-body)] font-medium border ${answers[q.key] === c ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]" : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)]"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : q.type === "select" ? (
                <div className="grid grid-cols-1 gap-2">
                  {q.choices?.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAnswers({ ...answers, [q.key]: c })}
                      className={`px-3 py-2 rounded-[var(--r-md)] text-[var(--fs-body)] font-medium border text-left ${answers[q.key] === c ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]" : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)]"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={answers[q.key] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] text-[var(--fs-body)] bg-[var(--bg-2)] text-[var(--text-1)]"
                  placeholder="자유롭게 작성해주세요"
                />
              )}
            </div>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold text-[var(--fs-base)] disabled:opacity-50"
        >
          {submitting ? "..." : "제출"}
        </button>
      </div>
    </div>
  );
}

export default function OpinionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <OpinionContent />
    </Suspense>
  );
}
