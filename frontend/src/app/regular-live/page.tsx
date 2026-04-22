"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import HourlyChart from "@/components/HourlyChart";
import ChartCard from "@/components/charts/ChartCard";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { CHART_COLORS, getColor } from "@/lib/chartColors";
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
      return "bg-[#EB5757]/10 text-[#EB5757] border border-[#EB5757]/30";
    case "clocked_in":
    case "clock_in":
      return "bg-[#F0BF00]/10 text-[#F0BF00] border border-[#F0BF00]/30";
    case "completed":
      return "bg-[#27A644]/10 text-[#27A644] border border-[#27A644]/30";
    default:
      return "bg-[#08090A] text-[#8A8F98]";
  }
}

function roleBadge(role: string) {
  if (role === "반장") return "bg-[#5E6AD2]/15 text-purple-300 border border-purple-500";
  if (role === "조장") return "bg-[#4EA7FC]/15 text-[#828FFF] border border-blue-300";
  return "";
}

export default function RegularLivePage() {
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'));
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
  const [chartDept, setChartDept] = useState("");

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
          <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#7070FF]" />
            정규직 실시간 현황
          </h1>
          <p className="text-sm text-[#8A8F98] mt-1">
            부서/조별 출퇴근 현황을 실시간으로 모니터링합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-[#23252A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-[#5E6AD2] text-white rounded-lg text-sm font-medium hover:bg-[#828FFF] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
          <span className="text-xs text-[#62666D] whitespace-nowrap">
            {countdown}초 후 자동 갱신
          </span>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#7070FF] mx-auto" />
          <p className="mt-3 text-sm text-[#8A8F98]">데이터를 불러오는 중...</p>
        </div>
      ) : data ? (
        <>
          {/* Hourly Chart */}
          {(() => {
            const DEPARTMENTS = ["생산2층", "생산3층", "물류1층", "생산 야간", "물류 야간"];
            const allEmps = (data.departments || []).flatMap((dept: any) => (dept.teams || []).flatMap((team: any) => team.employees || []));
            const inData = allEmps.filter((e) => e.clock_in_time).map((e) => ({
              hour: new Date(e.clock_in_time!).getHours(), count: 1, department: e.department || '기타',
            }));
            const outData = allEmps.filter((e) => e.clock_out_time).map((e) => ({
              hour: new Date(e.clock_out_time!).getHours(), count: 1, department: e.department || '기타',
            }));
            return (
              <div className="mb-6">
                <HourlyChart clockInData={inData} clockOutData={outData} title={`${date} 실시간 시간대별 출퇴근 인원`}
                  departments={DEPARTMENTS} selectedDept={chartDept} onDeptChange={setChartDept} />
              </div>
            );
          })()}
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5 text-center">
              <Users className="w-6 h-6 text-[#62666D] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[#F7F8F8]">{data.totals.total}</p>
              <p className="text-xs text-[#8A8F98] mt-1">전체</p>
            </div>
            <div className="bg-[#F0BF00]/10 rounded-xl border border-[#F0BF00]/30 p-5 text-center">
              <Activity className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-[#F0BF00]">{data.totals.clocked_in}</p>
              <p className="text-xs text-[#F0BF00] mt-1">출근중</p>
            </div>
            <div className="bg-[#27A644]/10 rounded-xl border border-[#27A644]/30 p-5 text-center">
              <MapPin className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-[#27A644]">{data.totals.completed}</p>
              <p className="text-xs text-[#27A644] mt-1">퇴근완료</p>
            </div>
            <div className="bg-[#EB5757]/10 rounded-xl border border-[#EB5757]/30 p-5 text-center">
              <Clock className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-[#EB5757]">{data.totals.not_clocked_in}</p>
              <p className="text-xs text-[#EB5757] mt-1">미출근</p>
            </div>
          </div>

          {/* Department Completion Donut Chart */}
          {data && data.departments && data.departments.length > 0 && (() => {
            const donutData = (data.departments || []).map((d: DepartmentSummary) => ({
              name: d.department,
              value: d.clocked_in + d.completed,
            }));
            return (
              <div className="mb-6">
                <ChartCard title="부서별 출근 현황" height={220}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius="50%"
                      outerRadius="75%"
                      dataKey="value"
                      label={({ percent }) => percent != null ? `${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                    >
                      {donutData.map((_: any, i: number) => (
                        <Cell key={i} fill={getColor(i)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number | undefined, name: string | undefined) => [`${value ?? 0}명`, name ?? '']} />
                  </PieChart>
                </ChartCard>
              </div>
            );
          })()}

          {/* Vacation Section */}
          {(data as any).vacations && (data as any).vacations.length > 0 && (
            <div className="bg-[#5E6AD2]/10 rounded-xl border border-[#5E6AD2]/30 p-4 mb-6">
              <h3 className="text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                🏖️ 휴가중 ({(data as any).vacations.length}명)
              </h3>
              <div className="flex flex-wrap gap-2">
                {(data as any).vacations.map((v: any) => (
                  <div key={v.id} className="bg-[#0F1011] rounded-lg px-3 py-2 border border-[#5E6AD2]/30 text-sm">
                    <span className="font-medium text-purple-300">{v.employee_name}</span>
                    <span className="text-[#7070FF] ml-2 text-xs">{v.department} {v.team}</span>
                    <span className="text-purple-400 ml-2 text-xs">{v.start_date}~{v.end_date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-department Sections */}
          {!data.departments || data.departments.length === 0 ? (
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] py-16 text-center">
              <Users className="w-10 h-10 text-[#62666D] mx-auto mb-2" />
              <p className="text-sm text-[#8A8F98]">해당 날짜에 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.departments.map((dept) => {
                const expanded = expandedDepts.has(dept.department);

                return (
                  <div
                    key={dept.department}
                    className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden"
                  >
                    {/* Department Header */}
                    <button
                      onClick={() => toggleDept(dept.department)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#141516]/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#4EA7FC]/10 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-[#7070FF]" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-sm font-semibold text-[#F7F8F8]">{dept.department}</h3>
                          <p className="text-xs text-[#8A8F98]">총 {dept.total}명</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[#F0BF00] font-medium">출근중 {dept.clocked_in}</span>
                          <span className="text-[#27A644] font-medium">퇴근 {dept.completed}</span>
                          <span className="text-[#EB5757] font-medium">미출근 {dept.not_clocked_in}</span>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-[#62666D]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#62666D]" />
                        )}
                      </div>
                    </button>

                    {/* Teams within Department */}
                    {expanded && (
                      <div className="border-t border-[#23252A]">
                        {dept.teams && dept.teams.length > 0 ? (
                          dept.teams.map((teamGroup) => (
                            <div key={teamGroup.team}>
                              <div className="px-5 py-2 bg-[#08090A]/70 border-b border-[#23252A]">
                                <span className="text-xs font-semibold text-[#8A8F98]">
                                  {teamGroup.team}
                                </span>
                                <span className="text-xs text-[#62666D] ml-2">
                                  ({teamGroup.employees.length}명)
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-[#08090A]/30 text-left">
                                    <th className="py-2 px-5 font-medium text-[#8A8F98]">이름</th>
                                    <th className="py-2 px-4 font-medium text-[#8A8F98]">조</th>
                                    <th className="py-2 px-4 font-medium text-[#8A8F98]">직책</th>
                                    <th className="py-2 px-4 font-medium text-[#8A8F98]">출근시간</th>
                                    <th className="py-2 px-4 font-medium text-[#8A8F98]">퇴근시간</th>
                                    <th className="py-2 px-4 font-medium text-[#8A8F98]">상태</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#23252A]">
                                  {teamGroup.employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-[#141516]/5">
                                      <td className="py-2.5 px-5 whitespace-nowrap font-medium text-[#F7F8F8]">
                                        {emp.name}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-[#8A8F98]">
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
                                          <span className="text-[#8A8F98] text-xs">{emp.role}</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-[#D0D6E0]">
                                        {formatTime(emp.clock_in_time)}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-[#D0D6E0]">
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
                          <div className="px-5 py-6 text-center text-sm text-[#62666D]">
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
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] py-16 text-center">
          <p className="text-sm text-[#8A8F98]">데이터를 불러올 수 없습니다.</p>
        </div>
      )}

      {/* Report Schedule Config */}
      <div className="mt-6">
        <button
          onClick={() => setShowReportConfig(!showReportConfig)}
          className="flex items-center gap-2 text-sm font-medium text-[#8A8F98] hover:text-[#F7F8F8] transition-colors"
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
          <div className="mt-3 bg-[#0F1011] rounded-xl border border-[#23252A] p-5 space-y-4">
            {/* Existing schedules */}
            {schedules.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-[#D0D6E0] mb-2">등록된 스케줄</h4>
                <div className="space-y-2">
                  {schedules.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-[#08090A] rounded-lg px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-[#F7F8F8]">{s.time}</span>
                        <span className="text-xs text-[#8A8F98]">
                          {(() => {
                            const rd = s.repeat_days || 'daily';
                            if (rd === 'daily') return '매일';
                            const dayNames: Record<string, string> = {'1':'월','2':'화','3':'수','4':'목','5':'금','6':'토','7':'일'};
                            return rd.split(',').map((d: string) => dayNames[d] || d).join('/');
                          })()}
                        </span>
                        <span className="text-xs text-[#8A8F98]">
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
                          className="px-2 py-1 text-xs font-medium text-[#27A644] bg-[#27A644]/10 rounded hover:bg-[#27A644]/15 transition-colors"
                        >
                          지금 발송
                        </button>
                        <button
                          onClick={async () => {
                            await deleteRegularReportSchedule(s.id);
                            setSchedules(schedules.filter((x: any) => x.id !== s.id));
                          }}
                          className="p-1 text-red-400 hover:text-[#EB5757] transition-colors"
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
              <h4 className="text-sm font-medium text-[#D0D6E0] mb-2">새 스케줄 추가</h4>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-[#8A8F98] mb-1">발송 시간</label>
                  <input
                    type="time"
                    value={reportTime}
                    onChange={(e) => setReportTime(e.target.value)}
                    className="px-3 py-1.5 border border-[#23252A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#8A8F98] mb-1">반복</label>
                  <select value={repeatDays} onChange={(e) => setRepeatDays(e.target.value)}
                    className="px-3 py-1.5 border border-[#23252A] rounded-lg text-sm bg-[#0F1011] focus:outline-none focus:ring-2 focus:ring-blue-500">
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
                  <label className="block text-xs text-[#8A8F98] mb-1">
                    수신 전화번호 (줄바꿈 구분)
                  </label>
                  <textarea
                    value={reportPhones}
                    onChange={(e) => setReportPhones(e.target.value)}
                    placeholder={"010-1234-5678\n010-9876-5432"}
                    rows={3}
                    className="w-full px-3 py-1.5 border border-[#23252A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#5E6AD2] text-white rounded-lg text-sm font-medium hover:bg-[#828FFF] transition-colors"
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
