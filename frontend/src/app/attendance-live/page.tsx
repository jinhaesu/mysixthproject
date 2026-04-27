"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getAttendanceLiveDashboard,
  getReportSchedules,
  createReportSchedule,
  deleteReportSchedule,
  sendReportNow,
} from "@/lib/api";
import {
  Activity,
  RefreshCw,
  MapPin,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  Settings,
  Trash2,
  Plus,
} from "lucide-react";

interface WorkplaceSummary {
  workplace_id: number;
  workplace_name: string;
  total: number;
  not_clocked_in: number;
  clocked_in: number;
  completed: number;
  expired: number;
}

interface Worker {
  id: number;
  phone: string;
  status: string;
  workplace_id: number;
  workplace_name: string;
  worker_name_ko: string | null;
  department: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  planned_clock_in: string | null;
  planned_clock_out: string | null;
}

interface DashboardData {
  date: string;
  byWorkplace: WorkplaceSummary[];
  workers: Worker[];
  totals: {
    total: number;
    not_clocked_in: number;
    clocked_in: number;
    completed: number;
  };
}

const AUTO_REFRESH_SECONDS = 30;

function statusLabel(status: string) {
  switch (status) {
    case "sent":
      return "미출근";
    case "clock_in":
      return "출근중";
    case "completed":
      return "퇴근완료";
    case "expired":
      return "만료";
    default:
      return status;
  }
}

function timeCompareClass(actual: string | null, planned: string | null, type: 'in' | 'out'): string {
  if (!actual || !planned) return 'text-[#D0D6E0]';
  const actualTime = new Date(actual).toTimeString().slice(0, 5);
  if (type === 'in') {
    return actualTime <= planned ? 'text-[#27A644] font-medium' : 'text-[#EB5757] font-medium';
  } else {
    return actualTime >= planned ? 'text-[#27A644] font-medium' : 'text-[#F0BF00] font-medium';
  }
}

function formatPlannedTime(time: string | null): string {
  if (!time) return "-";
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h < 12 ? "오전" : "오후";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function statusColor(status: string) {
  switch (status) {
    case "sent":
      return "bg-[#EB5757]/10 text-[#EB5757] border border-[#EB5757]/30";
    case "clock_in":
      return "bg-[#F0BF00]/10 text-[#F0BF00] border border-[#F0BF00]/30";
    case "completed":
      return "bg-[#27A644]/10 text-[#27A644] border border-[#27A644]/30";
    case "expired":
      return "bg-[#08090A] text-[#8A8F98] border border-[#23252A]";
    default:
      return "bg-[#08090A] text-[#8A8F98]";
  }
}

export default function AttendanceLivePage() {
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [expandedWorkplaces, setExpandedWorkplaces] = useState<Set<number>>(new Set());
  const countdownRef = useRef(AUTO_REFRESH_SECONDS);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [reportTime, setReportTime] = useState("09:00");
  const [repeatDays, setRepeatDays] = useState("daily");
  const [reportPhones, setReportPhones] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const result = await getAttendanceLiveDashboard(date);
      setData(result);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  // Initial load and date change
  useEffect(() => {
    setLoading(true);
    fetchData();
    getReportSchedules().then(setSchedules).catch(console.error);
  }, [fetchData]);

  // Auto-refresh countdown
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

  const toggleWorkplace = (id: number) => {
    setExpandedWorkplaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const workersForWorkplace = (workplaceId: number) =>
    data?.workers.filter((w) => w.workplace_id === workplaceId) || [];

  return (
    <div className="min-w-0">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
            <Activity className="w-6 h-6 text-[#7070FF]" />
            실시간 출퇴근 현황
          </h1>
          <p className="text-sm text-[#8A8F98] mt-1">
            근무지별 출퇴근 현황을 실시간으로 모니터링합니다.
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
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5 text-center">
              <Users className="w-6 h-6 text-[#62666D] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[#F7F8F8]">{data.totals.total}</p>
              <p className="text-xs text-[#8A8F98] mt-1">전체</p>
            </div>
            <div className="bg-[#EB5757]/10 rounded-xl border border-[#EB5757]/30 p-5 text-center">
              <Clock className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-[#EB5757]">{data.totals.not_clocked_in}</p>
              <p className="text-xs text-[#EB5757] mt-1">미출근</p>
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
          </div>

          {/* Per-workplace Sections */}
          {data.byWorkplace.length === 0 ? (
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] py-16 text-center">
              <MapPin className="w-10 h-10 text-[#62666D] mx-auto mb-2" />
              <p className="text-sm text-[#8A8F98]">해당 날짜에 발송된 설문이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.byWorkplace.map((wp) => {
                const expanded = expandedWorkplaces.has(wp.workplace_id);
                const workers = workersForWorkplace(wp.workplace_id);

                return (
                  <div
                    key={wp.workplace_id}
                    className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden"
                  >
                    {/* Workplace Header */}
                    <button
                      onClick={() => toggleWorkplace(wp.workplace_id)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#141516]/5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#4EA7FC]/10 rounded-lg flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-[#7070FF]" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-sm font-semibold text-[#F7F8F8]">
                            {wp.workplace_name || "미지정"}
                          </h3>
                          <p className="text-xs text-[#8A8F98]">총 {wp.total}명</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[#EB5757] font-medium">
                            미출근 {wp.not_clocked_in}
                          </span>
                          <span className="text-[#F0BF00] font-medium">
                            출근중 {wp.clocked_in}
                          </span>
                          <span className="text-[#27A644] font-medium">
                            퇴근 {wp.completed}
                          </span>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-[#62666D]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#62666D]" />
                        )}
                      </div>
                    </button>

                    {/* Workers List */}
                    {expanded && (
                      <div className="border-t border-[#23252A]">
                        {workers.length === 0 ? (
                          <div className="px-5 py-6 text-center text-sm text-[#62666D]">
                            근무자 데이터가 없습니다.
                          </div>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#08090A] text-left">
                                <th className="py-2.5 px-5 font-medium text-[#8A8F98]">이름</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">배정파트</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">전화번호</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">계획출근</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">출근시간</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">계획퇴근</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">퇴근시간</th>
                                <th className="py-2.5 px-4 font-medium text-[#8A8F98]">상태</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#23252A]">
                              {workers.map((w) => (
                                <tr key={w.id} className="hover:bg-[#141516]/5/50">
                                  <td className="py-2.5 px-5 whitespace-nowrap font-medium text-[#F7F8F8]">
                                    {w.worker_name_ko || "-"}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    {w.department ? (
                                      <span className="inline-flex px-2 py-0.5 bg-[#5E6AD2]/10 text-[#828FFF] border border-[#5E6AD2]/30 rounded text-xs font-medium">{w.department}</span>
                                    ) : <span className="text-[#62666D]">-</span>}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap text-[#8A8F98]">
                                    {w.phone}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap text-[#62666D] text-xs">
                                    {formatPlannedTime(w.planned_clock_in)}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span className={timeCompareClass(w.clock_in_time, w.planned_clock_in, 'in')}>
                                      {w.clock_in_time
                                        ? new Date(w.clock_in_time).toLocaleTimeString("ko-KR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "-"}
                                    </span>
                                    {w.planned_clock_in && (
                                      <span className="text-xs text-[#62666D] ml-1">({formatPlannedTime(w.planned_clock_in)})</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap text-[#62666D] text-xs">
                                    {formatPlannedTime(w.planned_clock_out)}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span className={timeCompareClass(w.clock_out_time, w.planned_clock_out, 'out')}>
                                      {w.clock_out_time
                                        ? new Date(w.clock_out_time).toLocaleTimeString("ko-KR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "-"}
                                    </span>
                                    {w.planned_clock_out && (
                                      <span className="text-xs text-[#62666D] ml-1">({formatPlannedTime(w.planned_clock_out)})</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${statusColor(
                                        w.status
                                      )}`}
                                    >
                                      {statusLabel(w.status)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
                      <button
                        onClick={async () => {
                          try {
                            const result = await sendReportNow(s.id);
                            alert(`${result.sent}/${result.total}명에게 리포트를 발송했습니다.`);
                          } catch (err: any) { alert(err.message); }
                        }}
                        className="px-2 py-1 text-xs font-medium text-[#27A644] bg-[#27A644]/10 rounded hover:bg-[#27A644]/15 transition-colors"
                      >
                        지금 발송
                      </button>
                      <button
                        onClick={async () => {
                          await deleteReportSchedule(s.id);
                          setSchedules(schedules.filter((x: any) => x.id !== s.id));
                        }}
                        className="p-1 text-red-400 hover:text-[#EB5757] transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
                      const created = await createReportSchedule({
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
