"use client";

import { useState, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Download, Users } from "lucide-react";
import { getPayrollCalc } from "@/lib/api";
import SessionPasswordGate from "@/components/SessionPasswordGate";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard, { TOOLTIP_STYLE } from "@/components/charts/ChartCard";
import { getColor } from "@/lib/chartColors";
import {
  PageHeader, Card, CardHeader, Stat, Badge, Button, Input, Field, SkeletonCard, EmptyState, useToast,
} from "@/components/ui";

const fmt = new Intl.NumberFormat('ko-KR');

type SortKey = 'name' | 'department' | 'hire_date' | 'resign_date' | 'base_pay' | 'meal_allowance' | 'bonus' | 'actual_work_days' | 'absent_days' | 'overtime_hours' | 'holiday_hours' | 'gross_pay' | 'net_pay';

export default function PayrollCalcPage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [yearMonth, setYearMonth] = usePersistedState("pc_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [overtimeRate, setOvertimeRate] = useState(10030);
  const [sortKey, setSortKey] = usePersistedState<SortKey>("pc_sortKey", "hire_date");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("pc_sortDir", "desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === 'name' || key === 'department' ? "asc" : "desc"); }
  };
  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getPayrollCalc(yearMonth)); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);


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
    const header = ['성명','부서','입사일','퇴사일','은행','계좌번호','주민번호','기본급','일할%','식대','상여','직책수당','기타수당','근무일','연장h','연장수당','휴일h','휴일수당','지급액','국민연금(4.5%)','건강보험(3.545%)','장기요양(건보×12.81%)','고용보험(0.9%)','소득세(지급액×3%)','주민세(소득세×10%)','공제계','실지급액'];
    // 계좌번호·주민번호는 텍스트로 강제(엑셀 자동 숫자 변환·지수 표기 방지). 빈 칸은 빈 문자열로.
    const TEXT_COLS = new Set([5, 6]);
    const rows = results.map((r: any) => [r.name, `${r.department} ${r.team}`, r.hire_date || '', r.resign_date || '', r.bank_name || '', String(r.bank_account ?? ''), String(r.id_number ?? ''), r.base_pay, r.prorate_ratio || 100, r.meal_allowance, r.bonus, r.position_allowance, r.other_allowance, r.work_days, r.overtime_hours, r.overtime_pay, Number((r.holiday_hours || 0).toFixed(1)), r.holiday_pay, r.gross_pay, r.national_pension, r.health_insurance, r.long_term_care, r.employment_insurance, r.income_tax, r.local_tax, r.total_deductions, r.net_pay]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    rows.forEach((row: any[], ri: number) => {
      TEXT_COLS.forEach(ci => {
        const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
        const cell = ws[addr];
        if (cell) { cell.t = 's'; cell.v = row[ci]; cell.z = '@'; }
      });
    });

    // 요율 기준 시트 — 4대보험·세금 산정 근거
    const ratesSheet = XLSX.utils.aoa_to_sheet([
      ['항목', '요율', '과세표준', '비고'],
      ['국민연금', '4.5%', '기본급 + 식대', '근로자 부담분 (사업주 동일 4.5% 별도 부담)'],
      ['건강보험', '3.545%', '기본급 + 식대', '근로자 부담분 (2024년 보수월액 기준)'],
      ['장기요양보험', '12.81%', '건강보험료', '건강보험료 × 12.81% (근로자 부담분)'],
      ['고용보험', '0.9%', '기본급 + 식대', '근로자 부담분 (실업급여 기여분)'],
      ['소득세', '3%', '지급액 (기본급+식대+상여+수당+연장+휴일)', '간이세액 근사치 — 정확한 산정은 간이세액표 적용 필요'],
      ['지방소득세(주민세)', '10%', '소득세', '소득세 × 10%'],
      [],
      ['※ 일할 계산 적용', '', '', ''],
      ['입사월·퇴사월', 'calendar 일할 × 근무율', '입사일~퇴사일 window', '예) 4/1 입사·22일 평일 모두 근무 → 30/30 × 22/22 = 100%'],
      ['일반월(마감 후)', '결근 차감', '월 소정근로일', '결근일 × (월급 / 소정근로일) 차감'],
      ['일반월(마감 전)', '전액 지급', '-', '결근 차감은 마감 후 적용'],
      [],
      ['연장수당', '시급 × 시간 × 1.5배', '연장 근로시간', '50% 가산'],
      ['휴일수당', '시급 × 시간 × 1.5배', '휴일 근로시간', '50% 가산'],
    ]);
    ratesSheet['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 36 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '급여');
    XLSX.utils.book_append_sheet(wb, ratesSheet, '요율 기준');
    XLSX.writeFile(wb, `정규직급여_${yearMonth}.xlsx`);
  };

  // 정렬 적용 — 기본 입사일 최근순. 컬럼 헤더 클릭으로 변경 가능
  const sortedResults = [...results].sort((a: any, b: any) => {
    const av = a?.[sortKey], bv = b?.[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    // 빈 값은 항상 끝
    const aEmpty = av === null || av === undefined || av === '';
    const bEmpty = bv === null || bv === undefined || bv === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv), 'ko') * dir;
  });

  if (!authorized) return <SessionPasswordGate title="급여 계산 접근" onVerified={() => setAuthorized(true)} />;

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
                  <th className="py-2 px-2 text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('name')}>성명{sortIcon('name')}</th>
                  <th className="py-2 px-2 text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('department')}>부서{sortIcon('department')}</th>
                  <th className="py-2 px-2 text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('hire_date')}>입사일{sortIcon('hire_date')}</th>
                  <th className="py-2 px-2 text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('resign_date')}>퇴사일{sortIcon('resign_date')}</th>
                  <th className="py-2 px-2 text-eyebrow">은행</th>
                  <th className="py-2 px-2 text-eyebrow">계좌번호</th>
                  <th className="py-2 px-2 text-eyebrow">주민번호</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('base_pay')}>기본급{sortIcon('base_pay')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('meal_allowance')}>식대{sortIcon('meal_allowance')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('bonus')}>상여{sortIcon('bonus')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow">직책수당</th>
                  <th className="py-2 px-2 text-right text-eyebrow">기타수당</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('actual_work_days')}>출근/소정{sortIcon('actual_work_days')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('absent_days')}>결근{sortIcon('absent_days')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('overtime_hours')}>연장h{sortIcon('overtime_hours')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow">연장수당</th>
                  <th className="py-2 px-2 text-right text-eyebrow cursor-pointer select-none hover:text-[var(--brand-400)]" onClick={() => toggleSort('holiday_hours')}>휴일h{sortIcon('holiday_hours')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow">휴일수당</th>
                  <th className="py-2 px-2 text-right font-bold text-[var(--success-fg)] text-eyebrow cursor-pointer select-none hover:text-[var(--brand-300)]" onClick={() => toggleSort('gross_pay')}>지급액{sortIcon('gross_pay')}</th>
                  <th className="py-2 px-2 text-right text-eyebrow">국민연금<br/><span className="text-[8px] text-[var(--text-4)]">4.5%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">건강보험<br/><span className="text-[8px] text-[var(--text-4)]">3.545%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">장기요양<br/><span className="text-[8px] text-[var(--text-4)]">12.81%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">고용보험<br/><span className="text-[8px] text-[var(--text-4)]">0.9%</span></th>
                  <th className="py-2 px-2 text-right text-eyebrow">소득세</th>
                  <th className="py-2 px-2 text-right text-eyebrow">주민세</th>
                  <th className="py-2 px-2 text-right font-bold text-[var(--danger-fg)] text-eyebrow">공제계</th>
                  <th className="py-2 px-2 text-right font-bold text-[var(--brand-400)] text-eyebrow cursor-pointer select-none hover:text-[var(--brand-300)]" onClick={() => toggleSort('net_pay')}>실지급{sortIcon('net_pay')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {sortedResults.map((r: any, i: number) => (
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
