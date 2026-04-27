"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, Save } from "lucide-react";
import { getSalarySettings, updateSalarySettings } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";
import { PageHeader, Card, Button, Input, SkeletonCard, useToast } from "@/components/ui";

const fmt = new Intl.NumberFormat('ko-KR');

export default function SalaryManagePage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getSalarySettings() || []); } catch (e: any) { toast.error(e.message); }
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
      toast.success("저장되었습니다.");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const filtered = data.filter(e => !search || e.name?.includes(search) || e.phone?.includes(search));

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0 fade-in space-y-4">
      <PageHeader
        eyebrow="급여"
        title="정규직 기본급 관리"
        description="직원별 기본급, 식대, 상여, 수당, 연장수당 시급을 설정합니다."
        actions={
          <Input
            type="text"
            inputSize="sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이름/연락처 검색..."
            className="w-48"
          />
        }
      />

      {loading ? (
        <SkeletonCard className="h-64" />
      ) : (
        <Card padding="none" className="overflow-hidden hover-lift">
          <div className="overflow-x-auto">
            <table className="w-full text-[var(--fs-body)]">
              <thead>
                <tr className="bg-[var(--bg-canvas)] border-b border-[var(--border-1)] text-left">
                  {['이름','부서','입사일','기본급','식대','상여','직책수당','기타수당','연장시급','관리'].map(h => (
                    <th key={h} className={`py-2.5 px-3 text-eyebrow ${['기본급','식대','상여','직책수당','기타수당','연장시급'].includes(h) ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {filtered.map((e: any) => (
                  <tr key={e.employee_id} className="hover:bg-[var(--bg-2)]/40 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-[var(--text-1)]">{e.name}</td>
                    <td className="py-2.5 px-3 text-[var(--text-3)] text-[var(--fs-caption)]">{e.department} {e.team}</td>
                    <td className="py-2.5 px-3 text-[var(--text-3)] text-[var(--fs-caption)]">{e.hire_date || '-'}</td>
                    {editingId === e.employee_id ? (
                      <>
                        {['base_pay','meal_allowance','bonus','position_allowance','other_allowance','overtime_hourly_rate'].map(f => (
                          <td key={f} className="py-1 px-1">
                            <Input
                              type="number"
                              inputSize="sm"
                              value={editForm[f] || ''}
                              onChange={ev => setEditForm({...editForm, [f]: parseInt(ev.target.value) || 0})}
                              className="w-20 text-right"
                            />
                          </td>
                        ))}
                        <td className="py-1 px-2">
                          <div className="flex gap-1">
                            <Button size="xs" variant="primary" onClick={() => handleSave(e.employee_id)} loading={saving}>
                              <Save className="w-3 h-3" />
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>취소</Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-3 text-right tabular text-[var(--text-2)]">{fmt.format(parseFloat(e.base_pay))}</td>
                        <td className="py-2.5 px-3 text-right tabular text-[var(--text-2)]">{fmt.format(parseFloat(e.meal_allowance))}</td>
                        <td className="py-2.5 px-3 text-right tabular text-[var(--text-2)]">{fmt.format(parseFloat(e.bonus))}</td>
                        <td className="py-2.5 px-3 text-right tabular text-[var(--text-2)]">{fmt.format(parseFloat(e.position_allowance))}</td>
                        <td className="py-2.5 px-3 text-right tabular text-[var(--text-2)]">{fmt.format(parseFloat(e.other_allowance))}</td>
                        <td className="py-2.5 px-3 text-right tabular font-medium text-[var(--brand-400)]">{fmt.format(parseFloat(e.overtime_hourly_rate) || 10030)}</td>
                        <td className="py-2.5 px-3">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(e.employee_id);
                              setEditForm({ base_pay: parseFloat(e.base_pay), meal_allowance: parseFloat(e.meal_allowance), bonus: parseFloat(e.bonus), position_allowance: parseFloat(e.position_allowance), other_allowance: parseFloat(e.other_allowance), overtime_hourly_rate: parseFloat(e.overtime_hourly_rate) || 10030 });
                            }}
                          >
                            수정
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
