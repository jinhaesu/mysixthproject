"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge, Input } from "@/components/ui";

interface Worker {
  id: number;
  phone: string;
  name: string;
  department: string | null;
  team: string | null;
  role: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
}

type WorkerStatus = "completed" | "clock_in" | "not_clocked_in";

function getWorkerStatus(w: Worker): WorkerStatus {
  if (w.clock_out_time) return "completed";
  if (w.clock_in_time) return "clock_in";
  return "not_clocked_in";
}

function ReportRegularContent() {
  const searchParams = useSearchParams();
  const initialDate = searchParams.get("date") || new Date().toLocaleDateString('sv-SE');
  const [dateParam, setDateParam] = useState(initialDate);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [filter, setFilter] = useState<"all" | "not_clocked_in" | "clock_in" | "completed">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${API_URL}/api/regular-public/dashboard-report/${dateParam}`);
      const json = await res.json();
      setData(json);
      const now = new Date();
      setLastUpdated(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      );
    } catch {
      // silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, [dateParam]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--success-fg)]" />
      </div>
    );

  if (!data || !data.workers)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
        <div className="text-center">
          <p className="text-[var(--fs-lg)] font-semibold text-[var(--text-2)]">데이터 없음</p>
          <p className="text-[var(--fs-body)] text-[var(--text-3)] mt-1">{dateParam} 등록된 정규직 데이터가 없습니다.</p>
        </div>
      </div>
    );

  const allWorkers: Worker[] = data.workers || [];

  const departments = Array.from(
    new Set(allWorkers.map((w) => w.department).filter(Boolean))
  ) as string[];

  const deptWorkers =
    deptFilter === "all"
      ? allWorkers
      : allWorkers.filter((w) => (w.department || "") === deptFilter);

  const displayTotals = {
    total: deptWorkers.length,
    not_clocked_in: deptWorkers.filter((w) => getWorkerStatus(w) === "not_clocked_in").length,
    clocked_in: deptWorkers.filter((w) => getWorkerStatus(w) === "clock_in").length,
    completed: deptWorkers.filter((w) => getWorkerStatus(w) === "completed").length,
  };

  const filteredWorkers = allWorkers.filter((w) => {
    if (filter !== "all" && getWorkerStatus(w) !== filter) return false;
    if (deptFilter !== "all" && (w.department || "") !== deptFilter) return false;
    return true;
  });

  const formatTime = (t: string | null) => {
    if (!t) return null;
    try {
      return new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return null;
    }
  };

  const statusTone = (status: WorkerStatus): "success" | "warning" | "danger" => {
    if (status === "completed") return "success";
    if (status === "clock_in") return "warning";
    return "danger";
  };
  const statusLabel = (status: WorkerStatus) => {
    if (status === "completed") return "퇴근";
    if (status === "clock_in") return "출근";
    return "미출근";
  };

  const rate =
    displayTotals.total > 0
      ? Math.round(
          ((displayTotals.clocked_in + displayTotals.completed) / displayTotals.total) * 100
        )
      : 0;

  // Role badge: show only for 반장 or 조장
  const roleBadge = (role: string | null) => {
    if (!role) return null;
    if (role === "반장" || role === "조장") {
      return (
        <Badge tone="success" size="xs">{role}</Badge>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] fade-in">
      {/* Header */}
      <div className="bg-[var(--success-fg)]/80 border-b border-[var(--success-border)] text-white px-4 pt-6 pb-8"
           style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[var(--fs-h4)] font-bold tracking-[var(--tracking-tight)]">정규직 출퇴근 현황 리포트</h1>
                <span className="shrink-0 text-[var(--fs-micro)] font-bold bg-[var(--bg-1)] text-[var(--success-fg)] px-2 py-0.5 rounded-[var(--r-pill)]">
                  정규직
                </span>
              </div>
              <p className="text-green-200 text-[var(--fs-caption)] mt-1 tabular">{lastUpdated} 업데이트 · 30초 자동 갱신</p>
            </div>
            <Input
              type="date"
              inputSize="sm"
              value={dateParam}
              onChange={(e) => setDateParam(e.target.value)}
              className="bg-white/20 border-white/30 text-white w-36"
            />
          </div>

          {/* Circle rate */}
          <div className="flex items-center justify-center mt-5">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={`${rate}, 100`} strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular">{rate}%</span>
                <span className="text-[var(--fs-micro)] text-green-200">출근률</span>
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
            { key: "not_clocked_in" as const, count: displayTotals.not_clocked_in, label: "미출근", activeBorder: "border-[var(--danger-border)]" },
          ].map((card) => (
            <button
              key={card.key}
              onClick={() => setFilter(card.key)}
              className={`bg-[var(--bg-1)] rounded-[var(--r-lg)] border-2 p-3 text-center transition-all hover-lift ${
                filter === card.key ? card.activeBorder + " shadow-[var(--elev-2)] scale-[1.02]" : "border-[var(--border-1)]"
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
                  ? "bg-[var(--success-fg)] text-white"
                  : "bg-[var(--bg-1)] text-[var(--text-3)] border border-[var(--border-1)]"
              }`}
            >
              전체
            </button>
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setDeptFilter(dept)}
                className={`shrink-0 px-3 py-1.5 rounded-[var(--r-pill)] text-[var(--fs-caption)] font-medium transition-all ${
                  deptFilter === dept
                    ? "bg-[var(--success-fg)] text-white"
                    : "bg-[var(--bg-1)] text-[var(--text-3)] border border-[var(--border-1)]"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        )}

        {/* Vacation List */}
        {data.vacations && data.vacations.length > 0 && (
          <div className="bg-[var(--brand-500)]/10 rounded-[var(--r-lg)] border border-[var(--brand-500)]/30 p-3">
            <p className="text-[var(--fs-caption)] font-semibold text-[var(--brand-400)] mb-2">휴가중 ({data.vacations.length}명)</p>
            {data.vacations.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between bg-[var(--bg-1)] rounded-[var(--r-md)] px-3 py-2 mb-1 border border-[var(--border-1)]">
                <div>
                  <span className="font-medium text-[var(--fs-body)] text-[var(--brand-400)]">{v.employee_name}</span>
                  {v.phone && <a href={`tel:${v.phone}`} className="text-[var(--fs-caption)] text-[var(--brand-400)] ml-2">{v.phone}</a>}
                </div>
                <span className="text-[var(--fs-caption)] text-[var(--text-3)] tabular">{v.start_date}~{v.end_date}</span>
              </div>
            ))}
          </div>
        )}

        {/* Worker List */}
        <div className="space-y-2">
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] px-1">
            {filter === "all"
              ? "전체"
              : filter === "not_clocked_in"
              ? "미출근"
              : filter === "clock_in"
              ? "출근중"
              : "퇴근완료"}{" "}
            <span className="tabular">{filteredWorkers.length}</span>명
          </p>

          {filteredWorkers.length === 0 ? (
            <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-8 text-center">
              <p className="text-[var(--fs-body)] text-[var(--text-4)]">해당 상태의 근무자가 없습니다.</p>
            </div>
          ) : (
            filteredWorkers.map((w) => {
              const status = getWorkerStatus(w);
              return (
                <div
                  key={w.id}
                  className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-3.5 shadow-[var(--elev-1)] hover-lift"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-[var(--r-pill)] flex items-center justify-center shrink-0
                        ${status === 'completed' ? 'bg-[var(--success-bg)]' : status === 'clock_in' ? 'bg-[var(--warning-bg)]' : 'bg-[var(--danger-bg)]'}`}>
                        <span className={`text-[var(--fs-caption)] font-bold
                          ${status === 'completed' ? 'text-[var(--success-fg)]' : status === 'clock_in' ? 'text-[var(--warning-fg)]' : 'text-[var(--danger-fg)]'}`}>
                          {statusLabel(status).charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-[var(--text-1)] text-[var(--fs-body)]">{w.name || w.phone}</p>
                          {roleBadge(w.role)}
                        </div>
                        {w.phone && (
                          <a href={`tel:${w.phone}`} className="text-[11px] text-[var(--success-fg)] font-medium">
                            {w.phone}
                          </a>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {w.department && (
                            <span className="text-[var(--fs-micro)] px-1.5 py-0.5 bg-[var(--success-bg)] text-[var(--success-fg)] rounded-[var(--r-sm)] font-medium">
                              {w.department}
                            </span>
                          )}
                          {w.team && (
                            <span className="text-[var(--fs-micro)] px-1.5 py-0.5 bg-[var(--bg-2)] text-[var(--text-3)] rounded-[var(--r-sm)] font-medium">
                              {w.team}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge tone={statusTone(status)} size="sm">{statusLabel(status)}</Badge>
                  </div>

                  {(w.clock_in_time || w.clock_out_time) && (
                    <div className="mt-2.5 pt-2.5 border-t border-[var(--border-1)] flex gap-4 text-[var(--fs-caption)]">
                      <div>
                        <span className="text-[var(--text-4)]">출근</span>
                        <p className="font-semibold text-[var(--text-1)] mt-0.5 tabular">
                          {formatTime(w.clock_in_time) || "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[var(--text-4)]">퇴근</span>
                        <p className="font-semibold text-[var(--text-1)] mt-0.5 tabular">
                          {formatTime(w.clock_out_time) || "-"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="text-center text-[var(--fs-micro)] text-[var(--text-4)] mt-4 pb-4">조인앤조인 근태관리</p>
      </div>
    </div>
  );
}

export default function ReportRegularPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--success-fg)]" />
        </div>
      }
    >
      <ReportRegularContent />
    </Suspense>
  );
}
