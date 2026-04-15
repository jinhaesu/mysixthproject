"use client";

import { useState, useCallback, useEffect } from "react";
import ChartCard from "@/components/charts/ChartCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { SEMANTIC_COLORS } from "@/lib/chartColors";
import { usePersistedState } from "@/lib/usePersistedState";
import { ClipboardList, Loader2, ChevronDown, ChevronUp, Check, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { getAttendanceSummaryRegular, confirmAttendance, getConfirmedList, deleteConfirmedRecord, getRegularVacations, deleteRegularAttendanceMonth } from "@/lib/api";
import { bumpRegularDataVersion } from "@/lib/dataSignal";

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

// Module-level cache (survives component unmount)
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
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set()); // "name|date"
  const [confirmedEmpSet, setConfirmedEmpSet] = useState<Set<string>>(new Set()); // employee names fully confirmed
  const [confirmedIdMap, setConfirmedIdMap] = useState<Record<string, number>>({});
  const [nameSearch, setNameSearch] = usePersistedState("asr_nameSearch", "");
  const [deptFilter, setDeptFilter] = usePersistedState("asr_deptFilter", "");
  const [dinnerBreak, setDinnerBreak] = useState<Record<string, boolean>>({});
  const [confirmFilter, setConfirmFilter] = usePersistedState<'all'|'unconfirmed'|'confirmed'>("asr_confirmFilter", 'all');
  const [vacationMap, setVacationMap] = useState<Record<string, { type: string; status: string }>>({});

  // Load approved vacations for the month
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
      // Still load confirmed data even from cache
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
        // 계획 출퇴근만 있고 실제 출퇴근이 없는 직원도 표시되도록
        // shifts에서 해당 월 날짜를 가상 actual로 생성 → 확정 가능하게
        const ym = `${year}-${String(month).padStart(2,'0')}`;
        const lastDay = new Date(year, month, 0).getDate();
        for (const emp of d.employees) {
          if (emp.actuals.length === 0 && emp.shifts && emp.shifts.length > 0) {
            // 이 직원은 실제 출퇴근 기록은 없지만 계획 배치가 있음
            // → 과거 날짜에 대해 가상 actual 생성 (계획 확정용)
            const existingDates = new Set(emp.actuals.map((a: any) => a.date));
            const today = new Date().toLocaleDateString('sv-SE');
            for (let day = 1; day <= lastDay; day++) {
              const dateStr = `${ym}-${String(day).padStart(2,'0')}`;
              if (dateStr > today) continue; // 미래 날짜 스킵
              if (existingDates.has(dateStr)) continue;
              const planned = getPlannedForDay(emp.shifts, dateStr);
              if (planned && planned.in && planned.in !== '-') {
                emp.actuals.push({
                  employee_id: emp.id,
                  date: dateStr,
                  clock_in_time: null,
                  clock_out_time: null,
                  isPlannedOnly: true, // 마커: 실제 출퇴근 없는 가상 행
                });
              }
            }
          }
        }
        // 실제 출퇴근 OR 계획 배치가 있는 직원만 표시
        d.employees = d.employees.filter((e: any) =>
          (e.actuals && e.actuals.length > 0) || (e.shifts && e.shifts.length > 0)
        );
      }
      setData(d);
      _cache[key] = { data: d, time: Date.now() };
      setHiddenEmps(new Set());

      // Load confirmed data
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
        // Mark fully confirmed employees
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
    } catch (e: any) { alert(e.message); }
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

    // 1차: month + week_number + 요일 정확 매칭
    for (const s of shifts) {
      if (s.week_number && s.week_number !== weekNum) continue;
      const daysStr = s.days_of_week && s.days_of_week !== '' ? s.days_of_week : (s.day_of_week != null ? String(s.day_of_week) : '');
      if (!daysStr) continue;
      const days = daysStr.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
    }
    // 2차: 요일만 매칭 (week_number 없는 시프트)
    for (const s of shifts) {
      if (s.week_number) continue; // week_number 있는 건 1차에서 처리
      const daysStr = s.days_of_week && s.days_of_week !== '' ? s.days_of_week : (s.day_of_week != null ? String(s.day_of_week) : '');
      if (!daysStr) continue;
      const days = daysStr.split(',').map(Number).filter((n: number) => !isNaN(n));
      if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
    }
    // 3차: fallback
    if (shifts && shifts.length > 0) return { in: shifts[0].planned_clock_in, out: shifts[0].planned_clock_out };
    return null;
  };

  const timeDiffHours = (t1: string, t2: string) => {
    if (!t1 || !t2 || t1 === '-' || t2 === '-') return 0;
    const [h1, m1] = t1.split(':').map(Number);
    const [h2, m2] = t2.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return 0;
    return Math.abs((h1 * 60 + (m1||0)) - (h2 * 60 + (m2||0))) / 60;
  };

  // 연장 2시간 이상일 때만 식사 휴게 30분 해당
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

  // 출근: 30분 올림 (8:03→8:30), 퇴근: 30분 내림 (17:25→17:00)
  const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
  const floor30Min = (min: number) => Math.floor(min / 30) * 30;

  // isHalfDay: 반차일 경우 기본 8h 고정(실근무 4h + 반차 4h), 연장 없음
  const calcHoursFromTimes = (clockIn: string, clockOut: string, breakH = 1, isHalfDay = false) => {
    if (isHalfDay) {
      // 반차: 출/퇴근 시각과 무관하게 기본 8h, 연장 0. 야간 시간만 clock 기반으로 계산.
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
    // 야간시간 계산 (22:00~06:00) - 야간시간은 기본/연장에서 분리
    let nightMin = 0;
    for (let min = startMin; min < endMin; min++) {
      const h = Math.floor((min % 1440) / 60);
      if (h >= 22 || h < 6) nightMin++;
    }
    const night = Math.round(nightMin / 60 * 10) / 10;
    const dayWork = Math.max(total - night, 0); // 주간 근무시간
    const regular = Math.min(dayWork, 8);
    const overtime = Math.max(dayWork - 8, 0);
    return { regular, overtime, night };
  };

  const getBreakHours = (empId: number, date: string, clockIn: string, clockOut: string, empName?: string) => {
    // 반차일 경우 휴게시간 0 (4시간 근무이므로)
    if (empName) {
      const vacInfo = vacationMap[`${empName}|${date}`];
      if (vacInfo?.type?.includes('반차')) return 0;
    }
    const key = `${empId}|${date}`;
    if (!isMealBreakApplicable(clockIn, clockOut)) return 1;
    const hasMeal = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
    return hasMeal ? 1.5 : 1;
  };

  const getEmpSummary = (emp: any, mode: 'actual' | 'planned') => {
    let regular = 0, overtime = 0, weekend = 0, days = 0;
    // Count vacation hours for this employee in this month
    const ym = `${year}-${String(month).padStart(2,'0')}`;
    let vacRegular = 0;
    Object.entries(vacationMap).forEach(([k, vInfo]) => {
      if (!k.startsWith(`${emp.name}|${ym}`)) return;
      const vDate = k.split('|')[1];
      if (isHolidayOrWeekend(vDate)) return;
      const hasActual = emp.actuals?.some((a: any) => a.date === vDate && !a.isVacOnly && (a.clock_in_time || a.clock_out_time));
      if (vInfo.type === '연차' && !hasActual) {
        vacRegular += 8;
        days++;
      } else if (vInfo.type?.includes('반차') && !hasActual) {
        vacRegular += 4;
        days++;
      }
      // 반차 + 실근무: calcHoursFromTimes가 이미 regular 8h(실 4h + 반차 4h) 반환하므로
      // 여기서 추가로 더하지 않음 (이전 버그: 중복 집계)
    });
    for (const actual of emp.actuals) {
      if (actual.isVacOnly) continue; // skip vacation-only rows
      const date = actual.date;
      const planned = getPlannedForDay(emp.shifts, date);
      const clockIn = mode === 'planned' && planned ? planned.in : formatTime(actual.clock_in_time);
      const clockOut = mode === 'planned' && planned ? planned.out : formatTime(actual.clock_out_time);
      if (clockIn === '-' && clockOut === '-') continue;
      days++;
      const isHalfVac = !!vacationMap[`${emp.name}|${date}`]?.type?.includes('반차');
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
    if (checkedRows.size === 0) return alert("확정할 항목을 선택해주세요.");
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
        const isHalfVac = !!vacationMap[`${emp.name}|${date}`]?.type?.includes('반차');
        const breakH = getBreakHours(parseInt(empId), date, clockIn, clockOut, emp.name);
        const h = calcHoursFromTimes(clockIn, clockOut, breakH, isHalfVac);
        records.push({ employee_type: '정규직', employee_name: emp.name, employee_phone: emp.phone, department: emp.department || '', date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source, regular_hours: h.regular, overtime_hours: h.overtime, night_hours: h.night, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
      }
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedRows(new Set());
      // 확정 후 캐시 무효화 + 크로스 페이지 signal + 재조회
      delete _cache[`reg-${year}-${month}`];
      bumpRegularDataVersion();
      setForceRefresh(f => f + 1);
    } catch (e: any) { alert(e.message); }
    finally { setConfirming(false); }
  };

  const handleBatchConfirm = async () => {
    if (checkedEmps.size === 0) return alert("직원을 선택해주세요.");
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
          const isHalfVac = !!vacationMap[`${emp.name}|${actual.date}`]?.type?.includes('반차');
          const breakH = getBreakHours(emp.id, actual.date, clockIn, clockOut, emp.name);
          const h = calcHoursFromTimes(clockIn, clockOut, breakH, isHalfVac);
          records.push({ employee_type: '정규직', employee_name: emp.name, employee_phone: emp.phone, department: emp.department || '', date: actual.date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source: batchSource, regular_hours: h.regular, overtime_hours: h.overtime, night_hours: h.night, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
        }
      }
      if (records.length === 0) return alert("해당 기간에 출근 데이터가 없습니다.");
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedEmps(new Set());
      delete _cache[`reg-${year}-${month}`];
      bumpRegularDataVersion();
      setForceRefresh(f => f + 1);
    } catch (e: any) { alert(e.message); }
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
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-[#7070FF]" />
          정규직 근태 정보 종합 요약
        </h1>
        <p className="text-sm text-[#8A8F98] mt-1">실제 출퇴근 기록이 있는 직원만 표시됩니다.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">연도</label>
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">월</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]">
            {Array.from({length:12}, (_,i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">시간 보기</label>
          <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]">
            <option value="actual">실제 기준</option>
            <option value="planned">계획 기준</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">부서</label>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]">
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
            <option value="생산 야간">생산 야간</option>
            <option value="물류 야간">물류 야간</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">이름 검색</label>
          <input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)} placeholder="이름"
            className="px-3 py-2 border border-[#23252A] rounded-lg text-sm w-28" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">확정 상태</label>
          <select value={confirmFilter} onChange={e => setConfirmFilter(e.target.value as any)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]">
            <option value="all">전체</option>
            <option value="unconfirmed">미확정만</option>
            <option value="confirmed">확정만</option>
          </select>
        </div>
        <button onClick={() => { delete _cache[`reg-${year}-${month}`]; setForceRefresh(f => f+1); }} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">조회</button>
      </div>

      {visibleEmployees.length > 0 && (
        <div className="bg-[#5E6AD2]/10 border border-[#5E6AD2]/30 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
          <button onClick={() => {
            if (checkedEmps.size === visibleEmployees.length) setCheckedEmps(new Set());
            else setCheckedEmps(new Set(visibleEmployees.map((e: any) => e.id)));
          }} className="px-3 py-1.5 bg-[#0F1011] border border-indigo-300 rounded-lg text-xs font-medium text-[#828FFF] hover:bg-[#5E6AD2]/15">
            {checkedEmps.size === visibleEmployees.length ? '전체 해제' : '전체 선택'}
          </button>
          <div>
            <label className="block text-xs font-medium text-[#828FFF] mb-1">기간</label>
            <div className="flex items-center gap-1">
              <input type="number" min={1} max={lastDay} value={rangeStart} onChange={e => setRangeStart(parseInt(e.target.value) || 1)} className="px-2 py-1.5 border border-indigo-300 rounded text-sm w-14 text-center" />
              <span className="text-[#7070FF]">~</span>
              <input type="number" min={1} max={lastDay} value={rangeEnd} onChange={e => setRangeEnd(parseInt(e.target.value) || lastDay)} className="px-2 py-1.5 border border-indigo-300 rounded text-sm w-14 text-center" />
              <span className="text-xs text-indigo-500">일</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#828FFF] mb-1">기준</label>
            <select value={batchSource} onChange={e => setBatchSource(e.target.value as any)} className="px-3 py-1.5 border border-indigo-300 rounded-lg text-sm bg-[#0F1011]">
              <option value="planned">계획 출퇴근</option>
              <option value="actual">실제 출퇴근</option>
            </select>
          </div>
          <button onClick={handleBatchConfirm} disabled={confirming || checkedEmps.size === 0}
            className="px-4 py-1.5 bg-[#27A644] text-white rounded-lg text-sm font-medium disabled:bg-[#28282C] flex items-center gap-1">
            <Check className="w-4 h-4" /> {checkedEmps.size}명 일괄 확정
          </button>
          {checkedRows.size > 0 && (
            <button onClick={handleConfirmRows} disabled={confirming}
              className="px-4 py-1.5 bg-[#5E6AD2] text-white rounded-lg text-sm font-medium disabled:bg-[#28282C] flex items-center gap-1">
              <Check className="w-4 h-4" /> 개별 {checkedRows.size}건 확정
            </button>
          )}
        </div>
      )}

      {/* Employee Hours Stacked Bar Chart */}
      {!loading && visibleEmployees.length > 0 && (
        <div className="mb-4">
          <ChartCard title="직원별 근무시간 분석" subtitle="상위 15명 (기본/연장/주말)" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="h" />
              <Tooltip formatter={(value: number | undefined, name: string | undefined) => [`${value ?? 0}h`, name ?? '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="기본" stackId="a" fill={SEMANTIC_COLORS.regular} />
              <Bar dataKey="연장" stackId="a" fill={SEMANTIC_COLORS.overtime} />
              <Bar dataKey="주말" stackId="a" fill={SEMANTIC_COLORS.holiday} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-[#7070FF] mx-auto" /></div>
      ) : visibleEmployees.length > 0 ? (
        <div className="space-y-2">
          {visibleEmployees.map((emp: any) => {
            const summary = getEmpSummary(emp, viewMode);
            const expanded = expandedEmp === emp.id;
            const isFullyConfirmed = confirmedEmpSet.has(emp.name);
            return (
              <div key={emp.id} className={`rounded-xl border overflow-hidden ${isFullyConfirmed ? 'border-green-300 bg-[#27A644]/10/30' : 'border-[#23252A] bg-[#0F1011]'}`}>
                <div className={`flex items-center px-4 py-3 hover:bg-[#141516]/5 ${checkedEmps.has(emp.id) ? 'bg-[#5E6AD2]/10/50' : ''}`}>
                  <div className="mr-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedEmps.has(emp.id)}
                      onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(emp.id); else n.delete(emp.id); setCheckedEmps(n); }}
                      className="rounded border-[#23252A]" />
                  </div>
                  <button className="flex-1 flex items-center justify-between" onClick={() => setExpandedEmp(expanded ? null : emp.id)}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-[#F7F8F8]">{emp.name}</span>
                      {isFullyConfirmed && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#27A644]/15 text-[#27A644]"><CheckCircle2 className="w-3 h-3" />확정</span>}
                      <span className="text-xs text-[#8A8F98]">{emp.department} {emp.team}</span>
                      {(() => { const ac = getAnomalyCount(emp); return ac > 0 ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EB5757]/15 text-[#EB5757]">차이 발생 {ac}건</span> : null; })()}
                      {(() => {
                        const ym = `${year}-${String(month).padStart(2,'0')}`;
                        const vacDays = Object.entries(vacationMap).filter(([k]) => k.startsWith(`${emp.name}|${ym}`));
                        const fullDays = vacDays.filter(([,v]) => v.type === '연차').length;
                        const halfDays = vacDays.filter(([,v]) => v.type?.includes('반차')).length;
                        if (fullDays + halfDays === 0) return null;
                        return (<>
                          {fullDays > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700">연차 {fullDays}일</span>}
                          {halfDays > 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F0BF00]/15 text-[#F0BF00]">반차 {halfDays}건</span>}
                        </>);
                      })()}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-[#8A8F98]">{summary.days}일</span>
                      <span className="text-[#828FFF] font-medium">기본 {summary.regular}h</span>
                      <span className="text-[#F0BF00] font-medium">연장 {summary.overtime}h</span>
                      <span className="text-[#EB5757] font-medium">주말 {summary.weekend}h</span>
                      {expanded ? <ChevronUp className="w-4 h-4 text-[#62666D]" /> : <ChevronDown className="w-4 h-4 text-[#62666D]" />}
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
                        // 캐시 무효화 + signal — 미확정 캘린더에도 바로 반영되도록
                        delete _cache[`reg-${year}-${month}`];
                        bumpRegularDataVersion();
                        alert('확정 취소 완료');
                      } catch (err: any) { alert(err.message); }
                    }} className="ml-1 px-1.5 py-0.5 text-[10px] font-medium text-[#EB5757] bg-[#EB5757]/10 hover:bg-[#EB5757]/15 rounded" title="확정 취소">
                      <XCircle className="w-3.5 h-3.5 inline mr-0.5" />취소
                    </button>
                  )}
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`${emp.name}을(를) 완전히 삭제하시겠습니까?\n\n해당 월의 실제 출퇴근 기록 + 확정 데이터가 모두 삭제됩니다.\n(미확정 캘린더에서도 사라집니다)`)) return;
                    let confirmedDeleted = 0;
                    let attendanceDeletedFailed = false;
                    const errors: string[] = [];
                    // 1) confirmed_attendance 삭제 (기존에 잘 작동하는 endpoint)
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
                    // 2) regular_attendance 삭제 (신규 endpoint — Railway 배포 지연 가능)
                    try {
                      await deleteRegularAttendanceMonth(emp.id, year, month);
                    } catch (err: any) {
                      attendanceDeletedFailed = true;
                      errors.push(`실제기록 삭제 실패: ${err.message || err}`);
                    }
                    // 3) 로컬 캐시 무효화 + signal
                    delete _cache[`reg-${year}-${month}`];
                    bumpRegularDataVersion();
                    setHiddenEmps(new Set([...hiddenEmps, emp.id]));
                    setForceRefresh(f => f + 1);

                    if (attendanceDeletedFailed) {
                      alert(`확정 ${confirmedDeleted}건 삭제 완료.\n\n실제 출퇴근 기록(regular_attendance) 삭제는 실패했습니다 (백엔드 배포 대기 중일 수 있음).\n잠시 후 다시 시도하세요.\n\n에러: ${errors.join(' / ')}`);
                    } else if (errors.length > 0) {
                      alert(`부분 성공 (${confirmedDeleted}건 확정 삭제). 에러: ${errors.join(' / ')}`);
                    }
                  }}
                    className="ml-1 p-1 text-[#62666D] hover:text-[#EB5757] hover:bg-[#EB5757]/10 rounded" title="완전 삭제 (실제+확정, 미확정 캘린더와 동기화)">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-[#5E6AD2]/30 bg-[#5E6AD2]/10/20 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#08090A] text-left">
                          <th className="py-2 px-3 w-8"></th>
                          <th className="py-2 px-3">날짜</th>
                          <th className="py-2 px-3">요일</th>
                          <th className="py-2 px-3 text-[#7070FF]">계획출근</th>
                          <th className="py-2 px-3 text-[#7070FF]">계획퇴근</th>
                          <th className="py-2 px-3 text-[#27A644]">실제출근</th>
                          <th className="py-2 px-3 text-[#27A644]">실제퇴근</th>
                          <th className="py-2 px-3">식사</th>
                          <th className="py-2 px-3">기준</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#23252A]">
                        {/* Merge actuals + vacation-only days */}
                        {(() => {
                          const ym = `${year}-${String(month).padStart(2,'0')}`;
                          const actualDates = new Set(emp.actuals.map((a: any) => a.date));
                          // Find vacation days with no actual record
                          const vacOnlyDays = Object.keys(vacationMap)
                            .filter(k => k.startsWith(`${emp.name}|${ym}`))
                            .map(k => k.split('|')[1])
                            .filter(d => !actualDates.has(d))
                            .sort();
                          // Combine: actuals + vacation-only
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

                          // Vacation-only row (no attendance record)
                          if (actual.isVacOnly && vacInfo) {
                            const isHalf = vacInfo.type?.includes('반차');
                            return (
                              <tr key={date} className={isHalf ? 'bg-[#F0BF00]/10' : 'bg-violet-50'}>
                                <td className="py-1.5 px-3"></td>
                                <td className="py-1.5 px-3 text-[#D0D6E0]">
                                  {date.slice(5)}
                                  <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-medium ${isHalf ? 'bg-[#F0BF00]/15 text-[#F0BF00]' : 'bg-violet-100 text-violet-700'}`}>
                                    {vacInfo.type}
                                    {vacInfo.type === '오전반차' && ' 09~14시'}
                                    {vacInfo.type === '오후반차' && ' 14~18시'}
                                  </span>
                                </td>
                                <td className={`py-1.5 px-3 ${dowNum === 0 ? 'text-[#EB5757] font-bold' : dowNum === 6 ? 'text-blue-500 font-bold' : 'text-[#8A8F98]'}`}>{dow}</td>
                                <td className="py-1.5 px-3 text-[#62666D]" colSpan={6}>
                                  <span className={`font-medium text-[10px] ${isHalf ? 'text-[#F0BF00]' : 'text-violet-600'}`}>
                                    유급{isHalf ? '반차' : '휴가'} ({isHalf ? '4h' : '8h'} 인정)
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
                          return (
                            <tr key={date} className={vacInfo?.type?.includes('반차') ? 'bg-[#F0BF00]/10/50' : vacInfo ? 'bg-violet-50' : isDayConfirmed ? 'bg-[#27A644]/10' : isAnomaly ? 'bg-[#EB5757]/10' : 'bg-[#0F1011]'}>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <input type="checkbox" checked={checkedRows.has(key)}
                                    onChange={e => { const n = new Set(checkedRows); if (e.target.checked) n.add(key); else n.delete(key); setCheckedRows(n); }}
                                    className="rounded border-[#23252A]" />
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-[#D0D6E0]">
                                {date.slice(5)}
                                {isDayConfirmed && <span className="ml-1 text-[9px] text-[#27A644]">확정</span>}
                                {vacInfo && <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-medium ${vacInfo.type === '반차' || vacInfo.type?.includes('반차') ? 'bg-[#F0BF00]/15 text-[#F0BF00]' : 'bg-violet-100 text-violet-700'}`}>{vacInfo.type}</span>}
                              </td>
                              <td className={`py-1.5 px-3 ${dowNum === 0 ? 'text-[#EB5757] font-bold' : dowNum === 6 ? 'text-blue-500 font-bold' : 'text-[#8A8F98]'}`}>{dow}</td>
                              <td className="py-1.5 px-3 text-[#828FFF]">{plannedIn}</td>
                              <td className="py-1.5 px-3 text-[#828FFF]">{plannedOut}</td>
                              <td className={`py-1.5 px-3 ${isAnomaly ? 'text-[#EB5757] font-bold' : 'text-[#27A644]'}`}>{actualIn}</td>
                              <td className={`py-1.5 px-3 ${isAnomaly ? 'text-[#EB5757] font-bold' : 'text-[#27A644]'}`}>{actualOut}</td>
                              <td className="py-1.5 px-3">
                                {mealApplicable ? (
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={mealChecked}
                                      onChange={e => setDinnerBreak({...dinnerBreak, [key]: e.target.checked})}
                                      className="rounded border-[#23252A]" disabled={isDayConfirmed} />
                                    <span className={`text-[10px] ${mealChecked ? 'text-[#FC7840] font-medium' : 'text-[#8A8F98]'}`}>
                                      {mealChecked ? '30분 휴게' : '미식사'}
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-[10px] text-[#62666D]">미해당</span>
                                )}
                              </td>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-[#27A644] font-medium">확정됨</span>
                                    <button onClick={async (e) => {
                                      e.stopPropagation();
                                      const cKey = `${emp.name}|${date}`;
                                      const recId = confirmedIdMap[cKey];
                                      if (!recId) { alert('확정 레코드를 찾을 수 없습니다.'); return; }
                                      if (!confirm(`${date} 확정을 취소하시겠습니까?`)) return;
                                      try {
                                        await deleteConfirmedRecord(recId);
                                        const newSet = new Set(confirmedSet); newSet.delete(cKey); setConfirmedSet(newSet);
                                        const newIdMap = {...confirmedIdMap}; delete newIdMap[cKey]; setConfirmedIdMap(newIdMap);
                                        const stillFull = emp.actuals.every((a: any) => a.date === date ? false : newSet.has(`${emp.name}|${a.date}`));
                                        if (!stillFull) { const newEmpSet = new Set(confirmedEmpSet); newEmpSet.delete(emp.name); setConfirmedEmpSet(newEmpSet); }
                                      } catch (err: any) { alert(err.message); }
                                    }} className="px-1 py-0.5 text-[9px] text-[#EB5757] bg-[#EB5757]/10 hover:bg-[#EB5757]/15 rounded font-medium">
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <select value={source} onChange={e => setSelectedSource({...selectedSource, [key]: e.target.value as any})}
                                    className="px-1 py-0.5 border border-[#23252A] rounded text-[10px] bg-[#0F1011]">
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
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] py-16 text-center text-sm text-[#62666D]">해당 월에 출근 기록이 있는 직원이 없습니다.</div>
      )}
    </div>
  );
}
