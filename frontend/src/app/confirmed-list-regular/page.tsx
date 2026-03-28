"use client";

import { useState, useCallback, useEffect } from "react";
import { Table2, Loader2, Edit3, Check } from "lucide-react";
import { getConfirmedList, updateConfirmedRecord } from "@/lib/api";

const fmt = new Intl.NumberFormat('ko-KR');

export default function ConfirmedListRegularPage() {
  const [yearMonth, setYearMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await getConfirmedList(yearMonth, '정규직'); setData(d || []); } catch (e: any) { alert(e.message); }
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

      <div className="flex gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">조회</button>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border py-16 text-center text-sm text-gray-400">확정된 데이터가 없습니다.</div>
      ) : (
        <>
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
              <tbody className="divide-y divide-gray-100">
                {data.map((emp: any) => (
                  <tr key={emp.name} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedEmp(expandedEmp === emp.name ? null : emp.name)}>
                    <td className="py-2.5 px-4 font-medium text-gray-900">{emp.name}</td>
                    <td className="py-2.5 px-4 text-gray-600">{emp.phone}</td>
                    <td className="py-2.5 px-4 text-right">{emp.days}</td>
                    <td className="py-2.5 px-4 text-right text-blue-700">{emp.regular_hours.toFixed(1)}</td>
                    <td className="py-2.5 px-4 text-right text-amber-700">{emp.overtime_hours.toFixed(1)}</td>
                    <td className="py-2.5 px-4 text-right text-purple-700">{emp.night_hours.toFixed(1)}</td>
                    <td className="py-2.5 px-4 text-right text-gray-500">{emp.break_hours.toFixed(1)}</td>
                    <td className="py-2.5 px-4 text-right text-red-600">{emp.holiday_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Expanded detail */}
          {expandedEmp && (() => {
            const emp = data.find(e => e.name === expandedEmp);
            if (!emp) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-indigo-50 border-b">
                  <h3 className="text-sm font-semibold text-indigo-800">{emp.name} 일별 상세</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="py-2 px-3">날짜</th>
                        <th className="py-2 px-3">출근</th>
                        <th className="py-2 px-3">퇴근</th>
                        <th className="py-2 px-3">기준</th>
                        <th className="py-2 px-3 text-right">기본(h)</th>
                        <th className="py-2 px-3 text-right">연장(h)</th>
                        <th className="py-2 px-3 text-right">야간(h)</th>
                        <th className="py-2 px-3 text-right">휴게(h)</th>
                        <th className="py-2 px-3">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {emp.records.map((r: any) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="py-2 px-3">{r.date}</td>
                          <td className="py-2 px-3">{editingId === r.id ? <input type="time" value={editForm.confirmed_clock_in} onChange={e => setEditForm({...editForm, confirmed_clock_in: e.target.value})} className="w-20 px-1 py-0.5 border rounded text-xs" /> : r.confirmed_clock_in}</td>
                          <td className="py-2 px-3">{editingId === r.id ? <input type="time" value={editForm.confirmed_clock_out} onChange={e => setEditForm({...editForm, confirmed_clock_out: e.target.value})} className="w-20 px-1 py-0.5 border rounded text-xs" /> : r.confirmed_clock_out}</td>
                          <td className="py-2 px-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.source === 'actual' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{r.source === 'actual' ? '실제' : '계획'}</span></td>
                          <td className="py-2 px-3 text-right">{editingId === r.id ? <input type="number" step="0.5" value={editForm.regular_hours} onChange={e => setEditForm({...editForm, regular_hours: parseFloat(e.target.value)})} className="w-14 px-1 py-0.5 border rounded text-xs text-right" /> : parseFloat(r.regular_hours).toFixed(1)}</td>
                          <td className="py-2 px-3 text-right">{editingId === r.id ? <input type="number" step="0.5" value={editForm.overtime_hours} onChange={e => setEditForm({...editForm, overtime_hours: parseFloat(e.target.value)})} className="w-14 px-1 py-0.5 border rounded text-xs text-right" /> : parseFloat(r.overtime_hours).toFixed(1)}</td>
                          <td className="py-2 px-3 text-right">{parseFloat(r.night_hours).toFixed(1)}</td>
                          <td className="py-2 px-3 text-right">{parseFloat(r.break_hours).toFixed(1)}</td>
                          <td className="py-2 px-3">
                            {editingId === r.id ? (
                              <div className="flex gap-1">
                                <button onClick={handleSave} className="px-1.5 py-0.5 bg-blue-600 text-white rounded text-[10px]">저장</button>
                                <button onClick={() => setEditingId(null)} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">취소</button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingId(r.id); setEditForm({ confirmed_clock_in: r.confirmed_clock_in, confirmed_clock_out: r.confirmed_clock_out, regular_hours: parseFloat(r.regular_hours), overtime_hours: parseFloat(r.overtime_hours), night_hours: parseFloat(r.night_hours), break_hours: parseFloat(r.break_hours) }); }}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit3 className="w-3 h-3" /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
