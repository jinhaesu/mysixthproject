"use client";

import { useState, useCallback, useEffect } from "react";
import { ClipboardList, Loader2, ChevronDown, ChevronUp, Check } from "lucide-react";
import { getAttendanceSummaryDispatch, confirmAttendance } from "@/lib/api";

export default function AttendanceSummaryDispatchPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<Record<string, 'planned' | 'actual'>>({});
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // Batch controls
  const [checkedEmps, setCheckedEmps] = useState<Set<number>>(new Set());
  const [batchSource, setBatchSource] = useState<'planned' | 'actual'>('planned');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(31);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await getAttendanceSummaryDispatch(year, month); setData(d); } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try { return new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); } catch { return t; }
  };

  const getPlannedForDay = (shifts: any[], _date: string) => {
    // For dispatch workers, shifts contain the planned times from survey_requests
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

  const calcHoursFromTimes = (clockIn: string, clockOut: string) => {
    if (!clockIn || !clockOut || clockIn === '-' || clockOut === '-') return { regular: 0, overtime: 0, weekend: 0 };
    const [h1,m1] = clockIn.split(':').map(Number);
    const [h2,m2] = clockOut.split(':').map(Number);
    if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0, weekend: 0 };
    const total = Math.max(((h2*60+(m2||0)) - (h1*60+(m1||0))) / 60 - 1, 0);
    return { regular: Math.min(total, 8), overtime: Math.max(total - 8, 0), weekend: 0 };
  };

  // Calculate employee summary
  const getEmpSummary = (emp: any) => {
    let regular = 0, overtime = 0, weekend = 0, days = 0;
    for (const date of allDates) {
      const actual = emp.actuals.find((a: any) => a.date === date);
      const planned = getPlannedForDay(emp.shifts, date);
      if (!actual && !planned) continue;
      days++;
      const plannedIn = planned?.in || '-';
      const plannedOut = planned?.out || '-';
      const actualIn = formatTime(actual?.clock_in_time);
      const actualOut = formatTime(actual?.clock_out_time);
      const h = calcHoursFromTimes(actual ? actualIn : plannedIn, actual ? actualOut : plannedOut);
      regular += h.regular;
      overtime += h.overtime;
      const dow = new Date(date + 'T00:00:00+09:00').getDay();
      if (dow === 0 || dow === 6) weekend += h.regular + h.overtime;
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
        const h = calcHoursFromTimes(clockIn, clockOut);
        records.push({
          employee_type: '파견', employee_name: emp.name, employee_phone: emp.phone,
          date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut,
          source, regular_hours: h.regular, overtime_hours: h.overtime,
          break_hours: 1, year_month: `${year}-${String(month).padStart(2, '0')}`
        });
      }
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedRows(new Set());
    } catch (e: any) { alert(e.message); }
    finally { setConfirming(false); }
  };

  // Batch confirm for selected employees
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
        for (const date of allDates) {
          if (date < startDate || date > endDate) continue;
          const actual = emp.actuals.find((a: any) => a.date === date);
          const planned = getPlannedForDay(emp.shifts, date);
          if (!actual && !planned) continue;
          const clockIn = batchSource === 'actual' ? formatTime(actual?.clock_in_time) : (planned?.in || '');
          const clockOut = batchSource === 'actual' ? formatTime(actual?.clock_out_time) : (planned?.out || '');
          if (clockIn === '-' && clockOut === '-') continue;
          const h = calcHoursFromTimes(clockIn, clockOut);
          records.push({
            employee_type: '파견', employee_name: emp.name, employee_phone: emp.phone,
            date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut,
            source: batchSource, regular_hours: h.regular, overtime_hours: h.overtime,
            break_hours: 1, year_month: `${year}-${String(month).padStart(2, '0')}`
          });
        }
      }
      if (records.length === 0) return alert("해당 기간에 데이터가 없습니다.");
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedEmps(new Set());
    } catch (e: any) { alert(e.message); }
    finally { setConfirming(false); }
  };

  const lastDay = new Date(year, month, 0).getDate();

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          사업소득(알바)/파견 근태 정보 종합 요약
        </h1>
        <p className="text-sm text-gray-500 mt-1">계획 출퇴근과 실제 출퇴근을 비교하고 확정합니다.</p>
      </div>

      {/* Controls */}
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
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">조회</button>
      </div>

      {/* Batch Actions */}
      {data?.employees?.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-indigo-700 mb-1">기간</label>
            <div className="flex items-center gap-1">
              <input type="number" min={1} max={lastDay} value={rangeStart} onChange={e => setRangeStart(parseInt(e.target.value) || 1)}
                className="px-2 py-1.5 border border-indigo-300 rounded text-sm w-14 text-center" />
              <span className="text-indigo-600">~</span>
              <input type="number" min={1} max={lastDay} value={rangeEnd} onChange={e => setRangeEnd(parseInt(e.target.value) || lastDay)}
                className="px-2 py-1.5 border border-indigo-300 rounded text-sm w-14 text-center" />
              <span className="text-xs text-indigo-500">일</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-indigo-700 mb-1">기준</label>
            <select value={batchSource} onChange={e => setBatchSource(e.target.value as any)}
              className="px-3 py-1.5 border border-indigo-300 rounded-lg text-sm bg-white">
              <option value="planned">계획 출퇴근</option>
              <option value="actual">실제 출퇴근</option>
            </select>
          </div>
          <button onClick={handleBatchConfirm} disabled={confirming || checkedEmps.size === 0}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 flex items-center gap-1">
            <Check className="w-4 h-4" /> 선택 {checkedEmps.size}명 일괄 확정
          </button>
          {checkedRows.size > 0 && (
            <button onClick={handleConfirmRows} disabled={confirming}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300 flex items-center gap-1">
              <Check className="w-4 h-4" /> 개별 {checkedRows.size}건 확정
            </button>
          )}
        </div>
      )}

      {/* Employee List */}
      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : data?.employees?.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="py-2 px-3 w-8">
                  <input type="checkbox"
                    checked={checkedEmps.size === data.employees.length}
                    onChange={e => setCheckedEmps(e.target.checked ? new Set(data.employees.map((e: any) => e.id)) : new Set())}
                    className="rounded border-gray-300" />
                </th>
                <th className="py-2 px-4 font-medium text-gray-600">이름</th>
                <th className="py-2 px-4 font-medium text-gray-600">부서</th>
                <th className="py-2 px-4 font-medium text-gray-600 text-right">출근일</th>
                <th className="py-2 px-4 font-medium text-gray-600 text-right">기본(h)</th>
                <th className="py-2 px-4 font-medium text-gray-600 text-right">연장(h)</th>
                <th className="py-2 px-4 font-medium text-gray-600 text-right">주말(h)</th>
                <th className="py-2 px-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.employees.map((emp: any) => {
                const summary = getEmpSummary(emp);
                const expanded = expandedEmp === emp.id;
                return (
                  <tr key={emp.id} className={`${checkedEmps.has(emp.id) ? 'bg-indigo-50/50' : ''}`}>
                    <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedEmps.has(emp.id)}
                        onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(emp.id); else n.delete(emp.id); setCheckedEmps(n); }}
                        className="rounded border-gray-300" />
                    </td>
                    <td className="py-2.5 px-4 font-medium text-gray-900 cursor-pointer" onClick={() => setExpandedEmp(expanded ? null : emp.id)}>{emp.name}</td>
                    <td className="py-2.5 px-4 text-gray-500 text-xs">{emp.department} {emp.team}</td>
                    <td className="py-2.5 px-4 text-right text-gray-700">{summary.days}</td>
                    <td className="py-2.5 px-4 text-right text-blue-700 font-medium">{summary.regular}</td>
                    <td className="py-2.5 px-4 text-right text-amber-700 font-medium">{summary.overtime}</td>
                    <td className="py-2.5 px-4 text-right text-red-600 font-medium">{summary.weekend}</td>
                    <td className="py-2.5 px-3 cursor-pointer" onClick={() => setExpandedEmp(expanded ? null : emp.id)}>
                      {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded detail */}
          {expandedEmp && (() => {
            const emp = data.employees.find((e: any) => e.id === expandedEmp);
            if (!emp) return null;
            return (
              <div className="border-t-2 border-indigo-200 bg-indigo-50/30">
                <div className="px-4 py-2 bg-indigo-100/50">
                  <span className="text-sm font-semibold text-indigo-800">{emp.name} 일별 상세</span>
                </div>
                <div className="overflow-x-auto">
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
                        <th className="py-2 px-3">기준</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allDates.map(date => {
                        const actual = emp.actuals.find((a: any) => a.date === date);
                        const planned = getPlannedForDay(emp.shifts, date);
                        if (!actual && !planned) return null;
                        const key = `${emp.id}|${date}`;
                        const actualIn = formatTime(actual?.clock_in_time);
                        const actualOut = formatTime(actual?.clock_out_time);
                        const plannedIn = planned?.in || '-';
                        const plannedOut = planned?.out || '-';
                        const diffIn = timeDiffHours(plannedIn, actualIn);
                        const diffOut = timeDiffHours(plannedOut, actualOut);
                        const isAnomaly = (diffIn >= 3 || diffOut >= 3) && actual;
                        const dow = ['일','월','화','수','목','금','토'][new Date(date + 'T00:00:00+09:00').getDay()];
                        const source = selectedSource[key] || 'planned';
                        return (
                          <tr key={date} className={isAnomaly ? 'bg-red-50' : 'bg-white'}>
                            <td className="py-1.5 px-3">
                              <input type="checkbox" checked={checkedRows.has(key)}
                                onChange={e => { const n = new Set(checkedRows); if (e.target.checked) n.add(key); else n.delete(key); setCheckedRows(n); }}
                                className="rounded border-gray-300" />
                            </td>
                            <td className="py-1.5 px-3 text-gray-700">{date.slice(5)}</td>
                            <td className={`py-1.5 px-3 ${new Date(date+'T00:00:00+09:00').getDay() === 0 ? 'text-red-500' : new Date(date+'T00:00:00+09:00').getDay() === 6 ? 'text-blue-500' : 'text-gray-500'}`}>{dow}</td>
                            <td className="py-1.5 px-3 text-blue-700">{plannedIn}</td>
                            <td className="py-1.5 px-3 text-blue-700">{plannedOut}</td>
                            <td className={`py-1.5 px-3 ${isAnomaly ? 'text-red-700 font-bold' : 'text-green-700'}`}>{actualIn}</td>
                            <td className={`py-1.5 px-3 ${isAnomaly ? 'text-red-700 font-bold' : 'text-green-700'}`}>{actualOut}</td>
                            <td className="py-1.5 px-3">
                              <select value={source} onChange={e => setSelectedSource({...selectedSource, [key]: e.target.value as any})}
                                className="px-1 py-0.5 border border-gray-200 rounded text-[10px] bg-white">
                                <option value="planned">계획</option>
                                <option value="actual">실제</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">데이터가 없습니다.</div>
      )}
    </div>
  );
}
