"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GraduationCap, Loader2, CheckCircle, ArrowLeft, PenLine, Info, Timer } from "lucide-react";

// 유튜브 URL 정규화 — watch·youtu.be·shorts → embed 형태로 변환.
function normalizeYouTubeEmbedUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    let vid = "";
    if (host === "youtu.be") vid = u.pathname.replace(/^\//, "").split("/")[0];
    else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") vid = u.searchParams.get("v") || "";
      else if (u.pathname.startsWith("/embed/")) vid = u.pathname.replace("/embed/", "").split("/")[0];
      else if (u.pathname.startsWith("/shorts/")) vid = u.pathname.replace("/shorts/", "").split("/")[0];
      else if (u.pathname.startsWith("/v/")) vid = u.pathname.replace("/v/", "").split("/")[0];
    }
    if (/^[a-zA-Z0-9_-]{6,}$/.test(vid)) return `https://www.youtube.com/embed/${vid}`;
    return raw;
  } catch { return raw; }
}
function fmtSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}분 ${r.toString().padStart(2, "0")}초`;
}

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
  const [watchedSec, setWatchedSec] = useState<number>(0);

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
        setWatchedSec(totalWatchedRef.current);
        startedAtRef.current = Date.now();
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token, courseId]);

  const syncProgress = useCallback(async () => {
    const inc = Math.round((Date.now() - startedAtRef.current) / 1000);
    startedAtRef.current = Date.now();
    if (inc > 0) totalWatchedRef.current += inc;
    setWatchedSec(totalWatchedRef.current);
    try {
      await fetch(`${API_URL}/api/regular-public/${token}/training/${courseId}/watch-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watched_seconds: totalWatchedRef.current }),
      });
    } catch {}
  }, [token, courseId]);

  // 시청 시간 실시간 카운터 — step==='watch' 인 동안 1초마다 증가 (표시용).
  // 서버 sync 는 60s interval, 이건 UI 게이지 전용.
  useEffect(() => {
    if (step !== "watch") return;
    const t = setInterval(() => {
      const inc = Math.round((Date.now() - startedAtRef.current) / 1000);
      setWatchedSec(totalWatchedRef.current + inc);
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

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
    const needSec = (data?.course.duration_min || 0) * 60 * 0.7;
    if (totalWatchedRef.current < needSec) {
      alert(`영상 시청 시간이 부족합니다.\n필요: ${fmtSec(needSec)}\n현재: ${fmtSec(totalWatchedRef.current)}\n\n영상을 마저 시청 후 다시 시도해주세요.`);
      return;
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

        {step === "watch" && (() => {
          const embedUrl = normalizeYouTubeEmbedUrl(data.course.video_url || "");
          const hasVideo = !!embedUrl;
          const requiredSec = Math.round((data.course.duration_min || 0) * 60 * 0.7);
          const remainingSec = Math.max(0, requiredSec - watchedSec);
          const progressPct = requiredSec > 0 ? Math.min(100, Math.round((watchedSec / requiredSec) * 100)) : 0;
          const reachedThreshold = watchedSec >= requiredSec;
          return (
            <>
              <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-4">
                <p className="text-[var(--fs-body)] text-[var(--text-2)] mb-3">{data.course.description}</p>
                {hasVideo ? (
                  <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                    <iframe
                      src={embedUrl}
                      title={data.course.title}
                      className="absolute top-0 left-0 w-full h-full rounded-[var(--r-md)]"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
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

                {/* 시청 안내 + 진행률 게이지 */}
                {hasVideo && (
                  <div className="mt-4 bg-[var(--info-bg)] border border-[var(--info-border)] rounded-[var(--r-md)] p-3">
                    <div className="flex items-start gap-2 mb-2">
                      <Info className="w-4 h-4 text-[var(--info-fg)] shrink-0 mt-0.5" />
                      <div className="flex-1 text-[var(--fs-caption)] text-[var(--info-fg)]">
                        <p className="font-semibold">이수 조건</p>
                        <p className="opacity-90 mt-0.5">
                          이 영상은 <b>총 {data.course.duration_min}분</b>이며, <b>{fmtSec(requiredSec)}</b>(70%) 이상 시청해야 퀴즈로 진행할 수 있습니다.
                        </p>
                      </div>
                    </div>
                    {/* 진행률 게이지 */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[var(--fs-caption)] text-[var(--info-fg)] mb-1 tabular">
                        <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> 시청 시간</span>
                        <span className="font-semibold">{fmtSec(watchedSec)} / {fmtSec(requiredSec)} ({progressPct}%)</span>
                      </div>
                      <div className="w-full h-2 bg-[var(--bg-2)] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${reachedThreshold ? "bg-[var(--success-fg)]" : "bg-[var(--info-fg)]"}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      {!reachedThreshold && (
                        <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] mt-1.5">
                          퀴즈 응시까지 <b>{fmtSec(remainingSec)}</b> 남았습니다. 영상을 계속 시청해주세요.
                        </p>
                      )}
                      {reachedThreshold && (
                        <p className="text-[var(--fs-caption)] text-[var(--success-fg)] mt-1.5 font-semibold">
                          ✓ 시청 시간 충족. 아래 버튼으로 퀴즈에 응시하세요.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={goToQuiz}
                disabled={!hasVideo || !reachedThreshold}
                className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold text-[var(--fs-base)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {!hasVideo ? "영상 등록 대기 중" : !reachedThreshold ? `시청 ${fmtSec(remainingSec)} 남음` : "시청 완료 · 퀴즈 풀기"}
              </button>
            </>
          );
        })()}

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
