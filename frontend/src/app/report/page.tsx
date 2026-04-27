"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Worker {
  id: number;
  phone: string;
  status: string;
  department: string | null;
  workplace_name: string;
  worker_name_ko: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  planned_clock_in: string | null;
  planned_clock_out: string | null;
}

function formatPlannedTime(time: string | null): string {
  if (!time) return "-";
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h < 12 ? "오전" : "오후";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function ReportContent() {
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date") || new Date().toLocaleDateString('sv-SE');
  const [dateParam, setDateParam] = useState(initialDate);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [filter, setFilter] = useState<"all" | "sent" | "clock_in" | "completed">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/survey-public/dashboard-report/${dateParam}`);
      const json = await res.json();
      setData(json);
      const now = new Date();
      setLastUpdated(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [dateParam]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#08090A]">
      <Loader2 className="w-8 h-8 animate-spin text-[#7070FF]" />
    </div>
  );

  if (!data || !data.totals) return (
    <div className="min-h-screen flex items-center justify-center bg-[#08090A] p-4">
      <div className="text-center">
        <p className="text-lg font-semibold text-[#D0D6E0]">데이터 없음</p>
        <p className="text-sm text-[#8A8F98] mt-1">{dateParam} 발송된 설문이 없습니다.</p>
      </div>
    </div>
  );

  const { totals } = data;
  const allWorkers: Worker[] = data.workers || [];

  const departments = Array.from(new Set(allWorkers.map(w => w.department).filter(Boolean))) as string[];

  const deptWorkers = deptFilter === "all" ? allWorkers : allWorkers.filter(w => (w.department || "") === deptFilter);
  const displayTotals = {
    total: deptWorkers.length,
    not_clocked_in: deptWorkers.filter(w => w.status === 'sent').length,
    clocked_in: deptWorkers.filter(w => w.status === 'clock_in').length,
    completed: deptWorkers.filter(w => w.status === 'completed').length,
  };

  const filteredWorkers = allWorkers.filter(w => {
    if (filter !== "all" && w.status !== filter) return false;
    if (deptFilter !== "all" && (w.department || "") !== deptFilter) return false;
    return true;
  });

  const formatTime = (t: string | null) => {
    if (!t) return null;
    try { return new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); } catch { return null; }
  };

  const statusStyle = (s: string) => {
    if (s === 'completed') return { bg: 'bg-[#27A644]', text: 'text-white', label: '퇴근' };
    if (s === 'clock_in') return { bg: 'bg-[#F0BF00]/100', text: 'text-white', label: '출근' };
    return { bg: 'bg-[#EB5757]', text: 'text-white', label: '미출근' };
  };

  const rate = displayTotals.total > 0 ? Math.round(((displayTotals.clocked_in + displayTotals.completed) / displayTotals.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#08090A]">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 pt-6 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">알바(사업소득)/파견 출퇴근 현황 리포트</h1>
              <p className="text-blue-200 text-xs mt-1">{lastUpdated} 업데이트 · 30초 자동 갱신</p>
            </div>
            <input
              type="date"
              value={dateParam}
              onChange={(e) => setDateParam(e.target.value)}
              className="px-2 py-1 rounded-lg text-sm bg-[#4EA7FC]/30 border border-blue-400/40 text-white focus:outline-none"
            />
          </div>

          {/* Big circle rate */}
          <div className="flex items-center justify-center mt-5">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={`${rate}, 100`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{rate}%</span>
                <span className="text-[10px] text-blue-200">출근률</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-3 pb-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: "all" as const, count: displayTotals.total, label: "전체", border: "border-[#23252A]" },
            { key: "clock_in" as const, count: displayTotals.clocked_in, label: "출근중", border: "border-amber-300" },
            { key: "completed" as const, count: displayTotals.completed, label: "퇴근", border: "border-green-300" },
            { key: "sent" as const, count: displayTotals.not_clocked_in, label: "미출근", border: "border-red-300" },
          ].map(card => (
            <button
              key={card.key}
              onClick={() => setFilter(card.key)}
              className={`bg-[#0F1011] rounded-xl border-2 p-3 text-center transition-all ${
                filter === card.key ? card.border + ' shadow-[0px_1px_3px_rgba(0,0,0,0.2)] scale-[1.02]' : 'border-[#23252A]'
              }`}
            >
              <p className="text-xl font-bold text-[#F7F8F8]">{card.count}</p>
              <p className="text-[10px] text-[#8A8F98] mt-0.5">{card.label}</p>
            </button>
          ))}
        </div>

        {/* Department Filter */}
        {departments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setDeptFilter("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                deptFilter === "all" ? "bg-[#5E6AD2] text-white" : "bg-[#0F1011] text-[#8A8F98] border border-[#23252A]"
              }`}
            >
              전체
            </button>
            {departments.map(dept => (
              <button
                key={dept}
                onClick={() => setDeptFilter(dept)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  deptFilter === dept ? "bg-purple-600 text-white" : "bg-[#0F1011] text-[#8A8F98] border border-[#23252A]"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        )}

        {/* Worker List - Mobile Card Style */}
        <div className="space-y-2">
          <p className="text-xs text-[#8A8F98] px-1">
            {filter === 'all' ? '전체' : filter === 'sent' ? '미출근' : filter === 'clock_in' ? '출근중' : '퇴근완료'} {filteredWorkers.length}명
          </p>

          {filteredWorkers.length === 0 ? (
            <div className="bg-[#0F1011] rounded-xl p-8 text-center">
              <p className="text-sm text-[#62666D]">해당 상태의 근무자가 없습니다.</p>
            </div>
          ) : (
            filteredWorkers.map((w) => {
              const st = statusStyle(w.status);
              return (
                <div key={w.id} className="bg-[#0F1011] rounded-xl border border-[#23252A] p-3.5 shadow-[0px_1px_3px_rgba(0,0,0,0.2)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full ${st.bg} flex items-center justify-center`}>
                        <span className={`text-xs font-bold ${st.text}`}>{st.label.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-[#F7F8F8] text-sm">{w.worker_name_ko || w.phone}</p>
                        {w.phone && (
                          <a href={`tel:${w.phone}`} className="text-[11px] text-[#7070FF] font-medium">{w.phone}</a>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {w.department && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-[#5E6AD2]/10 text-[#7070FF] rounded font-medium">{w.department}</span>
                          )}
                          {w.workplace_name && (
                            <span className="text-[10px] text-[#62666D]">{w.workplace_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                  </div>

                  {(w.clock_in_time || w.clock_out_time || w.planned_clock_in) && (
                    <div className="mt-2.5 pt-2.5 border-t border-[#23252A] flex gap-4 text-xs">
                      <div>
                        <span className="text-[#62666D]">출근</span>
                        <p className="font-semibold text-[#F7F8F8] mt-0.5">
                          {formatTime(w.clock_in_time) || "-"}
                          {w.planned_clock_in && <span className="text-[#62666D] font-normal ml-1">/ {formatPlannedTime(w.planned_clock_in)}</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#62666D]">퇴근</span>
                        <p className="font-semibold text-[#F7F8F8] mt-0.5">
                          {formatTime(w.clock_out_time) || "-"}
                          {w.planned_clock_out && <span className="text-[#62666D] font-normal ml-1">/ {formatPlannedTime(w.planned_clock_out)}</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="text-center text-[10px] text-[#62666D] mt-4 pb-4">조인앤조인 근태관리</p>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#08090A]">
        <Loader2 className="w-8 h-8 animate-spin text-[#7070FF]" />
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
