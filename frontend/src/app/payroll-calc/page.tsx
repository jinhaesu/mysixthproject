"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Loader2, Download } from "lucide-react";
import { getPayrollCalc } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";

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
    const header = ['성명','부서','은행','계좌번호','주민번호','기본급','식대','상여','직책수당','근무일','연장h','연장수당','휴일일','휴일수당','지급액','국민연금','건강보험','장기요양','고용보험','소득세','주민세','공제계','실지급액'];
    const rows = results.map((r: any) => [r.name, `${r.department} ${r.team}`, r.bank_name, r.bank_account, r.id_number, r.base_pay, r.meal_allowance, r.bonus, r.position_allowance, r.work_days, r.overtime_hours, r.overtime_pay, r.holiday_days, r.holiday_pay, r.gross_pay, r.national_pension, r.health_insurance, r.long_term_care, r.employment_insurance, r.income_tax, r.local_tax, r.total_deductions, r.net_pay]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `정규직급여_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-indigo-600" />
          정규직 급여 계산
        </h1>
        <p className="text-sm text-gray-500 mt-1">확정 근태 + 기본급 설정 기반 급여 자동 계산</p>
        <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-800">
          <b>연장/휴일 수당 계산 기준:</b> 시급 × 1.5배 | 연장/휴일 시간은 <b>30분 단위 내림</b> 적용 (0.1~0.4h → 0h, 0.5h = 30분) | 토/일/공휴일 근무 → 전량 연장
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연장/휴일 시급 (원)</label>
          <input type="number" value={overtimeRate} onChange={e => setOvertimeRate(parseInt(e.target.value) || 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28" />
        </div>
        <div className="text-xs text-gray-500 py-2">× 1.5배 = {fmt.format(Math.round(overtimeRate * 1.5))}원/h</div>
        {results.length > 0 && (
          <button onClick={handleExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 ml-auto">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold">{results.length}</p><p className="text-xs text-gray-500">인원</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center"><p className="text-lg font-bold text-blue-700">{fmt.format(sum('gross_pay'))}</p><p className="text-xs text-blue-600">총 지급액</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center"><p className="text-lg font-bold text-amber-700">{fmt.format(sum('overtime_pay'))}</p><p className="text-xs text-amber-600">총 연장수당</p></div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center"><p className="text-lg font-bold text-red-700">{fmt.format(sum('total_deductions'))}</p><p className="text-xs text-red-600">총 공제액</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center"><p className="text-lg font-bold text-green-700">{fmt.format(sum('net_pay'))}</p><p className="text-xs text-green-600">총 실지급액</p></div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : results.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-2">성명</th>
                  <th className="py-2 px-2">부서</th>
                  <th className="py-2 px-2">은행</th>
                  <th className="py-2 px-2">계좌번호</th>
                  <th className="py-2 px-2">주민번호</th>
                  <th className="py-2 px-2 text-right">기본급</th>
                  <th className="py-2 px-2 text-right">식대</th>
                  <th className="py-2 px-2 text-right">상여</th>
                  <th className="py-2 px-2 text-right">일</th>
                  <th className="py-2 px-2 text-right">연장h</th>
                  <th className="py-2 px-2 text-right">연장수당</th>
                  <th className="py-2 px-2 text-right">휴일</th>
                  <th className="py-2 px-2 text-right">휴일수당</th>
                  <th className="py-2 px-2 text-right font-bold">지급액</th>
                  <th className="py-2 px-2 text-right">국민연금<br/><span className="text-[8px] text-gray-400">4.5%</span></th>
                  <th className="py-2 px-2 text-right">건강보험<br/><span className="text-[8px] text-gray-400">3.545%</span></th>
                  <th className="py-2 px-2 text-right">장기요양<br/><span className="text-[8px] text-gray-400">12.81%</span></th>
                  <th className="py-2 px-2 text-right">고용보험<br/><span className="text-[8px] text-gray-400">0.9%</span></th>
                  <th className="py-2 px-2 text-right">소득세</th>
                  <th className="py-2 px-2 text-right">주민세</th>
                  <th className="py-2 px-2 text-right text-red-600">공제계</th>
                  <th className="py-2 px-2 text-right font-bold text-green-700">실지급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-1.5 px-2 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                    <td className="py-1.5 px-2 text-gray-500">{r.department} {r.team}</td>
                    <td className="py-1.5 px-2 text-gray-500 text-[9px]">{r.bank_name || '-'}</td>
                    <td className="py-1.5 px-2 text-gray-500 font-mono text-[9px]">{r.bank_account || '-'}</td>
                    <td className="py-1.5 px-2 text-gray-500 font-mono text-[9px]">{r.id_number || '-'}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.base_pay)}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.meal_allowance)}</td>
                    <td className="py-1.5 px-2 text-right">{fmt.format(r.bonus)}</td>
                    <td className="py-1.5 px-2 text-right">{r.work_days}</td>
                    <td className="py-1.5 px-2 text-right text-amber-700">{(r.overtime_hours || 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right text-amber-700">{fmt.format(r.overtime_pay)}</td>
                    <td className="py-1.5 px-2 text-right">{r.holiday_days}</td>
                    <td className="py-1.5 px-2 text-right text-red-600">{fmt.format(r.holiday_pay)}</td>
                    <td className="py-1.5 px-2 text-right font-medium">{fmt.format(r.gross_pay)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{fmt.format(r.national_pension)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{fmt.format(r.health_insurance)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{fmt.format(r.long_term_care)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{fmt.format(r.employment_insurance)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{fmt.format(r.income_tax)}</td>
                    <td className="py-1.5 px-2 text-right text-gray-500">{fmt.format(r.local_tax)}</td>
                    <td className="py-1.5 px-2 text-right text-red-600 font-medium">{fmt.format(r.total_deductions)}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-green-700">{fmt.format(r.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200 font-bold text-[10px]">
                  <td className="py-2 px-2 text-indigo-900" colSpan={8}>합계 ({results.length}명)</td>
                  <td className="py-2 px-2 text-right">{sum('work_days')}</td>
                  <td className="py-2 px-2 text-right">{sum('overtime_hours').toFixed(1)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('overtime_pay'))}</td>
                  <td className="py-2 px-2 text-right">{sum('holiday_days')}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('holiday_pay'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('gross_pay'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('national_pension'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('health_insurance'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('long_term_care'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('employment_insurance'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('income_tax'))}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(sum('local_tax'))}</td>
                  <td className="py-2 px-2 text-right text-red-700">{fmt.format(sum('total_deductions'))}</td>
                  <td className="py-2 px-2 text-right text-green-800">{fmt.format(sum('net_pay'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="bg-white rounded-xl border py-16 text-center text-sm text-gray-400">해당 월에 확정된 근태 데이터가 없습니다.</div>
      ) : null}
    </div>
  );
}
