"use client";

import { useEffect, useState, useCallback } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, AreaChart,
} from "recharts";
import {
  Users, Clock, TrendingUp, CalendarDays, AlertTriangle, Palmtree, RefreshCw, Sparkles,
} from "lucide-react";
import ChartCard from "@/components/charts/ChartCard";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, ChartTooltip, ChartGradients } from "@/components/charts/theme";
import { SEMANTIC_COLORS, CHART_COLORS } from "@/lib/chartColors";
import { getDashboardHomeStats, getConfirmedList, getRegularVacations, getAttendanceSummaryRegular, getAttendanceSummaryDispatch } from "@/lib/api";
import {
  PageHeader, Stat, Badge, Button, EmptyState, SkeletonCard, SegmentedControl, Input,
  Card, CardHeader, Table, THead, TBody, TR, TH, TD,
} from "@/components/ui";

const DEPT_COLORS: Record<string, string> = {
  '물류': CHART_COLORS[0], '생산2층': CHART_COLORS[6], '생산3층': CHART_COLORS[1],
  '생산 야간': CHART_COLORS[4], '물류 야간': CHART_COLORS[5], '기타': CHART_COLORS[7],
};
function getDeptColor(dept: string) { return DEPT_COLORS[dept] || CHART_COLORS[7]; }
const fmt = (n: number) => Math.round(n * 10) / 10;
const TYPE_COLORS: Record<string, string> = { '정규직': CHART_COLORS[0], '파견': CHART_COLORS[6], '알바': CHART_COLORS[1] };

export default function HomePage() {
  const now = new Date();
  const [yearMonth, setYearMonth] = usePersistedState("home_ym", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = usePersistedState<'confirmed' | 'all'>("home_ds", 'confirmed');
  const [timeBase, setTimeBase] = usePersistedState<'actual' | 'planned'>("home_tb", 'actual');

  const loadVacationSummary = async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    let vacationCount = 0, halfDayCount = 0, totalVacDays = 0;
    const todayVacNames: string[] = [];

    try {
      const vacations = await getRegularVacations({ status: 'approved' });
      for (const v of (vacations || [])) {
        if (v.start_date <= todayStr && v.end_date >= todayStr) {
          todayVacNames.push(v.employee_name);
          const vt = (v.type || '') as string;
          if (vt.startsWith('오전') || vt.startsWith('오후')) halfDayCount++;
          else vacationCount++;
        }
        if (v.start_date?.startsWith(yearMonth) || v.end_date?.startsWith(yearMonth)) {
          totalVacDays += parseFloat(v.days) || 0;
        }
      }
    } catch {}

    return {
      vacation_summary: { vacation: vacationCount, half_day: halfDayCount, names: todayVacNames },
      vacation_days: totalVacDays,
    };
  };

  const fmtTime = (t: string | null) => {
    if (!t) return '-';
    try { const d = new Date(t); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch { return t; }
  };

  const getPlannedTime = (shifts: any[], date: string) => {
    if (!shifts || shifts.length === 0) return null;
    const d = new Date(date + 'T00:00:00+09:00');
    const dow = d.getDay();
    for (const s of shifts) {
      const daysStr = s.days_of_week || (s.day_of_week != null ? String(s.day_of_week) : '');
      if (!daysStr) continue;
      const days = daysStr.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
    }
    return shifts[0] ? { in: shifts[0].planned_clock_in, out: shifts[0].planned_clock_out } : null;
  };

  const buildFromSummary = (regEmps: any[], dispEmps: any[], tb: 'actual' | 'planned') => {
    const byDeptMap: Record<string, any> = {}, byTypeMap: Record<string, any> = {};
    const dailyMap: Record<string, any> = {};
    const deptDailyArr: any[] = [];
    let tw = 0, td = 0, th = 0, to = 0;

    const calcHours = (ci: string, co: string) => {
      const [h1, m1] = (ci || '').split(':').map(Number);
      const [h2, m2] = (co || '').split(':').map(Number);
      if (isNaN(h1) || isNaN(h2)) return 0;
      let startM = h1 * 60 + (m1 || 0), endM = h2 * 60 + (m2 || 0);
      if (endM <= startM) endM += 1440;
      return Math.max((endM - startM) / 60 - 1, 0);
    };

    const processEmp = (emp: any, empType: string) => {
      if (!emp.actuals || emp.actuals.length === 0) return;
      tw++;
      for (const a of emp.actuals) {
        let clockIn: string, clockOut: string;
        if (tb === 'planned') {
          const planned = a.planned_clock_in ? { in: a.planned_clock_in, out: a.planned_clock_out }
            : getPlannedTime(emp.shifts, a.date);
          clockIn = planned?.in || fmtTime(a.clock_in_time);
          clockOut = planned?.out || fmtTime(a.clock_out_time);
        } else {
          clockIn = fmtTime(a.clock_in_time);
          clockOut = fmtTime(a.clock_out_time);
          if (a.isPlannedOnly && clockIn === '-') continue;
        }
        if (clockIn === '-' && clockOut === '-') continue;
        const hours = calcHours(clockIn, clockOut);
        if (hours <= 0) continue;
        td++;
        const reg = Math.min(hours, 8), ot = Math.max(hours - 8, 0);
        th += hours; to += ot;
        const dept = emp.department || '(미지정)';
        if (!byDeptMap[dept]) byDeptMap[dept] = { workers: new Set(), regular_hours: 0, overtime_hours: 0, night_hours: 0, holiday_hours: 0 };
        byDeptMap[dept].workers.add(emp.name); byDeptMap[dept].regular_hours += reg; byDeptMap[dept].overtime_hours += ot;
        if (!byTypeMap[empType]) byTypeMap[empType] = { workers: new Set(), hours: 0 };
        byTypeMap[empType].workers.add(emp.name); byTypeMap[empType].hours += hours;
        if (!dailyMap[a.date]) dailyMap[a.date] = { date: a.date, workers: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0 };
        dailyMap[a.date].workers++; dailyMap[a.date].regular_hours += reg; dailyMap[a.date].overtime_hours += ot;
        deptDailyArr.push({ date: a.date, department: dept, workers: 1, hours });
      }
    };
    for (const e of regEmps) processEmp(e, '정규직');
    for (const e of dispEmps) processEmp(e, e.type || '파견');
    return {
      kpi: { total_workers: tw, total_work_days: td, total_hours: fmt(th), avg_hours_per_worker: tw > 0 ? fmt(th / tw) : 0, overtime_ratio: th > 0 ? fmt(to / th * 100) : 0, vacation_days: 0 },
      by_department: Object.entries(byDeptMap).map(([d, v]: any) => ({ department: d, workers: v.workers.size, regular_hours: fmt(v.regular_hours), overtime_hours: fmt(v.overtime_hours), night_hours: fmt(v.night_hours), holiday_hours: fmt(v.holiday_hours) })),
      by_type: Object.entries(byTypeMap).map(([t, v]: any) => ({ type: t, workers: v.workers.size, hours: fmt(v.hours) })),
      daily: Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date)),
      by_dept_daily: deptDailyArr, dow_avg: [],
    };
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [ym_year, ym_month] = yearMonth.split('-').map(Number);
      const vacData = await loadVacationSummary();

      if (dataSource === 'all') {
        const [regData, dispData] = await Promise.all([
          getAttendanceSummaryRegular(ym_year, ym_month).catch(() => ({ employees: [] })),
          getAttendanceSummaryDispatch(ym_year, ym_month).catch(() => ({ employees: [] })),
        ]);
        const result = buildFromSummary(regData.employees || [], dispData.employees || [], timeBase);
        result.kpi.vacation_days = vacData.vacation_days;
        setData({ year_month: yearMonth, ...result, vacation_summary: vacData.vacation_summary });
      } else {
        const [d, confirmed] = await Promise.all([
          getDashboardHomeStats(yearMonth).catch(() => null),
          getConfirmedList(yearMonth, '').catch(() => []),
        ]);

        if (d?.kpi) {
          d.vacation_summary = vacData.vacation_summary;
          if (vacData.vacation_days > 0) d.kpi.vacation_days = vacData.vacation_days;
          setData(d);
        } else if (confirmed?.length > 0) {
          const byDeptMap: Record<string, any> = {}, byTypeMap: Record<string, any> = {};
          const dailyMap: Record<string, any> = {};
          let tw = 0, td = 0, th = 0, to = 0;
          for (const emp of confirmed) {
            tw++; td += emp.days || 0;
            const rh = parseFloat(emp.regular_hours) || 0, oh = parseFloat(emp.overtime_hours) || 0, nh = parseFloat(emp.night_hours) || 0;
            th += rh + oh + nh; to += oh;
            const dept = emp.department || '(미지정)';
            if (!byDeptMap[dept]) byDeptMap[dept] = { workers: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0, holiday_hours: 0 };
            byDeptMap[dept].workers++; byDeptMap[dept].regular_hours += rh; byDeptMap[dept].overtime_hours += oh; byDeptMap[dept].night_hours += nh;
            const t = emp.type || '(미지정)';
            if (!byTypeMap[t]) byTypeMap[t] = { workers: 0, hours: 0 };
            byTypeMap[t].workers++; byTypeMap[t].hours += rh + oh + nh;
            for (const r of (emp.records || [])) {
              if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, workers: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0 };
              dailyMap[r.date].workers++;
              dailyMap[r.date].regular_hours += parseFloat(r.regular_hours) || 0;
              dailyMap[r.date].overtime_hours += parseFloat(r.overtime_hours) || 0;
              dailyMap[r.date].night_hours += parseFloat(r.night_hours) || 0;
            }
          }
          const dailyArr = Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
          const deptDailyArr: any[] = [];
          for (const emp of confirmed) {
            for (const r of (emp.records || [])) {
              deptDailyArr.push({ date: r.date, department: emp.department || '(미지정)', workers: 1, hours: (parseFloat(r.regular_hours)||0)+(parseFloat(r.overtime_hours)||0)+(parseFloat(r.night_hours)||0) });
            }
          }
          setData({
            year_month: yearMonth,
            kpi: { total_workers: tw, total_work_days: td, total_hours: fmt(th), avg_hours_per_worker: tw > 0 ? fmt(th/tw) : 0, overtime_ratio: th > 0 ? fmt(to/th*100) : 0, vacation_days: vacData.vacation_days },
            by_department: Object.entries(byDeptMap).map(([d, v]: any) => ({ department: d, ...v })),
            by_type: Object.entries(byTypeMap).map(([t, v]: any) => ({ type: t, ...v })),
            daily: dailyArr, by_dept_daily: deptDailyArr,
            vacation_summary: vacData.vacation_summary, dow_avg: [],
          });
        } else {
          setData(null); setError('확정 데이터가 없습니다.');
        }
      }
    } catch (e: any) {
      setData(null); setError(e?.message || 'API 호출 실패');
    } finally { setLoading(false); }
  }, [yearMonth, dataSource, timeBase]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={<><Sparkles size={12} />Overview</>}
        title="근태 관리 대시보드"
        description="조직 전반의 근태·근무시수·휴가 현황을 한눈에 확인합니다."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard className="lg:col-span-2 h-[320px]" />
        <SkeletonCard className="h-[320px]" />
      </div>
    </div>
  );

  if (!data?.kpi) return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={<><Sparkles size={12} />Overview</>}
        title="근태 관리 대시보드"
        actions={
          <Input type="month" inputSize="sm" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-40" />
        }
      />
      <EmptyState
        icon={<AlertTriangle className="w-7 h-7" />}
        title={error ? "데이터 조회 중 오류" : "확정 데이터가 없습니다"}
        description={error ? error : "선택한 월에 대한 확정 근태 데이터가 아직 없습니다. 월을 변경하거나 새로고침해 보세요."}
        action={<Button variant="primary" leadingIcon={<RefreshCw size={14} />} onClick={load}>다시 시도</Button>}
      />
    </div>
  );

  const { kpi, by_department, by_type, daily: rawDaily, by_dept_daily, vacation_summary, dow_avg } = data;
  const deptNames = (by_dept_daily || []).map((r: any) => String(r.department)).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
  const daily = (rawDaily || []).map((d: any) => {
    const row: any = { ...d };
    for (const dept of deptNames) {
      const matches = (by_dept_daily || []).filter((r: any) => r.date === d.date && r.department === dept);
      row[`dept_${dept}`] = matches.reduce((s: number, m: any) => s + (parseFloat(m.hours) || 0), 0);
    }
    return row;
  });
  const heatmapDates = (by_dept_daily || []).map((r: any) => String(r.date)).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).sort();
  const heatmapMax = Math.max(...(by_dept_daily || []).map((r: any) => parseFloat(r.hours) || 0), 1);
  const vacTotal = (vacation_summary?.vacation || 0) + (vacation_summary?.half_day || 0);

  const renderPieLabel = ({ name, value, percent }: any) => `${name} ${value} (${(percent * 100).toFixed(0)}%)`;

  const workersTrend = (daily || []).slice(-14).map((d: any) => Number(d.workers) || 0);
  const hoursTrend = (daily || []).slice(-14).map((d: any) => (parseFloat(d.regular_hours)||0) + (parseFloat(d.overtime_hours)||0) + (parseFloat(d.night_hours)||0));

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={<><Sparkles size={12} />Overview · {yearMonth}</>}
        title="근태 관리 대시보드"
        description={`${dataSource === 'confirmed' ? '확정 데이터' : '전체 데이터'} · ${timeBase === 'actual' ? '실제 출근' : '계획 출근'} 기준 집계`}
        actions={
          <>
            <SegmentedControl
              value={dataSource}
              onChange={(v) => setDataSource(v)}
              options={[
                { value: 'confirmed', label: '확정' },
                { value: 'all',       label: '전체' },
              ]}
            />
            <SegmentedControl
              value={timeBase}
              onChange={(v) => { setTimeBase(v); if (dataSource === 'confirmed') setDataSource('all'); }}
              options={[
                { value: 'actual',  label: '실제' },
                { value: 'planned', label: '계획' },
              ]}
            />
            <Input type="month" inputSize="sm" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-40" />
            <Button variant="primary" size="sm" leadingIcon={<RefreshCw size={14} />} onClick={load}>새로고침</Button>
          </>
        }
        meta={
          <>
            <Badge tone="success" dot pulse>실시간 집계</Badge>
            {(vacation_summary?.names?.length || 0) > 0 && (
              <span>오늘 휴가자 <b className="text-[var(--text-2)] tabular">{vacation_summary.names.length}</b>명</span>
            )}
            <span>총 근로자 <b className="text-[var(--text-2)] tabular">{kpi.total_workers}</b>명</span>
          </>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat tone="info"    icon={<Users className="w-4 h-4" />}        label="총 근로자"   value={kpi.total_workers} unit="명" />
        <Stat tone="success" icon={<CalendarDays className="w-4 h-4" />} label="총 근무일"   value={kpi.total_work_days} unit="일" />
        <Stat tone="warning" icon={<Clock className="w-4 h-4" />}        label="총 근무시수" value={fmt(kpi.total_hours)} unit="h" trend={hoursTrend} />
        <Stat tone="brand"   icon={<TrendingUp className="w-4 h-4" />}    label="1인 평균"    value={fmt(kpi.avg_hours_per_worker)} unit="h" trend={workersTrend} />
        <Stat
          tone={kpi.overtime_ratio > 25 ? 'danger' : 'warning'}
          icon={<AlertTriangle className="w-4 h-4" />}
          label="연장 비율"
          value={fmt(kpi.overtime_ratio)}
          unit="%"
          hint={kpi.overtime_ratio > 25 ? '권장 상한 25% 초과' : '정상 범위'}
        />
        <Stat tone="brand" icon={<Palmtree className="w-4 h-4" />} label="휴가 사용" value={kpi.vacation_days} unit="일" hint="이번 달 사용일수" />
      </div>

      {/* Row 1: Department Bar + Type Pie + Vacation Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="부서별 근무시간 현황" subtitle="기본 / 연장 / 야간 / 휴일" height={300}>
            <BarChart data={by_department} layout="vertical" margin={{ left: 60, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis type="number" {...CHART_AXIS_PROPS} unit="h" />
              <YAxis type="category" dataKey="department" {...CHART_AXIS_PROPS} tick={{ fill: 'var(--text-2)', fontSize: 11 }} width={56} />
              <Tooltip content={<ChartTooltip unit="h" formatter={(v) => `${fmt(Number(v))}h`} />} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-2)' }} />
              <Bar dataKey="regular_hours" name="기본" stackId="a" fill={SEMANTIC_COLORS.regular} />
              <Bar dataKey="overtime_hours" name="연장" stackId="a" fill={SEMANTIC_COLORS.overtime} />
              <Bar dataKey="night_hours" name="야간" stackId="a" fill={SEMANTIC_COLORS.night} />
              <Bar dataKey="holiday_hours" name="휴일" stackId="a" fill={SEMANTIC_COLORS.holiday} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartCard>
        </div>
        <div className="flex flex-col gap-4">
          <ChartCard title="유형별 근로자 분포" height={140}>
            <PieChart>
              <Pie data={by_type} dataKey="workers" nameKey="type" cx="50%" cy="50%" outerRadius={48} innerRadius={20} paddingAngle={3}
                label={renderPieLabel} labelLine={{ stroke: 'var(--text-3)' }} style={{ fontSize: 9 }}>
                {(by_type || []).map((e: any, i: number) => <Cell key={i} fill={TYPE_COLORS[e.type] || '#64748b'} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ChartCard>

          <Card padding="md" className="hover-lift">
            <CardHeader
              title="오늘 휴가 현황"
              subtitle={kpi.vacation_days > 0 ? `이번 달 총 ${kpi.vacation_days}일 사용` : undefined}
              actions={<Badge tone={vacTotal > 0 ? 'brand' : 'neutral'} size="sm">{vacTotal}명</Badge>}
            />
            <div className="mt-3">
              {vacTotal > 0 ? (
                <div className="space-y-2">
                  {(vacation_summary?.vacation || 0) > 0 && (
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[var(--r-sm)] bg-[var(--bg-2)]">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />
                        <span className="text-[var(--fs-caption)] text-[var(--text-2)]">연차</span>
                      </span>
                      <span className="tabular text-[var(--fs-caption)] font-medium text-[var(--text-1)]">{vacation_summary.vacation}명</span>
                    </div>
                  )}
                  {(vacation_summary?.half_day || 0) > 0 && (
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[var(--r-sm)] bg-[var(--bg-2)]">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-fg)]" />
                        <span className="text-[var(--fs-caption)] text-[var(--text-2)]">반차</span>
                      </span>
                      <span className="tabular text-[var(--fs-caption)] font-medium text-[var(--text-1)]">{vacation_summary.half_day}명</span>
                    </div>
                  )}
                  {(vacation_summary?.names || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--border-1)]">
                      <div className="flex flex-wrap gap-1">
                        {(vacation_summary.names as string[]).map((name: string, i: number) => (
                          <Badge key={i} tone="brand" size="xs">{name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <Palmtree className="w-6 h-6 text-[var(--text-4)] mb-1.5" />
                  <span className="text-[var(--fs-caption)] text-[var(--text-4)]">오늘 휴가자 없음</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2: Daily Workers + Daily Hours */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <ChartCard title="일별 출근자 수 추이" height={240}>
            <AreaChart data={daily} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
              <defs>
                <ChartGradients keys={["brand"]} />
              </defs>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="date" tickFormatter={(d: any) => String(d).slice(8)} {...CHART_AXIS_PROPS} />
              <YAxis {...CHART_AXIS_PROPS} />
              <Tooltip content={<ChartTooltip unit="명" />} labelFormatter={(d: any) => String(d)} />
              <Area type="monotone" dataKey="workers" name="출근자" stroke="#828FFF" fill="url(#grad-brand)" strokeWidth={2} />
            </AreaChart>
          </ChartCard>
          <ChartCard title="일별 근무시수 추이" subtitle="기본 / 연장 / 야간" height={240}>
            <AreaChart data={daily} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
              <defs>
                <ChartGradients keys={["brand", "gold"]} />
              </defs>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis dataKey="date" tickFormatter={(d: any) => String(d).slice(8)} {...CHART_AXIS_PROPS} />
              <YAxis {...CHART_AXIS_PROPS} unit="h" />
              <Tooltip content={<ChartTooltip unit="h" formatter={(v) => `${fmt(Number(v))}h`} />} labelFormatter={(d: any) => String(d)} />
              <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-2)' }} />
              <Area type="monotone" dataKey="regular_hours" name="기본" stroke={SEMANTIC_COLORS.regular} fill="url(#grad-brand)" strokeWidth={1.5} stackId="1" />
              <Area type="monotone" dataKey="overtime_hours" name="연장" stroke={SEMANTIC_COLORS.overtime} fill="url(#grad-gold)" strokeWidth={1.5} stackId="1" />
              <Area type="monotone" dataKey="night_hours" name="야간" stroke={SEMANTIC_COLORS.night} fill={SEMANTIC_COLORS.night} fillOpacity={0.15} strokeWidth={1.5} stackId="1" />
            </AreaChart>
          </ChartCard>
        </div>
      )}

      {/* Row 3: Day-of-week avg + Dept daily stacked bar */}
      {daily.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {(dow_avg || []).length > 0 && (
            <ChartCard title="요일별 평균" subtitle="평균 근무시수 / 출근자" height={240}>
              <BarChart data={dow_avg} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="dow" {...CHART_AXIS_PROPS} />
                <YAxis yAxisId="h" {...CHART_AXIS_PROPS} unit="h" />
                <YAxis yAxisId="w" orientation="right" {...CHART_AXIS_PROPS} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-2)' }} />
                <Bar yAxisId="h" dataKey="avg_hours" name="평균 시수(h)" fill={SEMANTIC_COLORS.regular} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="w" dataKey="avg_workers" name="평균 인원" fill={SEMANTIC_COLORS.overtime} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
          <div className={(dow_avg || []).length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
            <ChartCard title="부서별 일별 근무시수" height={240}>
              <BarChart data={daily} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis dataKey="date" tickFormatter={(d: any) => String(d).slice(8)} {...CHART_AXIS_PROPS} />
                <YAxis {...CHART_AXIS_PROPS} unit="h" />
                <Tooltip content={<ChartTooltip unit="h" formatter={(v) => `${fmt(Number(v))}h`} filter={(it) => !(it.name === "미지정" && Number(it.value) === 0)} />} />
                <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-2)' }} />
                {deptNames.map((dept: string, i: number) => (
                  <Bar key={dept} dataKey={`dept_${dept}`} name={dept} stackId="a" fill={getDeptColor(dept)} radius={i === deptNames.length - 1 ? [2, 2, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ChartCard>
          </div>
        </div>
      )}

      {/* Row 4: Heatmap */}
      {heatmapDates.length > 0 && (
        <Card padding="md" className="mb-4 hover-lift">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] tracking-[var(--tracking-tight)]">부서별/일별 근무시수 히트맵</h3>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5">색이 진할수록 근무시수가 많습니다</p>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--fs-micro)] text-[var(--text-3)]">
              <span>적음</span>
              {[0.15, 0.35, 0.55, 0.75, 1].map((a, i) => (
                <span key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(110,124,255,${a})` }} />
              ))}
              <span>많음</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-eyebrow sticky left-0 bg-[var(--bg-1)] z-10">부서</th>
                  {heatmapDates.map((d: string) => {
                    const dow = new Date(d + 'T00:00:00+09:00').getDay();
                    return (
                      <th key={d} className={`px-1 py-1 text-center min-w-[26px] tabular text-eyebrow ${dow === 0 ? 'text-[var(--danger-fg)]' : dow === 6 ? 'text-[var(--info-fg)]' : ''}`}>
                        {d.slice(8)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {deptNames.map((dept: string) => (
                  <tr key={dept} className="hover:bg-[var(--bg-2)]/50">
                    <td className="px-2 py-1 text-[var(--text-2)] font-medium whitespace-nowrap sticky left-0 bg-[var(--bg-1)] z-10">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: getDeptColor(dept) }} />
                        {dept}
                      </span>
                    </td>
                    {heatmapDates.map((d: string) => {
                      const hrs = (by_dept_daily || []).filter((r: any) => r.date === d && r.department === dept).reduce((s: number, r: any) => s + (parseFloat(r.hours) || 0), 0);
                      const intensity = hrs > 0 ? Math.max(0.12, Math.min(hrs / heatmapMax, 1)) : 0;
                      return (
                        <td key={d} className="px-0.5 py-0.5 text-center" title={`${dept} ${d}: ${fmt(hrs)}h`}>
                          <div
                            className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center mx-auto transition-transform hover:scale-110"
                            style={{ background: hrs > 0 ? `rgba(110,124,255,${intensity})` : 'rgba(255,255,255,0.02)' }}
                          >
                            {hrs > 0 && <span className="text-[8px] text-white font-medium tabular">{Math.round(hrs)}</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Row 5: Department detail table */}
      <Card padding="none" className="overflow-hidden hover-lift">
        <div className="px-4 py-3 border-b border-[var(--border-1)] flex items-center justify-between">
          <CardHeader
            title="부서별 상세 현황"
            subtitle="근무 유형별 시수와 연장 비율"
            actions={<Badge tone="neutral" size="sm">{by_department?.length || 0}개 부서</Badge>}
          />
        </div>
        <Table>
          <THead>
            <TR>
              <TH>부서</TH>
              <TH numeric>인원</TH>
              <TH numeric>기본(h)</TH>
              <TH numeric>연장(h)</TH>
              <TH numeric>야간(h)</TH>
              <TH numeric>휴일(h)</TH>
              <TH numeric>합계(h)</TH>
              <TH numeric>연장비율</TH>
            </TR>
          </THead>
          <TBody>
            {(by_department || []).map((dept: any) => {
              const total = (parseFloat(dept.regular_hours)||0) + (parseFloat(dept.overtime_hours)||0) + (parseFloat(dept.night_hours)||0);
              const otRatio = total > 0 ? ((parseFloat(dept.overtime_hours)||0) + (parseFloat(dept.night_hours)||0)) / total * 100 : 0;
              return (
                <TR key={dept.department}>
                  <TD emphasis>
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: getDeptColor(dept.department) }} />
                      {dept.department || '미지정'}
                    </span>
                  </TD>
                  <TD numeric>{dept.workers}</TD>
                  <TD numeric className="tabular" style={{ color: SEMANTIC_COLORS.regular }}>{fmt(dept.regular_hours)}</TD>
                  <TD numeric className="tabular" style={{ color: SEMANTIC_COLORS.overtime }}>{fmt(dept.overtime_hours)}</TD>
                  <TD numeric className="tabular" style={{ color: SEMANTIC_COLORS.night }}>{fmt(dept.night_hours)}</TD>
                  <TD numeric className="tabular" style={{ color: SEMANTIC_COLORS.holiday }}>{fmt(dept.holiday_hours)}</TD>
                  <TD numeric emphasis>{fmt(total)}</TD>
                  <TD numeric>
                    <Badge tone={otRatio > 25 ? 'danger' : 'success'} size="sm">{fmt(otRatio)}%</Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
