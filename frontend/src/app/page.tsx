"use client";

import { useEffect, useState, useCallback } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, AreaChart,
} from "recharts";
import {
  Users, Clock, TrendingUp, CalendarDays, Loader2, AlertTriangle, Palmtree,
} from "lucide-react";
import ChartCard from "@/components/charts/ChartCard";
import { SEMANTIC_COLORS } from "@/lib/chartColors";
import { getDashboardHomeStats, getConfirmedList, getRegularVacations } from "@/lib/api";

const DEPT_COLORS: Record<string, string> = {
  '물류': '#3b82f6', '생산2층': '#f97316', '생산3층': '#10b981',
  '생산 야간': '#8b5cf6', '물류 야간': '#06b6d4', '기타': '#64748b',
};
function getDeptColor(dept: string) { return DEPT_COLORS[dept] || '#64748b'; }
const fmt = (n: number) => Math.round(n * 10) / 10;
const TYPE_COLORS: Record<string, string> = { '정규직': '#3b82f6', '파견': '#f97316', '알바': '#10b981' };
const TT = { background: '#0F1011', border: '1px solid #23252A', borderRadius: 8, fontSize: 12 };

export default function HomePage() {
  const now = new Date();
  const [yearMonth, setYearMonth] = usePersistedState("home_ym", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 프론트엔드에서 직접 휴가 데이터 계산
  const loadVacationSummary = async (confirmed: any[]) => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const vacNames = new Set<string>();
    let vacationCount = 0, halfDayCount = 0, totalVacDays = 0;

    // 1. confirmed_attendance에서 source='vacation' 레코드 (오늘)
    for (const emp of confirmed) {
      for (const r of (emp.records || [])) {
        if (r.date === todayStr && r.source === 'vacation') {
          if (!vacNames.has(emp.name)) {
            vacNames.add(emp.name);
            if ((r.memo || '').includes('반차')) halfDayCount++;
            else vacationCount++;
          }
        }
        // 이번 달 전체 휴가일 수
        if (r.source === 'vacation') totalVacDays++;
      }
    }

    // 2. regular_vacation_requests에서 승인된 휴가 (오늘)
    try {
      const vacations = await getRegularVacations({ status: 'approved' });
      for (const v of (vacations || [])) {
        if (v.start_date <= todayStr && v.end_date >= todayStr) {
          if (!vacNames.has(v.employee_name)) {
            vacNames.add(v.employee_name);
            if ((v.type || '').includes('반차')) halfDayCount++;
            else vacationCount++;
          }
        }
        // 이번 달 휴가일수 집계
        if (v.start_date?.startsWith(yearMonth) || v.end_date?.startsWith(yearMonth)) {
          totalVacDays += parseFloat(v.days) || 0;
        }
      }
    } catch {}

    // 오늘 출근자 (confirmed에서 오늘 날짜 레코드가 있고 휴가가 아닌 사람)
    const workingNames = new Set<string>();
    for (const emp of confirmed) {
      for (const r of (emp.records || [])) {
        if (r.date === todayStr && r.source !== 'vacation') workingNames.add(emp.name);
      }
    }
    // 휴가자 제외
    for (const name of vacNames) workingNames.delete(name);

    return {
      vacation_summary: { working: workingNames.size, vacation: vacationCount, half_day: halfDayCount },
      vacation_days: totalVacDays,
    };
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [d, confirmed] = await Promise.all([
        getDashboardHomeStats(yearMonth).catch(() => null),
        getConfirmedList(yearMonth, '').catch(() => []),
      ]);

      // 휴가 데이터는 항상 프론트엔드에서 직접 계산
      const vacData = await loadVacationSummary(confirmed || []);

      if (d?.kpi) {
        // 대시보드 API 성공 시 그 데이터 사용 + 휴가 보강
        d.vacation_summary = vacData.vacation_summary;
        if (vacData.vacation_days > 0) d.kpi.vacation_days = vacData.vacation_days;
        setData(d);
      } else if (confirmed?.length > 0) {
        // Fallback: confirmed list로 데이터 구성
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
    } catch (e: any) {
      setData(null); setError(e?.message || 'API 호출 실패');
    } finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-32 text-center"><Loader2 className="w-10 h-10 animate-spin text-[#7070FF] mx-auto" /><p className="text-sm text-[#8A8F98] mt-3">대시보드 로딩 중...</p></div>;

  if (!data?.kpi) return (
    <div className="py-32 text-center">
      <AlertTriangle className="w-10 h-10 text-[#F0BF00] mx-auto" />
      <p className="text-sm text-[#8A8F98] mt-3">{error ? `오류: ${error}` : '확정 데이터가 없습니다.'}</p>
      <div className="mt-4 flex justify-center gap-2">
        <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011] text-[#F7F8F8]" />
        <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">재시도</button>
      </div>
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
  const vacTotal = (vacation_summary?.working || 0) + (vacation_summary?.vacation || 0) + (vacation_summary?.half_day || 0);

  // Pie label renderer that avoids overlap
  const renderPieLabel = ({ name, value, percent }: any) => `${name} ${value} (${(percent * 100).toFixed(0)}%)`;

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#F7F8F8]">근태 관리 대시보드</h1>
          <p className="text-sm text-[#8A8F98] mt-1">확정된 근태 데이터 기반 종합 현황</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011] text-[#F7F8F8]" />
          <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">새로고침</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard icon={<Users className="w-5 h-5" />} label="총 근로자" value={kpi.total_workers} unit="명" color="#3b82f6" />
        <KpiCard icon={<CalendarDays className="w-5 h-5" />} label="총 근무일" value={kpi.total_work_days} unit="일" color="#10b981" />
        <KpiCard icon={<Clock className="w-5 h-5" />} label="총 근무시수" value={fmt(kpi.total_hours)} unit="h" color="#f59e0b" />
        <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="1인 평균" value={fmt(kpi.avg_hours_per_worker)} unit="h" color="#8b5cf6" />
        <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="연장 비율" value={fmt(kpi.overtime_ratio)} unit="%" color={kpi.overtime_ratio > 25 ? '#ef4444' : '#f59e0b'} />
        <KpiCard icon={<Palmtree className="w-5 h-5" />} label="휴가 사용" value={kpi.vacation_days} unit="일" color="#a78bfa" />
      </div>

      {/* Row 1: Department Bar + Type Pie + Vacation Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="부서별 근무시간 현황" subtitle="기본 / 연장 / 야간 / 휴일" height={300}>
            <BarChart data={by_department} layout="vertical" margin={{ left: 60, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23252A" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#8A8F98' }} unit="h" />
              <YAxis type="category" dataKey="department" tick={{ fontSize: 11, fill: '#D0D6E0' }} width={56} />
              <Tooltip formatter={(v: any) => `${fmt(v ?? 0)}h`} contentStyle={TT} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="regular_hours" name="기본" stackId="a" fill={SEMANTIC_COLORS.regular} />
              <Bar dataKey="overtime_hours" name="연장" stackId="a" fill={SEMANTIC_COLORS.overtime} />
              <Bar dataKey="night_hours" name="야간" stackId="a" fill={SEMANTIC_COLORS.night} />
              <Bar dataKey="holiday_hours" name="휴일" stackId="a" fill={SEMANTIC_COLORS.holiday} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartCard>
        </div>
        <div className="flex flex-col gap-4">
          {/* Type Pie */}
          <ChartCard title="유형별 근로자 분포" height={140}>
            <PieChart>
              <Pie data={by_type} dataKey="workers" nameKey="type" cx="50%" cy="50%" outerRadius={48} innerRadius={20} paddingAngle={3}
                label={renderPieLabel} labelLine={{ stroke: '#8A8F98' }} style={{ fontSize: 9 }}>
                {(by_type || []).map((e: any, i: number) => <Cell key={i} fill={TYPE_COLORS[e.type] || '#64748b'} />)}
              </Pie>
              <Tooltip contentStyle={TT} />
            </PieChart>
          </ChartCard>
          {/* Vacation */}
          <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4">
            <h3 className="text-sm font-semibold text-[#F7F8F8] mb-1">오늘 휴가 현황</h3>
            <p className="text-[10px] text-[#8A8F98] mb-3">{kpi.vacation_days > 0 ? `이번 달 총 ${kpi.vacation_days}일 사용` : ''}</p>
            {vacTotal > 0 ? (
              <div className="space-y-2">
                {[
                  { name: '출근', value: vacation_summary?.working || 0, color: '#10b981' },
                  { name: '연차', value: vacation_summary?.vacation || 0, color: '#a78bfa' },
                  { name: '반차', value: vacation_summary?.half_day || 0, color: '#f59e0b' },
                ].filter(d => d.value > 0).map(d => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                    <span className="text-xs text-[#D0D6E0] flex-1">{d.name}</span>
                    <span className="text-sm text-[#F7F8F8] font-bold">{d.value}명</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <Palmtree className="w-5 h-5 text-[#62666D] mx-auto mb-1" />
                <span className="text-xs text-[#62666D]">오늘 휴가자 없음</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Daily Workers + Daily Hours */}
      {daily.length > 0 && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="일별 출근자 수 추이" height={240}>
          <AreaChart data={daily} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#23252A" />
            <XAxis dataKey="date" tickFormatter={(d: any) => String(d).slice(8)} tick={{ fontSize: 10, fill: '#8A8F98' }} />
            <YAxis tick={{ fontSize: 10, fill: '#8A8F98' }} />
            <Tooltip labelFormatter={(d: any) => String(d)} formatter={(v: any) => [`${v ?? 0}명`]} contentStyle={TT} />
            <Area type="monotone" dataKey="workers" stroke="#3b82f6" fill="url(#wg)" strokeWidth={2} />
          </AreaChart>
        </ChartCard>
        <ChartCard title="일별 근무시수 추이" subtitle="기본 / 연장 / 야간" height={240}>
          <AreaChart data={daily} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SEMANTIC_COLORS.regular} stopOpacity={0.4} /><stop offset="95%" stopColor={SEMANTIC_COLORS.regular} stopOpacity={0} /></linearGradient>
              <linearGradient id="og" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={SEMANTIC_COLORS.overtime} stopOpacity={0.4} /><stop offset="95%" stopColor={SEMANTIC_COLORS.overtime} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#23252A" />
            <XAxis dataKey="date" tickFormatter={(d: any) => String(d).slice(8)} tick={{ fontSize: 10, fill: '#8A8F98' }} />
            <YAxis tick={{ fontSize: 10, fill: '#8A8F98' }} unit="h" />
            <Tooltip labelFormatter={(d: any) => String(d)} formatter={(v: any, name: any) => [`${fmt(v ?? 0)}h`, name]} contentStyle={TT} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="regular_hours" name="기본" stroke={SEMANTIC_COLORS.regular} fill="url(#rg)" strokeWidth={1.5} stackId="1" />
            <Area type="monotone" dataKey="overtime_hours" name="연장" stroke={SEMANTIC_COLORS.overtime} fill="url(#og)" strokeWidth={1.5} stackId="1" />
            <Area type="monotone" dataKey="night_hours" name="야간" stroke={SEMANTIC_COLORS.night} fill={SEMANTIC_COLORS.night} fillOpacity={0.15} strokeWidth={1.5} stackId="1" />
          </AreaChart>
        </ChartCard>
      </div>}

      {/* Row 3: Day-of-week + Dept daily stacked bar */}
      {daily.length > 0 && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {(dow_avg || []).length > 0 && <ChartCard title="요일별 평균" subtitle="평균 근무시수 / 출근자" height={240}>
          <BarChart data={dow_avg} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#23252A" />
            <XAxis dataKey="dow" tick={{ fontSize: 11, fill: '#D0D6E0' }} />
            <YAxis yAxisId="h" tick={{ fontSize: 10, fill: '#8A8F98' }} unit="h" />
            <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 10, fill: '#8A8F98' }} />
            <Tooltip contentStyle={TT} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar yAxisId="h" dataKey="avg_hours" name="평균 시수(h)" fill={SEMANTIC_COLORS.regular} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="w" dataKey="avg_workers" name="평균 인원" fill={SEMANTIC_COLORS.overtime} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>}
        <div className={(dow_avg || []).length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
          <ChartCard title="부서별 일별 근무시수" height={240}>
            <BarChart data={daily} margin={{ left: -8, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#23252A" />
              <XAxis dataKey="date" tickFormatter={(d: any) => String(d).slice(8)} tick={{ fontSize: 10, fill: '#8A8F98' }} />
              <YAxis tick={{ fontSize: 10, fill: '#8A8F98' }} unit="h" />
              <Tooltip contentStyle={TT} formatter={(v: any, name: any) => [`${fmt(v ?? 0)}h`, name]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {deptNames.map((dept: string, i: number) => (
                <Bar key={dept} dataKey={`dept_${dept}`} name={dept} stackId="a" fill={getDeptColor(dept)} radius={i === deptNames.length - 1 ? [2, 2, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ChartCard>
        </div>
      </div>}

      {/* Row 4: Heatmap */}
      {heatmapDates.length > 0 && <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4 mb-4">
        <h3 className="text-sm font-semibold text-[#F7F8F8] mb-1">부서별/일별 근무시수 히트맵</h3>
        <p className="text-[10px] text-[#8A8F98] mb-3">색이 진할수록 근무시수가 많습니다</p>
        <div className="overflow-x-auto">
          <table className="text-[10px] border-collapse">
            <thead><tr>
              <th className="px-2 py-1 text-left text-[#8A8F98] sticky left-0 bg-[#0F1011] z-10">부서</th>
              {heatmapDates.map((d: string) => {
                const dow = new Date(d + 'T00:00:00+09:00').getDay();
                return <th key={d} className={`px-1 py-1 text-center min-w-[26px] ${dow === 0 ? 'text-[#EB5757]' : dow === 6 ? 'text-[#4EA7FC]' : 'text-[#8A8F98]'}`}>{d.slice(8)}</th>;
              })}
            </tr></thead>
            <tbody>
              {deptNames.map((dept: string) => (
                <tr key={dept}>
                  <td className="px-2 py-1 text-[#D0D6E0] font-medium whitespace-nowrap sticky left-0 bg-[#0F1011] z-10">{dept}</td>
                  {heatmapDates.map((d: string) => {
                    const hrs = (by_dept_daily || []).filter((r: any) => r.date === d && r.department === dept).reduce((s: number, r: any) => s + (parseFloat(r.hours) || 0), 0);
                    const intensity = hrs > 0 ? Math.max(0.1, Math.min(hrs / heatmapMax, 1)) : 0;
                    return (
                      <td key={d} className="px-0.5 py-0.5 text-center" title={`${dept} ${d}: ${fmt(hrs)}h`}>
                        <div className="w-[22px] h-[22px] rounded-sm flex items-center justify-center mx-auto" style={{ background: hrs > 0 ? `rgba(59,130,246,${intensity})` : 'transparent' }}>
                          {hrs > 0 && <span className="text-[8px] text-white font-medium">{Math.round(hrs)}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Row 5: Department detail table */}
      <div className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#23252A]"><h3 className="text-sm font-semibold text-[#F7F8F8]">부서별 상세 현황</h3></div>
        <table className="w-full text-xs">
          <thead><tr className="bg-[#08090A] text-left">
            <th className="py-2 px-4 font-medium text-[#8A8F98]">부서</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">인원</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">기본(h)</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">연장(h)</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">야간(h)</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">휴일(h)</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">합계(h)</th>
            <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">연장비율</th>
          </tr></thead>
          <tbody>
            {(by_department || []).map((dept: any) => {
              const total = (parseFloat(dept.regular_hours)||0) + (parseFloat(dept.overtime_hours)||0) + (parseFloat(dept.night_hours)||0);
              const otRatio = total > 0 ? ((parseFloat(dept.overtime_hours)||0) + (parseFloat(dept.night_hours)||0)) / total * 100 : 0;
              return (
                <tr key={dept.department} className="border-b border-[#23252A] hover:bg-[#141516]">
                  <td className="py-2.5 px-4 font-medium text-[#F7F8F8]"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: getDeptColor(dept.department) }} />{dept.department || '미지정'}</td>
                  <td className="py-2.5 px-4 text-right text-[#D0D6E0]">{dept.workers}</td>
                  <td className="py-2.5 px-4 text-right text-[#3b82f6]">{fmt(dept.regular_hours)}</td>
                  <td className="py-2.5 px-4 text-right text-[#f59e0b]">{fmt(dept.overtime_hours)}</td>
                  <td className="py-2.5 px-4 text-right text-[#8b5cf6]">{fmt(dept.night_hours)}</td>
                  <td className="py-2.5 px-4 text-right text-[#f43f5e]">{fmt(dept.holiday_hours)}</td>
                  <td className="py-2.5 px-4 text-right text-[#F7F8F8] font-medium">{fmt(total)}</td>
                  <td className="py-2.5 px-4 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${otRatio > 25 ? 'bg-[#EB5757]/15 text-[#EB5757]' : 'bg-[#27A644]/15 text-[#27A644]'}`}>{fmt(otRatio)}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, unit, color }: { icon: React.ReactNode; label: string; value: number | string; unit: string; color: string }) {
  return (
    <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-lg" style={{ background: `${color}15`, color }}>{icon}</div>
        <span className="text-[11px] text-[#8A8F98]">{label}</span>
      </div>
      <p className="text-xl font-bold text-[#F7F8F8]">{value}<span className="text-xs text-[#8A8F98] ml-1">{unit}</span></p>
    </div>
  );
}
