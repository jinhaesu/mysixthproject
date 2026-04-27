"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge, Input } from "@/components/ui";

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
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" />
    </div>
  );

  if (!data || !data.totals) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
      <div className="text-center">
        <p className="text-[var(--fs-lg)] font-semibold text-[var(--text-2)]">데이터 없음</p>
        <p className="text-[var(--fs-body)] text-[var(--text-3)] mt-1">{dateParam} 발송된 설문이 없습니다.</p>
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

  const statusTone = (s: string): "success" | "warning" | "danger" => {
    if (s === 'completed') return 'success';
    if (s === 'clock_in') return 'warning';
    return 'danger';
  };
  const statusLabel = (s: string) => {
    if (s === 'completed') return '퇴근';
    if (s === 'clock_in') return '출근';
    return '미출근';
  };

  const rate = displayTotals.total > 0 ? Math.round(((displayTotals.clocked_in + displayTotals.completed) / displayTotals.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] fade-in">
      {/* Header */}
      <div className="bg-[var(--brand-600)] border-b border-[var(--brand-700)] text-white px-4 pt-6 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[var(--fs-h4)] font-bold tracking-[var(--tracking-tight)]">알바(사업소득)/파견 출퇴근 현황 리포트</h1>
              <p className="text-[var(--brand-200)] text-[var(--fs-caption)] mt-1 tabular">{lastUpdated} 업데이트 · 30초 자동 갱신</p>
            </div>
            <Input
              type="date"
              inputSize="sm"
              value={dateParam}
              onChange={(e) => setDateParam(e.target.value)}
              className="bg-[var(--brand-500)]/40 border-[var(--brand-400)]/40 text-white w-36"
            />
          </div>

          {/* Circle rate */}
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
                <span className="text-2xl font-bold tabular">{rate}%</span>
                <span className="text-[var(--fs-micro)] text-[var(--brand-200)]">출근률</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-3 pb-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: "all" as const, count: displayTotals.total, label: "전체", activeBorder: "border-[var(--border-3)]" },
            { key: "clock_in" as const, count: displayTotals.clocked_in, label: "출근중", activeBorder: "border-[var(--warning-border)]" },
            { key: "completed" as const, count: displayTotals.completed, label: "퇴근", activeBorder: "border-[var(--success-border)]" },
            { key: "sent" as const, count: displayTotals.not_clocked_in, label: "미출근", activeBorder: "border-[var(--danger-border)]" },
          ].map(card => (
            <button
              key={card.key}
              onClick={() => setFilter(card.key)}
              className={`bg-[var(--bg-1)] rounded-[var(--r-lg)] border-2 p-3 text-center transition-all hover-lift ${
                filter === card.key ? card.activeBorder + ' shadow-[var(--elev-2)] scale-[1.02]' : 'border-[var(--border-1)]'
              }`}
            >
              <p className="text-xl font-bold text-[var(--text-1)] tabular">{card.count}</p>
              <p className="text-[var(--fs-micro)] text-[var(--text-3)] mt-0.5">{card.label}</p>
            </button>
          ))}
        </div>

        {/* Department Filter */}
        {departments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setDeptFilter("all")}
              className={`shrink-0 px-3 py-1.5 rounded-[var(--r-pill)] text-[var(--fs-caption)] font-medium transition-all ${
                deptFilter === "all"
                  ? "bg-[var(--brand-500)] text-white"
                  : "bg-[var(--bg-1)] text-[var(--text-3)] border border-[var(--border-1)]"
              }`}
            >
              전체
            </button>
            {departments.map(dept => (
              <button
                key={dept}
                onClick={() => setDeptFilter(dept)}
                className={`shrink-0 px-3 py-1.5 rounded-[var(--r-pill)] text-[var(--fs-caption)] font-medium transition-all ${
                  deptFilter === dept
                    ? "bg-[var(--brand-500)] text-white"
                    : "bg-[var(--bg-1)] text-[var(--text-3)] border border-[var(--border-1)]"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        )}

        {/* Worker List */}
        <div className="space-y-2">
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] px-1">
            {filter === 'all' ? '전체' : filter === 'sent' ? '미출근' : filter === 'clock_in' ? '출근중' : '퇴근완료'} <span className="tabular">{filteredWorkers.length}</span>명
          </p>

          {filteredWorkers.length === 0 ? (
            <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-8 text-center">
              <p className="text-[var(--fs-body)] text-[var(--text-4)]">해당 상태의 근무자가 없습니다.</p>
            </div>
          ) : (
            filteredWorkers.map((w) => (
              <div key={w.id} className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-3.5 shadow-[var(--elev-1)] hover-lift">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-[var(--r-pill)] flex items-center justify-center shrink-0
                      ${w.status === 'completed' ? 'bg-[var(--success-bg)]' : w.status === 'clock_in' ? 'bg-[var(--warning-bg)]' : 'bg-[var(--danger-bg)]'}`}>
                      <span className={`text-[var(--fs-caption)] font-bold
                        ${w.status === 'completed' ? 'text-[var(--success-fg)]' : w.status === 'clock_in' ? 'text-[var(--warning-fg)]' : 'text-[var(--danger-fg)]'}`}>
                        {statusLabel(w.status).charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-1)] text-[var(--fs-body)]">{w.worker_name_ko || w.phone}</p>
                      {w.phone && (
                        <a href={`tel:${w.phone}`} className="text-[11px] text-[var(--brand-400)] font-medium">{w.phone}</a>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {w.department && (
                          <span className="text-[var(--fs-micro)] px-1.5 py-0.5 bg-[var(--brand-500)]/10 text-[var(--brand-400)] rounded-[var(--r-sm)] font-medium">{w.department}</span>
                        )}
                        {w.workplace_name && (
                          <span className="text-[var(--fs-micro)] text-[var(--text-4)]">{w.workplace_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge tone={statusTone(w.status)} size="sm">{statusLabel(w.status)}</Badge>
                </div>

                {(w.clock_in_time || w.clock_out_time || w.planned_clock_in) && (
                  <div className="mt-2.5 pt-2.5 border-t border-[var(--border-1)] flex gap-4 text-[var(--fs-caption)]">
                    <div>
                      <span className="text-[var(--text-4)]">출근</span>
                      <p className="font-semibold text-[var(--text-1)] mt-0.5 tabular">
                        {formatTime(w.clock_in_time) || "-"}
                        {w.planned_clock_in && <span className="text-[var(--text-4)] font-normal ml-1 tabular">/ {formatPlannedTime(w.planned_clock_in)}</span>}
                      </p>
                    </div>
                    <div>
                      <span className="text-[var(--text-4)]">퇴근</span>
                      <p className="font-semibold text-[var(--text-1)] mt-0.5 tabular">
                        {formatTime(w.clock_out_time) || "-"}
                        {w.planned_clock_out && <span className="text-[var(--text-4)] font-normal ml-1 tabular">/ {formatPlannedTime(w.planned_clock_out)}</span>}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <p className="text-center text-[var(--fs-micro)] text-[var(--text-4)] mt-4 pb-4">조인앤조인 근태관리</p>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" />
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
