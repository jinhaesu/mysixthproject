"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, Loader2, Save } from "lucide-react";
import { getSalarySettings, updateSalarySettings } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";

const fmt = new Intl.NumberFormat('ko-KR');

export default function SalaryManagePage() {
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getSalarySettings() || []); } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const verifyPassword = async (pw: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/verify-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: pw }),
    });
    const body = await res.json();
    return !!body.verified;
  };

  const handleSave = async (empId: number) => {
    setSaving(true);
    try {
      await updateSalarySettings(empId, editForm);
      setEditingId(null);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const filtered = data.filter(e => !search || e.name?.includes(search) || e.phone?.includes(search));

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-indigo-600" />
          정규직 기본급 관리
        </h1>
        <p className="text-sm text-gray-500 mt-1">직원별 기본급, 식대, 상여, 수당, 연장수당 시급을 설정합니다.</p>
      </div>

      <div className="flex gap-3 items-end mb-4">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="이름/연락처 검색..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48" />
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-3 font-medium text-gray-600">이름</th>
                  <th className="py-2 px-3 font-medium text-gray-600">부서</th>
                  <th className="py-2 px-3 font-medium text-gray-600">입사일</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">기본급</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">식대</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">상여</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">직책수당</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">기타수당</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">연장시급</th>
                  <th className="py-2 px-3 font-medium text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((e: any) => (
                  <tr key={e.employee_id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-medium text-gray-900">{e.name}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{e.department} {e.team}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{e.hire_date || '-'}</td>
                    {editingId === e.employee_id ? (
                      <>
                        {['base_pay','meal_allowance','bonus','position_allowance','other_allowance','overtime_hourly_rate'].map(f => (
                          <td key={f} className="py-1 px-1">
                            <input type="number" value={editForm[f] || ''} onChange={ev => setEditForm({...editForm, [f]: parseInt(ev.target.value) || 0})}
                              className="w-20 px-1 py-1 border border-blue-300 rounded text-xs text-right" />
                          </td>
                        ))}
                        <td className="py-1 px-2">
                          <div className="flex gap-1">
                            <button onClick={() => handleSave(e.employee_id)} disabled={saving}
                              className="px-2 py-1 bg-blue-600 text-white rounded text-[10px]"><Save className="w-3 h-3" /></button>
                            <button onClick={() => setEditingId(null)} className="px-2 py-1 bg-gray-100 rounded text-[10px]">취소</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-3 text-right text-gray-700">{fmt.format(parseFloat(e.base_pay))}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{fmt.format(parseFloat(e.meal_allowance))}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{fmt.format(parseFloat(e.bonus))}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{fmt.format(parseFloat(e.position_allowance))}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{fmt.format(parseFloat(e.other_allowance))}</td>
                        <td className="py-2.5 px-3 text-right text-indigo-700 font-medium">{fmt.format(parseFloat(e.overtime_hourly_rate) || 10030)}</td>
                        <td className="py-2.5 px-3">
                          <button onClick={() => { setEditingId(e.employee_id); setEditForm({ base_pay: parseFloat(e.base_pay), meal_allowance: parseFloat(e.meal_allowance), bonus: parseFloat(e.bonus), position_allowance: parseFloat(e.position_allowance), other_allowance: parseFloat(e.other_allowance), overtime_hourly_rate: parseFloat(e.overtime_hourly_rate) || 10030 }); }}
                            className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100">수정</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
