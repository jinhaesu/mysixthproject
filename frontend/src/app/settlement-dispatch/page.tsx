"use client";

import { useState, useCallback, useEffect } from "react";
import { Calculator, Loader2, Download } from "lucide-react";
import { getSettlement } from "@/lib/api";

const fmt = new Intl.NumberFormat('ko-KR');

export default function SettlementDispatchPage() {
  const [yearMonth, setYearMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(11000);
  const [feeRate, setFeeRate] = useState(10);
  const [checkedEmps, setCheckedEmps] = useState<Set<number>>(new Set());
  const [mealDeductions, setMealDeductions] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getSettlement(yearMonth, 'dispatch');
      setData(d);
      // Auto-select all and init meal deductions
      if (d?.results) {
        setCheckedEmps(new Set(d.results.map((_: any, i: number) => i)));
        const meals: Record<number, number> = {};
        d.results.forEach((_: any, i: number) => { meals[i] = 0; });
        setMealDeductions(meals);
      }
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  // 30분 단위 내림: 0.1~0.4 → 0, 0.5~0.9 → 0.5
  const floor30 = (h: number) => Math.floor(h * 2) / 2;

  const calcEmp = (r: any, idx: number) => {
    const otHours = floor30(r.overtime_hours);
    const basePay = Math.round(r.regular_hours * hourlyRate);
    const overtimePay = Math.round(otHours * hourlyRate * 1.5);
    const whPay = Math.round(r.weekly_holiday_hours * hourlyRate);
    const grossPay = basePay + overtimePay + whPay;
    const meal = mealDeductions[idx] || 0;
    const net = grossPay - meal;
    const np = Math.round(net * 0.0475);
    const hi = Math.round(net * 0.03595);
    const ia = Math.round(net * 0.01436);
    const ei = Math.round(net * 0.0115);
    const ltc = Math.round(hi * 0.1314);
    const ins = np + hi + ia + ei + ltc;
    const sub = net + ins;
    const fee = checkedEmps.has(idx) ? Math.round(sub * feeRate / 100) : 0;
    const bv = sub + fee;
    const vat = Math.round(bv * 0.1);
    return { basePay, overtimePay, whPay, grossPay, meal, net, np, hi, ia, ei, ltc, ins, fee, bv, vat, total: bv + vat };
  };

  const results = data?.results || [];
  const rows = results.map((r: any, i: number) => ({ ...r, idx: i, ...calcEmp(r, i) }));
  const totals: any = {};
  const numKeys = ['work_days','regular_hours','overtime_hours','weekly_holiday_hours','basePay','overtimePay','whPay','grossPay','meal','net','np','hi','ia','ei','ltc','ins','fee','bv','vat','total'];
  numKeys.forEach(k => { totals[k] = rows.reduce((s: number, r: any) => s + (r[k] || 0), 0); });

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="w-6 h-6 text-blue-600" />
          파견 정산관리
        </h1>
        <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
          <b>연장/휴일 수당 계산 기준:</b> 시간당 급여 × 1.5배 | 연장시간은 <b>30분 단위 내림</b> 적용 (0.1~0.4h → 0h, 0.5h = 30분)
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
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">파견수수료 (%)</label>
          <input type="number" step="0.1" value={feeRate} onChange={e => setFeeRate(parseFloat(e.target.value) || 0)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-20" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCheckedEmps(new Set(results.map((_: any, i: number) => i)))} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">전체 선택</button>
          <button onClick={() => setCheckedEmps(new Set())} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">전체 해제</button>
        </div>
        {rows.length > 0 && (
          <button onClick={() => {
            const header = ['이름','근무일','기본h','연장h','주휴h','기본급','연장수당','주휴수당','급여계','식대공제','국민연금','건강보험','산재보험','고용보험','장기요양','보험계','수수료','VAT','최종액'];
            const csvRows = rows.map((r: any) => [r.name,r.work_days,r.regular_hours,r.overtime_hours,r.weekly_holiday_hours,r.basePay,r.overtimePay,r.whPay,r.grossPay,r.meal,r.np,r.hi,r.ia,r.ei,r.ltc,r.ins,r.fee,r.vat,r.total]);
            const csv = [header,...csvRows].map(r => r.join(',')).join('\n');
            const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`파견정산_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
          }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center gap-1 ml-auto">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border p-3 text-center"><p className="text-xl font-bold">{rows.length}</p><p className="text-xs text-gray-500">인원</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 text-center"><p className="text-lg font-bold text-blue-700">{fmt.format(totals.grossPay)}</p><p className="text-xs text-blue-600">급여 합계</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 text-center"><p className="text-lg font-bold text-amber-700">{fmt.format(totals.ins)}</p><p className="text-xs text-amber-600">보험료 합계</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-center"><p className="text-lg font-bold text-green-700">{fmt.format(totals.total)}</p><p className="text-xs text-green-600">최종액 (VAT포함)</p></div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" /></div>
      ) : rows.length > 0 ? (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-1.5 w-8">수수료</th>
                  <th className="py-2 px-1.5">이름</th>
                  <th className="py-2 px-1.5 text-right">일</th>
                  <th className="py-2 px-1.5 text-right">기본h</th>
                  <th className="py-2 px-1.5 text-right">연장h</th>
                  <th className="py-2 px-1.5 text-right">주휴h</th>
                  <th className="py-2 px-1.5 text-right">기본급</th>
                  <th className="py-2 px-1.5 text-right">연장수당</th>
                  <th className="py-2 px-1.5 text-right">주휴수당</th>
                  <th className="py-2 px-1.5 text-right">급여계</th>
                  <th className="py-2 px-1.5 text-right w-20">식대공제</th>
                  <th className="py-2 px-1.5 text-right" title="4.75%">국민연금</th>
                  <th className="py-2 px-1.5 text-right" title="3.595%">건강보험</th>
                  <th className="py-2 px-1.5 text-right" title="1.436%">산재보험</th>
                  <th className="py-2 px-1.5 text-right" title="1.15%">고용보험</th>
                  <th className="py-2 px-1.5 text-right" title="건강x13.14%">장기요양</th>
                  <th className="py-2 px-1.5 text-right">보험계</th>
                  <th className="py-2 px-1.5 text-right">수수료</th>
                  <th className="py-2 px-1.5 text-right">VAT</th>
                  <th className="py-2 px-1.5 text-right font-bold">최종액</th>
                </tr>
                <tr className="bg-gray-100 text-[9px] text-gray-500">
                  <th colSpan={10}></th>
                  <th className="px-1.5 text-right">직접입력</th>
                  <th className="px-1.5 text-right">4.75%</th>
                  <th className="px-1.5 text-right">3.595%</th>
                  <th className="px-1.5 text-right">1.436%</th>
                  <th className="px-1.5 text-right">1.15%</th>
                  <th className="px-1.5 text-right">건강x13.14%</th>
                  <th colSpan={4}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r: any) => (
                  <tr key={r.idx} className="hover:bg-gray-50">
                    <td className="py-1.5 px-1.5 text-center">
                      <input type="checkbox" checked={checkedEmps.has(r.idx)}
                        onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(r.idx); else n.delete(r.idx); setCheckedEmps(n); }}
                        className="rounded border-gray-300" />
                    </td>
                    <td className="py-1.5 px-1.5 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
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
                        className="w-16 px-1 py-0.5 border border-gray-200 rounded text-[10px] text-right" placeholder="0" />
                    </td>
                    <td className="py-1.5 px-1.5 text-right text-gray-500">{fmt.format(r.np)}</td>
                    <td className="py-1.5 px-1.5 text-right text-gray-500">{fmt.format(r.hi)}</td>
                    <td className="py-1.5 px-1.5 text-right text-gray-500">{fmt.format(r.ia)}</td>
                    <td className="py-1.5 px-1.5 text-right text-gray-500">{fmt.format(r.ei)}</td>
                    <td className="py-1.5 px-1.5 text-right text-gray-500">{fmt.format(r.ltc)}</td>
                    <td className="py-1.5 px-1.5 text-right font-medium">{fmt.format(r.ins)}</td>
                    <td className="py-1.5 px-1.5 text-right text-blue-600">{r.fee > 0 ? fmt.format(r.fee) : '-'}</td>
                    <td className="py-1.5 px-1.5 text-right text-gray-500">{fmt.format(r.vat)}</td>
                    <td className="py-1.5 px-1.5 text-right font-bold text-blue-800">{fmt.format(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold text-[10px]">
                  <td className="py-2 px-1.5 text-blue-900" colSpan={2}>합계 ({rows.length}명)</td>
                  <td className="py-2 px-1.5 text-right">{totals.work_days}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.regular_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.overtime_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{totals.weekly_holiday_hours || 0}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.basePay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.overtimePay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.whPay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.grossPay)}</td>
                  <td className="py-2 px-1.5 text-right text-red-600">{fmt.format(totals.meal)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.np)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.hi)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ia)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ei)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ltc)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ins)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.fee)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.vat)}</td>
                  <td className="py-2 px-1.5 text-right text-blue-900">{fmt.format(totals.total)}</td>
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
