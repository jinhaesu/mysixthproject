"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Download, Users } from "lucide-react";
import { getConfirmedList, getWorkers } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard from "@/components/charts/ChartCard";
import { getColor } from "@/lib/chartColors";
import {
  PageHeader, Card, Stat, Button, Field, Input, EmptyState, CenterSpinner, useToast,
  Table, THead, TBody, TR, TH, TD, Toolbar,
} from "@/components/ui";

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
  const toast = useToast();
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
    } catch (e: any) { toast.error(e.message); }
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

  const floor30 = (h: number) => Math.floor(h * 2) / 2;

  const calcEmp = (r: any, idx: number) => {
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
    <div className="min-w-0 space-y-4 fade-in">
      <PageHeader
        eyebrow="정산"
        title="파견 정산관리"
        description="수당 계산: 시급 × 1.5배 | 30분 단위 내림 | 주5일 이하 휴일근무→수당 없음 | 공휴일→휴일수당 | 야간(22~06시)→연장수당"
        actions={
          rows.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Download size={14} />}
              onClick={() => {
                const header = ['이름','근무일','기본h','연장h','야간h','주휴h','기본급','연장수당','야간수당','주휴수당','급여계','식대공제','국민연금','건강보험','산재보험','고용보험','장기요양','보험계','수수료','VAT','최종액'];
                const csvRows = rows.map((r: any) => [r.name,r.work_days,r.regular_hours,r.overtime_hours,r.night_hours||0,r.weekly_holiday_hours,r.basePay,r.overtimePay,r.nightPay,r.whPay,r.grossPay,r.meal,r.np,r.hi,r.ia,r.ei,r.ltc,r.ins,r.fee,r.vat,r.total]);
                const csv = [header,...csvRows].map(r => r.join(',')).join('\n');
                const blob = new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`파견정산_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
              }}
            >
              엑셀 다운로드
            </Button>
          ) : undefined
        }
      />

      <Toolbar>
        <Field label="연월">
          <Input type="month" inputSize="sm" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-40" />
        </Field>
        <Field label="시간당 급여">
          <Input type="number" inputSize="sm" value={hourlyRate} onChange={e => setHourlyRate(parseInt(e.target.value) || 0)} className="w-28" />
        </Field>
        <Field label="파견수수료 (%)">
          <Input type="number" inputSize="sm" step="0.1" value={feeRate} onChange={e => setFeeRate(parseFloat(e.target.value) || 0)} className="w-20" />
        </Field>
        <div className="flex gap-2 items-end pb-0.5">
          <Button size="sm" variant="ghost" onClick={() => setCheckedEmps(new Set(results.map((_: any, i: number) => i)))}>전체 선택</Button>
          <Button size="sm" variant="ghost" onClick={() => setCheckedEmps(new Set())}>전체 해제</Button>
        </div>
      </Toolbar>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="인원" value={rows.length} unit="명" tone="neutral" icon={<Users size={14} />} />
          <Stat label="급여 합계" value={fmt.format(totals.grossPay)} unit="원" tone="brand" />
          <Stat label="보험료 합계" value={fmt.format(totals.ins)} unit="원" tone="warning" />
          <Stat label="최종액 (VAT포함)" value={fmt.format(totals.total)} unit="원" tone="success" />
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
        );
      })()}

      {loading ? (
        <CenterSpinner />
      ) : rows.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="text-[10px]">
              <THead>
                <TR>
                  <TH className="w-8">수수료</TH>
                  <TH>이름</TH>
                  <TH numeric>일</TH>
                  <TH numeric>기본h</TH>
                  <TH numeric>연장h</TH>
                  <TH numeric>야간h</TH>
                  <TH numeric>주휴h</TH>
                  <TH numeric>기본급</TH>
                  <TH numeric>연장수당</TH>
                  <TH numeric>야간수당</TH>
                  <TH numeric>주휴수당</TH>
                  <TH numeric>급여계</TH>
                  <TH numeric className="w-20">식대공제</TH>
                  <TH numeric title="4.75%">국민연금</TH>
                  <TH numeric title="3.595%">건강보험</TH>
                  <TH numeric title="1.436%">산재보험</TH>
                  <TH numeric title="1.15%">고용보험</TH>
                  <TH numeric title="건강x13.14%">장기요양</TH>
                  <TH numeric>보험계</TH>
                  <TH numeric>수수료</TH>
                  <TH numeric>VAT</TH>
                  <TH numeric>최종액</TH>
                </TR>
                <TR>
                  <TH colSpan={12}></TH>
                  <TH numeric className="text-[9px] text-[var(--text-4)]">직접입력</TH>
                  <TH numeric className="text-[9px] text-[var(--text-4)]">4.75%</TH>
                  <TH numeric className="text-[9px] text-[var(--text-4)]">3.595%</TH>
                  <TH numeric className="text-[9px] text-[var(--text-4)]">1.436%</TH>
                  <TH numeric className="text-[9px] text-[var(--text-4)]">1.15%</TH>
                  <TH numeric className="text-[9px] text-[var(--text-4)]">건강x13.14%</TH>
                  <TH colSpan={4}></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r: any) => (
                  <TR key={r.idx}>
                    <TD className="text-center">
                      <input type="checkbox" checked={checkedEmps.has(r.idx)}
                        onChange={e => { const n = new Set(checkedEmps); if (e.target.checked) n.add(r.idx); else n.delete(r.idx); setCheckedEmps(n); }}
                        className="rounded border-[var(--border-1)]" />
                    </TD>
                    <TD emphasis className="whitespace-nowrap">{r.name}</TD>
                    <TD numeric>{r.work_days}</TD>
                    <TD numeric>{r.regular_hours}</TD>
                    <TD numeric className="text-[var(--warning-fg)]">{r.overtime_hours}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{(r.night_hours || 0).toFixed(1)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{r.weekly_holiday_hours}</TD>
                    <TD numeric>{fmt.format(r.basePay)}</TD>
                    <TD numeric className="text-[var(--warning-fg)]">{fmt.format(r.overtimePay)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{fmt.format(r.nightPay)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{fmt.format(r.whPay)}</TD>
                    <TD numeric emphasis>{fmt.format(r.grossPay)}</TD>
                    <TD>
                      <Input type="number" inputSize="sm" value={mealDeductions[r.idx] || ''} onChange={e => setMealDeductions({...mealDeductions, [r.idx]: parseInt(e.target.value) || 0})}
                        className="w-16 text-right" placeholder="0" />
                    </TD>
                    <TD numeric muted>{fmt.format(r.np)}</TD>
                    <TD numeric muted>{fmt.format(r.hi)}</TD>
                    <TD numeric muted>{fmt.format(r.ia)}</TD>
                    <TD numeric muted>{fmt.format(r.ei)}</TD>
                    <TD numeric muted>{fmt.format(r.ltc)}</TD>
                    <TD numeric emphasis>{fmt.format(r.ins)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{r.fee > 0 ? fmt.format(r.fee) : '-'}</TD>
                    <TD numeric muted>{fmt.format(r.vat)}</TD>
                    <TD numeric emphasis className="text-[var(--brand-400)]">{fmt.format(r.total)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <TR className="bg-[var(--info-bg)] border-t-2 border-[var(--info-border)] font-bold text-[10px]">
                  <TD className="text-[var(--info-fg)]" colSpan={2}>합계 ({rows.length}명)</TD>
                  <TD numeric>{totals.work_days}</TD>
                  <TD numeric>{(totals.regular_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.overtime_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.night_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{totals.weekly_holiday_hours || 0}</TD>
                  <TD numeric>{fmt.format(totals.basePay)}</TD>
                  <TD numeric>{fmt.format(totals.overtimePay)}</TD>
                  <TD numeric>{fmt.format(totals.nightPay)}</TD>
                  <TD numeric>{fmt.format(totals.whPay)}</TD>
                  <TD numeric>{fmt.format(totals.grossPay)}</TD>
                  <TD numeric className="text-[var(--danger-fg)]">{fmt.format(totals.meal)}</TD>
                  <TD numeric>{fmt.format(totals.np)}</TD>
                  <TD numeric>{fmt.format(totals.hi)}</TD>
                  <TD numeric>{fmt.format(totals.ia)}</TD>
                  <TD numeric>{fmt.format(totals.ei)}</TD>
                  <TD numeric>{fmt.format(totals.ltc)}</TD>
                  <TD numeric>{fmt.format(totals.ins)}</TD>
                  <TD numeric>{fmt.format(totals.fee)}</TD>
                  <TD numeric>{fmt.format(totals.vat)}</TD>
                  <TD numeric className="text-[var(--info-fg)]">{fmt.format(totals.total)}</TD>
                </TR>
              </tfoot>
            </Table>
          </div>
        </Card>
      ) : data ? (
        <EmptyState
          icon={<Calculator className="w-7 h-7" />}
          title="데이터 없음"
          description="확정된 파견 근태 데이터가 없습니다."
        />
      ) : null}
    </div>
  );
}
