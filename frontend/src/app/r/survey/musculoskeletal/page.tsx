"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileText, Loader2, ArrowLeft, CheckCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface BodyPart { key: string; label: string }
interface Question { key: string; text: string; type: "yesno" | "select" | "number" | "text"; choices?: string[] }
interface Form {
  version: string;
  description: string;
  body_parts: BodyPart[];
  questions: Question[];
  overall: Question[];
}
interface Survey { id: number; title: string; description: string; form_json: Form }
interface LoadedData {
  employee: { name: string; department: string; team: string };
  survey: Survey;
  period: string;
  period_end: string;
  already_submitted: boolean;
  already_response: any | null;
  already_submitted_at: string | null;
}

function MuscContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LoadedData | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [overall, setOverall] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/regular-public/${token}/surveys/musculoskeletal`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "로드 실패");
        setData(body);
        if (body.already_submitted && body.already_response) {
          try {
            const prev = typeof body.already_response === "string" ? JSON.parse(body.already_response) : body.already_response;
            if (prev?.response?.parts) setAnswers(prev.response.parts);
            if (prev?.response?.overall) setOverall(prev.response.overall);
          } catch {}
        }
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const setPartQ = (partKey: string, qKey: string, val: any) => {
    setAnswers((prev) => ({
      ...prev,
      [partKey]: { ...(prev[partKey] || {}), [qKey]: val },
    }));
  };

  const submit = async () => {
    if (!data) return;
    setSubmitting(true);
    try {
      const payload = {
        response: {
          parts: answers,
          overall,
        },
        anonymous: false,
      };
      const res = await fetch(`${API_URL}/api/regular-public/${token}/surveys/musculoskeletal/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          <p className="text-[var(--fs-body)] text-[var(--success-fg)] mt-2">이번 반기 근골격계 증상 설문이 제출되었습니다.</p>
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
      <div className="bg-[var(--brand-600)] text-white px-4 py-4" style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
        <a href={`/r?token=${token}`} className="inline-flex items-center gap-1 text-white/80 text-[var(--fs-caption)] hover:text-white">
          <ArrowLeft className="w-4 h-4" /> 홈으로
        </a>
        <h1 className="text-[var(--fs-h4)] font-bold mt-2 flex items-center gap-2">
          <FileText className="w-6 h-6" /> {data.survey.title}
        </h1>
        <p className="text-white/80 text-[var(--fs-caption)] mt-1">{data.period} · 마감 {data.period_end}</p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <p className="text-[var(--fs-body)] text-[var(--text-2)]">{form.description}</p>

        {form.body_parts.map((part) => {
          const partAnswers = answers[part.key] || {};
          return (
            <div key={part.key} className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4 space-y-3">
              <p className="text-[var(--fs-body)] font-semibold text-[var(--text-1)]">{part.label}</p>
              {form.questions.map((q) => (
                <div key={q.key}>
                  <p className="text-[var(--fs-caption)] text-[var(--text-2)] mb-1">{q.text}</p>
                  {q.type === "yesno" ? (
                    <div className="flex gap-2">
                      {["예", "아니오"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setPartQ(part.key, q.key, c)}
                          className={`flex-1 py-2 rounded-[var(--r-md)] text-[var(--fs-caption)] font-medium border ${partAnswers[q.key] === c ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]" : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)]"}`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  ) : q.type === "select" ? (
                    <select
                      value={partAnswers[q.key] || ""}
                      onChange={(e) => setPartQ(part.key, q.key, e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] text-[var(--fs-caption)] bg-[var(--bg-2)] text-[var(--text-1)]"
                    >
                      <option value="">선택</option>
                      {q.choices?.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}

        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4 space-y-3">
          <p className="text-[var(--fs-body)] font-semibold text-[var(--text-1)]">종합</p>
          {form.overall.map((q) => (
            <div key={q.key}>
              <p className="text-[var(--fs-caption)] text-[var(--text-2)] mb-1">{q.text}</p>
              {q.type === "number" ? (
                <input
                  type="number"
                  value={overall[q.key] ?? ""}
                  onChange={(e) => setOverall({ ...overall, [q.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] text-[var(--fs-caption)] bg-[var(--bg-2)] text-[var(--text-1)] tabular"
                />
              ) : q.type === "text" ? (
                <input
                  type="text"
                  value={overall[q.key] ?? ""}
                  onChange={(e) => setOverall({ ...overall, [q.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] text-[var(--fs-caption)] bg-[var(--bg-2)] text-[var(--text-1)]"
                />
              ) : q.type === "yesno" ? (
                <div className="flex gap-2">
                  {["예", "아니오"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setOverall({ ...overall, [q.key]: c })}
                      className={`flex-1 py-2 rounded-[var(--r-md)] text-[var(--fs-caption)] font-medium border ${overall[q.key] === c ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]" : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)]"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}
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

export default function MuscPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <MuscContent />
    </Suspense>
  );
}
