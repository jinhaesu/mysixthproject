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
import {
  Card,
  PageHeader,
  Badge,
  Button,
  SkeletonCard,
  EmptyState,
  Input,
  Select,
  Textarea,
  Field,
} from "@/components/ui";

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
  if (!actual || !planned) return 'text-[var(--text-2)]';
  const actualTime = new Date(actual).toTimeString().slice(0, 5);
  if (type === 'in') {
    return actualTime <= planned ? 'text-[var(--success-fg)] font-medium' : 'text-[var(--danger-fg)] font-medium';
  } else {
    return actualTime >= planned ? 'text-[var(--success-fg)] font-medium' : 'text-[var(--warning-fg)] font-medium';
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

function statusTone(status: string): "danger" | "warning" | "success" | "neutral" {
  switch (status) {
    case "sent":      return "danger";
    case "clock_in":  return "warning";
    case "completed": return "success";
    default:          return "neutral";
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
      <PageHeader
        eyebrow={<><Activity className="w-3.5 h-3.5" /> 실시간 모니터링</>}
        title="실시간 출퇴근 현황"
        description="근무지별 출퇴근 현황을 실시간으로 모니터링합니다."
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              inputSize="sm"
            />
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={handleManualRefresh}
            >
              새로고침
            </Button>
            <span className="text-[var(--fs-caption)] text-[var(--text-4)] whitespace-nowrap tabular">
              {countdown}초 후 자동 갱신
            </span>
          </div>
        }
      />

      {loading && !data ? (
        <SkeletonCard />
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Card padding="lg" className="hover-lift text-center fade-in">
              <Users className="w-5 h-5 text-[var(--text-3)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--text-1)] tabular">{data.totals.total}</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">전체</p>
            </Card>
            <Card padding="lg" className="hover-lift text-center fade-in" style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}>
              <Clock className="w-5 h-5 text-[var(--danger-fg)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--danger-fg)] tabular">{data.totals.not_clocked_in}</p>
              <p className="text-[var(--fs-caption)] text-[var(--danger-fg)] mt-1">미출근</p>
            </Card>
            <Card padding="lg" className="hover-lift text-center fade-in" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
              <Activity className="w-5 h-5 text-[var(--warning-fg)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--warning-fg)] tabular">{data.totals.clocked_in}</p>
              <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] mt-1">출근중</p>
            </Card>
            <Card padding="lg" className="hover-lift text-center fade-in" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)" }}>
              <MapPin className="w-5 h-5 text-[var(--success-fg)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--success-fg)] tabular">{data.totals.completed}</p>
              <p className="text-[var(--fs-caption)] text-[var(--success-fg)] mt-1">퇴근완료</p>
            </Card>
          </div>

          {/* Per-workplace Sections */}
          {data.byWorkplace.length === 0 ? (
            <EmptyState icon={<MapPin className="w-8 h-8" />} title="발송된 설문이 없습니다" description="해당 날짜에 발송된 설문이 없습니다." />
          ) : (
            <div className="space-y-3">
              {data.byWorkplace.map((wp) => {
                const expanded = expandedWorkplaces.has(wp.workplace_id);
                const workers = workersForWorkplace(wp.workplace_id);

                return (
                  <Card
                    key={wp.workplace_id}
                    padding="none"
                    className="overflow-hidden hover-lift fade-in"
                  >
                    {/* Workplace Header */}
                    <button
                      onClick={() => toggleWorkplace(wp.workplace_id)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-2)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[var(--info-bg)] rounded-[var(--r-md)] flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-[var(--brand-400)]" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">
                            {wp.workplace_name || "미지정"}
                          </h3>
                          <p className="text-[var(--fs-caption)] text-[var(--text-3)]">총 <span className="tabular">{wp.total}</span>명</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-[var(--fs-caption)]">
                          <span className="text-[var(--danger-fg)] font-medium tabular">미출근 {wp.not_clocked_in}</span>
                          <span className="text-[var(--warning-fg)] font-medium tabular">출근중 {wp.clocked_in}</span>
                          <span className="text-[var(--success-fg)] font-medium tabular">퇴근 {wp.completed}</span>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-[var(--text-4)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--text-4)]" />
                        )}
                      </div>
                    </button>

                    {/* Workers List */}
                    {expanded && (
                      <div className="border-t border-[var(--border-1)]">
                        {workers.length === 0 ? (
                          <div className="px-5 py-6 text-center text-[var(--fs-body)] text-[var(--text-4)]">
                            근무자 데이터가 없습니다.
                          </div>
                        ) : (
                          <table className="w-full text-[var(--fs-body)]">
                            <thead>
                              <tr className="bg-[var(--bg-canvas)] text-left">
                                <th className="py-2.5 px-5 text-[10px] uppercase tracking-wider text-[var(--text-3)]">이름</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">배정파트</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">전화번호</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">계획출근</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">출근시간</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">계획퇴근</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">퇴근시간</th>
                                <th className="py-2.5 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">상태</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-1)]">
                              {workers.map((w) => (
                                <tr key={w.id} className="hover:bg-[var(--bg-2)] transition-colors">
                                  <td className="py-2.5 px-5 whitespace-nowrap font-medium text-[var(--text-1)]">
                                    {w.worker_name_ko || "-"}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    {w.department ? (
                                      <Badge tone="brand">{w.department}</Badge>
                                    ) : <span className="text-[var(--text-4)]">-</span>}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] tabular">
                                    {w.phone}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-4)] text-[var(--fs-caption)] tabular">
                                    {formatPlannedTime(w.planned_clock_in)}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span className={timeCompareClass(w.clock_in_time, w.planned_clock_in, 'in') + " tabular"}>
                                      {w.clock_in_time
                                        ? new Date(w.clock_in_time).toLocaleTimeString("ko-KR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "-"}
                                    </span>
                                    {w.planned_clock_in && (
                                      <span className="text-[var(--fs-caption)] text-[var(--text-4)] ml-1 tabular">({formatPlannedTime(w.planned_clock_in)})</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-4)] text-[var(--fs-caption)] tabular">
                                    {formatPlannedTime(w.planned_clock_out)}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span className={timeCompareClass(w.clock_out_time, w.planned_clock_out, 'out') + " tabular"}>
                                      {w.clock_out_time
                                        ? new Date(w.clock_out_time).toLocaleTimeString("ko-KR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })
                                        : "-"}
                                    </span>
                                    {w.planned_clock_out && (
                                      <span className="text-[var(--fs-caption)] text-[var(--text-4)] ml-1 tabular">({formatPlannedTime(w.planned_clock_out)})</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-4 whitespace-nowrap">
                                    <Badge tone={statusTone(w.status)}>
                                      {statusLabel(w.status)}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <EmptyState title="데이터 없음" description="데이터를 불러올 수 없습니다." />
      )}

      {/* Report Schedule Config */}
      <div className="mt-6">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Settings className="w-4 h-4" />}
          trailingIcon={showReportConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          onClick={() => setShowReportConfig(!showReportConfig)}
        >
          리포트 문자 설정
        </Button>

        {showReportConfig && (
          <Card className="mt-3 space-y-4 fade-in">
            {/* Existing schedules */}
            {schedules.length > 0 && (
              <div>
                <h4 className="text-[var(--fs-base)] font-medium text-[var(--text-2)] mb-2">등록된 스케줄</h4>
                <div className="space-y-2">
                  {schedules.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-[var(--bg-canvas)] rounded-[var(--r-md)] px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-[var(--info-fg)]" />
                        <span className="text-[var(--fs-body)] font-medium text-[var(--text-1)] tabular">{s.time}</span>
                        <span className="text-[var(--fs-caption)] text-[var(--text-3)]">
                          {(() => {
                            const rd = s.repeat_days || 'daily';
                            if (rd === 'daily') return '매일';
                            const dayNames: Record<string, string> = {'1':'월','2':'화','3':'수','4':'목','5':'금','6':'토','7':'일'};
                            return rd.split(',').map((d: string) => dayNames[d] || d).join('/');
                          })()}
                        </span>
                        <span className="text-[var(--fs-caption)] text-[var(--text-3)]">
                          {(() => {
                            try {
                              return JSON.parse(s.phones).join(", ");
                            } catch {
                              return s.phones;
                            }
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            try {
                              const result = await sendReportNow(s.id);
                              alert(`${result.sent}/${result.total}명에게 리포트를 발송했습니다.`);
                            } catch (err: any) { alert(err.message); }
                          }}
                        >
                          지금 발송
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          onClick={async () => {
                            await deleteReportSchedule(s.id);
                            setSchedules(schedules.filter((x: any) => x.id !== s.id));
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new schedule */}
            <div>
              <h4 className="text-[var(--fs-base)] font-medium text-[var(--text-2)] mb-2">새 스케줄 추가</h4>
              <div className="flex flex-wrap gap-3 items-end">
                <Field label="발송 시간">
                  <Input
                    type="time"
                    value={reportTime}
                    onChange={(e) => setReportTime(e.target.value)}
                    inputSize="sm"
                  />
                </Field>
                <Field label="반복">
                  <Select
                    value={repeatDays}
                    onChange={(e) => setRepeatDays(e.target.value)}
                    inputSize="sm"
                  >
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
                  </Select>
                </Field>
                <Field label="수신 전화번호 (줄바꿈 구분)" className="flex-1 min-w-[200px]">
                  <Textarea
                    value={reportPhones}
                    onChange={(e) => setReportPhones(e.target.value)}
                    placeholder={"010-1234-5678\n010-9876-5432"}
                    rows={3}
                  />
                </Field>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<Plus className="w-4 h-4" />}
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
                >
                  추가
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
