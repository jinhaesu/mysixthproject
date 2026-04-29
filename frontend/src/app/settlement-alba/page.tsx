"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Download, Users } from "lucide-react";
import { getConfirmedList, getWorkers } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import ChartCard from "@/components/charts/ChartCard";
import { SEMANTIC_COLORS } from "@/lib/chartColors";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, ChartTooltip } from "@/components/charts/theme";
import {
  PageHeader, Card, Stat, Button, Field, Input, EmptyState, CenterSpinner, useToast,
  Table, THead, TBody, TR, TH, TD, Toolbar,
} from "@/components/ui";

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

export default function SettlementAlbaPage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [yearMonth, setYearMonth] = usePersistedState("sa_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(11000);
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
          if (effType !== '알바') continue;
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
    return { basePay, overtimePay, nightPay, whPay, grossPay, meal, netBeforeTax, incomeTax, localTax, netPay };
  };

  const results = data?.results || [];
  const rows = results.map((r: any, i: number) => ({ ...r, idx: i, ...calcEmp(r, i) }));
  const totals: any = {};
  ['work_days','regular_hours','overtime_hours','night_hours','weekly_holiday_hours','basePay','overtimePay','nightPay','whPay','grossPay','meal','incomeTax','localTax','netPay'].forEach(k => {
    totals[k] = rows.reduce((s: number, r: any) => s + (r[k] || 0), 0);
  });

  const handleExcel = () => {
    const header = ['이름','연락처','은행','계좌번호','근무일','기본h','연장h','야간h','주휴h','기본급','연장수당','야간수당','주휴수당','급여계','식대공제','소득세(3.3%)','지방세(0.33%)','실지급'];
    const csvRows = rows.map((r: any) => [r.name,r.phone,r.bank_name,r.bank_account,r.work_days,r.regular_hours,r.overtime_hours,r.night_hours || 0,r.weekly_holiday_hours,r.basePay,r.overtimePay,r.nightPay,r.whPay,r.grossPay,r.meal,r.incomeTax,r.localTax,r.netPay]);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `알바정산_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0 space-y-4 fade-in">
      <PageHeader
        eyebrow="정산"
        title="알바(사업소득) 정산관리"
        description="수당 계산: 시급×1.5배 | 30분 내림 | 주5일 이하 휴일→수당없음 | 공휴일→휴일수당 | 야간(22~06)→연장 | 소득세3.3%+지방세0.33%"
        actions={
          rows.length > 0 ? (
            <Button variant="secondary" size="sm" leadingIcon={<Download size={14} />} onClick={handleExcel}>
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
      </Toolbar>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="인원" value={rows.length} unit="명" tone="neutral" icon={<Users size={14} />} />
          <Stat label="급여 합계" value={fmt.format(totals.grossPay)} unit="원" tone="warning" />
          <Stat label="세금 합계" value={fmt.format(totals.incomeTax + totals.localTax)} unit="원" tone="danger" />
          <Stat label="실지급 합계" value={fmt.format(totals.netPay)} unit="원" tone="success" />
        </div>
      )}

      {rows.length > 0 && (() => {
        const chartData = [...rows]
          .sort((a: any, b: any) => (b.regular_hours + b.overtime_hours + b.night_hours) - (a.regular_hours + a.overtime_hours + a.night_hours))
          .slice(0, 10)
          .map((r: any) => ({ name: r.name, 기본: r.regular_hours, 연장: r.overtime_hours, 야간: r.night_hours || 0 }));
        return (
          <ChartCard title="근무시간 상위 인원 (기본/연장/야간)" subtitle="최대 10명, 총 근무시간 내림차순" height={320}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 48 }}>
              <CartesianGrid {...CHART_GRID_PROPS} />
              <XAxis type="number" {...CHART_AXIS_PROPS} unit="h" />
              <YAxis type="category" dataKey="name" {...CHART_AXIS_PROPS} width={48} />
              <Tooltip content={<ChartTooltip unit="h" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="기본" stackId="a" fill={SEMANTIC_COLORS.regular} />
              <Bar dataKey="연장" stackId="a" fill={SEMANTIC_COLORS.overtime} />
              <Bar dataKey="야간" stackId="a" fill={SEMANTIC_COLORS.night} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartCard>
        );
      })()}

      {loading ? (
        <CenterSpinner />
      ) : rows.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="text-[10px] table-fixed">
              <colgroup>
                <col className="w-[70px]" />
                <col className="w-[55px]" />
                <col className="w-[90px]" />
                <col className="w-[80px]" />
                <col className="w-[28px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[70px]" />
                <col className="w-[65px]" />
                <col className="w-[60px]" />
                <col className="w-[55px]" />
                <col className="w-[75px]" />
              </colgroup>
              <THead>
                <TR>
                  <TH>이름</TH>
                  <TH>은행</TH>
                  <TH>계좌번호</TH>
                  <TH>주민번호</TH>
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
                  <TH numeric>식대공제</TH>
                  <TH numeric>소득세</TH>
                  <TH numeric>지방세</TH>
                  <TH numeric className="text-[var(--success-fg)]">실지급</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r: any) => (
                  <TR key={r.idx}>
                    <TD emphasis className="truncate">{r.name}</TD>
                    <TD muted className="truncate">{r.bank_name || '-'}</TD>
                    <TD muted className="font-mono text-[9px] truncate">{r.bank_account || '-'}</TD>
                    <TD muted className="font-mono text-[9px] truncate">{r.id_number || '-'}</TD>
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
                        className="w-full text-right" placeholder="0" />
                    </TD>
                    <TD numeric className="text-[var(--danger-fg)]">{fmt.format(r.incomeTax)}</TD>
                    <TD numeric className="text-[var(--danger-fg)]">{fmt.format(r.localTax)}</TD>
                    <TD numeric emphasis className="text-[var(--success-fg)]">{fmt.format(r.netPay)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <TR className="bg-[var(--warning-bg)] border-t-2 border-[var(--warning-border)] font-bold text-[10px]">
                  <TD colSpan={4} className="text-[var(--text-2)]">합계 ({rows.length}명)</TD>
                  <TD numeric>{totals.work_days}</TD>
                  <TD numeric>{(totals.regular_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.overtime_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.night_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{totals.weekly_holiday_hours || 0}</TD>
                  <TD numeric>{fmt.format(totals.basePay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.overtimePay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.nightPay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.whPay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.grossPay || 0)}</TD>
                  <TD numeric className="text-[var(--danger-fg)]">{fmt.format(totals.meal || 0)}</TD>
                  <TD numeric>{fmt.format(totals.incomeTax || 0)}</TD>
                  <TD numeric>{fmt.format(totals.localTax || 0)}</TD>
                  <TD numeric className="text-[var(--success-fg)]">{fmt.format(totals.netPay || 0)}</TD>
                </TR>
              </tfoot>
            </Table>
          </div>
        </Card>
      ) : data ? (
        <EmptyState
          icon={<Calculator className="w-7 h-7" />}
          title="데이터 없음"
          description="확정된 알바 근태 데이터가 없습니다."
        />
      ) : null}
    </div>
  );
}
