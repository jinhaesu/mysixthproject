"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { PageHeader, Badge, Button, Card, EmptyState, Input, Select, Field, SkeletonCard, useToast } from "@/components/ui";
import { ClipboardList, ChevronDown, ChevronUp, Check, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { getAttendanceSummaryDispatch, confirmAttendance, getConfirmedList, deleteConfirmedRecord } from "@/lib/api";

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

const _cache: Record<string, { data: any; time: number }> = {};
const CACHE_TTL = 3 * 60 * 60 * 1000;

export default function AttendanceSummaryDispatchPage() {
  const toast = useToast();
  const [year, setYear] = usePersistedState("asd_year", new Date().getFullYear());
  const [month, setMonth] = usePersistedState("asd_month", new Date().getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = usePersistedState<'all' | '파견' | '알바'>("asd_typeFilter", 'all');
  const [selectedSource, setSelectedSource] = useState<Record<string, 'planned' | 'actual'>>({});
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [checkedEmps, setCheckedEmps] = useState<Set<number>>(new Set());
  const [batchSource, setBatchSource] = useState<'planned' | 'actual'>('planned');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(31);
  const [viewMode, setViewMode] = usePersistedState<'actual' | 'planned'>("asd_viewMode", 'actual');
  const [hiddenEmps, setHiddenEmps] = useState<Set<number>>(new Set());
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const [confirmedEmpSet, setConfirmedEmpSet] = useState<Set<string>>(new Set());
  const [confirmedIdMap, setConfirmedIdMap] = useState<Record<string, number>>({});
  const [nameSearch, setNameSearch] = usePersistedState("asd_nameSearch", "");
  const [deptFilter, setDeptFilter] = usePersistedState("asd_deptFilter", "");
  const [dinnerBreak, setDinnerBreak] = useState<Record<string, boolean>>({});
  const [confirmFilter, setConfirmFilter] = usePersistedState<'all'|'unconfirmed'|'confirmed'>("asd_confirmFilter", 'all');

  const [forceRefresh, setForceRefresh] = useState(0);

  const load = useCallback(async () => {
    const key = `disp-${year}-${month}`;
    const cached = _cache[key];
    if (forceRefresh === 0 && cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      // Still load confirmed data even from cache
      const ym = `${year}-${String(month).padStart(2,'0')}`;
      try {
        const confirmed = await getConfirmedList(ym, '');
        const cSet = new Set<string>();
        const cIdMap: Record<string, number> = {};
        const cEmpDates = new Map<string, number>();
        for (const emp of (confirmed || [])) {
          if (emp.type === '정규직') continue;
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
      const d = await getAttendanceSummaryDispatch(year, month);
      if (d?.employees) {
        d.employees = d.employees.filter((e: any) => e.actuals && e.actuals.length > 0);
      }
      setData(d);
      _cache[key] = { data: d, time: Date.now() };
      setHiddenEmps(new Set());
      // Load confirmed
      const ym = `${year}-${String(month).padStart(2,'0')}`;
      try {
        const confirmed = await getConfirmedList(ym, '');
        const cSet = new Set<string>();
        const cIdMap: Record<string, number> = {};
        const cEmpDates = new Map<string, number>();
        for (const emp of (confirmed || [])) {
          if (emp.type === '정규직') continue;
          for (const rec of (emp.records || [])) { const k = `${emp.name}|${rec.date}`; cSet.add(k); cIdMap[k] = rec.id; }
          cEmpDates.set(emp.name, (cEmpDates.get(emp.name) || 0) + (emp.records?.length || 0));
        }
        setConfirmedSet(cSet);
        setConfirmedIdMap(cIdMap);
        const cEmpSet = new Set<string>();
        if (d?.employees) {
          for (const emp of d.employees) {
            const total = emp.actuals?.length || 0;
            const done = cEmpDates.get(emp.name) || 0;
            if (total > 0 && done >= total) cEmpSet.add(emp.name);
          }
        }
        setConfirmedEmpSet(cEmpSet);
      } catch {}
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [year, month, forceRefresh]);

  useEffect(() => { load(); }, [load]);

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try {
      const d = new Date(t);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return t; }
  };

  const getPlannedForDay = (shifts: any[], date: string, actuals?: any[]) => {
    // First check if actual record has per-day planned times
    if (actuals) {
      const actual = actuals.find((a: any) => a.date === date);
      if (actual?.planned_clock_in) {
        return { in: actual.planned_clock_in, out: actual.planned_clock_out || '' };
      }
    }
    // Fallback to shifts array
    if (shifts && shifts.length > 0) {
      return { in: shifts[0].planned_clock_in, out: shifts[0].planned_clock_out };
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

  const calcHoursFromTimes = (clockIn: string, clockOut: string, breakH = 1) => {
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
    return { regular: Math.min(dayWork, 8), overtime: Math.max(dayWork - 8, 0), night };
  };

  const getBreakHours = (empId: number, date: string, clockIn: string, clockOut: string) => {
    const key = `${empId}|${date}`;
    if (!isMealBreakApplicable(clockIn, clockOut)) return 1;
    const hasMeal = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
    return hasMeal ? 1.5 : 1;
  };

  // 주간 근무일수 기반 휴일근무 판정 (정산 로직과 동일: days > 5이면 주말=휴일근무)
  const getWeeklyDayCounts = (actuals: any[], mode: 'actual' | 'planned', shifts: any[]) => {
    const weekMap = new Map<string, Set<string>>();
    for (const actual of actuals) {
      const planned = getPlannedForDay(shifts, actual.date, actuals);
      const useMode = actual.isPlannedOnly ? 'planned' : mode;
      const clockIn = useMode === 'planned' && planned ? planned.in : formatTime(actual.clock_in_time);
      const clockOut = useMode === 'planned' && planned ? planned.out : formatTime(actual.clock_out_time);
      if (clockIn === '-' && clockOut === '-') continue;
      const d = new Date(actual.date + 'T00:00:00+09:00');
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Set());
      weekMap.get(weekKey)!.add(actual.date);
    }
    return weekMap;
  };

  // 해당 날짜가 휴일근무에 해당하는지 (주 5일 초과 시 주말=휴일, 아니면 공휴일만 휴일)
  const isHolidayWorkDate = (date: string, weekMap: Map<string, Set<string>>) => {
    if (!isHolidayOrWeekend(date)) return false;
    const d = new Date(date + 'T00:00:00+09:00');
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);
    const weekDays = weekMap.get(weekKey);
    const dayCount = weekDays ? weekDays.size : 0;
    // 주 5일 초과(6일+): 주말/공휴일 모두 휴일근무
    if (dayCount > 5) return true;
    // 주 5일 이하: 공휴일만 휴일근무 (토일은 일반근무)
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return false; // 토/일은 휴일 아님
    return (HOLIDAYS[d.getFullYear()] || []).includes(date); // 공휴일만
  };

  const getEmpSummary = (emp: any, mode: 'actual' | 'planned') => {
    let regular = 0, overtime = 0, weekend = 0, days = 0;
    const weekMap = getWeeklyDayCounts(emp.actuals, mode, emp.shifts);
    for (const actual of emp.actuals) {
      const date = actual.date;
      const planned = getPlannedForDay(emp.shifts, date, emp.actuals);
      // planned-only 행은 항상 계획 기준으로 계산
      const useMode = actual.isPlannedOnly ? 'planned' : mode;
      const clockIn = useMode === 'planned' && planned ? planned.in : formatTime(actual.clock_in_time);
      const clockOut = useMode === 'planned' && planned ? planned.out : formatTime(actual.clock_out_time);
      if (clockIn === '-' && clockOut === '-') continue;
      days++;
      const breakH = getBreakHours(emp.id, date, clockIn, clockOut);
      const h = calcHoursFromTimes(clockIn, clockOut, breakH);
      const totalH = h.regular + h.overtime;
      if (isHolidayWorkDate(date, weekMap)) {
        overtime += totalH;
        weekend += totalH;
      } else {
        regular += h.regular;
        overtime += h.overtime;
      }
    }
    return { regular: Math.round(regular*10)/10, overtime: Math.round(overtime*10)/10, weekend: Math.round(weekend*10)/10, days };
  };

  const allDates = data ? (() => {
    const dates: string[] = [];
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) dates.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    return dates;
  })() : [];

  const handleConfirmRows = async () => {
    if (checkedRows.size === 0) return toast.info('확정할 항목을 선택해주세요.');
    setConfirming(true);
    try {
      const records: any[] = [];
      for (const key of Array.from(checkedRows)) {
        const [empId, date] = key.split('|');
        const emp = data?.employees?.find((e: any) => String(e.id) === empId);
        if (!emp) continue;
        const actual = emp.actuals.find((a: any) => a.date === date);
        const source = selectedSource[key] || (actual?.isPlannedOnly ? 'planned' : 'planned');
        const planned = getPlannedForDay(emp.shifts, date, emp.actuals);
        let clockIn = source === 'actual' ? formatTime(actual?.clock_in_time) : (planned?.in || '');
        let clockOut = source === 'actual' ? formatTime(actual?.clock_out_time) : (planned?.out || '');
        // planned-only 행에서 실제가 없으면 계획으로 fallback
        if ((clockIn === '-' || !clockIn) && planned?.in) clockIn = planned.in;
        if ((clockOut === '-' || !clockOut) && planned?.out) clockOut = planned.out;
        const breakH = getBreakHours(parseInt(empId), date, clockIn, clockOut);
        const h = calcHoursFromTimes(clockIn, clockOut, breakH);
        records.push({ employee_type: emp.type || '파견', employee_name: emp.name, employee_phone: emp.phone, department: emp.department || '', date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source, regular_hours: h.regular, overtime_hours: h.overtime, night_hours: h.night, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
      }
      const result = await confirmAttendance(records);
      toast.success(`${result.confirmed}건 확정 완료`);
      setCheckedRows(new Set());
    } catch (e: any) { toast.error(e.message); }
    finally { setConfirming(false); }
  };

  const handleBatchConfirm = async () => {
    if (checkedEmps.size === 0) return toast.info('직원을 선택해주세요.');
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
          const planned = getPlannedForDay(emp.shifts, actual.date, emp.actuals);
          let clockIn = batchSource === 'actual' ? formatTime(actual.clock_in_time) : (planned?.in || formatTime(actual.clock_in_time));
          let clockOut = batchSource === 'actual' ? formatTime(actual.clock_out_time) : (planned?.out || formatTime(actual.clock_out_time));
          // planned-only 행에서 실제가 없으면 계획으로 fallback
          if ((clockIn === '-' || !clockIn) && planned?.in) clockIn = planned.in;
          if ((clockOut === '-' || !clockOut) && planned?.out) clockOut = planned.out;
          if (clockIn === '-' && clockOut === '-') continue;
          const breakH = getBreakHours(emp.id, actual.date, clockIn, clockOut);
          const h = calcHoursFromTimes(clockIn, clockOut, breakH);
          records.push({ employee_type: emp.type || '파견', employee_name: emp.name, employee_phone: emp.phone, department: emp.department || '', date: actual.date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source: batchSource, regular_hours: h.regular, overtime_hours: h.overtime, night_hours: h.night, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
        }
      }
      if (records.length === 0) return toast.info('해당 기간에 출근 데이터가 없습니다.');
      const result = await confirmAttendance(records);
      toast.success(`${result.confirmed}건 확정 완료`);
      setCheckedEmps(new Set());
    } catch (e: any) { toast.error(e.message); }
    finally { setConfirming(false); }
  };

  const getAnomalyCount = (emp: any) => {
    let count = 0;
    for (const actual of (emp.actuals || [])) {
      const planned = getPlannedForDay(emp.shifts, actual.date, emp.actuals);
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
    (typeFilter === 'all' || (e.type || '').includes(typeFilter)) &&
    (!nameSearch || (e.name || '').includes(nameSearch)) &&
    (!deptFilter || (e.department || '').includes(deptFilter)) &&
    (confirmFilter === 'all' || (confirmFilter === 'confirmed' && confirmedEmpSet.has(e.name)) || (confirmFilter === 'unconfirmed' && !confirmedEmpSet.has(e.name)))
  );
  const lastDay = new Date(year, month, 0).getDate();

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={<><ClipboardList className="w-3.5 h-3.5" /> 근태 요약</>}
        title="사업소득(알바)/파견 근태 종합 요약"
        description="실제 출퇴근 기록 또는 계획 출퇴근이 있는 직원이 표시됩니다."
      />

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <Field label="연도"><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} inputSize="md" className="w-24" /></Field>
        <Field label="월">
          <Select value={month} onChange={e => setMonth(parseInt(e.target.value))} inputSize="md">
            {Array.from({length:12}, (_,i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
          </Select>
        </Field>
        <Field label="시간 보기">
          <Select value={viewMode} onChange={e => setViewMode(e.target.value as any)} inputSize="md">
            <option value="actual">실제 기준</option>
            <option value="planned">계획 기준</option>
          </Select>
        </Field>
        <Field label="유형">
          <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} inputSize="md">
            <option value="all">전체</option>
            <option value="파견">파견</option>
            <option value="알바">알바(사업소득)</option>
          </Select>
        </Field>
        <Field label="부서">
          <Select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} inputSize="md">
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
            <option value="카페(해방촌)">카페(해방촌)</option>
            <option value="카페(행궁동)">카페(행궁동)</option>
            <option value="카페(경복궁)">카페(경복궁)</option>
          </Select>
        </Field>
        <Field label="이름 검색"><Input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)} placeholder="이름" inputSize="md" className="w-28" /></Field>
        <Field label="확정 상태">
          <Select value={confirmFilter} onChange={e => setConfirmFilter(e.target.value as any)} inputSize="md">
            <option value="all">전체</option>
            <option value="unconfirmed">미확정만</option>
            <option value="confirmed">확정만</option>
          </Select>
        </Field>
        <Button variant="primary" size="md" onClick={() => { delete _cache[`disp-${year}-${month}`]; setForceRefresh(f => f+1); }} disabled={loading} className="self-end">조회</Button>
      </div>

      {visibleEmployees.length > 0 && (
        <Card padding="md" className="mb-4 flex flex-wrap gap-3 items-end" style={{ background: "color-mix(in srgb, var(--brand-500) 10%, transparent)", borderColor: "color-mix(in srgb, var(--brand-500) 30%, transparent)" }}>
          <Button variant="outline" size="sm" onClick={() => {
            if (checkedEmps.size === visibleEmployees.length) setCheckedEmps(new Set());
            else setCheckedEmps(new Set(visibleEmployees.map((e: any) => e.id)));
          }}>
            {checkedEmps.size === visibleEmployees.length ? '전체 해제' : '전체 선택'}
          </Button>
          <Field label="기간">
            <div className="flex items-center gap-1">
              <Input type="number" min={1} max={lastDay} value={rangeStart} onChange={e => setRangeStart(parseInt(e.target.value) || 1)} inputSize="sm" className="w-14 text-center" />
              <span className="text-[var(--text-3)]">~</span>
              <Input type="number" min={1} max={lastDay} value={rangeEnd} onChange={e => setRangeEnd(parseInt(e.target.value) || lastDay)} inputSize="sm" className="w-14 text-center" />
              <span className="text-xs text-[var(--text-3)]">일</span>
            </div>
          </Field>
          <Field label="기준">
            <Select value={batchSource} onChange={e => setBatchSource(e.target.value as any)} inputSize="sm">
              <option value="planned">계획 출퇴근</option>
              <option value="actual">실제 출퇴근</option>
            </Select>
          </Field>
          <Button variant="secondary" size="sm" leadingIcon={<Check className="w-4 h-4" />} loading={confirming} disabled={checkedEmps.size === 0} onClick={handleBatchConfirm} className="self-end">
            {checkedEmps.size}명 일괄 확정
          </Button>
          {checkedRows.size > 0 && (
            <Button variant="primary" size="sm" leadingIcon={<Check className="w-4 h-4" />} loading={confirming} onClick={handleConfirmRows} className="self-end">
              개별 {checkedRows.size}건 확정
            </Button>
          )}
        </Card>
      )}

      {loading ? (
        <SkeletonCard />
      ) : visibleEmployees.length > 0 ? (
        <div className="space-y-2">
          {visibleEmployees.map((emp: any) => {
            const summary = getEmpSummary(emp, viewMode);
            const expanded = expandedEmp === emp.id;
            const isFullyConfirmed = confirmedEmpSet.has(emp.name);
            return (
              <Card key={emp.id} padding="none" className="overflow-hidden hover-lift fade-in" style={isFullyConfirmed ? { borderColor: "var(--success-border)", background: "color-mix(in srgb, var(--success-fg) 8%, var(--bg-1))" } : {}}>
                <div className={`flex items-center px-4 py-3 hover:bg-[var(--bg-2)]/5 ${checkedEmps.has(emp.id) ? 'bg-[var(--brand-500)]/10' : ''}`}>
                  <div className="mr-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedEmps.has(emp.id)}
                      onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(emp.id); else n.delete(emp.id); setCheckedEmps(n); }}
                      className="rounded border-[var(--border-1)]" />
                  </div>
                  <button className="flex-1 flex items-center justify-between" onClick={() => setExpandedEmp(expanded ? null : emp.id)}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-[var(--text-1)]">{emp.name}</span>
                      {isFullyConfirmed && <Badge tone="success" size="xs" dot><CheckCircle2 className="w-3 h-3 inline mr-0.5" />확정</Badge>}
                      <Badge tone={emp.type === '파견' ? 'warning' : emp.type === '알바' ? 'success' : 'neutral'} size="xs">{emp.type || '정보없음'}</Badge>
                      <span className="text-xs text-[var(--text-3)]">{emp.department}</span>
                      {(() => { const ac = getAnomalyCount(emp); return ac > 0 ? <Badge tone="danger" size="xs">차이 발생 {ac}건</Badge> : null; })()}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-[var(--text-3)] tabular">{summary.days}일</span>
                      <span className="text-[var(--brand-400)] font-medium tabular">기본 {summary.regular}h</span>
                      <span className="text-[var(--warning-fg)] font-medium tabular">연장 {summary.overtime}h</span>
                      <span className="text-[var(--danger-fg)] font-medium tabular">휴일근무 {summary.weekend}h</span>
                      {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-4)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-4)]" />}
                    </div>
                  </button>
                  {isFullyConfirmed && (
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`${emp.name}의 확정을 취소하시겠습니까?`)) return;
                      try {
                        const ym = `${year}-${String(month).padStart(2,'0')}`;
                        const confirmed = await getConfirmedList(ym, '');
                        const empData = (confirmed || []).find((c: any) => c.name === emp.name);
                        if (empData?.records) {
                          for (const rec of empData.records) { await deleteConfirmedRecord(rec.id); }
                        }
                        // Refresh confirmed state
                        const cSet = new Set(confirmedSet);
                        const cEmpSet = new Set(confirmedEmpSet);
                        cEmpSet.delete(emp.name);
                        emp.actuals.forEach((a: any) => cSet.delete(`${emp.name}|${a.date}`));
                        setConfirmedSet(cSet);
                        setConfirmedEmpSet(cEmpSet);
                        toast.success('확정 취소 완료');
                      } catch (err: any) { toast.error(err.message); }
                    }} className="ml-1 px-1.5 py-0.5 text-[10px] font-medium text-[var(--danger-fg)] bg-[var(--danger-fg)]/10 hover:bg-[var(--danger-fg)]/15 rounded" title="확정 취소">
                      <XCircle className="w-3.5 h-3.5 inline mr-0.5" />취소
                    </button>
                  )}
                  <button onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`${emp.name}을(를) 리스트에서 제거하시겠습니까? 확정된 데이터도 함께 삭제됩니다.`)) return;
                    // Delete confirmed records for this employee
                    try {
                      const ym = `${year}-${String(month).padStart(2,'0')}`;
                      const confirmed = await getConfirmedList(ym, '');
                      const empData = (confirmed || []).find((c: any) => c.name === emp.name && c.type !== '정규직');
                      if (empData?.records) {
                        for (const rec of empData.records) { await deleteConfirmedRecord(rec.id); }
                      }
                    } catch {}
                    setHiddenEmps(new Set([...hiddenEmps, emp.id]));
                  }}
                    className="ml-1 p-1 text-[var(--text-4)] hover:text-[var(--danger-fg)] hover:bg-[var(--danger-fg)]/10 rounded" title="리스트에서 제거 + 확정 삭제">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-[var(--brand-500)]/30 bg-[var(--brand-500)]/10 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--bg-canvas)] text-left">
                          <th className="py-2 px-3 w-8"></th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--text-3)]">날짜</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--text-3)]">요일</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--brand-400)]">계획출근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--brand-400)]">계획퇴근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--success-fg)]">실제출근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--success-fg)]">실제퇴근</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--text-3)]">식사</th>
                          <th className="py-2 px-3 text-[10px] uppercase tracking-wider text-[var(--text-3)]">기준</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-1)]">
                        {(() => {
                          const weekMap = getWeeklyDayCounts(emp.actuals, viewMode, emp.shifts);
                          return emp.actuals.map((actual: any) => {
                          const date = actual.date;
                          const planned = getPlannedForDay(emp.shifts, date, emp.actuals);
                          const key = `${emp.id}|${date}`;
                          const actualIn = formatTime(actual.clock_in_time);
                          const actualOut = formatTime(actual.clock_out_time);
                          const plannedIn = planned?.in || '-';
                          const plannedOut = planned?.out || '-';
                          const diffIn = timeDiffHours(plannedIn, actualIn);
                          const diffOut = timeDiffHours(plannedOut, actualOut);
                          const isAnomaly = (diffIn >= 3 || diffOut >= 3) && plannedIn !== '-';
                          const dowNum = new Date(date + 'T00:00:00+09:00').getDay();
                          const dow = ['일','월','화','수','목','금','토'][dowNum];
                          const isPlannedOnly = actual.isPlannedOnly;
                          const source = selectedSource[key] || (isPlannedOnly ? 'planned' : 'planned');
                          const isDayConfirmed = confirmedSet.has(`${emp.name}|${date}`);
                          const useClockIn = source === 'actual' ? actualIn : (plannedIn !== '-' ? plannedIn : actualIn);
                          const useClockOut = source === 'actual' ? actualOut : (plannedOut !== '-' ? plannedOut : actualOut);
                          const mealApplicable = isMealBreakApplicable(useClockIn, useClockOut);
                          const mealChecked = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
                          const isHolidayW = isHolidayWorkDate(date, weekMap);
                          return (
                            <tr key={date} className={isDayConfirmed ? 'bg-[var(--success-fg)]/10' : isHolidayW ? 'bg-[var(--danger-fg)]/10' : isPlannedOnly ? 'bg-[var(--info-fg)]/5' : isAnomaly ? 'bg-[var(--danger-fg)]/10' : 'bg-[var(--bg-1)]'}>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <input type="checkbox" checked={checkedRows.has(key)}
                                    onChange={e => { const n = new Set(checkedRows); if (e.target.checked) n.add(key); else n.delete(key); setCheckedRows(n); }}
                                    className="rounded border-[var(--border-1)]" />
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-[var(--text-2)]">{date.slice(5)}{isDayConfirmed && <span className="ml-1 text-[9px] text-[var(--success-fg)]">확정</span>}{isHolidayW && !isDayConfirmed && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--danger-fg)]/15 text-[var(--danger-fg)]">휴일근무</span>}{isPlannedOnly && !isDayConfirmed && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--info-fg)]/15 text-[var(--brand-400)]">계획만</span>}</td>
                              <td className={`py-1.5 px-3 ${dowNum === 0 ? 'text-[var(--danger-fg)] font-bold' : dowNum === 6 ? 'text-blue-500 font-bold' : 'text-[var(--text-3)]'}`}>{dow}</td>
                              <td className="py-1.5 px-3 text-[var(--brand-400)]">{plannedIn}</td>
                              <td className="py-1.5 px-3 text-[var(--brand-400)]">{plannedOut}</td>
                              <td className={`py-1.5 px-3 ${isAnomaly ? 'text-[var(--danger-fg)] font-bold' : 'text-[var(--success-fg)]'}`}>{actualIn}</td>
                              <td className={`py-1.5 px-3 ${isAnomaly ? 'text-[var(--danger-fg)] font-bold' : 'text-[var(--success-fg)]'}`}>{actualOut}</td>
                              <td className="py-1.5 px-3">
                                {mealApplicable ? (
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={mealChecked}
                                      onChange={e => setDinnerBreak({...dinnerBreak, [key]: e.target.checked})}
                                      className="rounded border-[var(--border-1)]" disabled={isDayConfirmed} />
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
                                        // Check if employee is still fully confirmed
                                        const stillFull = emp.actuals.every((a: any) => a.date === date ? false : newSet.has(`${emp.name}|${a.date}`));
                                        if (!stillFull) { const newEmpSet = new Set(confirmedEmpSet); newEmpSet.delete(emp.name); setConfirmedEmpSet(newEmpSet); }
                                      } catch (err: any) { toast.error(err.message); }
                                    }} className="px-1 py-0.5 text-[9px] text-[var(--danger-fg)] bg-[var(--danger-fg)]/10 hover:bg-[var(--danger-fg)]/15 rounded font-medium">
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <select value={source} onChange={e => setSelectedSource({...selectedSource, [key]: e.target.value as any})}
                                    className="px-1 py-0.5 border border-[var(--border-1)] rounded text-[10px] bg-[var(--bg-1)]">
                                    <option value="planned">계획</option>
                                    <option value="actual">실제</option>
                                  </select>
                                )}
                              </td>
                            </tr>
                          );
                        });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="해당 월에 출근 기록이 있는 직원이 없습니다." description="기간 조건을 변경하거나 조회 버튼을 눌러 다시 확인해 주세요." />
      )}
    </div>
  );
}
