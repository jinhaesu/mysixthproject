"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, Loader2, Download } from "lucide-react";
import { getPayrollCalc } from "@/lib/api";

const fmt = new Intl.NumberFormat('ko-KR');

export default function PayrollCalcPage() {
  const [yearMonth, setYearMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getPayrollCalc(yearMonth)); } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  const totalGross = data?.results?.reduce((s: number, r: any) => s + (r.gross_pay || 0), 0) || 0;
  const totalOvertime = data?.results?.reduce((s: number, r: any) => s + (r.overtime_pay || 0), 0) || 0;
  const totalDeductions = data?.results?.reduce((s: number, r: any) => s + (r.total_deductions || 0), 0) || 0;
  const totalNet = data?.results?.reduce((s: number, r: any) => s + (r.net_pay || 0), 0) || 0;

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-indigo-600" />
          정규직 급여 계산
        </h1>
        <p className="text-sm text-gray-500 mt-1">확정된 근태 + 기본급 설정을 기반으로 급여를 계산합니다.</p>
      </div>

      <div className="flex gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">계산</button>
      </div>

      {/* Summary */}
      {data?.results?.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{data.results.length}</p>
            <p className="text-xs text-gray-500">인원</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 text-center">
            <p className="text-lg font-bold text-blue-700">{fmt.format(totalGross)}</p>
            <p className="text-xs text-blue-600">총 지급액</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center">
            <p className="text-lg font-bold text-amber-700">{fmt.format(totalOvertime)}</p>
            <p className="text-xs text-amber-600">총 연장수당</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
            <p className="text-lg font-bold text-red-700">{fmt.format(totalDeductions)}</p>
            <p className="text-xs text-red-600">총 공제액</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
            <p className="text-lg font-bold text-green-700">{fmt.format(totalNet)}</p>
            <p className="text-xs text-green-600">총 실지급액</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
      ) : data?.results?.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-3 font-medium text-gray-600">성명</th>
                  <th className="py-2 px-3 font-medium text-gray-600">부서</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">기본급</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">식대</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">상여</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">직책수당</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">근무일</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">연장(h)</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">연장시급</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">연장수당</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">휴일</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">휴일수당</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right font-bold">지급액</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">국민연금</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">건강보험</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">장기요양</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">고용보험</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">소득세</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right">주민세</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right text-red-600">공제계</th>
                  <th className="py-2 px-3 font-medium text-gray-600 text-right font-bold text-green-700">실지급액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.results.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-900">{r.name}</td>
                    <td className="py-2 px-3 text-gray-500">{r.department} {r.team}</td>
                    <td className="py-2 px-3 text-right">{fmt.format(r.base_pay)}</td>
                    <td className="py-2 px-3 text-right">{fmt.format(r.meal_allowance)}</td>
                    <td className="py-2 px-3 text-right">{fmt.format(r.bonus)}</td>
                    <td className="py-2 px-3 text-right">{fmt.format(r.position_allowance)}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{r.work_days}</td>
                    <td className="py-2 px-3 text-right text-amber-700 font-medium">{r.overtime_hours.toFixed(1)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{fmt.format(r.overtime_hourly_rate)}</td>
                    <td className="py-2 px-3 text-right text-amber-700 font-medium">{fmt.format(r.overtime_pay)}</td>
                    <td className="py-2 px-3 text-right text-red-600">{r.holiday_days}</td>
                    <td className="py-2 px-3 text-right text-red-600">{fmt.format(r.holiday_pay)}</td>
                    <td className="py-2 px-3 text-right text-indigo-800 font-bold">{fmt.format(r.gross_pay)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{fmt.format(r.national_pension || 0)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{fmt.format(r.health_insurance || 0)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{fmt.format(r.long_term_care || 0)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{fmt.format(r.employment_insurance || 0)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{fmt.format(r.income_tax || 0)}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{fmt.format(r.local_tax || 0)}</td>
                    <td className="py-2 px-3 text-right text-red-600 font-medium">{fmt.format(r.total_deductions || 0)}</td>
                    <td className="py-2 px-3 text-right text-green-700 font-bold">{fmt.format(r.net_pay || 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200 font-bold text-xs">
                  <td className="py-2 px-3 text-indigo-900" colSpan={9}>합계 ({data.results.length}명)</td>
                  <td className="py-2 px-3 text-right text-amber-800">{fmt.format(totalOvertime)}</td>
                  <td colSpan={2}></td>
                  <td className="py-2 px-3 text-right text-indigo-900">{fmt.format(totalGross)}</td>
                  <td colSpan={6}></td>
                  <td className="py-2 px-3 text-right text-red-700">{fmt.format(totalDeductions)}</td>
                  <td className="py-2 px-3 text-right text-green-800">{fmt.format(totalNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="bg-white rounded-xl border py-16 text-center text-sm text-gray-400">해당 월에 확정된 근태 데이터가 없습니다. 근태 정보 종합 요약에서 먼저 확정해주세요.</div>
      ) : null}
    </div>
  );
}
