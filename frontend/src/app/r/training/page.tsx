"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GraduationCap, Loader2, CheckCircle, PlayCircle, ArrowLeft, Clock } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Course {
  id: number;
  title: string;
  description: string;
  duration_min: number;
  half_year_credit_hours: number;
  category: string;
  completion_id: number | null;
  completed_at: string | null;
  quiz_score: number | null;
  quiz_total: number | null;
  watched_seconds: number | null;
  credited_hours: number | null;
}

interface LoadedData {
  employee: { name: string; department: string; team: string };
  period: string;
  period_end: string;
  courses: Course[];
  summary: { total: number; done: number; remaining: number; credited_hours: number };
}

function TrainingContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LoadedData | null>(null);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/regular-public/${token}/training/my`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "로드 실패");
        setData(body);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-canvas)]">
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-2)] border border-[var(--border-1)] p-8 max-w-sm w-full text-center">
          <p className="text-[var(--danger-fg)]">{error || "데이터를 불러올 수 없습니다."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)]">
      <div className="bg-[var(--brand-600)] text-white px-4 py-5" style={{ background: "linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)" }}>
        <a href={`/r?token=${token}`} className="inline-flex items-center gap-1 text-white/80 text-[var(--fs-caption)] hover:text-white">
          <ArrowLeft className="w-4 h-4" /> 홈으로
        </a>
        <div className="mt-2">
          <h1 className="text-[var(--fs-h4)] font-bold flex items-center gap-2">
            <GraduationCap className="w-6 h-6" />
            반기 정기 안전보건교육
          </h1>
          <p className="text-white/80 text-[var(--fs-body)] mt-1">
            {data.period} · 마감 {data.period_end}
          </p>
          <p className="text-white/80 text-[var(--fs-body)]">
            {data.employee.name} · {data.employee.department || ""} {data.employee.team || ""}
          </p>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="필수 코스" value={String(data.summary.total)} tone="neutral" />
          <StatCard label="이수 완료" value={String(data.summary.done)} tone="success" />
          <StatCard label="남은 코스" value={String(data.summary.remaining)} tone="warning" />
        </div>
        <div className="rounded-[var(--r-md)] p-3 bg-[var(--info-bg)] border border-[var(--info-border)] text-[var(--info-fg)] text-[var(--fs-caption)]">
          이번 반기 인정 시간: <span className="font-bold tabular">{data.summary.credited_hours.toFixed(2)}h</span> ·
          반기 마감 14일 전부터 미이수 시 <b>퇴근이 차단</b>됩니다.
        </div>

        <div className="space-y-3">
          {data.courses.map((c) => {
            const done = !!c.completed_at;
            return (
              <a
                key={c.id}
                href={`/r/training/course?id=${c.id}&token=${token}`}
                className={`block rounded-[var(--r-xl)] shadow-[var(--elev-1)] border p-4 transition-transform hover:scale-[1.005] ${done ? "bg-[var(--success-bg)] border-[var(--success-border)]" : "bg-[var(--bg-1)] border-[var(--border-1)]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className={`text-[var(--fs-base)] font-semibold ${done ? "text-[var(--success-fg)]" : "text-[var(--text-1)]"}`}>
                      {c.title}
                    </p>
                    {c.description && (
                      <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">{c.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-[var(--fs-caption)] text-[var(--text-3)]">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="tabular">{c.duration_min}분</span>
                      <span className="tabular">· 인정 {c.half_year_credit_hours}h</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {done ? (
                      <CheckCircle className="w-6 h-6 text-[var(--success-fg)]" />
                    ) : (
                      <PlayCircle className="w-6 h-6 text-[var(--brand-500)]" />
                    )}
                  </div>
                </div>
                {done && c.completed_at && (
                  <p className="text-[var(--fs-caption)] text-[var(--success-fg)] mt-2">
                    이수 완료 · {new Date(c.completed_at).toLocaleDateString("ko-KR")}
                    {c.quiz_score != null && c.quiz_total != null && (
                      <span className="ml-2">({c.quiz_score}/{c.quiz_total})</span>
                    )}
                  </p>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" }) {
  const cls = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-md)] border p-3 text-center ${cls}`}>
      <div className="text-[var(--fs-caption)] opacity-80">{label}</div>
      <div className="text-xl font-bold tabular mt-1">{value}</div>
    </div>
  );
}

export default function TrainingListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <TrainingContent />
    </Suspense>
  );
}
