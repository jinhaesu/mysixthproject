"use client";

import { useEffect, useState } from "react";
import { getWeeklyHolidayStatus } from "@/lib/api";
import {
  AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Shield, XCircle,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, SkeletonCard, EmptyState,
} from "@/components/ui";

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

function getMonday(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekLabel(monday: Date, sunday: Date): string {
  const year = monday.getFullYear();
  const month = monday.getMonth() + 1;
  const firstOfMonth = new Date(year, monday.getMonth(), 1);
  const firstMonday = new Date(firstOfMonth);
  const dow = firstOfMonth.getDay();
  firstMonday.setDate(firstOfMonth.getDate() + (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow));
  const weekNum = Math.max(1, Math.ceil((monday.getDate() - firstMonday.getDate()) / 7) + 1);
  const mStart = `${monday.getMonth() + 1}/${monday.getDate()}`;
  const mEnd = `${sunday.getMonth() + 1}/${sunday.getDate()}`;
  return `${year}년 ${month}월 ${weekNum}주차 (${mStart} ~ ${mEnd})`;
}

function getDatesInWeek(monday: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

interface WorkerData {
  phone: string;
  name: string;
  department: string;
  workplace: string;
  work_days: number;
  total_hours: number;
  qualifies: boolean;
  warning: "danger" | "caution" | "safe";
  warning_message: string;
  daily_details: { date: string; hours: number }[];
}

interface SummaryData {
  week_start: string;
  week_end: string;
  total_workers: number;
  danger_count: number;
  caution_count: number;
  safe_count: number;
}

export default function WeeklyHolidayPage() {
  const [data, setData] = useState<{ summary: SummaryData; workers: WorkerData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [error, setError] = useState("");

  const monday = getMonday(weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekDates = getDatesInWeek(monday);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const mondayStr = formatDate(monday);
      const sundayStr = formatDate(sunday);
      const result = await getWeeklyHolidayStatus({ week_start: mondayStr, week_end: sundayStr });
      setData(result);
    } catch (err: any) {
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [weekOffset]);

  const warningTone = {
    danger: { tone: "danger" as const, label: "위험", borderColor: "border-l-[var(--danger-fg)]" },
    caution: { tone: "warning" as const, label: "주의", borderColor: "border-l-[var(--warning-fg)]" },
    safe: { tone: "success" as const, label: "안전", borderColor: "border-l-[var(--success-fg)]" },
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 fade-in">
      <PageHeader
        eyebrow="근태관리"
        title="주휴수당 관리 현황판"
        description="주 15시간 이상 + 5일 개근 시 주휴수당이 발생합니다"
      />

      {/* Week Navigation */}
      <Card className="flex items-center justify-between">
        <Button variant="ghost" size="sm" leadingIcon={<ChevronLeft size={16} />} onClick={() => setWeekOffset(p => p - 1)}>
          이전 주
        </Button>
        <div className="text-center">
          <p className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">
            {getWeekLabel(monday, sunday)}
          </p>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[var(--fs-caption)] text-[var(--brand-400)] hover:underline mt-1"
            >
              이번 주로 이동
            </button>
          )}
        </div>
        <Button variant="ghost" size="sm" trailingIcon={<ChevronRight size={16} />} onClick={() => setWeekOffset(p => p + 1)}>
          다음 주
        </Button>
      </Card>

      {loading && <SkeletonCard className="h-40" />}

      {error && !loading && (
        <Card tone="ghost" className="border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-fg)] text-[var(--fs-body)]">
          {error}
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="hover-lift">
              <p className="text-[var(--fs-caption)] text-[var(--text-3)]">전체 근무자</p>
              <p className="text-[var(--fs-h2)] font-bold tabular text-[var(--text-1)] mt-1">{data.summary.total_workers}</p>
            </Card>
            <Card tone="elevated" className="hover-lift border-l-4 border-l-[var(--danger-fg)]">
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-[var(--danger-fg)]" />
                <p className="text-[var(--fs-caption)] text-[var(--danger-fg)] font-medium">주휴수당 발생</p>
              </div>
              <p className="text-[var(--fs-h2)] font-bold tabular text-[var(--danger-fg)] mt-1">{data.summary.danger_count}</p>
            </Card>
            <Card tone="elevated" className="hover-lift border-l-4 border-l-[var(--warning-fg)]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[var(--warning-fg)]" />
                <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] font-medium">주의</p>
              </div>
              <p className="text-[var(--fs-h2)] font-bold tabular text-[var(--warning-fg)] mt-1">{data.summary.caution_count}</p>
            </Card>
            <Card tone="elevated" className="hover-lift border-l-4 border-l-[var(--success-fg)]">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-[var(--success-fg)]" />
                <p className="text-[var(--fs-caption)] text-[var(--success-fg)] font-medium">안전</p>
              </div>
              <p className="text-[var(--fs-h2)] font-bold tabular text-[var(--success-fg)] mt-1">{data.summary.safe_count}</p>
            </Card>
          </div>

          {/* Worker Cards */}
          {data.workers.length === 0 ? (
            <EmptyState
              title="이번 주 근무 기록이 없습니다."
            />
          ) : (
            <div className="space-y-3">
              {data.workers.map((worker) => {
                const wt = warningTone[worker.warning];
                const hoursPercent = Math.min((worker.total_hours / 15) * 100, 100);
                const overThreshold = worker.total_hours >= 15;
                const workedDates = new Set(worker.daily_details.map((d) => d.date));

                return (
                  <Card
                    key={worker.phone}
                    className={`border-l-4 ${wt.borderColor} hover-lift`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        {/* Name + badges */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{worker.name}</span>
                          {worker.department && (
                            <Badge tone="brand" size="sm">{worker.department}</Badge>
                          )}
                          {worker.workplace && (
                            <Badge tone="neutral" size="sm">{worker.workplace}</Badge>
                          )}
                          <Badge tone={wt.tone} size="sm">{wt.label}</Badge>
                        </div>

                        {/* Day dots */}
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--fs-caption)] text-[var(--text-4)] w-12">출근일:</span>
                          <div className="flex gap-1.5">
                            {DAY_NAMES.map((dayName, idx) => {
                              const dateStr = weekDates[idx];
                              const worked = workedDates.has(dateStr);
                              return (
                                <div key={idx} className="flex flex-col items-center gap-0.5">
                                  <span className="text-[10px] text-[var(--text-4)]">{dayName}</span>
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                      worked ? "bg-[var(--brand-500)] text-white" : "bg-[var(--bg-3)] text-[var(--text-4)]"
                                    }`}
                                  >
                                    {worked ? "O" : "-"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-[var(--fs-body)] font-medium text-[var(--text-2)] ml-2 tabular">{worker.work_days}일</span>
                        </div>

                        {/* Hours bar */}
                        <div className="flex items-center gap-3">
                          <span className="text-[var(--fs-caption)] text-[var(--text-4)] w-12">시간:</span>
                          <div className="flex-1 max-w-xs">
                            <div className="flex items-center justify-between text-[var(--fs-caption)] mb-1">
                              <span className="text-[var(--text-3)] tabular">{worker.total_hours}시간</span>
                              <span className="text-[var(--text-4)]">15시간</span>
                            </div>
                            <div className="w-full bg-[var(--bg-3)] rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  overThreshold
                                    ? "bg-[var(--danger-fg)]"
                                    : hoursPercent >= 80
                                    ? "bg-[var(--warning-fg)]"
                                    : "bg-[var(--success-fg)]"
                                }`}
                                style={{ width: `${hoursPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Warning message */}
                        {worker.warning_message && (
                          <div className={`flex items-center gap-2 text-[var(--fs-body)] ${
                            worker.warning === "danger" ? "text-[var(--danger-fg)]" :
                            worker.warning === "caution" ? "text-[var(--warning-fg)]" :
                            "text-[var(--success-fg)]"
                          }`}>
                            {worker.warning === "danger" ? <XCircle size={14} /> :
                             worker.warning === "caution" ? <AlertTriangle size={14} /> :
                             <Shield size={14} />}
                            {worker.warning_message}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
