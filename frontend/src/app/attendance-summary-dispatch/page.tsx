"use client";

import { useState, useCallback, useEffect } from "react";
import { ClipboardList, Loader2, ChevronDown, ChevronUp, Check } from "lucide-react";
import { getAttendanceSummaryRegular, confirmAttendance } from "@/lib/api";

export default function AttendanceSummaryDispatchPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<Record<string, 'planned' | 'actual'>>({});
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await getAttendanceSummaryRegular(year, month); setData(d); } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const formatTime = (t: string | null) => {
    if (!t) return '-';
    try { return new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); } catch { return t; }
  };

  const getPlannedForDay = (shifts: any[], date: string) => {
    const dow = new Date(date + 'T00:00:00+09:00').getDay();
    for (const s of shifts) {
      const days = (s.days_of_week || String(s.day_of_week)).split(',').map(Number);
      if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
    }
    return null;
  };

  const timeDiffHours = (t1: string, t2: string) => {
    if (!t1 || !t2 || t1 === '-' || t2 === '-') return 0;
    const [h1, m1] = t1.split(':').map(Number);
    const [h2, m2] = t2.split(':').map(Number);
    return Math.abs((h1 * 60 + m1) - (h2 * 60 + m2)) / 60;
  };

  const handleConfirm = async () => {
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

        // Calculate hours
        let regularHours = 0, overtimeHours = 0;
        if (clockIn && clockOut && clockIn !== '-' && clockOut !== '-') {
          const [h1,m1] = clockIn.split(':').map(Number);
          const [h2,m2] = clockOut.split(':').map(Number);
          const total = ((h2*60+m2) - (h1*60+m1)) / 60 - 1; // minus 1h break
          regularHours = Math.min(total, 8);
          overtimeHours = Math.max(total - 8, 0);
        }

        records.push({
          employee_type: emp.employee_type || '파견', employee_name: emp.name, employee_phone: emp.phone,
          date, confirmed_clock_in: clockIn, confirmed_clock_out: clockOut,
          source, regular_hours: Math.round(regularHours * 100) / 100,
          overtime_hours: Math.round(overtimeHours * 100) / 100,
          break_hours: 1, year_month: `${year}-${String(month).padStart(2, '0')}`
        });
      }
      const result = await confirmAttendance(records);
      alert(`${result.confirmed}건 확정 완료`);
      setCheckedRows(new Set());
    } catch (e: any) { alert(e.message); }
    finally { setConfirming(false); }
  };

  const allDates = data ? (() => {
    const dates: string[] = [];
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) dates.push(`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    return dates;
  })() : [];

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            사업소득(알바)/파견 근태 정보 종합 요약
          </h1>
          <p className="text-sm text-gray-500 mt-1">계획 출퇴근과 실제 출퇴근을 비교하고 확정합니다.</p>
        </div>
      </div>

      <div className="flex gap-3 items-end mb-4">
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
        {checkedRows.size > 0 && (
          <button onClick={handleConfirm} disabled={confirming} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1">
            <Check className="w-4 h-4" /> {checkedRows.size}건 확정
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : data?.employees?.length > 0 ? (
        <div className="space-y-2">
          {data.employees.map((emp: any) => {
            const expanded = expandedEmp === emp.id;
            return (
              <div key={emp.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setExpandedEmp(expanded ? null : emp.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{emp.name}</span>
                    <span className="text-xs text-gray-500">{emp.department} {emp.team}</span>
                    <span className="text-xs text-gray-400">{emp.phone}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-blue-600">{emp.actual_days}일 출근</span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-gray-100 overflow-x-auto">
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
                            <tr key={date} className={isAnomaly ? 'bg-red-50' : ''}>
                              <td className="py-2 px-3">
                                <input type="checkbox" checked={checkedRows.has(key)}
                                  onChange={e => { const n = new Set(checkedRows); if (e.target.checked) n.add(key); else n.delete(key); setCheckedRows(n); }}
                                  className="rounded border-gray-300" />
                              </td>
                              <td className="py-2 px-3 text-gray-700">{date.slice(5)}</td>
                              <td className="py-2 px-3 text-gray-500">{dow}</td>
                              <td className="py-2 px-3 text-blue-700 font-medium">{plannedIn}</td>
                              <td className="py-2 px-3 text-blue-700 font-medium">{plannedOut}</td>
                              <td className={`py-2 px-3 font-medium ${isAnomaly ? 'text-red-700' : 'text-green-700'}`}>{actualIn}</td>
                              <td className={`py-2 px-3 font-medium ${isAnomaly ? 'text-red-700' : 'text-green-700'}`}>{actualOut}</td>
                              <td className="py-2 px-3">
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
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-400">데이터가 없습니다.</div>
      )}
    </div>
  );
}
