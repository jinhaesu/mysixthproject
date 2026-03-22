"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getRegularDashboard } from "@/lib/api";
import {
  Activity,
  Clock,
  MapPin,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

interface EmployeeRecord {
  id: number;
  name: string;
  department: string;
  team: string;
  role: string;
  status: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
}

interface DepartmentSummary {
  department: string;
  total: number;
  clocked_in: number;
  completed: number;
  not_clocked_in: number;
  teams: {
    team: string;
    employees: EmployeeRecord[];
  }[];
}

interface DashboardData {
  date: string;
  totals: {
    total: number;
    clocked_in: number;
    completed: number;
    not_clocked_in: number;
  };
  departments: DepartmentSummary[];
}

const AUTO_REFRESH_SECONDS = 30;

function statusLabel(status: string) {
  switch (status) {
    case "clocked_in":
    case "clock_in":
      return "출근중";
    case "completed":
      return "퇴근완료";
    case "not_clocked_in":
    case "sent":
      return "미출근";
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "not_clocked_in":
    case "sent":
      return "bg-red-50 text-red-700 border border-red-200";
    case "clocked_in":
    case "clock_in":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "completed":
      return "bg-green-50 text-green-700 border border-green-200";
    default:
      return "bg-gray-50 text-gray-600";
  }
}

function roleBadge(role: string) {
  if (role === "반장") return "bg-purple-100 text-purple-800 border border-purple-300";
  if (role === "조장") return "bg-blue-100 text-blue-800 border border-blue-300";
  return "";
}

export default function RegularLivePage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const countdownRef = useRef(AUTO_REFRESH_SECONDS);

  const fetchData = useCallback(async () => {
    try {
      const result = await getRegularDashboard(date);
      setData(result);
      // Auto-expand all departments on first load
      if (result?.departments) {
        setExpandedDepts(new Set(result.departments.map((d: DepartmentSummary) => d.department)));
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    countdownRef.current = AUTO_REFRESH_SECONDS;
    setCountdown(AUTO_REFRESH_SECONDS);

    const interval = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        countdownRef.current = AUTO_REFRESH_SECONDS;
        setCountdown(AUTO_REFRESH_SECONDS);
        fetchData();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const handleManualRefresh = () => {
    countdownRef.current = AUTO_REFRESH_SECONDS;
    setCountdown(AUTO_REFRESH_SECONDS);
    fetchData();
  };

  const toggleDept = (dept: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    try {
      return new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return t;
    }
  };

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            정규직 실시간 현황
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            부서/조별 출퇴근 현황을 실시간으로 모니터링합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {countdown}초 후 자동 갱신
          </span>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">데이터를 불러오는 중...</p>
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <Users className="w-6 h-6 text-gray-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-gray-900">{data.totals.total}</p>
              <p className="text-xs text-gray-500 mt-1">전체</p>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 text-center">
              <Activity className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-amber-600">{data.totals.clocked_in}</p>
              <p className="text-xs text-amber-600 mt-1">출근중</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-5 text-center">
              <MapPin className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-green-600">{data.totals.completed}</p>
              <p className="text-xs text-green-600 mt-1">퇴근완료</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-5 text-center">
              <Clock className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-red-600">{data.totals.not_clocked_in}</p>
              <p className="text-xs text-red-600 mt-1">미출근</p>
            </div>
          </div>

          {/* Per-department Sections */}
          {!data.departments || data.departments.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">해당 날짜에 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.departments.map((dept) => {
                const expanded = expandedDepts.has(dept.department);

                return (
                  <div
                    key={dept.department}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                  >
                    {/* Department Header */}
                    <button
                      onClick={() => toggleDept(dept.department)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-sm font-semibold text-gray-900">{dept.department}</h3>
                          <p className="text-xs text-gray-500">총 {dept.total}명</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-amber-600 font-medium">출근중 {dept.clocked_in}</span>
                          <span className="text-green-600 font-medium">퇴근 {dept.completed}</span>
                          <span className="text-red-600 font-medium">미출근 {dept.not_clocked_in}</span>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Teams within Department */}
                    {expanded && (
                      <div className="border-t border-gray-100">
                        {dept.teams && dept.teams.length > 0 ? (
                          dept.teams.map((teamGroup) => (
                            <div key={teamGroup.team}>
                              <div className="px-5 py-2 bg-gray-50/70 border-b border-gray-100">
                                <span className="text-xs font-semibold text-gray-600">
                                  {teamGroup.team}
                                </span>
                                <span className="text-xs text-gray-400 ml-2">
                                  ({teamGroup.employees.length}명)
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-50/30 text-left">
                                    <th className="py-2 px-5 font-medium text-gray-600">이름</th>
                                    <th className="py-2 px-4 font-medium text-gray-600">조</th>
                                    <th className="py-2 px-4 font-medium text-gray-600">직책</th>
                                    <th className="py-2 px-4 font-medium text-gray-600">출근시간</th>
                                    <th className="py-2 px-4 font-medium text-gray-600">퇴근시간</th>
                                    <th className="py-2 px-4 font-medium text-gray-600">상태</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {teamGroup.employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-gray-50/50">
                                      <td className="py-2.5 px-5 whitespace-nowrap font-medium text-gray-900">
                                        {emp.name}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">
                                        {emp.team}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        {emp.role === "반장" || emp.role === "조장" ? (
                                          <span
                                            className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${roleBadge(
                                              emp.role
                                            )}`}
                                          >
                                            {emp.role}
                                          </span>
                                        ) : (
                                          <span className="text-gray-500 text-xs">{emp.role}</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                                        {formatTime(emp.clock_in_time)}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                                        {formatTime(emp.clock_out_time)}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        <span
                                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor(
                                            emp.status
                                          )}`}
                                        >
                                          {statusLabel(emp.status)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))
                        ) : (
                          <div className="px-5 py-6 text-center text-sm text-gray-400">
                            해당 부서에 데이터가 없습니다.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-sm text-gray-500">데이터를 불러올 수 없습니다.</p>
        </div>
      )}
    </div>
  );
}
