"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

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
  const dateParam = searchParams.get("date") || new Date().toLocaleDateString('sv-SE');
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );

  if (!data || !data.workers)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">데이터 없음</p>
          <p className="text-sm text-gray-500 mt-1">{dateParam} 등록된 정규직 데이터가 없습니다.</p>
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

  const statusStyle = (status: WorkerStatus) => {
    if (status === "completed") return { bg: "bg-green-500", text: "text-white", label: "퇴근" };
    if (status === "clock_in") return { bg: "bg-amber-500", text: "text-white", label: "출근" };
    return { bg: "bg-red-500", text: "text-white", label: "미출근" };
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
        <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-bold border border-green-200">
          {role}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-4 pt-6 pb-8">
        <div className="max-w-lg mx-auto">
          <p className="text-green-200 text-xs">{data.date || dateParam}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <h1 className="text-xl font-bold">정규직 출퇴근 현황 리포트</h1>
            <span className="shrink-0 text-[11px] font-bold bg-white text-green-700 px-2 py-0.5 rounded-full">
              정규직
            </span>
          </div>
          <p className="text-green-200 text-xs mt-1">{lastUpdated} 업데이트 · 30초 자동 갱신</p>

          {/* Big circle rate */}
          <div className="flex items-center justify-center mt-5">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeDasharray={`${rate}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{rate}%</span>
                <span className="text-[10px] text-green-200">출근률</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 space-y-3 pb-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: "all" as const, count: displayTotals.total, label: "전체", border: "border-gray-200" },
            { key: "clock_in" as const, count: displayTotals.clocked_in, label: "출근중", border: "border-amber-300" },
            { key: "completed" as const, count: displayTotals.completed, label: "퇴근", border: "border-green-300" },
            { key: "not_clocked_in" as const, count: displayTotals.not_clocked_in, label: "미출근", border: "border-red-300" },
          ].map((card) => (
            <button
              key={card.key}
              onClick={() => setFilter(card.key)}
              className={`bg-white rounded-xl border-2 p-3 text-center transition-all ${
                filter === card.key ? card.border + " shadow-sm scale-[1.02]" : "border-gray-100"
              }`}
            >
              <p className="text-xl font-bold text-gray-900">{card.count}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{card.label}</p>
            </button>
          ))}
        </div>

        {/* Department Filter */}
        {departments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setDeptFilter("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                deptFilter === "all"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              전체
            </button>
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setDeptFilter(dept)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  deptFilter === dept
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        )}

        {/* Vacation List */}
        {data.vacations && data.vacations.length > 0 && (
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-3">
            <p className="text-xs font-semibold text-purple-800 mb-2">🏖️ 휴가중 ({data.vacations.length}명)</p>
            {data.vacations.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 mb-1 border border-purple-100">
                <div>
                  <span className="font-medium text-sm text-purple-900">{v.employee_name}</span>
                  {v.phone && <a href={`tel:${v.phone}`} className="text-xs text-purple-600 ml-2">{v.phone}</a>}
                </div>
                <span className="text-xs text-purple-500">{v.start_date}~{v.end_date}</span>
              </div>
            ))}
          </div>
        )}

        {/* Worker List */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500 px-1">
            {filter === "all"
              ? "전체"
              : filter === "not_clocked_in"
              ? "미출근"
              : filter === "clock_in"
              ? "출근중"
              : "퇴근완료"}{" "}
            {filteredWorkers.length}명
          </p>

          {filteredWorkers.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400">해당 상태의 근무자가 없습니다.</p>
            </div>
          ) : (
            filteredWorkers.map((w) => {
              const status = getWorkerStatus(w);
              const st = statusStyle(status);
              return (
                <div
                  key={w.id}
                  className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-full ${st.bg} flex items-center justify-center shrink-0`}
                      >
                        <span className={`text-xs font-bold ${st.text}`}>
                          {st.label.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-gray-900 text-sm">{w.name || w.phone}</p>
                          {roleBadge(w.role)}
                        </div>
                        {w.phone && (
                          <a
                            href={`tel:${w.phone}`}
                            className="text-[11px] text-green-600 font-medium"
                          >
                            {w.phone}
                          </a>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {w.department && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-medium">
                              {w.department}
                            </span>
                          )}
                          {w.team && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">
                              {w.team}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-1 rounded-lg text-xs font-bold ${st.bg} ${st.text}`}
                    >
                      {st.label}
                    </span>
                  </div>

                  {(w.clock_in_time || w.clock_out_time) && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex gap-4 text-xs">
                      <div>
                        <span className="text-gray-400">출근</span>
                        <p className="font-semibold text-gray-800 mt-0.5">
                          {formatTime(w.clock_in_time) || "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400">퇴근</span>
                        <p className="font-semibold text-gray-800 mt-0.5">
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

        <p className="text-center text-[10px] text-gray-300 mt-4 pb-4">조인앤조인 근태관리</p>
      </div>
    </div>
  );
}

export default function ReportRegularPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
        </div>
      }
    >
      <ReportRegularContent />
    </Suspense>
  );
}
