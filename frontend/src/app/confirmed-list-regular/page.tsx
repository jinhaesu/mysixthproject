"use client";

import React, { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Table2, Loader2, Edit3, Trash2 } from "lucide-react";
import { getConfirmedList, updateConfirmedRecord, deleteConfirmedRecord, getRegularVacations } from "@/lib/api";

const fmt = new Intl.NumberFormat('ko-KR');

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

// 출근: 30분 올림, 퇴근: 30분 내림
const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
const floor30Min = (min: number) => Math.floor(min / 30) * 30;

function calcFromTimes(clockIn: string, clockOut: string, date: string) {
  if (!clockIn || !clockOut) return { regular: 0, overtime: 0, night: 0, breakH: 0 };
  const [h1, m1] = clockIn.split(':').map(Number);
  const [h2, m2] = clockOut.split(':').map(Number);
  if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0, night: 0, breakH: 0 };

  const startMin = ceil30Min(h1 * 60 + (m1 || 0));
  let endMin = floor30Min(h2 * 60 + (m2 || 0));
  if (endMin <= startMin) endMin += 1440; // 야간조 자정 넘김
  const totalMin = endMin - startMin;
  const totalH = totalMin / 60;

  // Break: 4h+ → 30min, 8h+ → 1h
  let breakH = 0;
  if (totalH >= 8) breakH = 1;
  else if (totalH >= 4) breakH = 0.5;

  const workH = Math.max(totalH - breakH, 0);

  // Night hours (22:00~06:00)
  let nightMin = 0;
  for (let min = startMin; min < endMin; min++) {
    const h = Math.floor(min / 60) % 24;
    if (h >= 22 || h < 6) nightMin++;
  }
  const nightH = Math.round(nightMin / 60 * 10) / 10;
  const dayWork = Math.max(workH - nightH, 0); // 야간 분리

  if (isHolidayOrWeekend(date)) {
    return { regular: 0, overtime: Math.round(dayWork * 10) / 10, night: nightH, breakH };
  }

  const regular = Math.min(dayWork, 8);
  const overtime = Math.max(dayWork - 8, 0);
  return { regular: Math.round(regular * 10) / 10, overtime: Math.round(overtime * 10) / 10, night: nightH, breakH };
}

const _cache: Record<string, { data: any; vac: any; time: number }> = {};
const CACHE_TTL = 10 * 60 * 1000; // 10분

export default function ConfirmedListRegularPage() {
  const [yearMonth, setYearMonth] = usePersistedState("clr_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [nameSearch, setNameSearch] = usePersistedState("clr_nameSearch", "");
  const [deptFilter, setDeptFilter] = usePersistedState("clr_deptFilter", "");
  const [vacationMap, setVacationMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const cacheKey = `clr-${yearMonth}`;
    const cached = _cache[cacheKey];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data); setVacationMap(cached.vac); return;
    }
    setLoading(true);
    try {
      const d = await getConfirmedList(yearMonth, '정규직');
      setData(d || []);
      // Load approved vacations
      try {
        const vacations = await getRegularVacations({ status: 'approved' });
        const map: Record<string, string> = {};
        for (const v of (vacations || [])) {
          const start = new Date(v.start_date + 'T00:00:00+09:00');
          const end = new Date(v.end_date + 'T00:00:00+09:00');
          for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            map[`${v.employee_name}|${dateStr}`] = v.type || '연차';
          }
        }
        setVacationMap(map);
        _cache[cacheKey] = { data: d || [], vac: map, time: Date.now() };
      } catch {}
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editingId) return;
    try { await updateConfirmedRecord(editingId, editForm); setEditingId(null); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Table2 className="w-6 h-6 text-indigo-600" />
          정규직 근태 정보 확정 리스트
        </h1>
        <p className="text-sm text-gray-500 mt-1">확정된 근태 정보를 확인하고 최종 수정합니다.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">부서</label>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
            <option value="생산 야간">생산 야간</option>
            <option value="물류 야간">물류 야간</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">이름 검색</label>
          <input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)} placeholder="이름"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28" />
        </div>
        <button onClick={() => { delete _cache[`clr-${yearMonth}`]; load(); }} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">조회</button>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border py-16 text-center text-sm text-gray-400">확정된 데이터가 없습니다.</div>
      ) : (() => {
        const filtered = data.filter((e: any) =>
          (!nameSearch || (e.name || '').includes(nameSearch)) &&
          (!deptFilter || (e.department || '').includes(deptFilter))
        );
        const totals = filtered.reduce((acc: any, e: any) => {
          acc.regular += e.regular_hours || 0;
          acc.overtime += e.overtime_hours || 0;
          acc.night += e.night_hours || 0;
          return acc;
        }, { regular: 0, overtime: 0, night: 0 });
        const vacCount = Object.entries(vacationMap)
          .filter(([k]) => k.includes(yearMonth) && filtered.some((e: any) => e.name === k.split('|')[0]))
          .reduce((sum, [, vType]) => sum + (typeof vType === 'string' && vType.includes('반차') ? 0.5 : 1), 0);
        return (
        <>
          {/* Stats Board */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
              <p className="text-xs text-gray-500 mt-1">총 근무자</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{totals.regular.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">기본시간(h)</p>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{totals.overtime.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">연장시간(h)</p>
            </div>
            <div className="bg-white rounded-xl border border-purple-200 p-4 text-center">
              <p className="text-2xl font-bold text-purple-700">{totals.night.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">야간시간(h)</p>
            </div>
            <div className="bg-white rounded-xl border border-violet-200 p-4 text-center">
              <p className="text-2xl font-bold text-violet-700">{vacCount % 1 === 0 ? vacCount : vacCount.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">휴가 사용(일)</p>
            </div>
          </div>

          {/* Summary Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-4 font-medium text-gray-600">이름</th>
                  <th className="py-2 px-4 font-medium text-gray-600">연락처</th>
                  <th className="py-2 px-4 font-medium text-gray-600 text-right">근무일</th>
                  <th className="py-2 px-4 font-medium text-gray-600 text-right">기본(h)</th>
                  <th className="py-2 px-4 font-medium text-gray-600 text-right">연장(h)</th>
                  <th className="py-2 px-4 font-medium text-gray-600 text-right">야간(h)</th>
                  <th className="py-2 px-4 font-medium text-gray-600 text-right">휴게(h)</th>
                  <th className="py-2 px-4 font-medium text-gray-600 text-right">휴일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp: any) => {
                  const isExpanded = expandedEmp === emp.name;
                  return (
                    <React.Fragment key={emp.name}>
                      <tr className={`hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${isExpanded ? 'bg-indigo-50/50' : ''}`} onClick={() => setExpandedEmp(isExpanded ? null : emp.name)}>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{emp.name}{emp.department && <span className="ml-1 text-[10px] text-gray-500">{emp.department}</span>}</td>
                        <td className="py-2.5 px-4 text-gray-600">{emp.phone}</td>
                        <td className="py-2.5 px-4 text-right">{emp.days}</td>
                        <td className="py-2.5 px-4 text-right text-blue-700">
                          {(() => {
                            const ym = yearMonth;
                            const vacDays = Object.entries(vacationMap).filter(([k]) => k.startsWith(`${emp.name}|${ym}`));
                            const fullVac = vacDays.filter(([,t]) => t === '연차').length;
                            const halfVac = vacDays.filter(([,t]) => t?.includes('반차')).length;
                            const vacH = fullVac * 8 + halfVac * 4;
                            const total = emp.regular_hours + vacH;
                            if (vacH > 0) return <>{total.toFixed(1)} <span className="text-[9px] text-red-600 font-medium">(휴가{vacH}h 포함)</span></>;
                            return <>{emp.regular_hours.toFixed(1)}</>;
                          })()}
                        </td>
                        <td className="py-2.5 px-4 text-right text-amber-700">{emp.overtime_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-purple-700">{emp.night_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-gray-500">{emp.break_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-red-600">{emp.holiday_days}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="bg-indigo-50/30 border-b border-indigo-200">
                              <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-200">
                                <span className="text-xs font-semibold text-indigo-800">{emp.name} 일별 상세</span>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50/80 text-left">
                                    <th className="py-1.5 px-3">날짜</th>
                                    <th className="py-1.5 px-3">출근</th>
                                    <th className="py-1.5 px-3">퇴근</th>
                                    <th className="py-1.5 px-3">기준</th>
                                    <th className="py-1.5 px-3 text-right">기본</th>
                                    <th className="py-1.5 px-3 text-right">연장</th>
                                    <th className="py-1.5 px-3 text-right">야간</th>
                                    <th className="py-1.5 px-3 text-right">휴게</th>
                                    <th className="py-1.5 px-3">관리</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {/* Merge records + vacation-only days */}
                                  {(() => {
                                    const recordDates = new Set(emp.records.map((r: any) => r.date));
                                    const ym = yearMonth;
                                    const vacOnlyRows = Object.entries(vacationMap)
                                      .filter(([k]) => k.startsWith(`${emp.name}|${ym}`))
                                      .map(([k, t]) => ({ date: k.split('|')[1], type: t }))
                                      .filter(v => !recordDates.has(v.date));
                                    const allRows = [
                                      ...emp.records.map((r: any) => ({ ...r, isVacOnly: false })),
                                      ...vacOnlyRows.map(v => ({ id: `vac-${v.date}`, date: v.date, isVacOnly: true, vacType: v.type })),
                                    ].sort((a: any, b: any) => a.date.localeCompare(b.date));
                                    return allRows;
                                  })().map((r: any) => {
                                    if (r.isVacOnly) {
                                      return (
                                        <tr key={r.id} className="bg-violet-50/50">
                                          <td className="py-1.5 px-3">
                                            {r.date}
                                            <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700">
                                              {r.vacType}{r.vacType === '오전반차' ? ' 09~14시' : r.vacType === '오후반차' ? ' 14~18시' : ''}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-3 text-violet-600">휴가</td>
                                          <td className="py-1.5 px-3 text-violet-600">휴가</td>
                                          <td className="py-1.5 px-3"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700">휴가</span></td>
                                          <td className="py-1.5 px-3 text-right text-violet-700">{r.vacType?.includes('반차') ? '4.0' : '8.0'}</td>
                                          <td className="py-1.5 px-3 text-right">0.0</td>
                                          <td className="py-1.5 px-3 text-right">0.0</td>
                                          <td className="py-1.5 px-3 text-right">0.0</td>
                                          <td className="py-1.5 px-3"></td>
                                        </tr>
                                      );
                                    }
                                    const vType = vacationMap[`${emp.name}|${r.date}`];
                                    return (
                                    <tr key={r.id} className={r.source === 'vacation' ? 'bg-violet-50/50' : vType?.includes('반차') ? 'bg-amber-50/50 hover:bg-amber-50' : vType ? 'bg-violet-50/50 hover:bg-violet-50' : 'hover:bg-white/60'}>
                                      <td className="py-1.5 px-3">
                                        {r.date}
                                        {r.source === 'vacation' && <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-medium bg-violet-100 text-violet-700">{r.memo || '연차'}</span>}
                                        {r.source !== 'vacation' && vType && <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-medium ${vType.includes('반차') ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>{vType}</span>}
                                      </td>
                                      <td className="py-1.5 px-3">{editingId === r.id ? <input type="time" value={editForm.confirmed_clock_in} onChange={e => {
                                        const ci = e.target.value; const calc = calcFromTimes(ci, editForm.confirmed_clock_out, r.date);
                                        setEditForm({...editForm, confirmed_clock_in: ci, regular_hours: calc.regular, overtime_hours: calc.overtime, night_hours: calc.night, break_hours: calc.breakH});
                                      }} className="w-20 px-1 py-0.5 border rounded text-xs" /> : r.confirmed_clock_in}</td>
                                      <td className="py-1.5 px-3">{editingId === r.id ? <input type="time" value={editForm.confirmed_clock_out} onChange={e => {
                                        const co = e.target.value; const calc = calcFromTimes(editForm.confirmed_clock_in, co, r.date);
                                        setEditForm({...editForm, confirmed_clock_out: co, regular_hours: calc.regular, overtime_hours: calc.overtime, night_hours: calc.night, break_hours: calc.breakH});
                                      }} className="w-20 px-1 py-0.5 border rounded text-xs" /> : r.confirmed_clock_out}</td>
                                      <td className="py-1.5 px-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.source === 'actual' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{r.source === 'actual' ? '실제' : '계획'}</span></td>
                                      <td className="py-1.5 px-3 text-right">
                                        {editingId === r.id ? <span className="text-xs text-blue-700 font-medium">{editForm.regular_hours}</span> : parseFloat(r.regular_hours).toFixed(1)}
                                        {vType?.includes('반차') && <span className="ml-0.5 text-[9px] text-red-600 font-medium">+반차4h</span>}
                                        {vType === '연차' && <span className="ml-0.5 text-[9px] text-red-600 font-medium">+휴가8h</span>}
                                      </td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-amber-700 font-medium">{editForm.overtime_hours}</span> : parseFloat(r.overtime_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-purple-700 font-medium">{editForm.night_hours}</span> : parseFloat(r.night_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-gray-500">{editForm.break_hours}</span> : parseFloat(r.break_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3">
                                        {editingId === r.id ? (
                                          <div className="flex gap-1">
                                            <button onClick={handleSave} className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px]">저장</button>
                                            <button onClick={() => setEditingId(null)} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">취소</button>
                                          </div>
                                        ) : (
                                          <div className="flex gap-1">
                                            <button onClick={() => { setEditingId(r.id); setEditForm({ confirmed_clock_in: r.confirmed_clock_in, confirmed_clock_out: r.confirmed_clock_out, regular_hours: parseFloat(r.regular_hours), overtime_hours: parseFloat(r.overtime_hours), night_hours: parseFloat(r.night_hours), break_hours: parseFloat(r.break_hours) }); }}
                                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit3 className="w-3 h-3" /></button>
                                            <button onClick={async () => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteConfirmedRecord(r.id); load(); } catch (e: any) { alert(e.message); } }}
                                              className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        );
      })()}
    </div>
  );
}
