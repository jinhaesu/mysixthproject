"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GraduationCap, Loader2, CheckCircle, ArrowLeft, PenLine } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Course {
  id: number;
  title: string;
  description: string;
  video_source_type: string;
  video_url: string;
  duration_min: number;
  half_year_credit_hours: number;
  category: string;
}
interface Quiz {
  id: number;
  question_no: number;
  question: string;
  choices: string[];
}
interface MyCompletion {
  id: number;
  watched_seconds: number;
  quiz_score: number | null;
  quiz_total: number | null;
  completed_at: string | null;
  signed_at: string | null;
}
interface LoadedData {
  employee: { name: string; department: string; team: string };
  course: Course;
  quiz: Quiz[];
  my_completion: MyCompletion | null;
  period: string;
  period_end: string;
}

function CourseContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const courseId = Number(params.get("id") || 0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LoadedData | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [signature, setSignature] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"watch" | "quiz" | "sign" | "done">("watch");
  const [quizError, setQuizError] = useState("");

  // Simple watched seconds tracker (rough)
  const startedAtRef = useRef<number>(Date.now());
  const totalWatchedRef = useRef<number>(0);

  useEffect(() => {
    if (!token || !courseId) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/regular-public/${token}/training/${courseId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "로드 실패");
        setData(body);
        if (body.my_completion?.completed_at) setStep("done");
        totalWatchedRef.current = Number(body.my_completion?.watched_seconds || 0);
        startedAtRef.current = Date.now();
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token, courseId]);

  const syncProgress = useCallback(async () => {
    const inc = Math.round((Date.now() - startedAtRef.current) / 1000);
    startedAtRef.current = Date.now();
    if (inc > 0) totalWatchedRef.current += inc;
    try {
      await fetch(`${API_URL}/api/regular-public/${token}/training/${courseId}/watch-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watched_seconds: totalWatchedRef.current }),
      });
    } catch {}
  }, [token, courseId]);

  // 60s sync during watch step
  useEffect(() => {
    if (step !== "watch") return;
    const t = setInterval(() => { syncProgress(); }, 60_000);
    const onHide = () => { if (document.hidden) syncProgress(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onHide); };
  }, [step, syncProgress]);

  const goToQuiz = async () => {
    await syncProgress();
    const needSec = (data?.course.duration_min || 0) * 60 * 0.7; // 70% 시청 요구
    if (totalWatchedRef.current < needSec) {
      if (!confirm(`영상을 충분히 시청하지 않았습니다 (${Math.round(totalWatchedRef.current)}s / 필요 ${Math.round(needSec)}s).\n\n그래도 퀴즈로 진행하시겠습니까?`)) return;
    }
    setStep("quiz");
  };

  const submitQuiz = async () => {
    if (!data) return;
    const missing = data.quiz.filter((q) => answers[q.question_no] === undefined);
    if (missing.length > 0) {
      setQuizError(`${missing.length}개 문항이 미응답입니다.`);
      return;
    }
    setQuizError("");
    setStep("sign");
  };

  const finalSubmit = async () => {
    if (!data) return;
    if (!signature.trim()) { alert("서명(성함)을 입력해주세요."); return; }
    setSubmitting(true);
    try {
      const payload = {
        answers: data.quiz.map((q) => ({ question_no: q.question_no, choice_index: answers[q.question_no] })),
        signature_data: signature.trim(),
      };
      const res = await fetch(`${API_URL}/api/regular-public/${token}/training/${courseId}/quiz`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "제출 실패");
      alert(`이수 완료! ${body.score}/${body.total} 정답 · 인정 시간 ${body.credited_hours}h`);
      setStep("done");
      router.push(`/r/training?token=${token}`);
    } catch (e: any) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]"><Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" /></div>;
  }
  if (error || !data) {
    return <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-canvas)]"><p className="text-[var(--danger-fg)]">{error || "로드 실패"}</p></div>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <div className="bg-[var(--brand-600)] text-white px-4 py-4" style={{ background: "linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)" }}>
        <a href={`/r/training?token=${token}`} className="inline-flex items-center gap-1 text-white/80 text-[var(--fs-caption)] hover:text-white">
          <ArrowLeft className="w-4 h-4" /> 목록으로
        </a>
        <h1 className="text-[var(--fs-h4)] font-bold mt-2 flex items-center gap-2">
          <GraduationCap className="w-6 h-6" /> {data.course.title}
        </h1>
        <p className="text-white/80 text-[var(--fs-caption)] mt-1">
          {data.course.duration_min}분 · 인정 {data.course.half_year_credit_hours}h
        </p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {step === "done" ? (
          <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-xl)] p-6 text-center">
            <CheckCircle className="w-16 h-16 text-[var(--success-fg)] mx-auto" />
            <h2 className="text-[var(--fs-h4)] font-bold text-[var(--success-fg)] mt-4">이수 완료</h2>
            <p className="text-[var(--fs-body)] text-[var(--success-fg)] mt-2">이번 반기 정기교육으로 인정되었습니다.</p>
            <a href={`/r/training?token=${token}`} className="inline-block mt-4 px-4 py-2 bg-[var(--success-fg)] text-white rounded-[var(--r-md)] font-semibold">
              목록으로
            </a>
          </div>
        ) : null}

        {step === "watch" && (
          <>
            <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4">
              <p className="text-[var(--fs-body)] text-[var(--text-2)] mb-3">{data.course.description}</p>
              {data.course.video_url ? (
                <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    src={data.course.video_url}
                    className="absolute top-0 left-0 w-full h-full rounded-[var(--r-md)]"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] p-6 text-center rounded-[var(--r-md)]">
                  <p className="text-[var(--fs-body)] font-semibold text-[var(--warning-fg)]">교육 영상이 아직 등록되지 않았습니다.</p>
                  <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] mt-2 opacity-90">
                    관리자가 안전보건공단(KOSHA) 공식 영상 URL을 등록하면 이수 가능합니다.
                  </p>
                </div>
              )}
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-3">
                60초마다 시청 시간이 서버에 저장됩니다. 다음 단계로 넘어가려면 아래 버튼을 누르세요.
              </p>
            </div>
            <button
              onClick={goToQuiz}
              disabled={!data.course.video_url}
              className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold text-[var(--fs-base)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {data.course.video_url ? "시청 완료 · 퀴즈 풀기" : "영상 등록 대기 중"}
            </button>
          </>
        )}

        {step === "quiz" && (
          <>
            <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4 space-y-4">
              <p className="text-[var(--fs-body)] font-semibold text-[var(--text-1)]">
                이수 확인 퀴즈 · 70% 이상 정답 시 통과
              </p>
              {data.quiz.map((q) => (
                <div key={q.id} className="border-b border-[var(--border-1)] pb-3 last:border-0">
                  <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)] mb-2">
                    Q{q.question_no}. {q.question}
                  </p>
                  <div className="space-y-2">
                    {q.choices.map((c, i) => (
                      <label key={i} className={`flex items-start gap-2 p-2 rounded-[var(--r-md)] cursor-pointer border ${answers[q.question_no] === i ? "border-[var(--brand-500)] bg-[var(--brand-500)]/10" : "border-[var(--border-2)] hover:bg-[var(--bg-2)]/40"}`}>
                        <input
                          type="radio"
                          name={`q${q.question_no}`}
                          checked={answers[q.question_no] === i}
                          onChange={() => setAnswers({ ...answers, [q.question_no]: i })}
                          className="mt-1 accent-[var(--brand-500)]"
                        />
                        <span className="text-[var(--fs-body)] text-[var(--text-2)]">{c}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {quizError && <p className="text-[var(--danger-fg)] text-[var(--fs-caption)]">{quizError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep("watch")} className="py-3 bg-[var(--bg-2)] border border-[var(--border-2)] text-[var(--text-1)] rounded-[var(--r-md)] font-semibold">
                다시 시청
              </button>
              <button onClick={submitQuiz} className="py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold">
                제출 확인
              </button>
            </div>
          </>
        )}

        {step === "sign" && (
          <>
            <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-[var(--brand-400)]">
                <PenLine className="w-5 h-5" />
                <h2 className="font-semibold">전자서명</h2>
              </div>
              <p className="text-[var(--fs-body)] text-[var(--text-2)]">
                본인이 위 교육을 이수하였음을 확인합니다. 아래에 <b>{data.employee.name}</b> 성함을 그대로 입력해주세요.
              </p>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder={data.employee.name}
                className="w-full px-3 py-2.5 border border-[var(--border-2)] rounded-[var(--r-md)] text-[var(--fs-base)] bg-[var(--bg-2)] text-[var(--text-1)]"
              />
              <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
                제출 시각·근로자 정보와 함께 기록됩니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setStep("quiz")} className="py-3 bg-[var(--bg-2)] border border-[var(--border-2)] text-[var(--text-1)] rounded-[var(--r-md)] font-semibold">
                이전
              </button>
              <button onClick={finalSubmit} disabled={submitting || !signature.trim()} className="py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold disabled:opacity-50">
                {submitting ? "..." : "이수 확정"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CoursePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <CourseContent />
    </Suspense>
  );
}
