"use client";

import { useState, useCallback, useEffect } from "react";
import { ClipboardList, Loader2, ChevronDown, ChevronUp, Check, Trash2, CheckCircle2, XCircle } from "lucide-react";
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
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | '파견' | '알바'>('all');
  const [selectedSource, setSelectedSource] = useState<Record<string, 'planned' | 'actual'>>({});
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [checkedEmps, setCheckedEmps] = useState<Set<number>>(new Set());
  const [batchSource, setBatchSource] = useState<'planned' | 'actual'>('planned');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(31);
  const [viewMode, setViewMode] = useState<'actual' | 'planned'>('actual');
  const [hiddenEmps, setHiddenEmps] = useState<Set<number>>(new Set());
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(new Set());
  const [confirmedEmpSet, setConfirmedEmpSet] = useState<Set<string>>(new Set());
  const [confirmedIdMap, setConfirmedIdMap] = useState<Record<string, number>>({});
  const [nameSearch, setNameSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [dinnerBreak, setDinnerBreak] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const key = `disp-${year}-${month}`;
    const cached = _cache[key];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
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
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try {
      const d = new Date(t);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return t; }
  };

  const getPlannedForDay = (shifts: any[], _date: string) => {
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

  const isDinnerApplicable = (clockIn: string, clockOut: string) => {
    if (!clockIn || !clockOut || clockIn === '-' || clockOut === '-') return false;
    const [h1] = clockIn.split(':').map(Number);
    const [h2] = clockOut.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return false;
    return h1 >= 7 && h1 <= 9 && h2 >= 19 && h2 <= 20;
  };

  const calcHoursFromTimes = (clockIn: string, clockOut: string, breakH = 1) => {
    if (!clockIn || !clockOut || clockIn === '-' || clockOut === '-') return { regular: 0, overtime: 0 };
    const [h1,m1] = clockIn.split(':').map(Number);
    const [h2,m2] = clockOut.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0 };
    const total = Math.max(((h2*60+(m2||0)) - (h1*60+(m1||0))) / 60 - breakH, 0);
    return { regular: Math.min(total, 8), overtime: Math.max(total - 8, 0) };
  };

  const getBreakHours = (empId: number, date: string, clockIn: string, clockOut: string) => {
    const key = `${empId}|${date}`;
    if (!isDinnerApplicable(clockIn, clockOut)) return 1;
    // default is true (dinner break checked), unless explicitly unchecked
    const hasDinner = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
    return hasDinner ? 1.5 : 1;
  };

  const getEmpSummary = (emp: any, mode: 'actual' | 'planned') => {
    let regular = 0, overtime = 0, weekend = 0, days = 0;
    for (const actual of emp.actuals) {
      const date = actual.date;
      const planned = getPlannedForDay(emp.shifts, date);
      const clockIn = mode === 'planned' && planned ? planned.in : formatTime(actual.clock_in_time);
      const clockOut = mode === 'planned' && planned ? planned.out : formatTime(actual.clock_out_time);
      if (clockIn === '-' && clockOut === '-') continue;
      days++;
      const breakH = getBreakHours(emp.id, date, clockIn, clockOut);
      const h = calcHoursFromTimes(clockIn, clockOut, breakH);
      const totalH = h.regular + h.overtime;
      if (isHolidayOrWeekend(date)) {
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
        const breakH = getBreakHours(parseInt(empId), date, clockIn, clockOut);
        const h = calcHoursFromTimes(clockIn, clockOut, breakH);
        records.push({ employee_type: emp.type || '파견', employee_name: emp.name, employee_phone: emp.phone, date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source, regular_hours: h.regular, overtime_hours: h.overtime, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
      }
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedRows(new Set());
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
          const breakH = getBreakHours(emp.id, actual.date, clockIn, clockOut);
          const h = calcHoursFromTimes(clockIn, clockOut, breakH);
          records.push({ employee_type: emp.type || '파견', employee_name: emp.name, employee_phone: emp.phone, date: actual.date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut, source: batchSource, regular_hours: h.regular, overtime_hours: h.overtime, break_hours: breakH, year_month: `${year}-${String(month).padStart(2, '0')}` });
        }
      }
      if (records.length === 0) return alert("해당 기간에 출근 데이터가 없습니다.");
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedEmps(new Set());
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
    (typeFilter === 'all' || (e.type || '').includes(typeFilter)) &&
    (!nameSearch || (e.name || '').includes(nameSearch)) &&
    (!deptFilter || (e.department || '').includes(deptFilter))
  );
  const lastDay = new Date(year, month, 0).getDate();

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          사업소득(알바)/파견 근태 정보 종합 요약
        </h1>
        <p className="text-sm text-gray-500 mt-1">실제 출퇴근 기록이 있는 직원만 표시됩니다.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연도</label>
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">월</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {Array.from({length:12}, (_,i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">시간 보기</label>
          <select value={viewMode} onChange={e => setViewMode(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="actual">실제 기준</option>
            <option value="planned">계획 기준</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">유형</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="all">전체</option>
            <option value="파견">파견</option>
            <option value="알바">알바(사업소득)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">부서</label>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">이름 검색</label>
          <input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)} placeholder="이름"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28" />
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">조회</button>
      </div>

      {visibleEmployees.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
          <button onClick={() => {
            if (checkedEmps.size === visibleEmployees.length) setCheckedEmps(new Set());
            else setCheckedEmps(new Set(visibleEmployees.map((e: any) => e.id)));
          }} className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-medium text-indigo-700 hover:bg-indigo-100">
            {checkedEmps.size === visibleEmployees.length ? '전체 해제' : '전체 선택'}
          </button>
          <div>
            <label className="block text-xs font-medium text-indigo-700 mb-1">기간</label>
            <div className="flex items-center gap-1">
              <input type="number" min={1} max={lastDay} value={rangeStart} onChange={e => setRangeStart(parseInt(e.target.value) || 1)} className="px-2 py-1.5 border border-indigo-300 rounded text-sm w-14 text-center" />
              <span className="text-indigo-600">~</span>
              <input type="number" min={1} max={lastDay} value={rangeEnd} onChange={e => setRangeEnd(parseInt(e.target.value) || lastDay)} className="px-2 py-1.5 border border-indigo-300 rounded text-sm w-14 text-center" />
              <span className="text-xs text-indigo-500">일</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-indigo-700 mb-1">기준</label>
            <select value={batchSource} onChange={e => setBatchSource(e.target.value as any)} className="px-3 py-1.5 border border-indigo-300 rounded-lg text-sm bg-white">
              <option value="planned">계획 출퇴근</option>
              <option value="actual">실제 출퇴근</option>
            </select>
          </div>
          <button onClick={handleBatchConfirm} disabled={confirming || checkedEmps.size === 0}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 flex items-center gap-1">
            <Check className="w-4 h-4" /> {checkedEmps.size}명 일괄 확정
          </button>
          {checkedRows.size > 0 && (
            <button onClick={handleConfirmRows} disabled={confirming}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 flex items-center gap-1">
              <Check className="w-4 h-4" /> 개별 {checkedRows.size}건 확정
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : visibleEmployees.length > 0 ? (
        <div className="space-y-2">
          {visibleEmployees.map((emp: any) => {
            const summary = getEmpSummary(emp, viewMode);
            const expanded = expandedEmp === emp.id;
            const isFullyConfirmed = confirmedEmpSet.has(emp.name);
            return (
              <div key={emp.id} className={`rounded-xl border overflow-hidden ${isFullyConfirmed ? 'border-green-300 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
                <div className={`flex items-center px-4 py-3 hover:bg-gray-50 ${checkedEmps.has(emp.id) ? 'bg-indigo-50/50' : ''}`}>
                  <div className="mr-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={checkedEmps.has(emp.id)}
                      onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(emp.id); else n.delete(emp.id); setCheckedEmps(n); }}
                      className="rounded border-gray-300" />
                  </div>
                  <button className="flex-1 flex items-center justify-between" onClick={() => setExpandedEmp(expanded ? null : emp.id)}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-gray-900">{emp.name}</span>
                      {isFullyConfirmed && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" />확정</span>}
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${emp.type === '파견' ? 'bg-blue-50 text-blue-700' : emp.type === '알바' ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-600'}`}>{emp.type || '정보없음'}</span>
                      <span className="text-xs text-gray-500">{emp.department}</span>
                      {(() => { const ac = getAnomalyCount(emp); return ac > 0 ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">차이 발생 {ac}건</span> : null; })()}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-600">{summary.days}일</span>
                      <span className="text-blue-700 font-medium">기본 {summary.regular}h</span>
                      <span className="text-amber-700 font-medium">연장 {summary.overtime}h</span>
                      <span className="text-red-600 font-medium">주말 {summary.weekend}h</span>
                      {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
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
                        alert('확정 취소 완료');
                      } catch (err: any) { alert(err.message); }
                    }} className="ml-1 px-1.5 py-0.5 text-[10px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded" title="확정 취소">
                      <XCircle className="w-3.5 h-3.5 inline mr-0.5" />취소
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setHiddenEmps(new Set([...hiddenEmps, emp.id])); }}
                    className="ml-1 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="리스트에서 제거">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-indigo-200 bg-indigo-50/20 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="py-2 px-3 w-8"></th>
                          <th className="py-2 px-3">날짜</th>
                          <th className="py-2 px-3">요일</th>
                          <th className="py-2 px-3 text-blue-600">계획출근</th>
                          <th className="py-2 px-3 text-blue-600">계획퇴근</th>
                          <th className="py-2 px-3 text-green-600">실제출근</th>
                          <th className="py-2 px-3 text-green-600">실제퇴근</th>
                          <th className="py-2 px-3">저녁식사</th>
                          <th className="py-2 px-3">기준</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {emp.actuals.map((actual: any) => {
                          const date = actual.date;
                          const planned = getPlannedForDay(emp.shifts, date);
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
                          const source = selectedSource[key] || 'planned';
                          const isDayConfirmed = confirmedSet.has(`${emp.name}|${date}`);
                          const useClockIn = source === 'actual' ? actualIn : (plannedIn !== '-' ? plannedIn : actualIn);
                          const useClockOut = source === 'actual' ? actualOut : (plannedOut !== '-' ? plannedOut : actualOut);
                          const dinnerApplicable = isDinnerApplicable(useClockIn, useClockOut);
                          const dinnerChecked = dinnerBreak[key] !== undefined ? dinnerBreak[key] : true;
                          return (
                            <tr key={date} className={isDayConfirmed ? 'bg-green-50' : isAnomaly ? 'bg-red-50' : 'bg-white'}>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : (
                                  <input type="checkbox" checked={checkedRows.has(key)}
                                    onChange={e => { const n = new Set(checkedRows); if (e.target.checked) n.add(key); else n.delete(key); setCheckedRows(n); }}
                                    className="rounded border-gray-300" />
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-gray-700">{date.slice(5)}{isDayConfirmed && <span className="ml-1 text-[9px] text-green-600">확정</span>}</td>
                              <td className={`py-1.5 px-3 ${dowNum === 0 ? 'text-red-500 font-bold' : dowNum === 6 ? 'text-blue-500 font-bold' : 'text-gray-500'}`}>{dow}</td>
                              <td className="py-1.5 px-3 text-blue-700">{plannedIn}</td>
                              <td className="py-1.5 px-3 text-blue-700">{plannedOut}</td>
                              <td className={`py-1.5 px-3 ${isAnomaly ? 'text-red-700 font-bold' : 'text-green-700'}`}>{actualIn}</td>
                              <td className={`py-1.5 px-3 ${isAnomaly ? 'text-red-700 font-bold' : 'text-green-700'}`}>{actualOut}</td>
                              <td className="py-1.5 px-3">
                                {dinnerApplicable ? (
                                  <label className="inline-flex items-center gap-1 cursor-pointer">
                                    <input type="checkbox" checked={dinnerChecked}
                                      onChange={e => setDinnerBreak({...dinnerBreak, [key]: e.target.checked})}
                                      className="rounded border-gray-300" disabled={isDayConfirmed} />
                                    <span className={`text-[10px] ${dinnerChecked ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                                      {dinnerChecked ? '30분 휴게' : '식사 안함'}
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-[10px] text-gray-400">미해당</span>
                                )}
                              </td>
                              <td className="py-1.5 px-3">
                                {isDayConfirmed ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-green-600 font-medium">확정됨</span>
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
                                        // Check if employee is still fully confirmed
                                        const stillFull = emp.actuals.every((a: any) => a.date === date ? false : newSet.has(`${emp.name}|${a.date}`));
                                        if (!stillFull) { const newEmpSet = new Set(confirmedEmpSet); newEmpSet.delete(emp.name); setConfirmedEmpSet(newEmpSet); }
                                      } catch (err: any) { alert(err.message); }
                                    }} className="px-1 py-0.5 text-[9px] text-red-600 bg-red-50 hover:bg-red-100 rounded font-medium">
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <select value={source} onChange={e => setSelectedSource({...selectedSource, [key]: e.target.value as any})}
                                    className="px-1 py-0.5 border border-gray-200 rounded text-[10px] bg-white">
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
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">해당 월에 출근 기록이 있는 직원이 없습니다.</div>
      )}
    </div>
  );
}
