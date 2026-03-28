"use client";

import { useState, useCallback } from "react";
import { Calculator, Loader2, Download } from "lucide-react";
import { getSettlement } from "@/lib/api";

const fmt = new Intl.NumberFormat('ko-KR');

export default function SettlementDispatchPage() {
  const [yearMonth, setYearMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(11000);
  const [feeRate, setFeeRate] = useState(10); // 파견 수수료 요율 %
  const [mealDeduction, setMealDeduction] = useState(0); // 식대 공제
  const [division, setDivision] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getSettlement(yearMonth, 'dispatch')); } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  const calcEmployee = (r: any) => {
    const basePay = Math.round(r.regular_hours * hourlyRate);
    const overtimePay = Math.round(r.overtime_hours * hourlyRate * 1.5);
    const weeklyHolidayPay = Math.round(r.weekly_holiday_hours * hourlyRate);
    const grossPay = basePay + overtimePay + weeklyHolidayPay;
    const meal = mealDeduction * r.work_days;
    const netBeforeInsurance = grossPay - meal;
    // Insurance (employer pays to dispatch company)
    const nationalPension = Math.round(netBeforeInsurance * 0.0475);
    const healthInsurance = Math.round(netBeforeInsurance * 0.03595);
    const industrialAccident = Math.round(netBeforeInsurance * 0.01436);
    const employmentInsurance = Math.round(netBeforeInsurance * 0.0115);
    const longTermCare = Math.round(healthInsurance * 0.1314);
    const totalInsurance = nationalPension + healthInsurance + industrialAccident + employmentInsurance + longTermCare;
    const subtotal = netBeforeInsurance + totalInsurance;
    const dispatchFee = Math.round(subtotal * feeRate / 100);
    const beforeVat = subtotal + dispatchFee;
    const vat = Math.round(beforeVat * 0.1);
    const totalAmount = beforeVat + vat;
    return { basePay, overtimePay, weeklyHolidayPay, grossPay, meal, netBeforeInsurance, nationalPension, healthInsurance, industrialAccident, employmentInsurance, longTermCare, totalInsurance, dispatchFee, beforeVat, vat, totalAmount };
  };

  const results = data?.results || [];
  const calculated = results.map((r: any) => ({ ...r, ...calcEmployee(r) }));
  const totals = calculated.reduce((acc: any, r: any) => {
    Object.keys(r).forEach(k => { if (typeof r[k] === 'number' && k !== 'hourlyRate') acc[k] = (acc[k] || 0) + r[k]; });
    return acc;
  }, {});

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-blue-600" />
          파견 정산관리
        </h1>
        <p className="text-sm text-gray-500 mt-1">확정된 근태 기반으로 파견 정산액을 계산합니다.</p>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">연월</label>
            <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">구분</label>
            <select value={division} onChange={e => setDivision(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="all">전체</option>
              <option value="production">생산</option>
              <option value="logistics">물류</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">시간당 급여 (원)</label>
            <input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseInt(e.target.value) || 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">파견 수수료 (%)</label>
            <input type="number" value={feeRate} onChange={e => setFeeRate(parseFloat(e.target.value) || 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-20" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">식대 공제 (1일/원)</label>
            <input type="number" value={mealDeduction} onChange={e => setMealDeduction(parseInt(e.target.value) || 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28" />
          </div>
          <button onClick={load} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">조회</button>
        </div>
      </div>

      {/* Summary */}
      {calculated.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold">{calculated.length}</p><p className="text-xs text-gray-500">인원</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center"><p className="text-lg font-bold text-blue-700">{fmt.format(totals.grossPay || 0)}</p><p className="text-xs text-blue-600">급여 합계</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center"><p className="text-lg font-bold text-amber-700">{fmt.format(totals.totalInsurance || 0)}</p><p className="text-xs text-amber-600">보험료 합계</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center"><p className="text-lg font-bold text-green-700">{fmt.format(totals.totalAmount || 0)}</p><p className="text-xs text-green-600">최종 지급액 (VAT포함)</p></div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>
      ) : calculated.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-2 font-medium text-gray-600">이름</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">근무일</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">기본(h)</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">연장(h)</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">주휴(h)</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">기본급</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">연장수당</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">주휴수당</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">급여계</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">식대공제</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">보험료</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">수수료</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right">VAT</th>
                  <th className="py-2 px-2 font-medium text-gray-600 text-right font-bold">최종액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calculated.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-2 font-medium text-gray-900">{r.name}</td>
                    <td className="py-2 px-2 text-right">{r.work_days}</td>
                    <td className="py-2 px-2 text-right">{r.regular_hours}</td>
                    <td className="py-2 px-2 text-right text-amber-700">{r.overtime_hours}</td>
                    <td className="py-2 px-2 text-right text-purple-700">{r.weekly_holiday_hours}</td>
                    <td className="py-2 px-2 text-right">{fmt.format(r.basePay)}</td>
                    <td className="py-2 px-2 text-right text-amber-700">{fmt.format(r.overtimePay)}</td>
                    <td className="py-2 px-2 text-right text-purple-700">{fmt.format(r.weeklyHolidayPay)}</td>
                    <td className="py-2 px-2 text-right font-medium">{fmt.format(r.grossPay)}</td>
                    <td className="py-2 px-2 text-right text-red-600">{r.meal > 0 ? `-${fmt.format(r.meal)}` : '-'}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{fmt.format(r.totalInsurance)}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{fmt.format(r.dispatchFee)}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{fmt.format(r.vat)}</td>
                    <td className="py-2 px-2 text-right font-bold text-blue-800">{fmt.format(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold text-[11px]">
                  <td className="py-2 px-2 text-blue-900">합계 ({calculated.length}명)</td>
                  <td className="py-2 px-2 text-right">{totals.work_days}</td>
                  <td className="py-2 px-2 text-right">{(totals.regular_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-2 text-right">{(totals.overtime_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-2 text-right">{totals.weekly_holiday_hours || 0}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.basePay || 0)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.overtimePay || 0)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.weeklyHolidayPay || 0)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.grossPay || 0)}</td>
                  <td className="py-2 px-2 text-right text-red-600">{totals.meal > 0 ? `-${fmt.format(totals.meal)}` : '-'}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.totalInsurance || 0)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.dispatchFee || 0)}</td>
                  <td className="py-2 px-2 text-right">{fmt.format(totals.vat || 0)}</td>
                  <td className="py-2 px-2 text-right text-blue-900">{fmt.format(totals.totalAmount || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="bg-white rounded-xl border py-16 text-center text-sm text-gray-400">확정된 파견 근태 데이터가 없습니다.</div>
      ) : null}
    </div>
  );
}
