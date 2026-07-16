"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Calculator, Download, Users, Lock, Unlock, Upload as UploadIcon } from "lucide-react";
import {
  getConfirmedList, getWorkersLite, updateWorkerHourlyRate, bulkWorkerHourlyRate,
  getAlbaSettlement, saveAlbaSettlementLine, closeAlbaSettlement, reopenAlbaSettlement,
  type AlbaSettlementState,
} from "@/lib/api";
import SessionPasswordGate from "@/components/SessionPasswordGate";
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
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
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
  const [hourlyRate, setHourlyRate] = usePersistedState<number>("sa_hourlyRate", 11000);
  // 서버 저장 상태: 식대공제·조정(+/-)·마감상태를 년월별로 관리
  const [settlementState, setSettlementState] = useState<AlbaSettlementState | null>(null);
  const [linesByName, setLinesByName] = useState<Record<string, { adjust: number; meal: number }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const lineTimers = useRef<Record<string, any>>({});
  const isClosed = settlementState?.status === 'closed';
  // 직원별 시급(로컬) — workerByIdentity 매칭으로 worker.hourly_rate 초기화. 편집 시 600ms debounce 자동저장.
  const [rates, setRates] = useState<Record<number, number>>({});
  const rateTimers = useRef<Record<number, any>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workersResp, confList, settlement] = await Promise.all([
        getWorkersLite().catch(() => ({ workers: [] })),
        getConfirmedList(yearMonth, ''),
        getAlbaSettlement(yearMonth).catch(() => null),
      ]);
      if (settlement) {
        setSettlementState(settlement.state);
        const map: Record<string, { adjust: number; meal: number }> = {};
        for (const ln of settlement.lines || []) {
          map[ln.employee_name] = { adjust: ln.adjust_amount || 0, meal: ln.meal_deduction || 0 };
        }
        setLinesByName(map);
      } else {
        setSettlementState({ year_month: yearMonth, status: 'open', closed_at: null, closed_by: '', reopened_at: null, reopened_by: '', note: '' });
        setLinesByName({});
      }
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
              worker_id: worker.id || null,
              department: worker.department || '',
              workplace: worker.workplace || '',
              category: worker.category || '',
              hourly_rate: parseInt(worker.hourly_rate) || 0,
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
      const initRates: Record<number, number> = {};
      results.forEach((r: any, i: number) => {
        initRates[i] = r.hourly_rate > 0 ? r.hourly_rate : hourlyRate;
      });
      setRates(initRates);
      // 식대공제·조정(+/-)은 서버(alba_settlement_line)에서 로드됨
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [yearMonth, hourlyRate]);

  useEffect(() => { if (authorized) load(); }, [load, authorized]);

  const getMeal = (name: string) => linesByName[name]?.meal || 0;
  const getAdjust = (name: string) => linesByName[name]?.adjust || 0;

  const scheduleLineSave = useCallback((name: string, adjust: number, meal: number) => {
    if (lineTimers.current[name]) clearTimeout(lineTimers.current[name]);
    lineTimers.current[name] = setTimeout(async () => {
      setSaving(s => ({ ...s, [name]: true }));
      try {
        await saveAlbaSettlementLine(yearMonth, { employee_name: name, adjust_amount: adjust, meal_deduction: meal });
      } catch (e: any) {
        toast.error(`저장 실패 (${name}): ${e.message || e}`);
      } finally {
        setSaving(s => { const n = { ...s }; delete n[name]; return n; });
      }
    }, 500);
  }, [yearMonth, toast]);

  const setMeal = (name: string, value: number) => {
    if (isClosed) { toast.error('마감된 월은 편집할 수 없습니다.'); return; }
    const v = Math.max(0, Math.trunc(value || 0));
    const cur = linesByName[name] || { adjust: 0, meal: 0 };
    const next = { adjust: cur.adjust, meal: v };
    setLinesByName(prev => ({ ...prev, [name]: next }));
    scheduleLineSave(name, next.adjust, next.meal);
  };

  const setAdjust = (name: string, value: number) => {
    if (isClosed) { toast.error('마감된 월은 편집할 수 없습니다.'); return; }
    const v = Math.trunc(value || 0);
    const cur = linesByName[name] || { adjust: 0, meal: 0 };
    const next = { adjust: v, meal: cur.meal };
    setLinesByName(prev => ({ ...prev, [name]: next }));
    scheduleLineSave(name, next.adjust, next.meal);
  };

  const handleClose = async () => {
    if (!confirm(`${yearMonth} 알바(사업소득) 정산을 마감할까요?\n마감 후에는 조정·식대공제 값이 잠깁니다. (관리자가 재개할 수 있음)`)) return;
    try {
      const r = await closeAlbaSettlement(yearMonth);
      setSettlementState(r.state);
      toast.success(`${yearMonth} 마감 완료`);
    } catch (e: any) { toast.error(e.message); }
  };

  const handleReopen = async () => {
    if (!confirm(`${yearMonth} 정산 마감을 재개할까요?\n(감사 기록에 재개 시각·계정이 남습니다)`)) return;
    try {
      const r = await reopenAlbaSettlement(yearMonth);
      setSettlementState(r.state);
      toast.success(`${yearMonth} 마감 재개 완료`);
    } catch (e: any) { toast.error(e.message); }
  };

  // CSV 재업로드 — 어제 다운로드한 v2 CSV(조정·식대공제 열 포함)로 서버 값 복원.
  const csvInputRef = useRef<HTMLInputElement>(null);
  const parseCsv = (text: string): string[][] => {
    // BOM 제거
    const t = text.replace(/^﻿/, '');
    const rows: string[][] = [];
    // 간단 CSV 파서: 큰따옴표 인용 처리 포함
    let cur = '', row: string[] = [], inQ = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inQ) {
        if (ch === '"' && t[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && t[i+1] === '\n') i++;
          row.push(cur); cur = '';
          if (row.length > 1 || row[0] !== '') rows.push(row);
          row = [];
        } else cur += ch;
      }
    }
    if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
    return rows;
  };

  const handleCsvImport = async (file: File) => {
    if (isClosed) { toast.error('마감된 월은 편집할 수 없습니다. 먼저 마감 재개하세요.'); return; }
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { toast.error('CSV 데이터 행이 없습니다.'); return; }
      const header = rows[0].map(s => (s || '').trim());
      const nameIdx = header.findIndex(h => h === '이름');
      const adjustIdx = header.findIndex(h => h === '조정(+/-)' || h === '조정');
      const mealIdx = header.findIndex(h => h === '식대공제');
      if (nameIdx < 0) { toast.error(`CSV에 '이름' 열이 없습니다. 헤더: ${header.slice(0,5).join(', ')}...`); return; }
      if (adjustIdx < 0 && mealIdx < 0) { toast.error("CSV에 '조정(+/-)' 또는 '식대공제' 열이 없습니다."); return; }

      const toNum = (s: string): number => {
        const n = parseInt(String(s || '').replace(/[^0-9\-]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
      };

      let ok = 0, skipped = 0, failed = 0;
      const pendingLines: Record<string, { adjust: number; meal: number }> = { ...linesByName };
      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        const name = (cols[nameIdx] || '').trim();
        if (!name || name === '합계' || name.startsWith('합계')) { skipped++; continue; }
        const adj = adjustIdx >= 0 ? toNum(cols[adjustIdx]) : (linesByName[name]?.adjust || 0);
        const meal = mealIdx >= 0 ? Math.max(0, toNum(cols[mealIdx])) : (linesByName[name]?.meal || 0);
        try {
          await saveAlbaSettlementLine(yearMonth, { employee_name: name, adjust_amount: adj, meal_deduction: meal });
          pendingLines[name] = { adjust: adj, meal };
          ok++;
        } catch { failed++; }
      }
      setLinesByName(pendingLines);
      toast.success(`복원 완료 · 저장 ${ok}건${skipped ? ` · 건너뜀 ${skipped}` : ''}${failed ? ` · 실패 ${failed}` : ''}`);
    } catch (e: any) {
      toast.error(`CSV 파싱 실패: ${e.message || e}`);
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  // 안전장치: 탭 유지된 경우 sessionStorage 잔존값 감지 → 배너로 안내.
  const [legacyBanner, setLegacyBanner] = useState<{ adjustCount: number; mealCount: number } | null>(null);
  useEffect(() => {
    if (!authorized || !settlementState) return;
    try {
      const rawAdj = sessionStorage.getItem('ps_sa_adjustmentsByKey');
      const rawMeal = sessionStorage.getItem('ps_sa_mealDeductionsByKey');
      if (!rawAdj && !rawMeal) return;
      const adjMap: Record<string, number> = rawAdj ? JSON.parse(rawAdj) : {};
      const mealMap: Record<string, number> = rawMeal ? JSON.parse(rawMeal) : {};
      const prefix = `${yearMonth}|`;
      const adjustCount = Object.entries(adjMap).filter(([k, v]) => k.startsWith(prefix) && v !== 0).length;
      const mealCount = Object.entries(mealMap).filter(([k, v]) => k.startsWith(prefix) && v > 0).length;
      if (adjustCount > 0 || mealCount > 0) setLegacyBanner({ adjustCount, mealCount });
      else setLegacyBanner(null);
    } catch {}
  }, [authorized, yearMonth, settlementState]);

  const handleLegacyRestore = async () => {
    if (!confirm(`탭에 남은 이전 값을 서버로 이관합니다.\n조정 ${legacyBanner?.adjustCount || 0}건 + 식대공제 ${legacyBanner?.mealCount || 0}건.\n서버에 이미 값이 있는 인원은 덮어씁니다.`)) return;
    try {
      const rawAdj = sessionStorage.getItem('ps_sa_adjustmentsByKey');
      const rawMeal = sessionStorage.getItem('ps_sa_mealDeductionsByKey');
      const adjMap: Record<string, number> = rawAdj ? JSON.parse(rawAdj) : {};
      const mealMap: Record<string, number> = rawMeal ? JSON.parse(rawMeal) : {};
      const prefix = `${yearMonth}|`;
      const nameSet = new Set<string>();
      for (const k of Object.keys(adjMap)) if (k.startsWith(prefix)) nameSet.add(k.slice(prefix.length));
      for (const k of Object.keys(mealMap)) if (k.startsWith(prefix)) nameSet.add(k.slice(prefix.length));
      const pendingLines: Record<string, { adjust: number; meal: number }> = { ...linesByName };
      let ok = 0, failed = 0;
      for (const name of nameSet) {
        const adj = adjMap[`${prefix}${name}`] || 0;
        const meal = mealMap[`${prefix}${name}`] || 0;
        try {
          await saveAlbaSettlementLine(yearMonth, { employee_name: name, adjust_amount: adj, meal_deduction: meal });
          pendingLines[name] = { adjust: adj, meal };
          ok++;
        } catch { failed++; }
      }
      setLinesByName(pendingLines);
      setLegacyBanner(null);
      toast.success(`sessionStorage 이관 완료 · ${ok}건${failed ? ` · 실패 ${failed}` : ''}`);
    } catch (e: any) {
      toast.error(`이관 실패: ${e.message || e}`);
    }
  };

  const calcEmp = (r: any, idx: number) => {
    const floor30 = (h: number) => Math.floor(h * 2) / 2;
    const rate = rates[idx] ?? (r.hourly_rate > 0 ? r.hourly_rate : hourlyRate);
    const holHours = floor30(r.holiday_pay_hours || 0);
    const otRawHours = floor30(r.overtime_hours);
    // 백엔드 recalc가 휴일 근무를 overtime_hours 로 밀어넣기 때문에 holiday_pay_hours 와
    // overtime_hours 가 동일한 휴일 근무 시간을 중복 보유한다. 휴일수당 1.5x 로만 지급하고
    // 연장수당 계산에서는 그만큼 차감해 이중 반영을 막는다. (근기법 §56②)
    const otPayHours = Math.max(0, otRawHours - holHours);
    const nightHours = floor30(r.night_hours || 0);
    const basePay = Math.round(r.regular_hours * rate);
    const overtimePay = Math.round(otPayHours * rate * 1.5);
    const holidayPay = Math.round(holHours * rate * 1.5);
    const nightPay = Math.round(nightHours * rate * 1.5);
    const whPay = Math.round(r.weekly_holiday_hours * rate);
    const rawPay = basePay + overtimePay + holidayPay + nightPay + whPay;
    const adjust = getAdjust(r.name);
    const grossPay = rawPay + adjust;
    const meal = getMeal(r.name);
    const netBeforeTax = grossPay - meal;
    const incomeTax = Math.round(netBeforeTax * 0.033);
    const localTax = Math.round(netBeforeTax * 0.0033);
    const netPay = netBeforeTax - incomeTax - localTax;
    return { rate, otPayHours, basePay, overtimePay, holidayPay, nightPay, whPay, rawPay, adjust, grossPay, meal, netBeforeTax, incomeTax, localTax, netPay };
  };

  const onRateChange = (idx: number, workerId: number | null, value: string) => {
    const num = parseInt((value || '').replace(/[^0-9]/g, ''), 10) || 0;
    setRates(prev => ({ ...prev, [idx]: num }));
    if (!workerId) return;  // 워커 DB 매칭 안된 경우 저장 안 함
    if (rateTimers.current[idx]) clearTimeout(rateTimers.current[idx]);
    rateTimers.current[idx] = setTimeout(async () => {
      try { await updateWorkerHourlyRate(workerId, num); }
      catch (e: any) { toast.error(e.message); }
    }, 600);
  };

  const handleBulkApply = async () => {
    if (!confirm(`알바(사업소득) 카테고리 전체 시급을 ${fmt.format(hourlyRate)}원으로 일괄 적용합니다. 진행할까요?`)) return;
    try {
      const r = await bulkWorkerHourlyRate('알바', hourlyRate);
      toast.success(`${r.updated || 0}명 일괄 적용 완료`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const results = data?.results || [];
  const rows = results.map((r: any, i: number) => ({ ...r, idx: i, ...calcEmp(r, i) }));
  const totals: any = {};
  ['work_days','regular_hours','overtime_hours','otPayHours','night_hours','holiday_pay_hours','weekly_holiday_hours','basePay','overtimePay','holidayPay','nightPay','whPay','rawPay','adjust','grossPay','meal','incomeTax','localTax','netPay'].forEach(k => {
    totals[k] = rows.reduce((s: number, r: any) => s + (r[k] || 0), 0);
  });

  const handleExcel = () => {
    const header = ['이름','소속','연락처','은행','계좌번호','근무일','시급','기본h','연장h','야간h','휴일h','주휴h','기본급','연장수당','휴일수당','야간수당','주휴수당','조정(+/-)','급여계','식대공제','소득세(3.3%)','지방세(0.33%)','실지급'];
    const csvRows = rows.map((r: any) => [r.name,r.department || r.workplace || '',r.phone,r.bank_name,r.bank_account,r.work_days,r.rate || 0,r.regular_hours,(r.otPayHours ?? r.overtime_hours),r.night_hours || 0,r.holiday_pay_hours || 0,r.weekly_holiday_hours,r.basePay,r.overtimePay,r.holidayPay,r.nightPay,r.whPay,r.adjust || 0,r.grossPay,r.meal,r.incomeTax,r.localTax,r.netPay]);
    const csv = [header, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `알바정산_${yearMonth}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!authorized) return <SessionPasswordGate title="알바(사업소득) 정산 접근" onVerified={() => setAuthorized(true)} />;

  return (
    <div className="min-w-0 space-y-4 fade-in">
      <PageHeader
        eyebrow="정산"
        title="알바(사업소득) 정산관리"
        description="수당 계산: 시급×1.5배 | 30분 내림 | 주5일 이하 휴일→수당없음 | 공휴일→휴일수당 | 야간(22~06)→연장 | 소득세3.3%+지방세0.33%"
        actions={
          <div className="flex gap-2 items-center">
            {isClosed ? (
              <>
                <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded bg-[var(--danger-bg)] text-[var(--danger-fg)] border border-[var(--danger-border)]" title={`${settlementState?.closed_at?.slice(0,16).replace('T',' ')} · ${settlementState?.closed_by || '-'}`}>
                  <Lock size={12} /> 마감됨
                </span>
                <Button variant="secondary" size="sm" leadingIcon={<Unlock size={14} />} onClick={handleReopen}>마감 재개</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" leadingIcon={<UploadIcon size={14} />} onClick={() => csvInputRef.current?.click()} title="이전에 다운받은 알바정산 CSV로 조정·식대공제 값을 복원합니다">CSV 복원</Button>
                {rows.length > 0 && (
                  <Button variant="primary" size="sm" leadingIcon={<Lock size={14} />} onClick={handleClose}>월 마감</Button>
                )}
              </>
            )}
            {rows.length > 0 && (
              <Button variant="secondary" size="sm" leadingIcon={<Download size={14} />} onClick={handleExcel}>
                엑셀 다운로드
              </Button>
            )}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); }}
            />
          </div>
        }
      />
      {legacyBanner && !isClosed && (
        <div className="p-3 rounded-[var(--r-md)] bg-[var(--warning-bg)] border border-[var(--warning-border)] text-[var(--warning-fg)] text-[12px] flex justify-between items-center gap-2">
          <div>
            <b>이전 브라우저 값 감지</b> — 이 탭 sessionStorage에 {yearMonth} 조정 {legacyBanner.adjustCount}건 + 식대공제 {legacyBanner.mealCount}건이 남아있습니다.
            <br />
            <span className="text-[11px] opacity-80">어제 값이면 서버로 이관하세요. 이 알림은 이관하거나 다른 월을 열면 사라집니다.</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="primary" size="sm" onClick={handleLegacyRestore}>서버로 이관</Button>
            <Button variant="ghost" size="sm" onClick={() => setLegacyBanner(null)}>닫기</Button>
          </div>
        </div>
      )}
      {isClosed && (
        <div className="p-3 rounded-[var(--r-md)] bg-[var(--danger-bg)] border border-[var(--danger-border)] text-[var(--danger-fg)] text-[12px]">
          <b>{yearMonth}</b> 정산이 마감되었습니다 — 조정·식대공제 입력이 잠겼습니다.
          {settlementState?.closed_at && <> · 마감: {settlementState.closed_at.slice(0,16).replace('T',' ')}</>}
          {settlementState?.closed_by && <> ({settlementState.closed_by})</>}
        </div>
      )}

      <Toolbar>
        <Field label="연월">
          <Input type="month" inputSize="sm" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-40" />
        </Field>
        <Field label="시급 일괄 설정 (원)">
          <div className="flex gap-1.5 items-center">
            <Input type="number" inputSize="sm" value={hourlyRate} onChange={e => setHourlyRate(parseInt(e.target.value) || 0)} className="w-28" disabled={isClosed} />
            <Button size="sm" variant="secondary" onClick={handleBulkApply} title="알바 카테고리 전체 직원 시급을 일괄 변경 (DB 저장)" disabled={isClosed}>전체 적용</Button>
          </div>
        </Field>
        <div className="text-[var(--fs-caption)] text-[var(--text-3)] pb-1">개별 시급은 표 안에서 직접 편집 (자동 저장)</div>
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
                <col className="w-[80px]" />
                <col className="w-[55px]" />
                <col className="w-[90px]" />
                <col className="w-[80px]" />
                <col className="w-[28px]" />
                <col className="w-[55px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[38px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[65px]" />
                <col className="w-[75px]" />
                <col className="w-[70px]" />
                <col className="w-[65px]" />
                <col className="w-[60px]" />
                <col className="w-[55px]" />
                <col className="w-[75px]" />
              </colgroup>
              <THead>
                <TR>
                  <TH>이름</TH>
                  <TH>소속</TH>
                  <TH>은행</TH>
                  <TH>계좌번호</TH>
                  <TH>주민번호</TH>
                  <TH numeric>일</TH>
                  <TH numeric>시급<br/><span className="text-[8px] text-[var(--text-4)]">편집</span></TH>
                  <TH numeric>기본h</TH>
                  <TH numeric>연장h</TH>
                  <TH numeric>야간h</TH>
                  <TH numeric>휴일h</TH>
                  <TH numeric>주휴h</TH>
                  <TH numeric>기본급</TH>
                  <TH numeric>연장수당</TH>
                  <TH numeric>휴일수당</TH>
                  <TH numeric>야간수당</TH>
                  <TH numeric>주휴수당</TH>
                  <TH numeric title="내부 결산과 차이 나는 금액을 +/- 로 보정합니다. 급여계에 가산되고 소득세·지방세도 이 값 기준으로 재계산됩니다.">조정(+/-)</TH>
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
                    <TD muted className="truncate" title={`${r.department || ''} ${r.workplace || ''}`.trim() || '-'}>{r.department || r.workplace || '-'}</TD>
                    <TD muted className="truncate">{r.bank_name || '-'}</TD>
                    <TD muted className="font-mono text-[9px] truncate">{r.bank_account || '-'}</TD>
                    <TD muted className="font-mono text-[9px] truncate">{r.id_number || '-'}</TD>
                    <TD numeric>{r.work_days}</TD>
                    <TD className="p-0.5">
                      <input
                        type="number"
                        className="w-full px-1 py-1 text-right text-[10px] tabular bg-[var(--bg-canvas)] border border-[var(--border-1)] rounded focus:border-[var(--brand-500)] focus:outline-none disabled:opacity-60"
                        value={rates[r.idx] ?? (r.hourly_rate > 0 ? r.hourly_rate : hourlyRate)}
                        onChange={e => onRateChange(r.idx, r.worker_id, e.target.value)}
                        disabled={isClosed}
                        title={isClosed ? "마감된 월은 편집 불가" : "이 직원의 시급 — 자동저장 (worker_id 매칭된 경우만)"}
                      />
                    </TD>
                    <TD numeric>{r.regular_hours}</TD>
                    <TD numeric className="text-[var(--warning-fg)]" title="휴일 근무 시간은 휴일h 로 분리 표시됩니다">{(r.otPayHours ?? r.overtime_hours).toFixed(1)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{(r.night_hours || 0).toFixed(1)}</TD>
                    <TD numeric className="text-[var(--warning-fg)]">{(r.holiday_pay_hours || 0).toFixed(1)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{r.weekly_holiday_hours}</TD>
                    <TD numeric>{fmt.format(r.basePay)}</TD>
                    <TD numeric className="text-[var(--warning-fg)]">{fmt.format(r.overtimePay)}</TD>
                    <TD numeric className="text-[var(--warning-fg)]">{fmt.format(r.holidayPay)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{fmt.format(r.nightPay)}</TD>
                    <TD numeric className="text-[var(--brand-400)]">{fmt.format(r.whPay)}</TD>
                    <TD className="p-0.5">
                      <input
                        type="number"
                        className={`w-full px-1 py-1 text-right text-[10px] tabular bg-[var(--bg-canvas)] border border-[var(--border-1)] rounded focus:border-[var(--brand-500)] focus:outline-none disabled:opacity-60 ${r.adjust > 0 ? 'text-[var(--success-fg)]' : r.adjust < 0 ? 'text-[var(--danger-fg)]' : ''}`}
                        value={r.adjust || ''}
                        onChange={e => setAdjust(r.name, parseInt((e.target.value || '').replace(/[^0-9\-]/g, ''), 10) || 0)}
                        placeholder="0"
                        disabled={isClosed}
                        title={isClosed ? "마감된 월은 편집 불가" : `+/- 조정 금액 (예: -5000, 12000). 급여계에 가산됨.${saving[r.name] ? ' · 저장 중...' : ''}`}
                      />
                    </TD>
                    <TD numeric emphasis title={r.adjust !== 0 ? `원본 ${fmt.format(r.rawPay)} + 조정 ${r.adjust > 0 ? '+' : ''}${fmt.format(r.adjust)}` : undefined}>{fmt.format(r.grossPay)}</TD>
                    <TD>
                      <Input type="number" inputSize="sm" value={getMeal(r.name) || ''} onChange={e => setMeal(r.name, parseInt(e.target.value) || 0)}
                        className="w-full text-right" placeholder="0" disabled={isClosed}
                        title={isClosed ? "마감된 월은 편집 불가" : (saving[r.name] ? '저장 중...' : '식대공제 — 자동저장')} />
                    </TD>
                    <TD numeric className="text-[var(--danger-fg)]">{fmt.format(r.incomeTax)}</TD>
                    <TD numeric className="text-[var(--danger-fg)]">{fmt.format(r.localTax)}</TD>
                    <TD numeric emphasis className="text-[var(--success-fg)]">{fmt.format(r.netPay)}</TD>
                  </TR>
                ))}
              </TBody>
              <tfoot>
                <TR className="bg-[var(--warning-bg)] border-t-2 border-[var(--warning-border)] font-bold text-[10px]">
                  <TD colSpan={5} className="text-[var(--text-2)]">합계 ({rows.length}명)</TD>
                  <TD numeric>{totals.work_days}</TD>
                  <TD numeric className="text-[var(--text-4)]">-</TD>
                  <TD numeric>{(totals.regular_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.otPayHours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.night_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{(totals.holiday_pay_hours || 0).toFixed(1)}</TD>
                  <TD numeric>{totals.weekly_holiday_hours || 0}</TD>
                  <TD numeric>{fmt.format(totals.basePay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.overtimePay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.holidayPay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.nightPay || 0)}</TD>
                  <TD numeric>{fmt.format(totals.whPay || 0)}</TD>
                  <TD numeric className={totals.adjust > 0 ? 'text-[var(--success-fg)]' : totals.adjust < 0 ? 'text-[var(--danger-fg)]' : ''}>{totals.adjust > 0 ? '+' : ''}{fmt.format(totals.adjust || 0)}</TD>
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
