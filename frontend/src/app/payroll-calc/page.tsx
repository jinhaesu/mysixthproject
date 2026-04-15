"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Loader2, Download } from "lucide-react";
import { getPayrollCalc } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard from "@/components/charts/ChartCard";
import { getColor } from "@/lib/chartColors";

const fmt = new Intl.NumberFormat('ko-KR');

export default function PayrollCalcPage() {
  const [authorized, setAuthorized] = useState(false);
  const [yearMonth, setYearMonth] = usePersistedState("pc_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [overtimeRate, setOvertimeRate] = useState(10030);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getPayrollCalc(yearMonth)); } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

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

  // 30분 단위 내림: 0.1~0.4 → 0, 0.5~0.9 → 0.5
  const floor30 = (h: number) => Math.floor(h * 2) / 2;

  // Recalculate with custom overtime rate
  const results = (data?.results || []).map((r: any) => {
    const otHours = floor30(r.overtime_hours || 0);
    const holHours = floor30(r.holiday_hours || 0);
    const nightHours = floor30(r.night_hours || 0);
    const otPay = Math.round(otHours * overtimeRate * 1.5);
    const holPay = Math.round(holHours * overtimeRate * 1.5);
    const nightPay = Math.round(nightHours * overtimeRate * 1.5); // 야간시간은 기본에서 분리됨, 1.5배
    const gross = (r.base_pay || 0) + (r.meal_allowance || 0) + (r.bonus || 0) + (r.position_allowance || 0) + (r.other_allowance || 0) + otPay + holPay + nightPay;
    const taxBase = (r.base_pay || 0) + (r.meal_allowance || 0);
    const np = Math.round(taxBase * 0.045);
    const hi = Math.round(taxBase * 0.03545);
    const ltc = Math.round(hi * 0.1281);
    const ei = Math.round(taxBase * 0.009);
    const it = Math.round(gross * 0.03);
    const lt = Math.round(it * 0.1);
    const ded = np + hi + ltc + ei + it + lt;
    const net = gross - ded;
    return { ...r, overtime_pay: otPay, holiday_pay: holPay, night_pay: nightPay, gross_pay: gross, national_pension: np, health_insurance: hi, long_term_care: ltc, employment_insurance: ei, income_tax: it, local_tax: lt, total_deductions: ded, net_pay: net };
  });

  const sum = (key: string) => results.reduce((s: number, r: any) => s + (r[key] || 0), 0);

  const handleExcel = () => {
    const header = ['성명','부서','은행','계좌번호','주민번호','기본급','식대','상여','직책수당','기타수당','근무일','연장h','연장수당','휴일h','휴일수당','지급액','국민연금','건강보험','장기요양','고용보험','소득세','주민세','공제계','실지급액'];
    const rows = results.map((r: any) => [r.name, `${r.department} ${r.team}`, r.bank_name, r.bank_account, r.id_number, r.base_pay, r.meal_allowance, r.bonus, r.position_allowance, r.other_allowance, r.work_days, r.overtime_hours, r.overtime_pay, (r.holiday_hours || 0).toFixed(1), r.holiday_pay, r.gross_pay, r.national_pension, r.health_insurance, r.long_term_care, r.employment_insurance, r.income_tax, r.local_tax, r.total_deductions, r.net_pay]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `정규직급여_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
          <Calculator className="w-6 h-6 text-[#7070FF]" />
          정규직 급여 계산
        </h1>
        <p className="text-sm text-[#8A8F98] mt-1">확정 근태 + 기본급 설정 기반 급여 자동 계산</p>
        <div className="mt-2 bg-[#5E6AD2]/10 border border-[#5E6AD2]/30 rounded-lg px-3 py-2 text-xs text-indigo-800">
          <b>수당 계산:</b> 연장/휴일/야간 각 <b>시급 × 1.5배</b> | <b>30분 단위 내림</b> (0.1~0.4h → 0, 0.5h = 30분) | 토/일/공휴일 근무 = <b>휴일(h) 별도 집계</b> (연장 제외) | 22:00~06:00 = 야간(h) 별도 | 연장 2h 초과 시 저녁식사 30분 휴게 자동 추가
        </div>
      </div>

      <div className="bg-[#0F1011] rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">연장/휴일 시급 (원)</label>
          <input type="number" value={overtimeRate} onChange={e => setOvertimeRate(parseInt(e.target.value) || 0)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm w-28" />
        </div>
        <div className="text-xs text-[#8A8F98] py-2">× 1.5배 = {fmt.format(Math.round(overtimeRate * 1.5))}원/h</div>
        {results.length > 0 && (
          <button onClick={handleExcel} className="px-4 py-2 bg-[#27A644] text-white rounded-lg text-sm font-medium flex items-center gap-1 ml-auto">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="bg-[#0F1011] rounded-xl border p-3 text-center"><p className="text-xl font-bold">{results.length}</p><p className="text-xs text-[#8A8F98]">인원</p></div>
          <div className="bg-[#4EA7FC]/10 rounded-xl border border-[#5E6AD2]/30 p-3 text-center"><p className="text-lg font-bold text-[#828FFF]">{fmt.format(sum('gross_pay'))}</p><p className="text-xs text-[#7070FF]">총 지급액</p></div>
          <div className="bg-[#F0BF00]/10 rounded-xl border border-[#F0BF00]/30 p-3 text-center"><p className="text-lg font-bold text-[#F0BF00]">{fmt.format(sum('overtime_pay'))}</p><p className="text-xs text-[#F0BF00]">총 연장수당</p></div>
          <div className="bg-[#EB5757]/10 rounded-xl border border-[#EB5757]/30 p-3 text-center"><p className="text-lg font-bold text-[#EB5757]">{fmt.format(sum('total_deductions'))}</p><p className="text-xs text-[#EB5757]">총 공제액</p></div>
          <div className="bg-[#27A644]/10 rounded-xl border border-[#27A644]/30 p-3 text-center"><p className="text-lg font-bold text-[#27A644]">{fmt.format(sum('net_pay'))}</p><p className="text-xs text-[#27A644]">총 실지급액</p></div>
        </div>
      )}

      {results.length > 0 && (() => {
        const deductionData = [
          { name: '국민연금', value: sum('national_pension') },
          { name: '건강보험', value: sum('health_insurance') },
          { name: '장기요양', value: sum('long_term_care') },
          { name: '고용보험', value: sum('employment_insurance') },
          { name: '소득세', value: sum('income_tax') },
          { name: '주민세', value: sum('local_tax') },
        ].filter(d => d.value > 0);
        return (
          <div className="mb-4">
            <ChartCard title="공제 항목 구성" subtitle="국민연금, 건강보험, 장기요양, 고용보험, 소득세, 주민세" height={260}>
              <PieChart>
                <Pie data={deductionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="75%" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {deductionData.map((_entry, index) => (
                    <Cell key={index} fill={getColor(index)} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | string | Array<number | string> | undefined) => [`${fmt.format(Number(value ?? 0))}원`, '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartCard>
          </div>
        );
      })()}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-[#7070FF] mx-auto" /></div>
      ) : results.length > 0 ? (
        <div className="bg-[#0F1011] rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-[#08090A] text-left">
                  <th className="py-2 px-2">성명</th>
                  <th className="py-2 px-2">부서</th>
                  <th className="py-2 px-2">은행</th>
                  <th className="py-2 px-2">계좌번호</th>
                  <th className="py-2 px-2">주민번호</th>
                  <th className="py-2 px-2 text-right">기본급</th>
                  <th className="py-2 px-2 text-right">식대</th>
                  <th className="py-2 px-2 text-right">상여</th>
                  <th className="py-2 px-2 text-right">직책수당</th>
                  <th className="py-2 px-2 text-right">기타수당</th>
                  <th className="py-2 px-2 text-right">일</th>
                  <th className="py-2 px-2 text-right">연장h</th>
                  <th className="py-2 px-2 text-right">연장수당</th>
                  <th className="py-2 px-2 text-right">휴일h</th>
                  <th className="py-2 px-2 text-right">휴일수당</th>
                  <th className="py-2 px-2 text-right font-bold">지급액</th>
                  <th className="py-2 px-2 text-right">국민연금<br/><span className="text-[8px] text-[#62666D]">4.5%</span></th>
                  <th className="py-2 px-2 text-right">건강보험<br/><span className="text-[8px] text-[#62666D]">3.545%</span></th>
                  <th className="py-2 px-2 text-right">장기요양<br/><span className="text-[8px] text-[#62666D]">12.81%</span></th>
                  <th className="py-2 px-2 text-right">고용보험<br/><span className="text-[8px] text-[#62666D]">0.9%</span></th>
                  <th className="py-2 px-2 text-right">소득세</th>
                  <th className="py-2 px-2 text-right">주민세</th>
                  <th className="py-2 px-2 text-right text-[#EB5757]">공제계</th>
                  <th className="py-2 px-2 text-right font-bold text-[#27A644]">실지급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23252A]">
                {results.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-[#141516]/5">
                    <td className="py-1.5 px-2 font-medium text-[#F7F8F8] whitespace-nowrap">{r.name}</td>
                    <td className="py-1.5 px-2 text-[#8A8F98]">{r.department} {r.team}</td>
                    <td className="py-1.5 px-2 text-[#8A8F98] text-[9px]">{r.bank_name || '-'}</td>
                    <td className="py-1.5 px-2 text-[#8A8F98] font-mono text-[9px]">{r.bank_account || '-'}</td>
                    <td className="py-1.5 px-2 text-[#8A8F98] font-mono text-[9px]">{r.id_number || '-'}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.base_pay)}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.meal_allowance)}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.bonus)}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.position_allowance || 0)}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.other_allowance || 0)}</td>
                    <td className="py-1.5 px-2 text-right">{r.work_days}</td>
                    <td className="py-1.5 px-2 text-right text-[#F0BF00]">{(r.overtime_hours || 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right text-[#F0BF00]">{fmt.format(r.overtime_pay)}</td>
                    <td className="py-1.5 px-2 text-right text-[#EB5757]">{(r.holiday_hours || 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right text-[#EB5757]">{fmt.format(r.holiday_pay)}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{fmt.format(r.gross_pay)}</td>
                    <td className="py-1.5 px-2 text-right text-[#8A8F98]">{fmt.format(r.national_pension)}</td>
                    <td className="py-1.5 px-2 text-right text-[#8A8F98]">{fmt.format(r.health_insurance)}</td>
                    <td className="py-1.5 px-2 text-right text-[#8A8F98]">{fmt.format(r.long_term_care)}</td>
                    <td className="py-1.5 px-2 text-right text-[#8A8F98]">{fmt.format(r.employment_insurance)}</td>
                    <td className="py-1.5 px-2 text-right text-[#8A8F98]">{fmt.format(r.income_tax)}</td>
                    <td className="py-1.5 px-2 text-right text-[#8A8F98]">{fmt.format(r.local_tax)}</td>
                    <td className="py-1.5 px-2 text-right text-[#EB5757] font-medium">{fmt.format(r.total_deductions)}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-[#27A644]">{fmt.format(r.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#5E6AD2]/10 border-t-2 border-[#5E6AD2]/30 font-bold text-[10px]">
                  <td className="py-2 px-2 text-indigo-900" colSpan={10}>합계 ({results.length}명)</td>
                  <td className="py-2 px-2 text-right">{sum('work_days')}</td>
                  <td className="py-2 px-2 text-right">{sum('overtime_hours').toFixed(1)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('overtime_pay'))}</td>
                  <td className="py-2 px-2 text-right">{sum('holiday_hours').toFixed(1)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('holiday_pay'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('gross_pay'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('national_pension'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('health_insurance'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('long_term_care'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('employment_insurance'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('income_tax'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('local_tax'))}</td>
                  <td className="py-2 px-2 text-right text-[#EB5757]">{fmt.format(sum('total_deductions'))}</td>
                  <td className="py-2 px-2 text-right text-[#27A644]">{fmt.format(sum('net_pay'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="bg-[#0F1011] rounded-xl border py-16 text-center text-sm text-[#62666D]">해당 월에 확정된 근태 데이터가 없습니다.</div>
      ) : null}
    </div>
  );
}
