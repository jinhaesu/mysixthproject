"use client";

import { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Download, Users } from "lucide-react";
import { getPayrollCalc } from "@/lib/api";
import PasswordGate from "@/components/PasswordGate";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard, { TOOLTIP_STYLE } from "@/components/charts/ChartCard";
import { getColor } from "@/lib/chartColors";
import {
  PageHeader, Card, CardHeader, Stat, Badge, Button, Input, Field, SkeletonCard, EmptyState, useToast,
} from "@/components/ui";

const fmt = new Intl.NumberFormat('ko-KR');

export default function PayrollCalcPage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [yearMonth, setYearMonth] = usePersistedState("pc_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [overtimeRate, setOvertimeRate] = useState(10030);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getPayrollCalc(yearMonth)); } catch (e: any) { toast.error(e.message); }
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

  const results = (data?.results || []).map((r: any) => {
    const otHours = floor30(r.overtime_hours || 0);
    const holHours = floor30(r.holiday_hours || 0);
    const nightHours = floor30(r.night_hours || 0);
    const otPay = Math.round(otHours * overtimeRate * 1.5);
    const holPay = Math.round(holHours * overtimeRate * 1.5);
    const nightPay = Math.round(nightHours * overtimeRate * 1.5);
    const basePay = r.base_pay || 0;
    const mealAllow = r.meal_allowance || 0;
    const gross = basePay + mealAllow + (r.bonus || 0) + (r.position_allowance || 0) + (r.other_allowance || 0) + otPay + holPay + nightPay;
    const taxBase = basePay + mealAllow;
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
    const header = ['성명','부서','입사일','퇴사일','은행','계좌번호','주민번호','기본급','일할%','식대','상여','직책수당','기타수당','근무일','연장h','연장수당','휴일h','휴일수당','지급액','국민연금','건강보험','장기요양','고용보험','소득세','주민세','공제계','실지급액'];
    const rows = results.map((r: any) => [r.name, `${r.department} ${r.team}`, r.hire_date || '', r.resign_date || '', r.bank_name, r.bank_account, r.id_number, r.base_pay, r.prorate_ratio || 100, r.meal_allowance, r.bonus, r.position_allowance, r.other_allowance, r.work_days, r.overtime_hours, r.overtime_pay, (r.holiday_hours || 0).toFixed(1), r.holiday_pay, r.gross_pay, r.national_pension, r.health_insurance, r.long_term_care, r.employment_insurance, r.income_tax, r.local_tax, r.total_deductions, r.net_pay]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `정규직급여_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

  return (
    <div className="min-w-0 fade-in space-y-4">
      <PageHeader
        eyebrow="급여"
        title="정규직 급여 계산"
        description="확정 근태 + 기본급 설정 기반 급여 자동 계산"
        actions={
          results.length > 0 ? (
            <Button variant="secondary" size="sm" leadingIcon={<Download size={14} />} onClick={handleExcel}>
              엑셀 다운로드
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <Field label="연월">
            <Input type="month" inputSize="sm" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-40" />
          </Field>
          <Field label="연장/휴일 시급 (원)">
            <Input
              type="number"
              inputSize="sm"
              value={overtimeRate}
              onChange={e => setOvertimeRate(parseInt(e.target.value) || 0)}
              className="w-28"
            />
          </Field>
          <div className="text-[var(--fs-caption)] text-[var(--text-3)] pb-1">
            × 1.5배 = <span className="tabular text-[var(--text-2)]">{fmt.format(Math.round(overtimeRate * 1.5))}</span>원/h
          </div>
          {data && (
            <Badge tone={data.is_closed ? 'success' : 'warning'} dot>
              {data.is_closed ? '마감 완료' : '미마감'}
              {data.is_closed && data.closed_at && (
                <span className="ml-1 text-[var(--text-3)]">({new Date(data.closed_at).toLocaleDateString('ko-KR')})</span>
              )}
            </Badge>
          )}
        </div>
      </Card>

      <Card tone="ghost" className="border-l-4 border-l-[var(--brand-500)] bg-[var(--brand-500)]/5 text-[var(--fs-caption)] text-[var(--brand-400)]">
        <b>수당 계산:</b> 연장/휴일/야간 각 <b>시급 × 1.5배</b> | <b>30분 단위 내림</b> (0.1~0.4h → 0, 0.5h = 30분) | 토/일/공휴일 근무 = <b>휴일(h) 별도 집계</b> (연장 제외) | 22:00~06:00 = 야간(h) 별도 | 연장 2h 초과 시 저녁식사 30분 휴게 자동 추가
      </Card>

      {data && !data.is_closed && (
        <Card tone="ghost" className="border-l-4 border-l-[var(--warning-fg)] bg-[var(--warning-bg)] text-[var(--fs-caption)] text-[var(--warning-fg)]">
          미마감 상태입니다. 기본급은 전액으로 표시됩니다. <b>확정 리스트에서 최종 마감</b> 후 결근 차감이 반영됩니다.
        </Card>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="인원" value={results.length} unit="명" tone="neutral" icon={<Users size={14} />} />
          <Stat label="총 지급액" value={fmt.format(sum('gross_pay'))} unit="원" tone="success" />
          <Stat label="총 연장수당" value={fmt.format(sum('overtime_pay'))} unit="원" tone="warning" />
          <Stat label="총 공제액" value={fmt.format(sum('total_deductions'))} unit="원" tone="danger" />
          <Stat label="총 실지급액" value={fmt.format(sum('net_pay'))} unit="원" tone="brand" />
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
          <ChartCard title="공제 항목 구성" subtitle="국민연금, 건강보험, 장기요양, 고용보험, 소득세, 주민세" height={260}>
            <PieChart>
              <Pie data={deductionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="75%"
                label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}>
                {deductionData.map((_entry, index) => (
                  <Cell key={index} fill={getColor(index)} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number | string | Array<number | string> | undefined) => [`${fmt.format(Number(value ?? 0))}원`, '']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ChartCard>
        );
      })()}

      {loading ? (
        <SkeletonCard className="h-64" />
      ) : results.length > 0 ? (
        <Card padding="none" className="overflow-hidden hover-lift">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-[var(--bg-canvas)] text-left whitespace-nowrap border-b border-[var(--border-1)]">
                  {['성명','부서','입사일','퇴사일','은행','계좌번호','주민번호'].map(h => (
                    <th key={h} className="py-2 px-2 text-eyebrow">{h}</th>
                  ))}
                  {['기본급','식대','상여','직책수당','기타수당','출근/소정','결근','연장h','연장수당','휴일h','휴일수당'].map(h => (
                    <th key={h} className="py-2 px-2 text-right text-eyebrow">{h}</th>
                  ))}
                  <th className="py-2 px-2 text-right font-bold text-[var(--success-fg)] text-eyebrow">지급액</th>
                  <th className="py-2 px-2 text-right text-eyebrow">국민연금<br/><span className="text-[8px] text-[var(--text-4)]">4.5%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">건강보험<br/><span className="text-[8px] text-[var(--text-4)]">3.545%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">장기요양<br/><span className="text-[8px] text-[var(--text-4)]">12.81%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">고용보험<br/><span className="text-[8px] text-[var(--text-4)]">0.9%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">소득세</th>
                  <th className="py-2 px-2 text-right text-eyebrow">주민세</th>
                  <th className="py-2 px-2 text-right font-bold text-[var(--danger-fg)] text-eyebrow">공제계</th>
                  <th className="py-2 px-2 text-right font-bold text-[var(--brand-400)] text-eyebrow">실지급</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {results.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-[var(--bg-2)]/40 transition-colors whitespace-nowrap">
                    <td className="py-1.5 px-2 font-medium text-[var(--text-1)] sticky left-0 bg-[var(--bg-1)] z-10">{r.name}</td>
                    <td className="py-1.5 px-2 text-[var(--text-3)]">{r.department} {r.team}</td>
                    <td className="py-1.5 px-2 text-[var(--text-3)] text-[9px]">{r.hire_date ? r.hire_date.slice(5) : '-'}</td>
                    <td className="py-1.5 px-2 text-[9px]">{r.resign_date ? <span className="text-[var(--danger-fg)]">{r.resign_date.slice(5)}</span> : <span className="text-[var(--text-4)]">-</span>}</td>
                    <td className="py-1.5 px-2 text-[var(--text-3)] text-[9px]">{r.bank_name || '-'}</td>
                    <td className="py-1.5 px-2 text-[var(--text-3)] font-mono text-[9px]">{r.bank_account || '-'}</td>
                    <td className="py-1.5 px-2 text-[var(--text-3)] font-mono text-[9px]">{r.id_number || '-'}</td>
                    <td className="py-1.5 px-2 text-right tabular">
                      {fmt.format(r.base_pay)}
                      {r.prorate_ratio < 100 && <span className="ml-0.5 text-[8px] text-[var(--warning-fg)]">({r.prorate_ratio}%)</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular">{fmt.format(r.meal_allowance)}</td>
                    <td className="py-1.5 px-2 text-right tabular">{fmt.format(r.bonus)}</td>
                    <td className="py-1.5 px-2 text-right tabular">{fmt.format(r.position_allowance || 0)}</td>
                    <td className="py-1.5 px-2 text-right tabular">{fmt.format(r.other_allowance || 0)}</td>
                    <td className="py-1.5 px-2 text-right tabular">{r.actual_work_days ?? r.work_days}<span className="text-[var(--text-4)]">/{r.scheduled_work_days ?? '-'}</span></td>
                    <td className="py-1.5 px-2 text-right tabular">{(r.absent_days || 0) > 0 ? <span className="text-[var(--danger-fg)] font-medium">{r.absent_days}</span> : <span className="text-[var(--text-4)]">0</span>}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--warning-fg)]">{(r.overtime_hours || 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--warning-fg)]">{fmt.format(r.overtime_pay)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--danger-fg)]">{(r.holiday_hours || 0).toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--danger-fg)]">{fmt.format(r.holiday_pay)}</td>
                    <td className="py-1.5 px-2 text-right tabular font-medium text-[var(--success-fg)]">{fmt.format(r.gross_pay)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--text-3)]">{fmt.format(r.national_pension)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--text-3)]">{fmt.format(r.health_insurance)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--text-3)]">{fmt.format(r.long_term_care)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--text-3)]">{fmt.format(r.employment_insurance)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--text-3)]">{fmt.format(r.income_tax)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--text-3)]">{fmt.format(r.local_tax)}</td>
                    <td className="py-1.5 px-2 text-right tabular text-[var(--danger-fg)] font-medium">{fmt.format(r.total_deductions)}</td>
                    <td className="py-1.5 px-2 text-right tabular font-bold text-[var(--brand-400)]">{fmt.format(r.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--brand-500)]/10 border-t-2 border-[var(--brand-500)]/30 font-bold text-[10px]">
                  <td className="py-2 px-2 text-[var(--brand-400)]" colSpan={13}>합계 ({results.length}명)</td>
                  <td className="py-2 px-2 text-right tabular">{sum('absent_days')}</td>
                  <td className="py-2 px-2 text-right tabular">{sum('overtime_hours').toFixed(1)}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('overtime_pay'))}</td>
                  <td className="py-2 px-2 text-right tabular">{sum('holiday_hours').toFixed(1)}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('holiday_pay'))}</td>
                  <td className="py-2 px-2 text-right tabular text-[var(--success-fg)]">{fmt.format(sum('gross_pay'))}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('national_pension'))}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('health_insurance'))}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('long_term_care'))}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('employment_insurance'))}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('income_tax'))}</td>
                  <td className="py-2 px-2 text-right tabular">{fmt.format(sum('local_tax'))}</td>
                  <td className="py-2 px-2 text-right tabular text-[var(--danger-fg)]">{fmt.format(sum('total_deductions'))}</td>
                  <td className="py-2 px-2 text-right tabular text-[var(--brand-400)]">{fmt.format(sum('net_pay'))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      ) : data ? (
        <EmptyState
          icon={<Calculator className="w-7 h-7" />}
          title="데이터 없음"
          description="해당 월에 확정된 근태 데이터가 없습니다."
        />
      ) : null}
    </div>
  );
}
