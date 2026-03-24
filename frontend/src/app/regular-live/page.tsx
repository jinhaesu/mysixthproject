"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getRegularDashboard,
  getRegularReportSchedules,
  createRegularReportSchedule,
  deleteRegularReportSchedule,
  sendRegularReportNow,
} from "@/lib/api";
import {
  Activity,
  Clock,
  MapPin,
  Users,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Settings,
  Trash2,
  Plus,
  Send,
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
  const [schedules, setSchedules] = useState<any[]>([]);
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [reportTime, setReportTime] = useState("09:00");
  const [repeatDays, setRepeatDays] = useState("daily");
  const [reportPhones, setReportPhones] = useState("");

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

  useEffect(() => {
    getRegularReportSchedules().then(setSchedules).catch(console.error);
  }, []);

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

      {/* Report Schedule Config */}
      <div className="mt-6">
        <button
          onClick={() => setShowReportConfig(!showReportConfig)}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
        >
          <Settings className="w-4 h-4" />
          리포트 문자 설정
          {showReportConfig ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {showReportConfig && (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {/* Existing schedules */}
            {schedules.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">등록된 스케줄</h4>
                <div className="space-y-2">
                  {schedules.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-gray-800">{s.time}</span>
                        <span className="text-xs text-gray-500">
                          {(() => {
                            const rd = s.repeat_days || 'daily';
                            if (rd === 'daily') return '매일';
                            const dayNames: Record<string, string> = {'1':'월','2':'화','3':'수','4':'목','5':'금','6':'토','7':'일'};
                            return rd.split(',').map((d: string) => dayNames[d] || d).join('/');
                          })()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(() => {
                            try {
                              return JSON.parse(s.phones).join(", ");
                            } catch {
                              return s.phones;
                            }
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async () => {
                            try {
                              const result = await sendRegularReportNow(s.id);
                              alert(`${result.sent}/${result.total}명에게 리포트를 발송했습니다.`);
                            } catch (err: any) { alert(err.message); }
                          }}
                          className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100 transition-colors"
                        >
                          지금 발송
                        </button>
                        <button
                          onClick={async () => {
                            await deleteRegularReportSchedule(s.id);
                            setSchedules(schedules.filter((x: any) => x.id !== s.id));
                          }}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new schedule */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">새 스케줄 추가</h4>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">발송 시간</label>
                  <input
                    type="time"
                    value={reportTime}
                    onChange={(e) => setReportTime(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">반복</label>
                  <select value={repeatDays} onChange={(e) => setRepeatDays(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="daily">매일</option>
                    <option value="1,2,3,4,5">평일 (월~금)</option>
                    <option value="1">월요일</option>
                    <option value="2">화요일</option>
                    <option value="3">수요일</option>
                    <option value="4">목요일</option>
                    <option value="5">금요일</option>
                    <option value="6">토요일</option>
                    <option value="7">일요일</option>
                    <option value="1,3,5">월/수/금</option>
                    <option value="2,4">화/목</option>
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-500 mb-1">
                    수신 전화번호 (줄바꿈 구분)
                  </label>
                  <textarea
                    value={reportPhones}
                    onChange={(e) => setReportPhones(e.target.value)}
                    placeholder={"010-1234-5678\n010-9876-5432"}
                    rows={3}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                <button
                  onClick={async () => {
                    const phones = reportPhones
                      .split("\n")
                      .map((p) => p.trim())
                      .filter(Boolean);
                    if (!reportTime || phones.length === 0) {
                      alert("시간과 전화번호를 입력해주세요.");
                      return;
                    }
                    try {
                      const created = await createRegularReportSchedule({
                        time: reportTime,
                        phones,
                        repeat_days: repeatDays,
                      });
                      setSchedules([...schedules, created]);
                      setReportPhones("");
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  추가
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
