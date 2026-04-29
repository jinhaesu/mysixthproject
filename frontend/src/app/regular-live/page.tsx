"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import HourlyChart from "@/components/HourlyChart";
import ChartCard, { TOOLTIP_STYLE } from "@/components/charts/ChartCard";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { getColor } from "@/lib/chartColors";
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
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";

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

function statusTone(status: string): "warning" | "success" | "danger" | "neutral" {
  switch (status) {
    case "clocked_in":
    case "clock_in":
      return "warning";
    case "completed":
      return "success";
    case "not_clocked_in":
    case "sent":
      return "danger";
    default:
      return "neutral";
  }
}

function roleTone(role: string): "brand" | "info" | undefined {
  if (role === "반장") return "brand";
  if (role === "조장") return "info";
  return undefined;
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
    <div className="min-w-0 fade-in">
      <PageHeader
        eyebrow="정규직"
        title="실시간 현황"
        description="부서/조별 출퇴근 현황을 실시간으로 모니터링합니다."
        actions={
          <div className="flex items-center gap-3">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              inputSize="sm"
            />
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<RefreshCw className="w-4 h-4" />}
              onClick={handleManualRefresh}
            >
              새로고침
            </Button>
            <span className="text-xs text-[var(--text-4)] tabular whitespace-nowrap">
              {countdown}초 후 자동 갱신
            </span>
          </div>
        }
      />

      {loading && !data ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)] mx-auto" />
          <p className="mt-3 text-sm text-[var(--text-3)]">데이터를 불러오는 중...</p>
        </div>
      ) : data ? (
        <>
          {/* Hourly Chart */}
          {(() => {
            const DEPARTMENTS = ["생산2층", "생산3층", "물류", "생산 야간", "물류 야간", "카페(해방촌)", "카페(행궁동)", "카페(경복궁)"];
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
            <Card padding="md" className="text-center">
              <Users className="w-6 h-6 text-[var(--text-4)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--text-1)] tabular">{data.totals.total}</p>
              <p className="text-xs text-[var(--text-3)] mt-1">전체</p>
            </Card>
            <div className="rounded-[var(--r-lg)] border border-[var(--warning-border)] bg-[var(--warning-bg)] p-5 text-center hover-lift">
              <Activity className="w-6 h-6 text-[var(--warning-fg)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--warning-fg)] tabular">{data.totals.clocked_in}</p>
              <p className="text-xs text-[var(--warning-fg)] mt-1">출근중</p>
            </div>
            <div className="rounded-[var(--r-lg)] border border-[var(--success-border)] bg-[var(--success-bg)] p-5 text-center hover-lift">
              <MapPin className="w-6 h-6 text-[var(--success-fg)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--success-fg)] tabular">{data.totals.completed}</p>
              <p className="text-xs text-[var(--success-fg)] mt-1">퇴근완료</p>
            </div>
            <div className="rounded-[var(--r-lg)] border border-[var(--danger-border)] bg-[var(--danger-bg)] p-5 text-center hover-lift">
              <Clock className="w-6 h-6 text-[var(--danger-fg)] mx-auto mb-2" />
              <p className="text-3xl font-bold text-[var(--danger-fg)] tabular">{data.totals.not_clocked_in}</p>
              <p className="text-xs text-[var(--danger-fg)] mt-1">미출근</p>
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
                    <Tooltip
                      formatter={(value: number | undefined, name: string | undefined) => [`${value ?? 0}명`, name ?? '']}
                      contentStyle={TOOLTIP_STYLE}
                    />
                  </PieChart>
                </ChartCard>
              </div>
            );
          })()}

          {/* Vacation Section */}
          {(data as any).vacations && (data as any).vacations.length > 0 && (
            <div className="rounded-[var(--r-lg)] border border-[var(--brand-500)]/30 bg-[var(--brand-500)]/10 p-4 mb-6">
              <h3 className="text-sm font-semibold text-[var(--brand-400)] mb-2 flex items-center gap-2">
                휴가중 ({(data as any).vacations.length}명)
              </h3>
              <div className="flex flex-wrap gap-2">
                {(data as any).vacations.map((v: any) => (
                  <div key={v.id} className="rounded-[var(--r-md)] px-3 py-2 border border-[var(--brand-500)]/30 bg-[var(--bg-1)] text-sm">
                    <span className="font-medium text-[var(--brand-400)]">{v.employee_name}</span>
                    <span className="text-[var(--brand-500)] ml-2 text-xs">{v.department} {v.team}</span>
                    <span className="text-[var(--brand-400)] ml-2 text-xs tabular">{v.start_date}~{v.end_date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-department Sections */}
          {!data.departments || data.departments.length === 0 ? (
            <Card padding="lg" className="py-16 text-center">
              <Users className="w-10 h-10 text-[var(--text-4)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-3)]">해당 날짜에 데이터가 없습니다.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.departments.map((dept) => {
                const expanded = expandedDepts.has(dept.department);

                return (
                  <Card key={dept.department} padding="none" className="overflow-hidden hover-lift">
                    {/* Department Header */}
                    <button
                      onClick={() => toggleDept(dept.department)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-2)] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[var(--brand-500)]/10 rounded-[var(--r-md)] flex items-center justify-center">
                          <Users className="w-4 h-4 text-[var(--brand-400)]" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-sm font-semibold text-[var(--text-1)]">{dept.department}</h3>
                          <p className="text-xs text-[var(--text-3)]">총 <span className="tabular">{dept.total}</span>명</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-[var(--warning-fg)] font-medium tabular">출근중 {dept.clocked_in}</span>
                          <span className="text-[var(--success-fg)] font-medium tabular">퇴근 {dept.completed}</span>
                          <span className="text-[var(--danger-fg)] font-medium tabular">미출근 {dept.not_clocked_in}</span>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-[var(--text-4)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--text-4)]" />
                        )}
                      </div>
                    </button>

                    {/* Teams within Department */}
                    {expanded && (
                      <div className="border-t border-[var(--border-1)]">
                        {dept.teams && dept.teams.length > 0 ? (
                          dept.teams.map((teamGroup) => (
                            <div key={teamGroup.team}>
                              <div className="px-5 py-2 bg-[var(--bg-0)]/70 border-b border-[var(--border-1)]">
                                <span className="text-xs font-semibold text-[var(--text-3)]">
                                  {teamGroup.team}
                                </span>
                                <span className="text-xs text-[var(--text-4)] ml-2 tabular">
                                  ({teamGroup.employees.length}명)
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-[var(--bg-0)]/30 text-left">
                                    <th className="py-2 px-5 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">이름</th>
                                    <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">조</th>
                                    <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">직책</th>
                                    <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">출근시간</th>
                                    <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">퇴근시간</th>
                                    <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">상태</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-1)]">
                                  {teamGroup.employees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-[var(--bg-2)]">
                                      <td className="py-2.5 px-5 whitespace-nowrap font-medium text-[var(--text-1)]">
                                        {emp.name}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)]">
                                        {emp.team}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        {emp.role === "반장" || emp.role === "조장" ? (
                                          <Badge tone={roleTone(emp.role)} size="xs">{emp.role}</Badge>
                                        ) : (
                                          <span className="text-[var(--text-3)] text-xs">{emp.role}</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)] tabular">
                                        {formatTime(emp.clock_in_time)}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)] tabular">
                                        {formatTime(emp.clock_out_time)}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        <Badge tone={statusTone(emp.status)} size="xs" dot>
                                          {statusLabel(emp.status)}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))
                        ) : (
                          <div className="px-5 py-6 text-center text-sm text-[var(--text-4)]">
                            해당 부서에 데이터가 없습니다.
                          </div>
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
        <Card padding="lg" className="py-16 text-center">
          <p className="text-sm text-[var(--text-3)]">데이터를 불러올 수 없습니다.</p>
        </Card>
      )}

      {/* Report Schedule Config */}
      <div className="mt-6">
        <button
          onClick={() => setShowReportConfig(!showReportConfig)}
          className="flex items-center gap-2 text-sm font-medium text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
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
          <Card padding="md" className="mt-3 space-y-4">
            {/* Existing schedules */}
            {schedules.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-[var(--text-2)] mb-2">등록된 스케줄</h4>
                <div className="space-y-2">
                  {schedules.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between bg-[var(--bg-0)] rounded-[var(--r-md)] px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-[var(--info-fg)]" />
                        <span className="text-sm font-medium text-[var(--text-1)] tabular">{s.time}</span>
                        <span className="text-xs text-[var(--text-3)]">
                          {(() => {
                            const rd = s.repeat_days || 'daily';
                            if (rd === 'daily') return '매일';
                            const dayNames: Record<string, string> = {'1':'월','2':'화','3':'수','4':'목','5':'금','6':'토','7':'일'};
                            return rd.split(',').map((d: string) => dayNames[d] || d).join('/');
                          })()}
                        </span>
                        <span className="text-xs text-[var(--text-3)]">
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
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            try {
                              const result = await sendRegularReportNow(s.id);
                              alert(`${result.sent}/${result.total}명에게 리포트를 발송했습니다.`);
                            } catch (err: any) { alert(err.message); }
                          }}
                        >
                          지금 발송
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            await deleteRegularReportSchedule(s.id);
                            setSchedules(schedules.filter((x: any) => x.id !== s.id));
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-[var(--danger-fg)]" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new schedule */}
            <div>
              <h4 className="text-sm font-medium text-[var(--text-2)] mb-2">새 스케줄 추가</h4>
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
