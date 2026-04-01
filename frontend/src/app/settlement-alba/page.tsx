"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Loader2, Download } from "lucide-react";
import { getSettlement } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";

const fmt = new Intl.NumberFormat('ko-KR');

export default function SettlementAlbaPage() {
  const [authorized, setAuthorized] = useState(false);
  const [yearMonth, setYearMonth] = usePersistedState("sa_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(11000);
  const [mealDeductions, setMealDeductions] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getSettlement(yearMonth, 'alba');
      setData(d);
      if (d?.results) {
        const meals: Record<number, number> = {};
        d.results.forEach((_: any, i: number) => { meals[i] = 0; });
        setMealDeductions(meals);
      }
    } catch (e: any) { alert(e.message); }
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

  const calcEmp = (r: any, idx: number) => {
    const floor30 = (h: number) => Math.floor(h * 2) / 2;
    const otHours = floor30(r.overtime_hours);
    const holHours = floor30(r.holiday_pay_hours || 0);
    const nightHours = floor30(r.night_hours || 0);
    const basePay = Math.round(r.regular_hours * hourlyRate);
    const overtimePay = Math.round(otHours * hourlyRate * 1.5);
    const holidayPay = Math.round(holHours * hourlyRate * 1.5);
    const nightPay = Math.round(nightHours * hourlyRate * 1.5);
    const whPay = Math.round(r.weekly_holiday_hours * hourlyRate);
    const grossPay = basePay + overtimePay + holidayPay + nightPay + whPay;
    const meal = mealDeductions[idx] || 0;
    const netBeforeTax = grossPay - meal;
    const incomeTax = Math.round(netBeforeTax * 0.033);
    const localTax = Math.round(netBeforeTax * 0.0033);
    const netPay = netBeforeTax - incomeTax - localTax;
    return { basePay, overtimePay, whPay, grossPay, meal, netBeforeTax, incomeTax, localTax, netPay };
  };

  const results = data?.results || [];
  const rows = results.map((r: any, i: number) => ({ ...r, idx: i, ...calcEmp(r, i) }));
  const totals: any = {};
  ['work_days','regular_hours','overtime_hours','weekly_holiday_hours','basePay','overtimePay','whPay','grossPay','meal','incomeTax','localTax','netPay'].forEach(k => {
    totals[k] = rows.reduce((s: number, r: any) => s + (r[k] || 0), 0);
  });

  const handleExcel = () => {
    const header = ['이름','연락처','은행','계좌번호','근무일','기본h','연장h','주휴h','기본급','연장수당','주휴수당','급여계','식대공제','소득세(3.3%)','지방세(0.33%)','실지급'];
    const csvRows = rows.map((r: any) => [r.name,r.phone,r.bank_name,r.bank_account,r.work_days,r.regular_hours,r.overtime_hours,r.weekly_holiday_hours,r.basePay,r.overtimePay,r.whPay,r.grossPay,r.meal,r.incomeTax,r.localTax,r.netPay]);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `알바정산_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-orange-600" />
          알바(사업소득) 정산관리
        </h1>
        <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
          <b>수당 계산:</b> 시급×1.5배 | <b>30분 내림</b> | 주5일 이하 휴일→수당없음 | 주5일 초과+휴일→휴일수당 | 공휴일→무조건 휴일수당 | 야간(22~06)→연장 | 소득세3.3%+지방세0.33%
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">시간당 급여</label>
          <input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseInt(e.target.value) || 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-28" />
        </div>
        {rows.length > 0 && (
          <button onClick={handleExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold">{rows.length}</p><p className="text-xs text-gray-500">인원</p></div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-3 text-center"><p className="text-lg font-bold text-orange-700">{fmt.format(totals.grossPay)}</p><p className="text-xs text-orange-600">급여 합계</p></div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-center"><p className="text-lg font-bold text-red-700">{fmt.format(totals.incomeTax + totals.localTax)}</p><p className="text-xs text-red-600">세금 합계</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center"><p className="text-lg font-bold text-green-700">{fmt.format(totals.netPay)}</p><p className="text-xs text-green-600">실지급 합계</p></div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto" /></div>
      ) : rows.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] table-fixed">
              <colgroup>
                <col className="w-[70px]" />{/* 이름 */}
                <col className="w-[55px]" />{/* 은행 */}
                <col className="w-[90px]" />{/* 계좌 */}
                <col className="w-[80px]" />{/* 주민번호 */}
                <col className="w-[28px]" />{/* 일 */}
                <col className="w-[38px]" />{/* 기본h */}
                <col className="w-[38px]" />{/* 연장h */}
                <col className="w-[38px]" />{/* 주휴h */}
                <col className="w-[65px]" />{/* 기본급 */}
                <col className="w-[65px]" />{/* 연장수당 */}
                <col className="w-[65px]" />{/* 주휴수당 */}
                <col className="w-[70px]" />{/* 급여계 */}
                <col className="w-[65px]" />{/* 식대 */}
                <col className="w-[60px]" />{/* 소득세 */}
                <col className="w-[55px]" />{/* 지방세 */}
                <col className="w-[75px]" />{/* 실지급 */}
              </colgroup>
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-1.5">이름</th>
                  <th className="py-2 px-1.5">은행</th>
                  <th className="py-2 px-1.5">계좌번호</th>
                  <th className="py-2 px-1.5">주민번호</th>
                  <th className="py-2 px-1.5 text-right">일</th>
                  <th className="py-2 px-1.5 text-right">기본h</th>
                  <th className="py-2 px-1.5 text-right">연장h</th>
                  <th className="py-2 px-1.5 text-right">주휴h</th>
                  <th className="py-2 px-1.5 text-right">기본급</th>
                  <th className="py-2 px-1.5 text-right">연장수당</th>
                  <th className="py-2 px-1.5 text-right">주휴수당</th>
                  <th className="py-2 px-1.5 text-right">급여계</th>
                  <th className="py-2 px-1.5 text-right">식대공제</th>
                  <th className="py-2 px-1.5 text-right">소득세</th>
                  <th className="py-2 px-1.5 text-right">지방세</th>
                  <th className="py-2 px-1.5 text-right font-bold text-green-700">실지급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r: any) => (
                  <tr key={r.idx} className="hover:bg-gray-50">
                    <td className="py-1.5 px-1.5 font-medium text-gray-900 truncate">{r.name}</td>
                    <td className="py-1.5 px-1.5 text-gray-500 truncate">{r.bank_name || '-'}</td>
                    <td className="py-1.5 px-1.5 text-gray-500 font-mono text-[9px] truncate">{r.bank_account || '-'}</td>
                    <td className="py-1.5 px-1.5 text-gray-500 font-mono text-[9px] truncate">{r.id_number || '-'}</td>
                    <td className="py-1.5 px-1.5 text-right">{r.work_days}</td>
                    <td className="py-1.5 px-1.5 text-right">{r.regular_hours}</td>
                    <td className="py-1.5 px-1.5 text-right text-amber-700">{r.overtime_hours}</td>
                    <td className="py-1.5 px-1.5 text-right text-purple-700">{r.weekly_holiday_hours}</td>
                    <td className="py-1.5 px-1.5 text-right">{fmt.format(r.basePay)}</td>
                    <td className="py-1.5 px-1.5 text-right text-amber-700">{fmt.format(r.overtimePay)}</td>
                    <td className="py-1.5 px-1.5 text-right text-purple-700">{fmt.format(r.whPay)}</td>
                    <td className="py-1.5 px-1.5 text-right font-medium">{fmt.format(r.grossPay)}</td>
                    <td className="py-1.5 px-1.5">
                      <input type="number" value={mealDeductions[r.idx] || ''} onChange={e => setMealDeductions({...mealDeductions, [r.idx]: parseInt(e.target.value) || 0})}
                        className="w-full px-1 py-0.5 border border-gray-200 rounded text-[10px] text-right" placeholder="0" />
                    </td>
                    <td className="py-1.5 px-1.5 text-right text-red-500">{fmt.format(r.incomeTax)}</td>
                    <td className="py-1.5 px-1.5 text-right text-red-500">{fmt.format(r.localTax)}</td>
                    <td className="py-1.5 px-1.5 text-right font-bold text-green-700">{fmt.format(r.netPay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-orange-50 border-t-2 border-orange-200 font-bold text-[10px]">
                  <td className="py-2 px-1.5 text-orange-900" colSpan={4}>합계 ({rows.length}명)</td>
                  <td className="py-2 px-1.5 text-right">{totals.work_days}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.regular_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.overtime_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{totals.weekly_holiday_hours || 0}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.basePay || 0)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.overtimePay || 0)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.whPay || 0)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.grossPay || 0)}</td>
                  <td className="py-2 px-1.5 text-right text-red-600">{fmt.format(totals.meal || 0)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.incomeTax || 0)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.localTax || 0)}</td>
                  <td className="py-2 px-1.5 text-right text-green-800">{fmt.format(totals.netPay || 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="bg-white rounded-xl border py-16 text-center text-sm text-gray-400">확정된 알바 근태 데이터가 없습니다.</div>
      ) : null}
    </div>
  );
}
