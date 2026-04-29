"use client";

import { useState, useCallback, useEffect } from "react";
import ChartCard, { TOOLTIP_STYLE } from "@/components/charts/ChartCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { SEMANTIC_COLORS, GRID_STROKE, AXIS_STYLE } from "@/lib/chartColors";
import { usePersistedState } from "@/lib/usePersistedState";
import { ClipboardList, ChevronDown, ChevronUp, Check, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { getAttendanceSummaryRegular, confirmAttendance, getConfirmedList, deleteConfirmedRecord, getRegularVacations, deleteRegularAttendanceMonth } from "@/lib/api";
import { bumpRegularDataVersion } from "@/lib/dataSignal";
import { PageHeader, Badge, Button, Input, Select, Field, Card, EmptyState, CenterSpinner, useToast } from "@/components/ui";

// Korean public holidays
const HOLIDAYS: Record<number, string[]> = {
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
};
function isHolidayOrWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}

function isHalfLeaveType(t?: string): boolean {
  if (!t) return false;
  return t.startsWith('오전') || t.startsWith('오후');
}
function isFullLeaveType(t?: string): boolean {
  return t === '연차' || t === '공가';
}

const _cache: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 3 * 60 * 60 * 1000;

export default function AttendanceSummaryRegularPage() {
  const [year, setYear] = usePersistedState("asr_year", new Date().getFullYear());
  const [month, setMonth] = usePersistedState("asr_month", new Date().getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<Record<string, 'planned' | 'actual'>>({});
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [checkedEmps, setCheckedEmps] = useState<Set<number>>(new Set());
  const [batchSource, setBatchSource] = useState<'planned' | 'actual'>('planned');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(31);
  const [viewMode, setViewMode] = usePersistedState<'actual' | 'planned'>("asr_viewMode", 'actual');
  const [hiddenEmps, setHiddenEmps] = useState<Set<number>>(new Set());
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const [confirmedEmpSet, setConfirmedEmpSet] = useState<Set<string>>(new Set());
  const [confirmedIdMap, setConfirmedIdMap] = useState<Record<string, number>>({});
  const [nameSearch, setNameSearch] = usePersistedState("asr_nameSearch", "");
  const [deptFilter, setDeptFilter] = usePersistedState("asr_deptFilter", "");
  const [dinnerBreak, setDinnerBreak] = useState<Record<string, boolean>>({});
  const [confirmFilter, setConfirmFilter] = usePersistedState<'all'|'unconfirmed'|'confirmed'>("asr_confirmFilter", 'all');
  const toast = useToast();
  const [vacationMap, setVacationMap] = useState<Record<string, { type: string; status: string }>>({}); 

  const loadVacations = useCallback(async () => {
    try {
      const vacations = await getRegularVacations({ status: 'approved' });
      const map: Record<string, { type: string; status: string }> = {};
      for (const v of (vacations || [])) {
        const start = new Date(v.start_date + 'T00:00:00+09:00');
        const end = new Date(v.end_date + 'T00:00:00+09:00');
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${day}`;
          map[`${v.employee_name}|${dateStr}`] = { type: v.type || '연차', status: 'approved' };
        }
      }
      setVacationMap(map);
    } catch {}
  }, []);

  const [forceRefresh, setForceRefresh] = useState(0);

  const load = useCallback(async () => {
    const key = `reg-${year}-${month}`;
    const cached = _cache[key];
    if (forceRefresh === 0 && cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      const ym = `${year}-${String(month).padStart(2,'0')}`;
      try {
        const confirmed = await getConfirmedList(ym, '정규직');
        const cSet = new Set<string>();
        const cIdMap: Record<string, number> = {};
        const cEmpDates = new Map<string, number>();
        for (const emp of (confirmed || [])) {
          for (const rec of (emp.records || [])) { const k = `${emp.name}|${rec.date}`; cSet.add(k); cIdMap[k] = rec.id; }
          cEmpDates.set(emp.name, (cEmpDates.get(emp.name) || 0) + (emp.records?.length || 0));
        }
        setConfirmedSet(cSet);
        setConfirmedIdMap(cIdMap);
        const cEmpSet = new Set<string>();
        for (const emp of cached.data.employees || []) {
          const total = emp.actuals?.length || 0;
          const done = cEmpDates.get(emp.name) || 0;
          if (total > 0 && done >= total) cEmpSet.add(emp.name);
        }
        setConfirmedEmpSet(cEmpSet);
      } catch {}
      return;
    }
    setLoading(true);
    try {
      const d = await getAttendanceSummaryRegular(year, month);
      if (d?.employees) {
        const ym = `${year}-${String(month).padStart(2,'0')}`;
        const lastDay = new Date(year, month, 0).getDate();
        const today = new Date().toLocaleDateString('sv-SE');
        for (const emp of d.employees) {
          if (!emp.shifts || emp.shifts.length === 0) continue;
          const existingDates = new Set(emp.actuals.map((a: any) => a.date));
          for (let day = 1; day <= lastDay; day++) {
            const dateStr = `${ym}-${String(day).padStart(2,'0')}`;
            if (dateStr > today) continue;
            if (existingDates.has(dateStr)) continue;
            const planned = getPlannedForDay(emp.shifts, dateStr);
            if (planned && planned.in && planned.in !== '-') {
              emp.actuals.push({
                employee_id: emp.id,
                date: dateStr,
                clock_in_time: null,
                clock_out_time: null,
                isPlannedOnly: true,
              });
            }
          }
        }
        d.employees = d.employees.filter((e: any) =>
          (e.actuals && e.actuals.length > 0) || (e.shifts && e.shifts.length > 0)
        );
      }
      setData(d);
      _cache[key] = { data: d, time: Date.now() };
      setHiddenEmps(new Set());

      const ym = `${year}-${String(month).padStart(2,'0')}`;
      try {
        const confirmed = await getConfirmedList(ym, '정규직');
        const cSet = new Set<string>();
        const cIdMap: Record<string, number> = {};
        const cEmpDates = new Map<string, number>();
        for (const emp of (confirmed || [])) {
          let allDays = 0;
          for (const rec of (emp.records || [])) {
            const k = `${emp.name}|${rec.date}`;
            cSet.add(k);
            cIdMap[k] = rec.id;
            allDays++;
          }
          cEmpDates.set(emp.name, allDays);
        }
        setConfirmedSet(cSet);
        setConfirmedIdMap(cIdMap);
        const cEmpSet = new Set<string>();
        if (d?.employees) {
          for (const emp of d.employees) {
            const totalDays = emp.actuals?.length || 0;
            const confirmedDays = cEmpDates.get(emp.name) || 0;
            if (totalDays > 0 && confirmedDays >= totalDays) cEmpSet.add(emp.name);
          }
        }
        setConfirmedEmpSet(cEmpSet);
      } catch {}
    } catch (e: any) { toast.error(e.message || "데이터를 불러오는데 실패했습니다."); }
    finally { setLoading(false); }
  }, [year, month, forceRefresh]);

  useEffect(() => { load(); loadVacations(); }, [load, loadVacations]);

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try {
      const d = new Date(t);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return t; }
  };

  const getPlannedForDay = (shifts: any[], date: string) => {
    const d = new Date(date + 'T00:00:00+09:00');
    const dow = d.getDay();
    const dayOfMonth = d.getDate();
    const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const startOffset = (firstDow + 6) % 7;
    const weekNum = Math.ceil((dayOfMonth + startOffset) / 7);

    for (const s of shifts) {
      if (s.week_number && s.week_number !== weekNum) continue;
      const daysStr = s.days_of_week && s.days_of_week !== '' ? s.days_of_week : (s.day_of_week != null ? String(s.day_of_week) : '');
      if (!daysStr) continue;
      const days = daysStr.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
    }
    for (const s of shifts) {
      if (s.week_number) continue;
      const daysStr = s.days_of_week && s.days_of_week !== '' ? s.days_of_week : (s.day_of_week != null ? String(s.day_of_week) : '');
      if (!daysStr) continue;
      const days = daysStr.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
    }
    return null;
  };

  const timeDiffHours = (t1: string, t2: string) => {
    if (!t1 || !t2 || t1 === '-' || t2 === '-') return 0;
    const [h1, m1] = t1.split(':').map(Number);
    const [h2, m2] = t2.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return 0;
    return Math.abs((h1 * 60 + (m1||0)) - (h2 * 60 + (m2||0))) / 60;
  };

  const isMealBreakApplicable = (clockIn: string, clockOut: string) => {
    if (!clockIn || !clockOut || clockIn === '-' || clockOut === '-') return false;
    const [h1,m1] = clockIn.split(':').map(Number);
    const [h2,m2] = clockOut.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return false;
    const startMin = Math.ceil((h1 * 60 + (m1 || 0)) / 30) * 30;
    let endMin = Math.floor((h2 * 60 + (m2 || 0)) / 30) * 30;
    if (endMin <= startMin) endMin += 1440;
    const totalH = Math.max((endMin - startMin) / 60 - 1, 0);
    const overtime = Math.max(totalH - 8, 0);
    return overtime >= 2;
  };

  const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
  const floor30Min = (min: number) => Math.floor(min / 30) * 30;

  const calcHoursFromTimes = (clockIn: string, clockOut: string, breakH = 1, isHalfDay = false) => {
    if (isHalfDay) {
      let night = 0;
      if (clockIn && clockOut && clockIn !== '-' && clockOut !== '-') {
        const [h1,m1] = clockIn.split(':').map(Number);
        const [h2,m2] = clockOut.split(':').map(Number);
        if (!isNaN(h1) && !isNaN(h2)) {
          const startMin = ceil30Min(h1 * 60 + (m1 || 0));
          let endMin = floor30Min(h2 * 60 + (m2 || 0));
          if (endMin <= startMin) endMin += 1440;
          let nightMin = 0;
          for (let min = startMin; min < endMin; min++) {
            const h = Math.floor((min % 1440) / 60);
            if (h >= 22 || h < 6) nightMin++;
          }
          night = Math.round(nightMin / 60 * 10) / 10;
        }
      }
      return { regular: 8, overtime: 0, night };
    }
    if (!clockIn || !clockOut || clockIn === '-' || clockOut === '-') return { regular: 0, overtime: 0, night: 0 };
    const [h1,m1] = clockIn.split(':').map(Number);
    const [h2,m2] = clockOut.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0, night: 0 };
    const startMin = ceil30Min(h1 * 60 + (m1 || 0));
    let endMin = floor30Min(h2 * 60 + (m2 || 0));
    if (endMin <= startMin) endMin += 1440;
    const total = Math.max((endMin - startMin) / 60 - breakH, 0);
    let nightMin = 0;
    for (let min = startMin; min < endMin; min++) {
      const h = Math.floor((min % 1440) / 60);
      if (h >= 22 || h < 6) nightMin++;
    }
    const night = Math.round(nightMin / 60 * 10) / 10;
    const dayWork = Math.max(total - night, 0);
    const regular = Math.min(dayWork, 8);
    const overtime = Math.max(dayWork - 8, 0);
    return { regular, overtime, night };
  };

  const getBreakHours = (empId: number, date: string, clockIn: string, clockOut: string, empName?: string) => {
    if (empName) {
      const vacInfo = vacationMap[`${empName}|${date}`];
      if (isHalfLeaveType(vacInfo?.type)) return 0;
    }
    const key = `${empId}|${date}`;
    if (!isMealBreakApplicable(clockIn, clockOut)) return 1;
    const hasMeal = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
    return hasMeal ? 1.5 : 1;
  };

  const getEmpSummary = (emp: any, mode: 'actual' | 'planned') => {
    let regular = 0, overtime = 0, weekend = 0, days = 0;
    const ym = `${year}-${String(month).padStart(2,'0')}`;
    let vacRegular = 0;
    Object.entries(vacationMap).forEach(([k, vInfo]) => {
      if (!k.startsWith(`${emp.name}|${ym}`)) return;
      const vDate = k.split('|')[1];
      if (isHolidayOrWeekend(vDate)) return;
      const hasActual = emp.actuals?.some((a: any) => a.date === vDate && !a.isVacOnly && (a.clock_in_time || a.clock_out_time));
      if (isFullLeaveType(vInfo.type) && !hasActual) {
        vacRegular += 8;
        days++;
      } else if (isHalfLeaveType(vInfo.type) && !hasActual) {
        vacRegular += 4;
        days++;
      }
    });
    for (const actual of emp.actuals) {
      if (actual.isVacOnly) continue;
      const date = actual.date;
      const planned = getPlannedForDay(emp.shifts, date);
      const clockIn = mode === 'planned' && planned ? planned.in : formatTime(actual.clock_in_time);
      const clockOut = mode === 'planned' && planned ? planned.out : formatTime(actual.clock_out_time);
      if (clockIn === '-' && clockOut === '-') continue;
      days++;
      const isHalfVac = !!isHalfLeaveType(vacationMap[`${emp.name}|${date}`]?.type);
      const breakH = getBreakHours(emp.id, date, clockIn, clockOut, emp.name);
      const h = calcHoursFromTimes(clockIn, clockOut, breakH, isHalfVac);
      const totalH = h.regular + h.overtime;
      if (isHolidayOrWeekend(date)) {
        overtime += totalH;
        weekend += totalH;
      } else {
        regular += h.regular;
        overtime += h.overtime;
      }
    }
    regular += vacRegular;
    return { regular: Math.round(regular*10)/10, overtime: Math.round(overtime*10)/10, weekend: Math.round(weekend*10)/10, days };
  };

  const allDates = data ? (() => {
    const dates: string[] = [];
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) dates.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    return dates;
  })() : [];

  const handleConfirmRows = async () => {
    if (checkedRows.size === 0) { toast.info("확정할 항목을 선택해주세요."); return; }
    setConfirming(true);
    try {
      const records: any[] = [];
      for (const key of Array.from(checkedRows)) {
        const [empId, date] = key.split('|');
        const emp = data?.employees?.find((e: any) => String(e.id) === empId);
        if (!emp) continue;
        const source = selectedSource[key] || 'planned';
        const actual = emp.actuals.find((a: any) => a.date === date);
        const planned = getPlannedForDay(emp.shifts, date);
        const clockIn = source === 'actual' ? formatTime(actual?.clock_in_time) : (planned?.in || '');
        const clockOut = source === 'actual' ? formatTime(actual?.clock_out_time) : (planned?.out || '');
        const isHalfVac = !!isHalfLeaveType(vacationMap[`${emp.name}|${date}`]?.type);
        const breakH = getBreakHours(parseInt(empId), date, clockIn, clockOut, emp.name);
        const h = calcHoursFromTimes(clockIn, clockOut, breakH, isHalfVac);
        records.push({ employee_type: '정규직', employee_name: emp.name, employee_phone: emp.phone, department: emp.department || '', date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source, regular_hours: h.regular, overtime_hours: h.overtime, night_hours: h.night, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
      }
      const result = await confirmAttendance(records);
      toast.success(`${result.confirmed}건 확정 완료`);
      setCheckedRows(new Set());
      delete _cache[`reg-${year}-${month}`];
      bumpRegularDataVersion();
      setForceRefresh(f => f + 1);
    } catch (e: any) { toast.error(e.message || "확정 처리 실패"); }
    finally { setConfirming(false); }
  };

  const handleBatchConfirm = async () => {
    if (checkedEmps.size === 0) { toast.info("직원을 선택해주세요."); return; }
    setConfirming(true);
    try {
      const records: any[] = [];
      const startDate = `${year}-${String(month).padStart(2,'0')}-${String(rangeStart).padStart(2,'0')}`;
      const endDate = `${year}-${String(month).padStart(2,'0')}-${String(rangeEnd).padStart(2,'0')}`;
      for (const empId of Array.from(checkedEmps)) {
        const emp = data?.employees?.find((e: any) => e.id === empId);
        if (!emp) continue;
        for (const actual of emp.actuals) {
          if (actual.date < startDate || actual.date > endDate) continue;
          const planned = getPlannedForDay(emp.shifts, actual.date);
          const clockIn = batchSource === 'actual' ? formatTime(actual.clock_in_time) : (planned?.in || formatTime(actual.clock_in_time));
          const clockOut = batchSource === 'actual' ? formatTime(actual.clock_out_time) : (planned?.out || formatTime(actual.clock_out_time));
          if (clockIn === '-' && clockOut === '-') continue;
          const isHalfVac = isHalfLeaveType(vacationMap[`${emp.name}|${actual.date}`]?.type);
          const breakH = getBreakHours(emp.id, actual.date, clockIn, clockOut, emp.name);
          const h = calcHoursFromTimes(clockIn, clockOut, breakH, isHalfVac);
          records.push({ employee_type: '정규직', employee_name: emp.name, employee_phone: emp.phone, department: emp.department || '', date: actual.date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source: batchSource, regular_hours: h.regular, overtime_hours: h.overtime, night_hours: h.night, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
        }
      }
      if (records.length === 0) { toast.info("해당 기간에 출근 데이터가 없습니다."); return; }
      const result = await confirmAttendance(records);
      toast.success(`${result.confirmed}건 확정 완료`);
      setCheckedEmps(new Set());
      delete _cache[`reg-${year}-${month}`];
      bumpRegularDataVersion();
      setForceRefresh(f => f + 1);
    } catch (e: any) { toast.error(e.message || "일괄 확정 처리 실패"); }
    finally { setConfirming(false); }
  };

  const getAnomalyCount = (emp: any) => {
    let count = 0;
    for (const actual of (emp.actuals || [])) {
      const planned = getPlannedForDay(emp.shifts, actual.date);
      if (!planned || planned.in === '-') continue;
      const actualIn = formatTime(actual.clock_in_time);
      const actualOut = formatTime(actual.clock_out_time);
      const diffIn = timeDiffHours(planned.in, actualIn);
      const diffOut = timeDiffHours(planned.out, actualOut);
      if (diffIn >= 3 || diffOut >= 3) count++;
    }
    return count;
  };

  const visibleEmployees = (data?.employees || []).filter((e: any) =>
    !hiddenEmps.has(e.id) &&
    (!nameSearch || (e.name || '').includes(nameSearch)) &&
    (!deptFilter || (e.department || '').includes(deptFilter)) &&
    (confirmFilter === 'all' || (confirmFilter === 'confirmed' && confirmedEmpSet.has(e.name)) || (confirmFilter === 'unconfirmed' && !confirmedEmpSet.has(e.name)))
  );
  const lastDay = new Date(year, month, 0).getDate();

  const chartData = visibleEmployees.slice(0, 15).map((emp: any) => {
    const s = getEmpSummary(emp, viewMode);
    return { name: emp.name.slice(0, 3), 기본: s.regular, 연장: s.overtime, 주말: s.weekend };
  });

  return (
    <div className="min-w-0 fade-in">
      <PageHeader
        eyebrow="정규직"
        title="근태 정보 종합 요약"
        description="실제 출퇴근 기록이 있는 직원만 표시됩니다."
      />

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <Field label="연도">
          <Input
            type="number"
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            inputSize="sm"
            className="w-24"
          />
        </Field>
        <Field label="월">
          <Select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            inputSize="sm"
          >
            {Array.from({length:12}, (_,i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
          </Select>
        </Field>
        <Field label="시간 보기">
          <Select
            value={viewMode}
            onChange={e => setViewMode(e.target.value as any)}
            inputSize="sm"
          >
            <option value="actual">실제 기준</option>
            <option value="planned">계획 기준</option>
          </Select>
        </Field>
        <Field label="부서">
          <Select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            inputSize="sm"
          >
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
            <option value="생산 야간">생산 야간</option>
            <option value="물류 야간">물류 야간</option>
            <option value="카페(해방촌)">카페(해방촌)</option>
            <option value="카페(행궁동)">카페(행궁동)</option>
            <option value="카페(경복궁)">카페(경복궁)</option>
          </Select>
        </Field>
        <Field label="이름 검색">
          <Input
            type="text"
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            placeholder="이름"
            inputSize="sm"
            className="w-28"
          />
        </Field>
        <Field label="확정 상태">
          <Select
            value={confirmFilter}
            onChange={e => setConfirmFilter(e.target.value as any)}
            inputSize="sm"
          >
            <option value="all">전체</option>
            <option value="unconfirmed">미확정만</option>
            <option value="confirmed">확정만</option>
          </Select>
        </Field>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { delete _cache[`reg-${year}-${month}`]; setForceRefresh(f => f+1); }}
          loading={loading}
        >
          조회
        </Button>
      </div>

      {visibleEmployees.length > 0 && (
        <div className="rounded-[var(--r-lg)] border border-[var(--brand-500)]/30 bg-[var(--brand-500)]/10 p-4 mb-4 flex flex-wrap gap-3 items-end">
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              if (checkedEmps.size === visibleEmployees.length) setCheckedEmps(new Set());
              else setCheckedEmps(new Set(visibleEmployees.map((e: any) => e.id)));
            }}
          >
            {checkedEmps.size === visibleEmployees.length ? '전체 해제' : '전체 선택'}
          </Button>
          <Field label="기간">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={lastDay}
                value={rangeStart}
                onChange={e => setRangeStart(parseInt(e.target.value) || 1)}
                inputSize="sm"
                className="w-14 text-center tabular"
              />
              <span className="text-[var(--brand-400)]">~</span>
              <Input
                type="number"
                min={1}
                max={lastDay}
                value={rangeEnd}
                onChange={e => setRangeEnd(parseInt(e.target.value) || lastDay)}
                inputSize="sm"
                className="w-14 text-center tabular"
              />
              <span className="text-xs text-[var(--brand-600)]">일</span>
            </div>
          </Field>
          <Field label="기준">
            <Select
              value={batchSource}
              onChange={e => setBatchSource(e.target.value as any)}
              inputSize="sm"
            >
              <option value="planned">계획 출퇴근</option>
              <option value="actual">실제 출퇴근</option>
            </Select>
          </Field>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Check className="w-4 h-4" />}
            onClick={handleBatchConfirm}
            loading={confirming}
            disabled={checkedEmps.size === 0}
          >
            {checkedEmps.size}명 일괄 확정
          </Button>
          {checkedRows.size > 0 && (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Check className="w-4 h-4" />}
              onClick={handleConfirmRows}
              loading={confirming}
            >
              개별 {checkedRows.size}건 확정
            </Button>
          )}
        </div>
      )}

      {/* Employee Hours Stacked Bar Chart */}
      {!loading && visibleEmployees.length > 0 && (
        <div className="mb-4">
          <ChartCard title="직원별 근무시간 분석" subtitle="상위 15명 (기본/연장/주말)" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="name" tick={AXIS_STYLE} />
              <YAxis tick={AXIS_STYLE} unit="h" />
              <Tooltip
                formatter={(value: number | undefined, name: string | undefined) => [`${value ?? 0}h`, name ?? '']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="기본" stackId="a" fill={SEMANTIC_COLORS.regular} />
              <Bar dataKey="연장" stackId="a" fill={SEMANTIC_COLORS.overtime} />
              <Bar dataKey="주말" stackId="a" fill={SEMANTIC_COLORS.holiday} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      )}

      {loading ? (
        <CenterSpinner />
      ) : visibleEmployees.length > 0 ? (
        <div className="space-y-2">
          {visibleEmployees.map((emp: any) => {
            const summary = getEmpSummary(emp, viewMode);
            const expanded = expandedEmp === emp.id;
            const isFullyConfirmed = confirmedEmpSet.has(emp.name);
            return (
              <div key={emp.id} className={`rounded-[var(--r-lg)] border overflow-hidden ${isFullyConfirmed ? 'border-[var(--success-border)] bg-[var(--success-bg)]' : 'border-[var(--border-1)] bg-[var(--bg-1)]'}`}>
                <div className={`flex items-center px-4 py-3 hover:bg-[var(--bg-2)] ${checkedEmps.has(emp.id) ? 'bg-[var(--brand-500)]/10' : ''}`}>
                  <div className="mr-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedEmps.has(emp.id)}
                      onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(emp.id); else n.delete(emp.id); setCheckedEmps(n); }}
                      className="rounded border-[var(--border-2)]" />
                  </div>
                  <button className="flex-1 flex items-center justify-between" onClick={() => setExpandedEmp(expanded ? null : emp.id)}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-[var(--text-1)]">{emp.name}</span>
                      {isFullyConfirmed && <Badge tone="success" size="xs" dot>확정</Badge>}
                      <span className="text-xs text-[var(--text-3)]">{emp.department} {emp.team}</span>
                      {(() => { const ac = getAnomalyCount(emp); return ac > 0 ? <Badge tone="danger" size="xs">차이 발생 {ac}건</Badge> : null; })()}
                      {(() => {
                        const ym = `${year}-${String(month).padStart(2,'0')}`;
                        const vacDays = Object.entries(vacationMap).filter(([k]) => k.startsWith(`${emp.name}|${ym}`));
                        const annualFull = vacDays.filter(([,v]) => v.type === '연차').length;
                        const annualHalf = vacDays.filter(([,v]) => v.type === '오전반차' || v.type === '오후반차').length;
                        const publicFull = vacDays.filter(([,v]) => v.type === '공가').length;
                        const publicHalf = vacDays.filter(([,v]) => v.type === '오전공가' || v.type === '오후공가').length;
                        if (annualFull + annualHalf + publicFull + publicHalf === 0) return null;
                        return (<>
                          {annualFull > 0 && <Badge tone="violet" size="xs">연차 {annualFull}일</Badge>}
                          {annualHalf > 0 && <Badge tone="warning" size="xs">반차 {annualHalf}건</Badge>}
                          {publicFull > 0 && <Badge tone="brand" size="xs">공가 {publicFull}일</Badge>}
                          {publicHalf > 0 && <Badge tone="brand" size="xs">반차공가 {publicHalf}건</Badge>}
                        </>);
                      })()}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-[var(--text-3)] tabular">{summary.days}일</span>
                      <span className="text-[var(--brand-400)] font-medium tabular">기본 {summary.regular}h</span>
                      <span className="text-[var(--warning-fg)] font-medium tabular">연장 {summary.overtime}h</span>
                      <span className="text-[var(--danger-fg)] font-medium tabular">주말 {summary.weekend}h</span>
                      {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-4)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-4)]" />}
                    </div>
                  </button>
                  {isFullyConfirmed && (
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`${emp.name}의 확정을 취소하시겠습니까?`)) return;
                      try {
                        const ym = `${year}-${String(month).padStart(2,'0')}`;
                        const confirmed = await getConfirmedList(ym, '정규직');
                        const empData = (confirmed || []).find((c: any) => c.name === emp.name);
                        if (empData?.records) {
                          for (const rec of empData.records) { await deleteConfirmedRecord(rec.id); }
                        }
                        const cSet = new Set(confirmedSet);
                        const cEmpSet = new Set(confirmedEmpSet);
                        cEmpSet.delete(emp.name);
                        emp.actuals.forEach((a: any) => cSet.delete(`${emp.name}|${a.date}`));
                        setConfirmedSet(cSet);
                        setConfirmedEmpSet(cEmpSet);
                        delete _cache[`reg-${year}-${month}`];
                        bumpRegularDataVersion();
                        toast.success('확정 취소 완료');
                      } catch (err: any) { toast.error(err.message || "확정 취소 실패"); }
                    }} className="ml-1 px-1.5 py-0.5 text-[10px] font-medium text-[var(--danger-fg)] bg-[var(--danger-bg)] hover:bg-[var(--danger-border)] rounded" title="확정 취소">
                      <XCircle className="w-3.5 h-3.5 inline mr-0.5" />취소
                    </button>
                  )}
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`${emp.name}을(를) 완전히 삭제하시겠습니까?\n\n해당 월의 실제 출퇴근 기록 + 확정 데이터가 모두 삭제됩니다.\n(미확정 캘린더에서도 사라집니다)`)) return;
                    let confirmedDeleted = 0;
                    let attendanceDeletedFailed = false;
                    const errors: string[] = [];
                    try {
                      const ym = `${year}-${String(month).padStart(2,'0')}`;
                      const confirmed = await getConfirmedList(ym, '정규직');
                      const empData = (confirmed || []).find((c: any) => c.name === emp.name);
                      if (empData?.records) {
                        for (const rec of empData.records) {
                          try { await deleteConfirmedRecord(rec.id); confirmedDeleted++; } catch {}
                        }
                      }
                    } catch (err: any) {
                      errors.push(`확정 조회 실패: ${err.message || err}`);
                    }
                    try {
                      await deleteRegularAttendanceMonth(emp.id, year, month);
                    } catch (err: any) {
                      attendanceDeletedFailed = true;
                      errors.push(`실제기록 삭제 실패: ${err.message || err}`);
                    }
                    delete _cache[`reg-${year}-${month}`];
                    bumpRegularDataVersion();
                    setHiddenEmps(new Set([...hiddenEmps, emp.id]));
                    setForceRefresh(f => f + 1);

                    if (attendanceDeletedFailed) {
                      toast.error(`확정 ${confirmedDeleted}건 삭제. 실제기록 삭제 실패: ${errors.join(' / ')}`);
                    } else if (errors.length > 0) {
                      toast.error(`부분 성공 (${confirmedDeleted}건 확정 삭제). 에러: ${errors.join(' / ')}`);
                    }
                  }}
                    className="ml-1 p-1 text-[var(--text-4)] hover:text-[var(--danger-fg)] hover:bg-[var(--danger-bg)] rounded" title="완전 삭제 (실제+확정, 미확정 캘린더와 동기화)">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-[var(--border-1)] bg-[var(--bg-0)] overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-0)] text-left">
                          <th className="py-2 px-3 w-8"></th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">날짜</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">요일</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--brand-400)]">계획출근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--brand-400)]">계획퇴근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--success-fg)]">실제출근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--success-fg)]">실제퇴근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">식사</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">기준</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-1)]">
                        {(() => {
                          const ym = `${year}-${String(month).padStart(2,'0')}`;
                          const actualDates = new Set(emp.actuals.map((a: any) => a.date));
                          const vacOnlyDays = Object.keys(vacationMap)
                            .filter(k => k.startsWith(`${emp.name}|${ym}`))
                            .map(k => k.split('|')[1])
                            .filter(d => !actualDates.has(d))
                            .sort();
                          const allRows = [
                            ...emp.actuals.map((a: any) => ({ ...a, isVacOnly: false })),
                            ...vacOnlyDays.map(d => ({ date: d, clock_in_time: null, clock_out_time: null, isVacOnly: true })),
                          ].sort((a: any, b: any) => a.date.localeCompare(b.date));
                          return allRows;
                        })().map((actual: any) => {
                          const date = actual.date;
                          const planned = getPlannedForDay(emp.shifts, date);
                          const key = `${emp.id}|${date}`;
                          const dowNum = new Date(date + 'T00:00:00+09:00').getDay();
                          const dow = ['일','월','화','수','목','금','토'][dowNum];
                          const vacInfo = vacationMap[`${emp.name}|${date}`];

                          if (actual.isVacOnly && vacInfo) {
                            const isHalf = isHalfLeaveType(vacInfo.type);
                            const isPub = (vacInfo.type || '').includes('공가');
                            const rowBg = isPub ? 'bg-[var(--brand-500)]/10' : isHalf ? 'bg-[var(--warning-bg)]' : 'bg-violet-500/10';
                            const badgeTone = isPub ? 'brand' : isHalf ? 'warning' : 'violet';
                            const labelColor = isPub ? 'text-[var(--brand-400)]' : isHalf ? 'text-[var(--warning-fg)]' : 'text-violet-400';
                            return (
                              <tr key={date} className={rowBg}>
                                <td className="py-1.5 px-3"></td>
                                <td className="py-1.5 px-3 text-[var(--text-2)] tabular">
                                  {date.slice(5)}
                                  <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-medium`}>
                                    <Badge tone={badgeTone as any} size="xs">
                                      {vacInfo.type}
                                      {(vacInfo.type === '오전반차' || vacInfo.type === '오전공가') && ' 09~14시'}
                                      {(vacInfo.type === '오후반차' || vacInfo.type === '오후공가') && ' 14~18시'}
                                    </Badge>
                                  </span>
                                </td>
                                <td className={`py-1.5 px-3 ${dowNum === 0 ? 'text-[var(--danger-fg)] font-bold' : dowNum === 6 ? 'text-[var(--info-fg)] font-bold' : 'text-[var(--text-3)]'}`}>{dow}</td>
                                <td className="py-1.5 px-3 text-[var(--text-4)]" colSpan={6}>
                                  <span className={`font-medium text-[10px] ${labelColor}`}>
                                    유급{isPub ? (isHalf ? '반차공가' : '공가') : (isHalf ? '반차' : '휴가')} ({isHalf ? '4h' : '8h'} 인정)
                                  </span>
                                </td>
                              </tr>
                            );
                          }

                          const actualIn = formatTime(actual.clock_in_time);
                          const actualOut = formatTime(actual.clock_out_time);
                          const plannedIn = planned?.in || '-';
                          const plannedOut = planned?.out || '-';
                          const diffIn = timeDiffHours(plannedIn, actualIn);
                          const diffOut = timeDiffHours(plannedOut, actualOut);
                          const isAnomaly = (diffIn >= 3 || diffOut >= 3) && plannedIn !== '-';
                          const source = selectedSource[key] || 'planned';
                          const isDayConfirmed = confirmedSet.has(`${emp.name}|${date}`);
                          const useClockIn = source === 'actual' ? actualIn : (plannedIn !== '-' ? plannedIn : actualIn);
                          const useClockOut = source === 'actual' ? actualOut : (plannedOut !== '-' ? plannedOut : actualOut);
                          const mealApplicable = isMealBreakApplicable(useClockIn, useClockOut);
                          const mealChecked = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
                          const rowVacIsHalf = isHalfLeaveType(vacInfo?.type);
                          const rowVacIsPub = (vacInfo?.type || '').includes('공가');
                          const rowBgCls = rowVacIsPub
                            ? 'bg-[var(--brand-500)]/10'
                            : rowVacIsHalf
                            ? 'bg-[var(--warning-bg)]'
                            : vacInfo
                            ? 'bg-violet-500/10'
                            : isDayConfirmed
                            ? 'bg-[var(--success-bg)]'
                            : isAnomaly
                            ? 'bg-[var(--danger-bg)]'
                            : 'bg-[var(--bg-1)]';
                          return (
                            <tr key={date} className={rowBgCls}>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <CheckCircle2 className="w-4 h-4 text-[var(--success-fg)]" />
                                ) : (
                                  <input type="checkbox" checked={checkedRows.has(key)}
                                    onChange={e => { const n = new Set(checkedRows); if (e.target.checked) n.add(key); else n.delete(key); setCheckedRows(n); }}
                                    className="rounded border-[var(--border-2)]" />
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-[var(--text-2)] tabular">
                                {date.slice(5)}
                                {isDayConfirmed && <span className="ml-1 text-[9px] text-[var(--success-fg)]">확정</span>}
                                {vacInfo && <Badge tone={rowVacIsPub ? 'brand' : rowVacIsHalf ? 'warning' : 'violet'} size="xs" className="ml-1">{vacInfo.type}</Badge>}
                              </td>
                              <td className={`py-1.5 px-3 ${dowNum === 0 ? 'text-[var(--danger-fg)] font-bold' : dowNum === 6 ? 'text-[var(--info-fg)] font-bold' : 'text-[var(--text-3)]'}`}>{dow}</td>
                              <td className="py-1.5 px-3 text-[var(--brand-400)] tabular">{plannedIn}</td>
                              <td className="py-1.5 px-3 text-[var(--brand-400)] tabular">{plannedOut}</td>
                              <td className={`py-1.5 px-3 tabular ${isAnomaly ? 'text-[var(--danger-fg)] font-bold' : 'text-[var(--success-fg)]'}`}>{actualIn}</td>
                              <td className={`py-1.5 px-3 tabular ${isAnomaly ? 'text-[var(--danger-fg)] font-bold' : 'text-[var(--success-fg)]'}`}>{actualOut}</td>
                              <td className="py-1.5 px-3">
                                {mealApplicable ? (
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={mealChecked}
                                      onChange={e => setDinnerBreak({...dinnerBreak, [key]: e.target.checked})}
                                      className="rounded border-[var(--border-2)]" disabled={isDayConfirmed} />
                                    <span className={`text-[10px] ${mealChecked ? 'text-[var(--warning-fg)] font-medium' : 'text-[var(--text-3)]'}`}>
                                      {mealChecked ? '30분 휴게' : '미식사'}
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-[10px] text-[var(--text-4)]">미해당</span>
                                )}
                              </td>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-[var(--success-fg)] font-medium">확정됨</span>
                                    <button onClick={async (e) => {
                                      e.stopPropagation();
                                      const cKey = `${emp.name}|${date}`;
                                      const recId = confirmedIdMap[cKey];
                                      if (!recId) { toast.error('확정 레코드를 찾을 수 없습니다.'); return; }
                                      if (!confirm(`${date} 확정을 취소하시겠습니까?`)) return;
                                      try {
                                        await deleteConfirmedRecord(recId);
                                        const newSet = new Set(confirmedSet); newSet.delete(cKey); setConfirmedSet(newSet);
                                        const newIdMap = {...confirmedIdMap}; delete newIdMap[cKey]; setConfirmedIdMap(newIdMap);
                                        const stillFull = emp.actuals.every((a: any) => a.date === date ? false : newSet.has(`${emp.name}|${a.date}`));
                                        if (!stillFull) { const newEmpSet = new Set(confirmedEmpSet); newEmpSet.delete(emp.name); setConfirmedEmpSet(newEmpSet); }
                                      } catch (err: any) { toast.error(err.message || "취소 처리 실패"); }
                                    }} className="px-1 py-0.5 text-[9px] text-[var(--danger-fg)] bg-[var(--danger-bg)] hover:bg-[var(--danger-border)] rounded font-medium">
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <select value={source} onChange={e => setSelectedSource({...selectedSource, [key]: e.target.value as any})}
                                    className="px-1 py-0.5 border border-[var(--border-2)] rounded text-[10px] bg-[var(--bg-1)]">
                                    <option value="planned">계획</option>
                                    <option value="actual">실제</option>
                                  </select>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList className="w-8 h-8" />}
          title="해당 월에 출근 기록이 없습니다."
          description="다른 월을 선택하거나 조회를 눌러주세요."
        />
      )}
    </div>
  );
}
