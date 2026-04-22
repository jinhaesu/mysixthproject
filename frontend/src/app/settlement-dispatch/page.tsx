"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Loader2, Download } from "lucide-react";
import { getConfirmedList, getWorkers } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard from "@/components/charts/ChartCard";
import { getColor } from "@/lib/chartColors";

const krFmt = new Intl.NumberFormat('ko-KR');

const fmt = new Intl.NumberFormat('ko-KR');

const HOLIDAYS: Record<number, string[]> = {
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
};
const isHolidayOrWeekend = (dateStr: string): boolean => {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
};
const isKoreanHoliday = (dateStr: string): boolean => {
  const year = parseInt(dateStr.slice(0, 4));
  return (HOLIDAYS[year] || []).includes(dateStr);
};
const normalizePhone = (p: string | null | undefined) => (p || '').replace(/[-\s]/g, '').trim();
const normType = (t: string | null | undefined): string => {
  const s = (t || '').toString().trim();
  if (!s) return '';
  if (s.includes('파견')) return '파견';
  if (s.includes('알바') || s.includes('사업소득')) return '알바';
  if (s.includes('정규')) return '정규직';
  return '';
};

export default function SettlementDispatchPage() {
  const [authorized, setAuthorized] = useState(false);
  const [yearMonth, setYearMonth] = usePersistedState("sd_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(11000);
  const [feeRate, setFeeRate] = useState(10);
  const [checkedEmps, setCheckedEmps] = useState<Set<number>>(new Set());
  const [mealDeductions, setMealDeductions] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // confirmed-list + workers 직접 조회 → 로컬 정산 계산 (정규직 오분류 버그 우회)
      const [workersResp, confList] = await Promise.all([
        getWorkers({ limit: '10000' }).catch(() => ({ workers: [] })),
        getConfirmedList(yearMonth, ''),
      ]);
      const workersList = (workersResp as any).workers || (workersResp as any) || [];
      const catMap = new Map<string, string>();
      const workerByIdentity = new Map<string, any>();
      for (const w of workersList) {
        const np = normalizePhone(w.phone || '');
        if (w.category) {
          if (np) catMap.set(np, w.category);
          if (w.phone) catMap.set(w.phone, w.category);
          if (w.name_ko) catMap.set(w.name_ko, w.category);
        }
        if (np) workerByIdentity.set(np, w);
        if (w.name_ko) workerByIdentity.set(w.name_ko, w);
      }

      const empMap = new Map<string, any>();
      for (const e of (confList || [])) {
        for (const r of (e.records || [])) {
          const raw = (r.employee_type || '').toString().trim();
          let t = raw;
          if (!t) {
            const np = normalizePhone(r.employee_phone || '');
            t = catMap.get(np) || catMap.get(r.employee_phone) || catMap.get(r.employee_name) || '';
          }
          const effType = normType(t);
          if (effType !== '파견') continue;
          const identity = `n:${r.employee_name || ''}`;
          if (!empMap.has(identity)) {
            const worker = workerByIdentity.get(normalizePhone(r.employee_phone || '')) || workerByIdentity.get(r.employee_name) || {};
            empMap.set(identity, {
              name: r.employee_name,
              phone: r.employee_phone || '',
              bank_name: worker.bank_name || '',
              bank_account: worker.bank_account || '',
              id_number: worker.id_number || '',
              work_days: 0,
              regular_hours: 0,
              overtime_hours: 0,
              night_hours: 0,
              holiday_pay_hours: 0,
              weekly_holiday_hours: 0,
              weekly_data: new Map<string, any>(),
            });
          }
          const emp = empMap.get(identity);
          emp.work_days++;
          const regH = parseFloat(r.regular_hours) || 0;
          const otH = parseFloat(r.overtime_hours) || 0;
          const nightH = parseFloat(r.night_hours) || 0;
          const totalH = regH + otH;
          emp.regular_hours += regH;
          emp.overtime_hours += otH;
          emp.night_hours += nightH;
          const isHoliday = isHolidayOrWeekend(r.date);
          const isPublicHoliday = isKoreanHoliday(r.date);
          const d = new Date(r.date + 'T00:00:00+09:00');
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          const weekKey = weekStart.toISOString().slice(0, 10);
          if (!emp.weekly_data.has(weekKey)) emp.weekly_data.set(weekKey, { days: 0, hours: 0, hasHoliday: false, holidayHours: 0, publicHolidayHours: 0 });
          const w = emp.weekly_data.get(weekKey);
          w.days++;
          w.hours += totalH;
          if (isHoliday) { w.hasHoliday = true; w.holidayHours += totalH; }
          if (isPublicHoliday) w.publicHolidayHours += totalH;
        }
      }

      const results: any[] = [];
      for (const [, emp] of empMap) {
        let weeklyHolidayWeeks = 0;
        let holidayPayHours = 0;
        for (const [, w] of emp.weekly_data) {
          if (w.hours >= 15 && w.days >= 5) weeklyHolidayWeeks++;
          if (w.days > 5 && w.hasHoliday) holidayPayHours += w.holidayHours || 0;
          else holidayPayHours += w.publicHolidayHours || 0;
        }
        results.push({
          ...emp,
          regular_hours: Math.round(emp.regular_hours * 100) / 100,
          overtime_hours: Math.round(emp.overtime_hours * 100) / 100,
          night_hours: Math.round(emp.night_hours * 100) / 100,
          weekly_holiday_weeks: weeklyHolidayWeeks,
          weekly_holiday_hours: weeklyHolidayWeeks * 8,
          holiday_pay_hours: Math.round(holidayPayHours * 100) / 100,
        });
      }
      results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setData({ results });
      setCheckedEmps(new Set(results.map((_: any, i: number) => i)));
      const meals: Record<number, number> = {};
      results.forEach((_, i) => { meals[i] = 0; });
      setMealDeductions(meals);
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

  // 30분 단위 내림: 0.1~0.4 → 0, 0.5~0.9 → 0.5
  const floor30 = (h: number) => Math.floor(h * 2) / 2;

  const calcEmp = (r: any, idx: number) => {
    const otHours = floor30(r.overtime_hours);
    const holHours = floor30(r.holiday_pay_hours || 0);
    const nightHours = floor30(r.night_hours || 0);
    const basePay = Math.round(r.regular_hours * hourlyRate);
    const overtimePay = Math.round(otHours * hourlyRate * 1.5);
    const holidayPay = Math.round(holHours * hourlyRate * 1.5);
    const nightPay = Math.round(nightHours * hourlyRate * 1.5); // 야간시간은 기본에서 분리됨, 1.5배
    const whPay = Math.round(r.weekly_holiday_hours * hourlyRate);
    const grossPay = basePay + overtimePay + holidayPay + nightPay + whPay;
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
    return { basePay, overtimePay, nightPay, whPay, grossPay, meal, net, np, hi, ia, ei, ltc, ins, fee, bv, vat, total: bv + vat };
  };

  const results = data?.results || [];
  const rows = results.map((r: any, i: number) => ({ ...r, idx: i, ...calcEmp(r, i) }));
  const totals: any = {};
  const numKeys = ['work_days','regular_hours','overtime_hours','night_hours','weekly_holiday_hours','basePay','overtimePay','nightPay','whPay','grossPay','meal','net','np','hi','ia','ei','ltc','ins','fee','bv','vat','total'];
  numKeys.forEach(k => { totals[k] = rows.reduce((s: number, r: any) => s + (r[k] || 0), 0); });

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
          <Calculator className="w-6 h-6 text-[#7070FF]" />
          파견 정산관리
        </h1>
        <div className="mt-2 bg-[#4EA7FC]/10 border border-[#5E6AD2]/30 rounded-lg px-3 py-2 text-xs text-[#828FFF]">
          <b>수당 계산 기준:</b> 시급 × 1.5배 | <b>30분 단위 내림</b> (0.1~0.4h→0, 0.5h=30분) | 주5일 이하 휴일근무→휴일수당 없음 | 주5일 초과+휴일→휴일수당 | 공휴일→무조건 휴일수당 | 야간(22~06시)→연장수당
        </div>
      </div>

      <div className="bg-[#0F1011] rounded-xl border p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">시간당 급여</label>
          <input type="number" value={hourlyRate} onChange={e => setHourlyRate(parseInt(e.target.value) || 0)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm w-28" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">파견수수료 (%)</label>
          <input type="number" step="0.1" value={feeRate} onChange={e => setFeeRate(parseFloat(e.target.value) || 0)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm w-20" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCheckedEmps(new Set(results.map((_: any, i: number) => i)))} className="px-3 py-2 bg-[#141516] text-[#D0D6E0] rounded-lg text-xs font-medium">전체 선택</button>
          <button onClick={() => setCheckedEmps(new Set())} className="px-3 py-2 bg-[#141516] text-[#D0D6E0] rounded-lg text-xs font-medium">전체 해제</button>
        </div>
        {rows.length > 0 && (
          <button onClick={() => {
            const header = ['이름','근무일','기본h','연장h','야간h','주휴h','기본급','연장수당','야간수당','주휴수당','급여계','식대공제','국민연금','건강보험','산재보험','고용보험','장기요양','보험계','수수료','VAT','최종액'];
            const csvRows = rows.map((r: any) => [r.name,r.work_days,r.regular_hours,r.overtime_hours,r.night_hours||0,r.weekly_holiday_hours,r.basePay,r.overtimePay,r.nightPay,r.whPay,r.grossPay,r.meal,r.np,r.hi,r.ia,r.ei,r.ltc,r.ins,r.fee,r.vat,r.total]);
            const csv = [header,...csvRows].map(r => r.join(',')).join('\n');
            const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`파견정산_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
          }} className="px-4 py-2 bg-[#27A644] text-white rounded-lg text-sm font-medium flex items-center gap-1 ml-auto">
            <Download className="w-4 h-4" /> 엑셀 다운로드
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-[#0F1011] rounded-xl border p-3 text-center"><p className="text-xl font-bold">{rows.length}</p><p className="text-xs text-[#8A8F98]">인원</p></div>
          <div className="bg-[#4EA7FC]/10 rounded-xl border border-[#5E6AD2]/30 p-3 text-center"><p className="text-lg font-bold text-[#828FFF]">{fmt.format(totals.grossPay)}</p><p className="text-xs text-[#7070FF]">급여 합계</p></div>
          <div className="bg-[#F0BF00]/10 rounded-xl border border-[#F0BF00]/30 p-3 text-center"><p className="text-lg font-bold text-[#F0BF00]">{fmt.format(totals.ins)}</p><p className="text-xs text-[#F0BF00]">보험료 합계</p></div>
          <div className="bg-[#27A644]/10 rounded-xl border border-[#27A644]/30 p-3 text-center"><p className="text-lg font-bold text-[#27A644]">{fmt.format(totals.total)}</p><p className="text-xs text-[#27A644]">최종액 (VAT포함)</p></div>
        </div>
      )}

      {totals.grossPay > 0 && (() => {
        const pieData = [
          { name: '기본급', value: totals.basePay || 0 },
          { name: '연장수당', value: totals.overtimePay || 0 },
          { name: '야간수당', value: totals.nightPay || 0 },
          { name: '주휴수당', value: totals.whPay || 0 },
          { name: '보험료', value: totals.ins || 0 },
          { name: '수수료', value: totals.fee || 0 },
        ].filter(d => d.value > 0);
        return (
          <div className="mb-4">
            <ChartCard title="급여 구성 비율" subtitle="기본급, 수당, 보험료, 수수료 분포" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_entry, index) => (
                    <Cell key={index} fill={getColor(index)} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | string | Array<number | string> | undefined) => [`${krFmt.format(Number(value ?? 0))}원`, '']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ChartCard>
          </div>
        );
      })()}

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-[#7070FF] mx-auto" /></div>
      ) : rows.length > 0 ? (
        <div className="bg-[#0F1011] rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-[#08090A] text-left">
                  <th className="py-2 px-1.5 w-8">수수료</th>
                  <th className="py-2 px-1.5">이름</th>
                  <th className="py-2 px-1.5 text-right">일</th>
                  <th className="py-2 px-1.5 text-right">기본h</th>
                  <th className="py-2 px-1.5 text-right">연장h</th>
                  <th className="py-2 px-1.5 text-right">야간h</th>
                  <th className="py-2 px-1.5 text-right">주휴h</th>
                  <th className="py-2 px-1.5 text-right">기본급</th>
                  <th className="py-2 px-1.5 text-right">연장수당</th>
                  <th className="py-2 px-1.5 text-right">야간수당</th>
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
                <tr className="bg-[#141516] text-[9px] text-[#8A8F98]">
                  <th colSpan={12}></th>
                  <th className="px-1.5 text-right">직접입력</th>
                  <th className="px-1.5 text-right">4.75%</th>
                  <th className="px-1.5 text-right">3.595%</th>
                  <th className="px-1.5 text-right">1.436%</th>
                  <th className="px-1.5 text-right">1.15%</th>
                  <th className="px-1.5 text-right">건강x13.14%</th>
                  <th colSpan={4}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23252A]">
                {rows.map((r: any) => (
                  <tr key={r.idx} className="hover:bg-[#141516]/5">
                    <td className="py-1.5 px-1.5 text-center">
                      <input type="checkbox" checked={checkedEmps.has(r.idx)}
                        onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(r.idx); else n.delete(r.idx); setCheckedEmps(n); }}
                        className="rounded border-[#23252A]" />
                    </td>
                    <td className="py-1.5 px-1.5 font-medium text-[#F7F8F8] whitespace-nowrap">{r.name}</td>
                    <td className="py-1.5 px-1.5 text-right">{r.work_days}</td>
                    <td className="py-1.5 px-1.5 text-right">{r.regular_hours}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#F0BF00]">{r.overtime_hours}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#828FFF]">{(r.night_hours || 0).toFixed(1)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#828FFF]">{r.weekly_holiday_hours}</td>
                    <td className="py-1.5 px-1.5 text-right">{fmt.format(r.basePay)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#F0BF00]">{fmt.format(r.overtimePay)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#828FFF]">{fmt.format(r.nightPay)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#828FFF]">{fmt.format(r.whPay)}</td>
                    <td className="py-1.5 px-1.5 text-right font-medium">{fmt.format(r.grossPay)}</td>
                    <td className="py-1.5 px-1.5">
                      <input type="number" value={mealDeductions[r.idx] || ''} onChange={e => setMealDeductions({...mealDeductions, [r.idx]: parseInt(e.target.value) || 0})}
                        className="w-16 px-1 py-0.5 border border-[#23252A] rounded text-[10px] text-right" placeholder="0" />
                    </td>
                    <td className="py-1.5 px-1.5 text-right text-[#8A8F98]">{fmt.format(r.np)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#8A8F98]">{fmt.format(r.hi)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#8A8F98]">{fmt.format(r.ia)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#8A8F98]">{fmt.format(r.ei)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#8A8F98]">{fmt.format(r.ltc)}</td>
                    <td className="py-1.5 px-1.5 text-right font-medium">{fmt.format(r.ins)}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#7070FF]">{r.fee > 0 ? fmt.format(r.fee) : '-'}</td>
                    <td className="py-1.5 px-1.5 text-right text-[#8A8F98]">{fmt.format(r.vat)}</td>
                    <td className="py-1.5 px-1.5 text-right font-bold text-[#828FFF]">{fmt.format(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#4EA7FC]/10 border-t-2 border-[#5E6AD2]/30 font-bold text-[10px]">
                  <td className="py-2 px-1.5 text-[#4EA7FC]" colSpan={2}>합계 ({rows.length}명)</td>
                  <td className="py-2 px-1.5 text-right">{totals.work_days}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.regular_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.overtime_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{(totals.night_hours || 0).toFixed(1)}</td>
                  <td className="py-2 px-1.5 text-right">{totals.weekly_holiday_hours || 0}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.basePay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.overtimePay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.nightPay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.whPay)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.grossPay)}</td>
                  <td className="py-2 px-1.5 text-right text-[#EB5757]">{fmt.format(totals.meal)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.np)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.hi)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ia)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ei)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ltc)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.ins)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.fee)}</td>
                  <td className="py-2 px-1.5 text-right">{fmt.format(totals.vat)}</td>
                  <td className="py-2 px-1.5 text-right text-[#4EA7FC]">{fmt.format(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : data ? (
        <div className="bg-[#0F1011] rounded-xl border py-16 text-center text-sm text-[#62666D]">확정된 파견 근태 데이터가 없습니다.</div>
      ) : null}
    </div>
  );
}
