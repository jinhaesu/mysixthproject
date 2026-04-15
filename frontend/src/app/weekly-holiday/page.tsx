"use client";

import { useEffect, useState } from "react";
import { getWeeklyHolidayStatus } from "@/lib/api";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  XCircle,
} from "lucide-react";

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
  // Calculate week number within the month
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
  const [data, setData] = useState<{
    summary: SummaryData;
    workers: WorkerData[];
  } | null>(null);
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
      const result = await getWeeklyHolidayStatus({
        week_start: mondayStr,
        week_end: sundayStr,
      });
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [weekOffset]);

  const warningColors = {
    danger: {
      border: "border-l-red-500",
      bg: "bg-[#EB5757]/10",
      badge: "bg-[#EB5757]/15 text-[#EB5757]",
      text: "text-[#EB5757]",
      label: "위험",
    },
    caution: {
      border: "border-l-yellow-500",
      bg: "bg-[#F0BF00]/10",
      badge: "bg-[#F0BF00]/15 text-[#F0BF00]",
      text: "text-[#F0BF00]",
      label: "주의",
    },
    safe: {
      border: "border-l-green-500",
      bg: "bg-[#27A644]/10",
      badge: "bg-[#27A644]/15 text-[#27A644]",
      text: "text-[#27A644]",
      label: "안전",
    },
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#F7F8F8]">
          주휴수당 관리 현황판
        </h1>
        <p className="text-sm text-[#8A8F98] mt-1">
          주 15시간 이상 + 5일 개근 시 주휴수당이 발생합니다
        </p>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-[#0F1011] rounded-xl border border-[#23252A] p-4">
        <button
          onClick={() => setWeekOffset((p) => p - 1)}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#8A8F98] hover:bg-[#141516]/5 rounded-lg transition-colors"
        >
          <ChevronLeft size={16} />
          이전 주
        </button>
        <div className="text-center">
          <p className="text-lg font-semibold text-[#F7F8F8]">
            {getWeekLabel(monday, sunday)}
          </p>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-sm text-[#7070FF] hover:underline mt-1"
            >
              이번 주로 이동
            </button>
          )}
        </div>
        <button
          onClick={() => setWeekOffset((p) => p + 1)}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[#8A8F98] hover:bg-[#141516]/5 rounded-lg transition-colors"
        >
          다음 주
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-500" size={32} />
          <span className="ml-3 text-[#8A8F98]">불러오는 중...</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-xl p-4 text-[#EB5757]">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
              <p className="text-sm text-[#8A8F98]">전체 근무자</p>
              <p className="text-3xl font-bold text-[#F7F8F8] mt-1">
                {data.summary.total_workers}
              </p>
            </div>
            <div className="bg-[#EB5757]/10 rounded-xl border border-[#EB5757]/30 p-5">
              <div className="flex items-center gap-2">
                <XCircle size={18} className="text-[#EB5757]" />
                <p className="text-sm text-[#EB5757] font-medium">
                  주휴수당 발생
                </p>
              </div>
              <p className="text-3xl font-bold text-[#EB5757] mt-1">
                {data.summary.danger_count}
              </p>
            </div>
            <div className="bg-[#F0BF00]/10 rounded-xl border border-[#F0BF00]/30 p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-yellow-500" />
                <p className="text-sm text-[#F0BF00] font-medium">주의</p>
              </div>
              <p className="text-3xl font-bold text-[#F0BF00] mt-1">
                {data.summary.caution_count}
              </p>
            </div>
            <div className="bg-[#27A644]/10 rounded-xl border border-[#27A644]/30 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-green-500" />
                <p className="text-sm text-[#27A644] font-medium">안전</p>
              </div>
              <p className="text-3xl font-bold text-[#27A644] mt-1">
                {data.summary.safe_count}
              </p>
            </div>
          </div>

          {/* Worker Cards */}
          {data.workers.length === 0 ? (
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-10 text-center text-[#8A8F98]">
              이번 주 근무 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {data.workers.map((worker) => {
                const colors = warningColors[worker.warning];
                const hoursPercent = Math.min(
                  (worker.total_hours / 15) * 100,
                  100
                );
                const overThreshold = worker.total_hours >= 15;
                const workedDates = new Set(
                  worker.daily_details.map((d) => d.date)
                );

                return (
                  <div
                    key={worker.phone}
                    className={`bg-[#0F1011] rounded-xl border border-[#23252A] border-l-4 ${colors.border} p-5`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      {/* Left: Info */}
                      <div className="flex-1 space-y-3">
                        {/* Name + badges */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-lg font-semibold text-[#F7F8F8]">
                            {worker.name}
                          </span>
                          {worker.department && (
                            <span className="text-xs font-medium px-2 py-0.5 bg-[#4EA7FC]/15 text-[#828FFF] rounded-full">
                              {worker.department}
                            </span>
                          )}
                          {worker.workplace && (
                            <span className="text-xs font-medium px-2 py-0.5 bg-[#141516] text-[#8A8F98] rounded-full">
                              {worker.workplace}
                            </span>
                          )}
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${colors.badge}`}
                          >
                            {colors.label}
                          </span>
                        </div>

                        {/* Day dots */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#62666D] w-12">
                            출근일:
                          </span>
                          <div className="flex gap-1.5">
                            {DAY_NAMES.map((dayName, idx) => {
                              const dateStr = weekDates[idx];
                              const worked = workedDates.has(dateStr);
                              return (
                                <div
                                  key={idx}
                                  className="flex flex-col items-center gap-0.5"
                                >
                                  <span className="text-[10px] text-[#62666D]">
                                    {dayName}
                                  </span>
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                      worked
                                        ? "bg-[#4EA7FC] text-white"
                                        : "bg-[#141516] text-[#62666D]"
                                    }`}
                                  >
                                    {worked ? "O" : "-"}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span className="text-sm font-medium text-[#D0D6E0] ml-2">
                            {worker.work_days}일
                          </span>
                        </div>

                        {/* Hours bar */}
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#62666D] w-12">
                            시간:
                          </span>
                          <div className="flex-1 max-w-xs">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-[#8A8F98]">
                                {worker.total_hours}시간
                              </span>
                              <span className="text-[#62666D]">15시간</span>
                            </div>
                            <div className="w-full bg-[#141516] rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  overThreshold
                                    ? "bg-[#EB5757]"
                                    : hoursPercent >= 80
                                    ? "bg-[#F0BF00]"
                                    : "bg-[#27A644]"
                                }`}
                                style={{ width: `${hoursPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Warning message */}
                        {worker.warning_message && (
                          <div
                            className={`flex items-center gap-2 text-sm ${colors.text}`}
                          >
                            {worker.warning === "danger" ? (
                              <XCircle size={14} />
                            ) : worker.warning === "caution" ? (
                              <AlertTriangle size={14} />
                            ) : (
                              <Shield size={14} />
                            )}
                            {worker.warning_message}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
