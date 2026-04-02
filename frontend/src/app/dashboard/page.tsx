"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Calendar, DollarSign, BarChart3, ChevronLeft, ChevronRight, AlertTriangle, Info } from "lucide-react";
import { getReportSummary, getReportDaily, getAttendanceAnomalies, getConfirmedList, getSalarySettings } from "@/lib/api";

const REGULAR_CATS = ['정규직'];
const DISPATCH_CATS = ['파견', '알바', '사업소득', '직원'];

// --- Types ---
interface SummaryRow {
  department: string;
  workplace: string;
  category: string;
  shift: string;
  attendance_count: number;
  unique_workers: number;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  annual_leave_days: number;
}

interface DailyRow {
  date: string;
  department: string;
  workplace: string;
  category: string;
  count: number;
  total_hours: number;
}

interface SummaryResponse {
  current: SummaryRow[];
  previous: SummaryRow[];
  year: number;
  month: number;
  prevYear: number;
  prevMonth: number;
  weeklyHolidayHours?: {
    current: Record<string, number>;
    previous: Record<string, number>;
  };
}

interface DailyResponse {
  data: DailyRow[];
  groups: { department: string; workplace: string }[];
  categories: string[];
  year: number;
  month: number;
}

interface Totals {
  attendance_count: number;
  unique_workers: number;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  annual_leave_days: number;
}

interface ProcessedGroup {
  key: string;
  department: string;
  workplace: string;
  rows: SummaryRow[];
  subtotal: Totals;
}

type TabId = "summary" | "salary" | "labor";

// --- Constants ---
const TABS: { id: TabId; label: string; icon: typeof Calendar }[] = [
  { id: "summary", label: "월별 근태 요약", icon: Calendar },
  { id: "salary", label: "급여 추정", icon: DollarSign },
  { id: "labor", label: "인건비 분석", icon: BarChart3 },
];

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const ZERO_TOTALS: Totals = { attendance_count: 0, unique_workers: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0, annual_leave_days: 0 };

// --- Utilities ---
const fmt = (n: number) => n.toFixed(1);
const fmtWon = (n: number) => Math.round(n).toLocaleString();
const getDayName = (d: string) => DAY_NAMES[new Date(d + "T00:00:00").getDay()];
const isWeekend = (d: string) => { const day = new Date(d + "T00:00:00").getDay(); return day === 0 || day === 6; };
const gk = (dept: string, wp: string) => wp ? `${dept}-${wp}` : dept;
const pct = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10;

// 30분 단위 내림 (전역)
const floor30g = (h: number) => Math.floor(h * 2) / 2;

function sumTotals(rows: SummaryRow[]): Totals {
  const raw = rows.reduce((a, r) => ({
    attendance_count: a.attendance_count + r.attendance_count,
    unique_workers: a.unique_workers + r.unique_workers,
    total_hours: 0, // recalculate below
    regular_hours: a.regular_hours + r.regular_hours,
    overtime_hours: a.overtime_hours + r.overtime_hours,
    night_hours: a.night_hours + (r.night_hours || 0),
    annual_leave_days: a.annual_leave_days + r.annual_leave_days,
  }), { ...ZERO_TOTALS });
  // total = regular + floor30g(overtime) + night
  raw.total_hours = raw.regular_hours + floor30g(raw.overtime_hours) + raw.night_hours;
  return raw;
}

function processSummaryGroups(data: SummaryRow[]): ProcessedGroup[] {
  const map = new Map<string, SummaryRow[]>();
  for (const row of data) {
    const k = gk(row.department, row.workplace);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return Array.from(map.entries()).map(([key, rows]) => ({
    key, department: rows[0].department, workplace: rows[0].workplace, rows, subtotal: sumTotals(rows),
  }));
}

function getDatesInMonth(year: number, month: number): string[] {
  const dates: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dates;
}

function getPrevYearMonth(y: number, m: number): [number, number] {
  return m === 1 ? [y - 1, 12] : [y, m - 1];
}

// --- Component ---
function DashboardContent() {
  const searchParams = useSearchParams();
  const dashboardType = searchParams.get("type") || "dispatch"; // "dispatch" or "regular"
  const isRegular = dashboardType === "regular";
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [dailyData, setDailyData] = useState<DailyResponse | null>(null);
  const [twoMonthsAgoData, setTwoMonthsAgoData] = useState<SummaryRow[]>([]);
  const [twoMonthsAgoWHH, setTwoMonthsAgoWHH] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [anomalyCount, setAnomalyCount] = useState(0);

  const [rates, setRates] = useState<Record<string, number>>({ "정규직": 10030, "파견": 9860, "알바": 9860 });
  const [salaryData, setSalaryData] = useState<any[]>([]); // 정규직 기본급 데이터
  const [revenue, setRevenue] = useState(0);
  const [targetRatio, setTargetRatio] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      const [prevY, prevM] = getPrevYearMonth(year, month);
      const prevYearMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;
      const allowedCats = isRegular ? REGULAR_CATS : DISPATCH_CATS;

      // Fetch both: confirmed (priority) + excel (fallback)
      const [currentConfirmed, prevConfirmed, excelSummary, excelDaily] = await Promise.all([
        getConfirmedList(yearMonth, '').catch(() => []),
        getConfirmedList(prevYearMonth, '').catch(() => []),
        getReportSummary(year, month).catch(() => ({ current: [], previous: [] })),
        getReportDaily(year, month).catch(() => ({ data: [] })),
      ]);

      const parseRow = (r: any) => ({ ...r, total_hours: parseFloat(r.total_hours) || 0, regular_hours: parseFloat(r.regular_hours) || 0, overtime_hours: parseFloat(r.overtime_hours) || 0, night_hours: parseFloat(r.night_hours) || 0, attendance_count: parseInt(r.attendance_count) || 0, unique_workers: parseInt(r.unique_workers) || 0, annual_leave_days: parseInt(r.annual_leave_days) || 0 });
      const filterCat = (rows: any[]) => (rows || []).filter((r: any) => allowedCats.some(c => (r.category || '').includes(c))).map(parseRow);

      // Check if confirmed data exists for current type
      const hasConfirmed = (currentConfirmed || []).some((e: any) => isRegular ? e.type === '정규직' : e.type !== '정규직');

      // Build confirmed summary rows
      const confirmedNames = new Set<string>();
      const toSummaryRows = (employees: any[]): SummaryRow[] => {
        const groupMap = new Map<string, SummaryRow>();
        for (const emp of (employees || [])) {
          if (isRegular && emp.type !== '정규직') continue;
          if (!isRegular && emp.type === '정규직') continue;
          confirmedNames.add(emp.name);
          const category = emp.type || '파견';
          // Determine shift: if employee has night_hours > regular_hours → 야간
          const isNightWorker = (emp.night_hours || 0) > (emp.regular_hours || 0);
          const shift = isNightWorker ? '야간' : '주간';
          const dept = emp.department || '';
          const key = `${category}-${shift}-${dept}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, { department: dept, workplace: '', category, shift, attendance_count: 0, unique_workers: 0, total_hours: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0, annual_leave_days: 0 });
          }
          const row = groupMap.get(key)!;
          row.attendance_count += emp.days || 0;
          row.unique_workers += 1;
          row.regular_hours += emp.regular_hours || 0;
          row.overtime_hours += emp.overtime_hours || 0;
          row.night_hours += emp.night_hours || 0;
          row.total_hours += (emp.regular_hours || 0) + floor30g(emp.overtime_hours || 0) + (emp.night_hours || 0);
        }
        return Array.from(groupMap.values());
      };

      const confirmedRows = toSummaryRows(currentConfirmed || []);
      const prevConfirmedRows = toSummaryRows(prevConfirmed || []);

      // Confirmed priority, excel fallback
      const excelFiltered = filterCat(excelSummary.current || []);
      const mergedCurrent = hasConfirmed ? confirmedRows : excelFiltered;
      const hasPrevConfirmed = (prevConfirmed || []).some((e: any) => isRegular ? e.type === '정규직' : e.type !== '정규직');
      const excelPrevFiltered = filterCat(excelSummary.previous || []);
      const mergedPrevious = hasPrevConfirmed ? prevConfirmedRows : excelPrevFiltered;

      // Daily data: confirmed priority, excel fallback
      let dailyRows: DailyRow[] = [];
      if (hasConfirmed) {
        const dayMap = new Map<string, DailyRow>();
        for (const emp of (currentConfirmed || [])) {
          if (isRegular && emp.type !== '정규직') continue;
          if (!isRegular && emp.type === '정규직') continue;
          for (const rec of (emp.records || [])) {
            const key = rec.date;
            if (!dayMap.has(key)) dayMap.set(key, { date: key, department: '', workplace: '', category: emp.type || '파견', count: 0, total_hours: 0 });
            const d = dayMap.get(key)!;
            d.count += 1;
            d.total_hours += (parseFloat(rec.regular_hours) || 0) + (parseFloat(rec.overtime_hours) || 0) + (parseFloat(rec.night_hours) || 0);
          }
        }
        dailyRows = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      } else if (excelDaily?.data) {
        dailyRows = (excelDaily.data || []).filter((r: any) => allowedCats.some(c => (r.category || '').includes(c))).map((r: any) => ({ ...r, total_hours: parseFloat(r.total_hours) || 0, count: parseInt(r.count) || 0 }));
      }

      // Calculate weekly holiday hours (주휴수당) from confirmed data
      // Condition: 15h+/week AND 5 days worked in the week → 8h weekly holiday per week
      const calcWeeklyHoliday = (employees: any[]): Record<string, number> => {
        const catHours: Record<string, number> = {};
        for (const emp of (employees || [])) {
          if (isRegular && emp.type !== '정규직') continue;
          if (!isRegular && emp.type === '정규직') continue;
          const cat = emp.type || '파견';
          // Group records by ISO week
          const weekMap = new Map<string, { days: number; hours: number }>();
          for (const rec of (emp.records || [])) {
            const d = new Date(rec.date + 'T00:00:00+09:00');
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay()); // Sunday start
            const weekKey = weekStart.toISOString().slice(0, 10);
            if (!weekMap.has(weekKey)) weekMap.set(weekKey, { days: 0, hours: 0 });
            const w = weekMap.get(weekKey)!;
            w.days++;
            w.hours += (parseFloat(rec.regular_hours) || 0) + (parseFloat(rec.overtime_hours) || 0);
          }
          // Count qualifying weeks
          let holidayHours = 0;
          for (const [, w] of weekMap) {
            if (w.hours >= 15 && w.days >= 5) {
              holidayHours += 8; // 8 hours per qualifying week
            }
          }
          catHours[cat] = (catHours[cat] || 0) + holidayHours;
        }
        return catHours;
      };

      const currentWHH = calcWeeklyHoliday(currentConfirmed || []);
      const prevWHH = calcWeeklyHoliday(prevConfirmed || []);

      // Use confirmed WHH if available, else from excel summary
      const finalCurrentWHH = hasConfirmed ? currentWHH : (excelSummary.weeklyHolidayHours?.current || {});
      const finalPrevWHH = hasPrevConfirmed ? prevWHH : (excelSummary.weeklyHolidayHours?.previous || {});
      setSummaryData({ current: mergedCurrent, previous: mergedPrevious, year, month, prevYear: prevY, prevMonth: prevM, weeklyHolidayHours: { current: finalCurrentWHH, previous: finalPrevWHH } });
      setDailyData({ data: dailyRows, groups: [], categories: [], year, month } as DailyResponse);
      setTwoMonthsAgoData([]);
      setTwoMonthsAgoWHH({});

      // Anomalies
      const anomalyList: any[] = [];
      for (const emp of (currentConfirmed || [])) {
        if (isRegular && emp.type !== '정규직') continue;
        if (!isRegular && emp.type === '정규직') continue;
        if (emp.overtime_hours > 52) anomalyList.push({ type: 'overtime', severity: 'high', message: `${emp.name}: 월 연장근로 ${emp.overtime_hours.toFixed(1)}시간 (52시간 초과)` });
      }
      setAnomalies(anomalyList);
      setAnomalyCount(anomalyList.length);

      // Load salary settings for regular dashboard
      if (isRegular) {
        try { const sd = await getSalarySettings(); setSalaryData(sd || []); } catch {}
      }
    } catch (err: any) {
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [year, month, isRegular]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  // Processed data
  const groups = useMemo(() => summaryData ? processSummaryGroups(summaryData.current) : [], [summaryData]);
  const grandTotal = useMemo(() => sumTotals(summaryData?.current || []), [summaryData]);
  const prevTotal = useMemo(() => sumTotals(summaryData?.previous || []), [summaryData]);
  const twoMonthsAgoTotal = useMemo(() => sumTotals(twoMonthsAgoData), [twoMonthsAgoData]);

  // Category-level totals for overtime ratio cards (shift-based)
  const categoryStats = useMemo(() => {
    const calc = (rows: SummaryRow[]) => {
      const map = new Map<string, { total_hours: number; daytime_ot: number; night_total: number }>();
      for (const r of rows) {
        const cat = r.category || "미분류";
        const prev = map.get(cat) || { total_hours: 0, daytime_ot: 0, night_total: 0 };
        map.set(cat, {
          total_hours: prev.total_hours + r.regular_hours + floor30g(r.overtime_hours) + (r.night_hours || 0),
          daytime_ot: prev.daytime_ot + (r.shift !== "야간" ? floor30g(r.overtime_hours) : 0),
          night_total: prev.night_total + (r.shift === "야간" ? r.regular_hours + floor30g(r.overtime_hours) + (r.night_hours || 0) : 0),
        });
      }
      return map;
    };
    return {
      current: calc(summaryData?.current || []),
      previous: calc(summaryData?.previous || []),
    };
  }, [summaryData]);

  // Previous month group-level totals for subtotal MoM comparison
  const prevGroups = useMemo(() => summaryData ? processSummaryGroups(summaryData.previous) : [], [summaryData]);
  const prevGroupTotalMap = useMemo(() => {
    const map = new Map<string, Totals>();
    for (const g of prevGroups) {
      map.set(g.key, g.subtotal);
    }
    return map;
  }, [prevGroups]);

  const dailyLookup = useMemo(() => {
    if (!dailyData) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const r of dailyData.data) {
      const k = `${r.date}|${r.department}|${r.workplace}|${r.category}`;
      m.set(k, (m.get(k) || 0) + r.count);
    }
    return m;
  }, [dailyData]);

  const getCount = (date: string, dept: string, wp: string, cat: string) =>
    dailyLookup.get(`${date}|${dept}|${wp}|${cat}`) || 0;

  // Normalize category for matching: handles variants like "파견직", "정규" etc.
  const normCat = (cat: string): "정규직" | "파견" | "알바" => {
    const c = cat.trim();
    if (c.includes("파견")) return "파견";
    if (c.includes("정규")) return "정규직";
    return "알바";
  };

  const getRateForCategory = useCallback((category: string) => {
    return rates[normCat(category)];
  }, [rates]);

  // 30분 단위 내림

  const calcSalary = useCallback((rows: SummaryRow[]) => {
    if (isRegular) {
      // 정규직: 기본급 합계를 일할 계산 + 연장/야간/휴일 수당
      const daysInMonth = new Date(year, month, 0).getDate();
      const today = new Date();
      const currentDay = (today.getFullYear() === year && today.getMonth() + 1 === month)
        ? today.getDate() : daysInMonth;
      const dayRatio = currentDay / daysInMonth;

      let total = 0;
      // 기본급 일할 계산
      for (const s of salaryData) {
        const monthlyPay = parseFloat(s.base_pay || 0) + parseFloat(s.meal_allowance || 0) + parseFloat(s.bonus || 0) + parseFloat(s.position_allowance || 0) + parseFloat(s.other_allowance || 0);
        total += monthlyPay * dayRatio;
      }
      // 연장/야간 수당 추가
      for (const r of rows) {
        const rate = rates["정규직"] || 10030;
        const otH = floor30g(r.overtime_hours);
        total += otH * rate * 1.5;
        total += (r.night_hours || 0) * rate * 0.5; // 야간 가산 50%
      }
      return total;
    } else {
      // 파견/알바: 시간당 단가 계산
      let total = 0;
      for (const r of rows) {
        const rate = getRateForCategory(r.category);
        const otH = floor30g(r.overtime_hours);
        if (r.shift === "야간") {
          total += r.regular_hours * rate * 1.5 + otH * rate * 2.0;
        } else {
          total += r.regular_hours * rate + otH * rate * 1.5;
        }
      }
      return total;
    }
  }, [getRateForCategory, isRegular, year, month, salaryData, rates]);

  // Weekly holiday bonus (주휴수당): hours × base rate per category (파견/알바만)
  const calcWHBonus = useCallback((whh: Record<string, number>) => {
    if (isRegular) return 0;
    return (whh["파견"] || 0) * rates["파견"] + (whh["알바"] || 0) * rates["알바"];
  }, [rates, isRegular]);

  const curSalary = useMemo(() =>
    calcSalary(summaryData?.current || []) + calcWHBonus(summaryData?.weeklyHolidayHours?.current || {}),
    [summaryData, calcSalary, calcWHBonus]);
  const prevSalary = useMemo(() =>
    calcSalary(summaryData?.previous || []) + calcWHBonus(summaryData?.weeklyHolidayHours?.previous || {}),
    [summaryData, calcSalary, calcWHBonus]);
  const twoMonthsAgoSalary = useMemo(() =>
    calcSalary(twoMonthsAgoData) + calcWHBonus(twoMonthsAgoWHH),
    [twoMonthsAgoData, calcSalary, twoMonthsAgoWHH, calcWHBonus]);

  // Salary breakdown by category + shift for detailed comparison
  const salaryBreakdown = useMemo(() => {
    const compute = (rows: SummaryRow[]) => {
      const map = new Map<string, { regular_hours: number; overtime_hours: number; salary: number }>();
      for (const r of rows) {
        const n = normCat(r.category);
        const catKey = n === "정규직" ? "정규직" : n === "파견" ? "파견" : "알바(사업소득)";
        const key = `${catKey}|${r.shift === "야간" ? "야간" : "주간"}`;
        const prev = map.get(key) || { regular_hours: 0, overtime_hours: 0, salary: 0 };
        const rate = getRateForCategory(r.category);
        const otH = floor30g(r.overtime_hours);
        let sal: number;
        if (isRegular) {
          sal = otH * (rates["정규직"] || 10030) * 1.5; // 정규직은 연장수당만
        } else {
          sal = r.shift === "야간"
            ? r.regular_hours * rate * 1.5 + otH * rate * 2.0
            : r.regular_hours * rate + otH * rate * 1.5;
        }
        map.set(key, {
          regular_hours: prev.regular_hours + r.regular_hours,
          overtime_hours: prev.overtime_hours + floor30g(r.overtime_hours),
          salary: prev.salary + sal,
        });
      }
      return map;
    };
    return {
      current: compute(summaryData?.current || []),
      previous: compute(summaryData?.previous || []),
    };
  }, [summaryData, getRateForCategory, isRegular, rates]);

  const deptSalary = useMemo(() => {
    if (!summaryData) return [];
    const map = new Map<string, number>();
    if (isRegular) {
      // 정규직: 부서별 기본급 합계 + 연장수당
      const daysInMonth = new Date(year, month, 0).getDate();
      const today = new Date();
      const currentDay = (today.getFullYear() === year && today.getMonth() + 1 === month) ? today.getDate() : daysInMonth;
      const dayRatio = currentDay / daysInMonth;
      for (const s of salaryData) {
        const dept = s.department || "미분류";
        const mp = parseFloat(s.base_pay || 0) + parseFloat(s.meal_allowance || 0) + parseFloat(s.bonus || 0) + parseFloat(s.position_allowance || 0) + parseFloat(s.other_allowance || 0);
        map.set(dept, (map.get(dept) || 0) + mp * dayRatio);
      }
      for (const r of summaryData.current) {
        const dept = r.department || "미분류";
        const otH = floor30g(r.overtime_hours);
        map.set(dept, (map.get(dept) || 0) + otH * (rates["정규직"] || 10030) * 1.5);
      }
    } else {
      for (const r of summaryData.current) {
        const dept = r.department || "미분류";
        const rate = getRateForCategory(r.category);
        const otH = floor30g(r.overtime_hours);
        const s = r.shift === "야간"
          ? r.regular_hours * rate * 1.5 + otH * rate * 2.0
          : r.regular_hours * rate + otH * rate * 1.5;
        map.set(dept, (map.get(dept) || 0) + s);
      }
    }
    return Array.from(map.entries()).map(([dept, cost]) => ({ dept, cost }));
  }, [summaryData, getRateForCategory, isRegular, year, month, salaryData, rates]);

  // 3-month trend data for chart
  const threeMonthTrend = useMemo(() => {
    const [prevY, prevM] = getPrevYearMonth(year, month);
    const [twoAgoY, twoAgoM] = getPrevYearMonth(prevY, prevM);
    return [
      {
        month: `${twoAgoM}월`,
        출근횟수: twoMonthsAgoTotal.attendance_count,
        정규시간: Math.round(twoMonthsAgoTotal.regular_hours * 10) / 10,
        연장시간: Math.round(twoMonthsAgoTotal.overtime_hours * 10) / 10,
        총근로시간: Math.round((twoMonthsAgoTotal.regular_hours + floor30g(twoMonthsAgoTotal.overtime_hours) + twoMonthsAgoTotal.night_hours) * 10) / 10,
        추정급여: twoMonthsAgoSalary,
      },
      {
        month: `${prevM}월`,
        출근횟수: prevTotal.attendance_count,
        정규시간: Math.round(prevTotal.regular_hours * 10) / 10,
        연장시간: Math.round(prevTotal.overtime_hours * 10) / 10,
        총근로시간: Math.round((prevTotal.regular_hours + floor30g(prevTotal.overtime_hours) + prevTotal.night_hours) * 10) / 10,
        추정급여: prevSalary,
      },
      {
        month: `${month}월`,
        출근횟수: grandTotal.attendance_count,
        정규시간: Math.round(grandTotal.regular_hours * 10) / 10,
        연장시간: Math.round(grandTotal.overtime_hours * 10) / 10,
        총근로시간: Math.round((grandTotal.regular_hours + floor30g(grandTotal.overtime_hours) + grandTotal.night_hours) * 10) / 10,
        추정급여: curSalary,
      },
    ];
  }, [year, month, twoMonthsAgoTotal, prevTotal, grandTotal, twoMonthsAgoSalary, prevSalary, curSalary]);

  // ===================== RENDER =====================
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{isRegular ? '정규직' : '사업소득(알바)/파견'} 대시보드</h2>
          <p className="text-gray-500 mt-1">근태 데이터를 다양한 관점에서 분석합니다.</p>
          <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] text-gray-600">
            연장/휴일 시간: <b>30분 단위 내림</b> (0.1~0.4h → 0h, 0.5h = 30분) | 토/일/공휴일 → 전량 연장 | 수당 = 시급 × 1.5배
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-2">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={20} /></button>
          <span className="text-lg font-semibold text-gray-900 min-w-[120px] text-center">{year}년 {month}월</span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={20} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>}

      {!loading && !error && (
        <>
          {anomalyCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-base font-semibold text-red-800">근태 이상 감지 ({anomalyCount}건)</h2>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {anomalies.slice(0, 20).map((a: any, i: number) => (
                  <div key={i} className={`flex items-start gap-2 text-sm ${
                    a.severity === 'high' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                      a.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============ TAB 1: 월별 근태 요약 ============ */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              {/* Overtime ratio cards by employment type */}
              {groups.length > 0 && (() => {
                const targetCats = ["정규직", "파견", "알바(사업소득)", "알바"];
                const displayCats: { label: string; keys: string[]; color: string; bg: string; border: string }[] = [
                  { label: "정규직", keys: ["정규직"], color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
                  { label: "파견", keys: ["파견"], color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
                  { label: "알바(사업소득)", keys: ["알바(사업소득)", "알바"], color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
                  { label: "파견+알바", keys: ["파견", "알바(사업소득)", "알바"], color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
                ];
                const found = displayCats.filter(dc => dc.keys.some(k => categoryStats.current.has(k)));

                return (
                  <>
                    <div className={`grid grid-cols-1 ${found.length >= 4 ? "md:grid-cols-4" : found.length >= 3 ? "md:grid-cols-3" : found.length === 2 ? "md:grid-cols-2" : ""} gap-4`}>
                      {found.map(dc => {
                        const cur = dc.keys.reduce((a, k) => {
                          const t = categoryStats.current.get(k);
                          return t ? { total: a.total + t.total_hours, dayOt: a.dayOt + t.daytime_ot, nightTotal: a.nightTotal + t.night_total } : a;
                        }, { total: 0, dayOt: 0, nightTotal: 0 });
                        const prev = dc.keys.reduce((a, k) => {
                          const t = categoryStats.previous.get(k);
                          return t ? { total: a.total + t.total_hours, dayOt: a.dayOt + t.daytime_ot, nightTotal: a.nightTotal + t.night_total } : a;
                        }, { total: 0, dayOt: 0, nightTotal: 0 });

                        const curOtNight = cur.dayOt + cur.nightTotal;
                        const prevOtNight = prev.dayOt + prev.nightTotal;
                        const curRatio = cur.total > 0 ? (curOtNight / cur.total) * 100 : 0;
                        const prevRatio = prev.total > 0 ? (prevOtNight / prev.total) * 100 : 0;
                        const ratioDiff = curRatio - prevRatio;
                        const over30 = curRatio > 30;

                        return (
                          <div key={dc.label} className={`${dc.bg} rounded-xl border ${dc.border} p-4`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-sm font-semibold ${dc.color}`}>{dc.label} 연장&야간 비율</span>
                              {over30 && <AlertTriangle size={16} className="text-red-500" />}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className={`text-2xl font-bold ${over30 ? "text-red-600" : dc.color}`}>
                                {curRatio.toFixed(1)}%
                              </span>
                              <span className="text-xs text-gray-500">(연장+야간 {fmt(curOtNight)}h / 총 {fmt(cur.total)}h)</span>
                            </div>
                            <div className="mt-1 text-xs">
                              {prev.total > 0 ? (
                                <span className={ratioDiff > 0 ? "text-red-500" : ratioDiff < 0 ? "text-blue-500" : "text-gray-400"}>
                                  전월 {prevRatio.toFixed(1)}% {ratioDiff !== 0 && `(${ratioDiff > 0 ? "+" : ""}${ratioDiff.toFixed(1)}%p)`}
                                </span>
                              ) : (
                                <span className="text-gray-400">전월 데이터 없음</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Advisory notices */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">총 근무시간 대비 연장+야간 근무 시간은 <strong>30%를 넘기지 않는 것</strong>이 좋습니다.</p>
                      </div>
                      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-blue-800">파견직과 알바(사업소득)는 <strong>생산성이 보장된 상황을 계산하면서</strong> 채용하셔야 합니다.</p>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">{year}년 {month}월 근태 요약</h3>
                </div>
                {groups.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p className="text-lg font-semibold">{year}년 {month}월</p>
                    <p className="mt-2">확정된 근태 데이터가 없습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">근태 정보 종합 요약에서 데이터를 확정해주세요.</p>
                    <div className="grid grid-cols-4 gap-3 mt-4 max-w-md mx-auto">
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-400">0</p><p className="text-[10px] text-gray-400">인원</p></div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-400">0h</p><p className="text-[10px] text-gray-400">총 근로</p></div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-400">0h</p><p className="text-[10px] text-gray-400">연장</p></div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xl font-bold text-gray-400">0h</p><p className="text-[10px] text-gray-400">야간</p></div>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-900 text-white">
                          {["부서","근무층","고용형태","시간대"].map(h => <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>)}
                          {["출근횟수","총근로시간","기본시간","연장시간","야간시간","연차일수","1인평균근로","1인평균연장"].map(h => <th key={h} className="text-right px-3 py-3 font-medium">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g, gi) => {
                          const fragment: React.ReactNode[] = [];
                          g.rows.forEach((r, ri) => {
                            fragment.push(
                              <tr key={`r-${gi}-${ri}`} className="border-b border-gray-100 hover:bg-gray-50">
                                {ri === 0 && <td className="px-3 py-2 font-medium text-gray-900" rowSpan={g.rows.length}>{r.department || "-"}</td>}
                                {ri === 0 && <td className="px-3 py-2 text-gray-700" rowSpan={g.rows.length}>{r.workplace || "-"}</td>}
                                <td className="px-3 py-2 text-gray-700">{r.category || "-"}</td>
                                <td className="px-3 py-2 text-gray-700">{r.shift}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.attendance_count}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.regular_hours + floor30g(r.overtime_hours) + (r.night_hours || 0))}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.regular_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(floor30g(r.overtime_hours))}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.night_hours || 0)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.annual_leave_days}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.unique_workers > 0 ? fmt((r.regular_hours + floor30g(r.overtime_hours) + (r.night_hours || 0)) / r.unique_workers) : "-"}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.unique_workers > 0 ? fmt(floor30g(r.overtime_hours) / r.unique_workers) : "-"}</td>
                              </tr>
                            );
                          });
                          fragment.push(
                            <tr key={`sub-${gi}`} className="bg-blue-50 border-b border-blue-200 font-semibold text-blue-900">
                              <td className="px-3 py-2" colSpan={4}>{g.key} 소계</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.attendance_count}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.regular_hours + floor30g(g.subtotal.overtime_hours) + g.subtotal.night_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.regular_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(floor30g(g.subtotal.overtime_hours))}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.night_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.annual_leave_days}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.unique_workers > 0 ? fmt((g.subtotal.regular_hours + floor30g(g.subtotal.overtime_hours) + g.subtotal.night_hours) / g.subtotal.unique_workers) : "-"}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.unique_workers > 0 ? fmt(floor30g(g.subtotal.overtime_hours) / g.subtotal.unique_workers) : "-"}</td>
                            </tr>
                          );
                          return fragment;
                        })}
                        {/* Grand total with MoM % */}
                        {(() => {
                          const gt = grandTotal;
                          const pt = prevTotal;
                          const momBadge = (cur: number, prev: number) => {
                            const rate = pct(cur, prev);
                            if (rate === 0 && cur === 0 && prev === 0) return null;
                            return (
                              <div className={`text-[10px] leading-tight mt-0.5 ${rate > 0 ? "text-red-300" : rate < 0 ? "text-green-300" : "text-blue-200"}`}>
                                {rate > 0 ? "+" : ""}{rate}%
                              </div>
                            );
                          };
                          const avgHoursCur = gt.unique_workers > 0 ? (gt.regular_hours + floor30g(gt.overtime_hours) + gt.night_hours) / gt.unique_workers : 0;
                          const avgHoursPrev = pt.unique_workers > 0 ? (pt.regular_hours + floor30g(pt.overtime_hours) + pt.night_hours) / pt.unique_workers : 0;
                          const avgOtCur = gt.unique_workers > 0 ? floor30g(gt.overtime_hours) / gt.unique_workers : 0;
                          const avgOtPrev = pt.unique_workers > 0 ? floor30g(pt.overtime_hours) / pt.unique_workers : 0;

                          return (
                            <tr className="bg-blue-900 text-white font-bold">
                              <td className="px-3 py-3" colSpan={4}>전체 합계</td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {gt.attendance_count}
                                {momBadge(gt.attendance_count, pt.attendance_count)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(gt.regular_hours + floor30g(gt.overtime_hours) + gt.night_hours)}
                                {momBadge(gt.total_hours, pt.total_hours)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(gt.regular_hours)}
                                {momBadge(gt.regular_hours, pt.regular_hours)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(floor30g(gt.overtime_hours))}
                                {momBadge(floor30g(gt.overtime_hours), floor30g(pt.overtime_hours))}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(gt.night_hours)}
                                {momBadge(gt.night_hours, pt.night_hours)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">{gt.annual_leave_days}</td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {gt.unique_workers > 0 ? fmt(avgHoursCur) : "-"}
                                {gt.unique_workers > 0 && momBadge(avgHoursCur, avgHoursPrev)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {gt.unique_workers > 0 ? fmt(avgOtCur) : "-"}
                                {gt.unique_workers > 0 && momBadge(avgOtCur, avgOtPrev)}
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============ TAB 2: 급여 추정 ============ */}
          {activeTab === "salary" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">고용형태별 단가 설정</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-2.5 text-left font-medium text-gray-700">고용형태</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-700">정규시간 단가 (원/시간)</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-700">연장근로 (1.5배)</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-700">야간정규 (1.5배)</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-700">야간연장 (2.0배)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["정규직", "파견", "알바"] as const).filter(cat => isRegular ? cat === "정규직" : cat !== "정규직").map(cat => (
                        <tr key={cat} className="border-b border-gray-100">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{cat === "알바" ? "알바(사업소득)" : cat}</td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              value={rates[cat]}
                              onChange={(e) => setRates(prev => ({ ...prev, [cat]: Number(e.target.value) }))}
                              className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right text-gray-900"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtWon(rates[cat] * 1.5)}원</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtWon(rates[cat] * 1.5)}원</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtWon(rates[cat] * 2.0)}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed breakdown by category + shift */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">고용형태별 근로시간 & 추정급여 비교</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-900 text-white">
                        <th className="px-3 py-3 text-left font-medium" rowSpan={2}>고용형태</th>
                        <th className="px-3 py-3 text-left font-medium" rowSpan={2}>시간대</th>
                        <th className="px-3 py-3 text-center font-medium border-l border-blue-700" colSpan={4}>당월 ({month}월)</th>
                        <th className="px-3 py-3 text-center font-medium border-l border-blue-700" colSpan={4}>전월 ({summaryData?.prevMonth || "-"}월)</th>
                        <th className="px-3 py-3 text-center font-medium border-l border-blue-700" rowSpan={2}>급여 증감</th>
                      </tr>
                      <tr className="bg-blue-800 text-blue-100">
                        <th className="px-3 py-2 text-right font-medium border-l border-blue-600">정규시간</th>
                        <th className="px-3 py-2 text-right font-medium">연장시간</th>
                        <th className="px-3 py-2 text-right font-medium">총시간</th>
                        <th className="px-3 py-2 text-right font-medium">추정급여</th>
                        <th className="px-3 py-2 text-right font-medium border-l border-blue-600">정규시간</th>
                        <th className="px-3 py-2 text-right font-medium">연장시간</th>
                        <th className="px-3 py-2 text-right font-medium">총시간</th>
                        <th className="px-3 py-2 text-right font-medium">추정급여</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const cats = (["정규직", "파견", "알바(사업소득)"] as const).filter(cat => isRegular ? cat === "정규직" : cat !== "정규직");
                        const shifts = ["주간", "야간"] as const;
                        const z = { regular_hours: 0, overtime_hours: 0, salary: 0 };
                        const getS = (map: Map<string, typeof z>, cat: string, shift: string) => map.get(`${cat}|${shift}`) || z;
                        const whCur = summaryData?.weeklyHolidayHours?.current || {};
                        const whPrev = summaryData?.weeklyHolidayHours?.previous || {};
                        let grandCurSal = 0, grandPrevSal = 0;
                        let grandCurWH = 0, grandPrevWH = 0;

                        return cats.flatMap((cat, ci) => {
                          let catCurReg = 0, catCurOt = 0, catCurSal = 0;
                          let catPrevReg = 0, catPrevOt = 0, catPrevSal = 0;

                          const shiftRows = shifts.map((shift, si) => {
                            const cur = getS(salaryBreakdown.current, cat, shift);
                            const prev = getS(salaryBreakdown.previous, cat, shift);
                            catCurReg += cur.regular_hours; catCurOt += cur.overtime_hours; catCurSal += cur.salary;
                            catPrevReg += prev.regular_hours; catPrevOt += prev.overtime_hours; catPrevSal += prev.salary;
                            const diff = cur.salary - prev.salary;

                            return (
                              <tr key={`${cat}-${shift}`} className="border-b border-gray-100 hover:bg-gray-50">
                                {si === 0 && <td className="px-3 py-2 font-medium text-gray-900" rowSpan={2}>{cat}</td>}
                                <td className="px-3 py-2 text-gray-700">{shift}</td>
                                <td className="text-right px-3 py-2 tabular-nums border-l border-gray-200">{fmt(cur.regular_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(cur.overtime_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(cur.regular_hours + cur.overtime_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums font-medium">{fmtWon(cur.salary)}원</td>
                                <td className="text-right px-3 py-2 tabular-nums text-gray-500 border-l border-gray-200">{fmt(prev.regular_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums text-gray-500">{fmt(prev.overtime_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums text-gray-500">{fmt(prev.regular_hours + prev.overtime_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums text-gray-500">{fmtWon(prev.salary)}원</td>
                                <td className={`text-right px-3 py-2 tabular-nums font-medium border-l border-gray-200 ${diff > 0 ? "text-red-600" : diff < 0 ? "text-blue-600" : ""}`}>
                                  {diff !== 0 ? `${diff > 0 ? "+" : ""}${fmtWon(diff)}원` : "-"}
                                </td>
                              </tr>
                            );
                          });

                          grandCurSal += catCurSal; grandPrevSal += catPrevSal;
                          const catDiff = catCurSal - catPrevSal;

                          const subtotalRow = (
                            <tr key={`sub-${cat}`} className="bg-blue-50 border-b border-blue-200 font-semibold text-blue-900">
                              <td className="px-3 py-2" colSpan={2}>{cat} 소계</td>
                              <td className="text-right px-3 py-2 tabular-nums border-l border-blue-100">{fmt(catCurReg)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(catCurOt)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(catCurReg + catCurOt)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmtWon(catCurSal)}원</td>
                              <td className="text-right px-3 py-2 tabular-nums text-blue-700 border-l border-blue-100">{fmt(catPrevReg)}</td>
                              <td className="text-right px-3 py-2 tabular-nums text-blue-700">{fmt(catPrevOt)}</td>
                              <td className="text-right px-3 py-2 tabular-nums text-blue-700">{fmt(catPrevReg + catPrevOt)}</td>
                              <td className="text-right px-3 py-2 tabular-nums text-blue-700">{fmtWon(catPrevSal)}원</td>
                              <td className={`text-right px-3 py-2 tabular-nums border-l border-blue-100 ${catDiff > 0 ? "text-red-600" : catDiff < 0 ? "text-blue-600" : ""}`}>
                                {catDiff !== 0 ? `${catDiff > 0 ? "+" : ""}${fmtWon(catDiff)}원` : "-"}
                              </td>
                            </tr>
                          );

                          // 주휴수당 row for 파견 and 알바 only
                          const whKey = cat === "파견" ? "파견" : cat === "알바(사업소득)" ? "알바" : null;
                          const whRows: React.ReactNode[] = [];
                          if (whKey) {
                            const curWHHours = whCur[whKey] || 0;
                            const prevWHHours = whPrev[whKey] || 0;
                            const rateKey = whKey as "파견" | "알바";
                            const curWHSal = curWHHours * rates[rateKey];
                            const prevWHSal = prevWHHours * rates[rateKey];
                            const whDiff = curWHSal - prevWHSal;
                            grandCurSal += curWHSal; grandPrevSal += prevWHSal;
                            grandCurWH += curWHHours; grandPrevWH += prevWHHours;

                            whRows.push(
                              <tr key={`wh-${cat}`} className="bg-orange-50 border-b border-orange-200">
                                <td className="px-3 py-2 font-medium text-orange-800" colSpan={2}>
                                  ↳ {cat === "알바(사업소득)" ? "알바" : cat} 주휴수당
                                  <span className="ml-1 text-xs font-normal text-orange-500">(주5일↑ × 8h × 기본단가)</span>
                                </td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-700 border-l border-orange-100">{fmt(curWHHours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-400">-</td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-700">{fmt(curWHHours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums font-semibold text-orange-800">{fmtWon(curWHSal)}원</td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-500 border-l border-orange-100">{fmt(prevWHHours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-400">-</td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-500">{fmt(prevWHHours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums text-orange-500">{fmtWon(prevWHSal)}원</td>
                                <td className={`text-right px-3 py-2 tabular-nums font-medium border-l border-orange-100 ${whDiff > 0 ? "text-red-600" : whDiff < 0 ? "text-blue-600" : ""}`}>
                                  {whDiff !== 0 ? `${whDiff > 0 ? "+" : ""}${fmtWon(whDiff)}원` : "-"}
                                </td>
                              </tr>
                            );
                          }

                          // Add grand total after last category
                          if (ci === cats.length - 1) {
                            const gDiff = grandCurSal - grandPrevSal;
                            const curAllReg = grandTotal.regular_hours, curAllOt = grandTotal.overtime_hours;
                            const prevAllReg = prevTotal.regular_hours, prevAllOt = prevTotal.overtime_hours;
                            return [...shiftRows, subtotalRow, ...whRows, (
                              <tr key="grand" className="bg-blue-900 text-white font-bold">
                                <td className="px-3 py-3" colSpan={2}>전체 합계 (주휴수당 포함)</td>
                                <td className="text-right px-3 py-2 tabular-nums border-l border-blue-700">{fmt(curAllReg + grandCurWH)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(curAllOt)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(curAllReg + curAllOt + grandCurWH)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmtWon(grandCurSal)}원</td>
                                <td className="text-right px-3 py-2 tabular-nums border-l border-blue-700">{fmt(prevAllReg + grandPrevWH)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(prevAllOt)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(prevAllReg + prevAllOt + grandPrevWH)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmtWon(grandPrevSal)}원</td>
                                <td className={`text-right px-3 py-2 tabular-nums border-l border-blue-700 ${gDiff > 0 ? "text-red-300" : gDiff < 0 ? "text-green-300" : ""}`}>
                                  {gDiff !== 0 ? `${gDiff > 0 ? "+" : ""}${fmtWon(gDiff)}원` : "-"}
                                </td>
                              </tr>
                            )];
                          }
                          return [...shiftRows, subtotalRow, ...whRows];
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Salary summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-sm font-medium text-gray-700">당월 추정급여</span>
                  <span className="text-xl font-bold text-blue-700">{fmtWon(curSalary)}원</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-sm font-medium text-gray-700">전월 추정급여</span>
                  <span className="text-xl font-bold text-gray-600">{fmtWon(prevSalary)}원</span>
                </div>
                <div className={`flex justify-between items-center p-4 rounded-xl border ${curSalary - prevSalary > 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <span className="text-sm font-medium text-gray-700">급여 증감{prevSalary > 0 ? ` (${curSalary - prevSalary > 0 ? "+" : ""}${pct(curSalary, prevSalary)}%)` : ""}</span>
                  <span className={`text-xl font-bold ${curSalary - prevSalary > 0 ? "text-red-600" : "text-green-600"}`}>
                    {curSalary - prevSalary > 0 ? "+" : ""}{fmtWon(curSalary - prevSalary)}원
                  </span>
                </div>
              </div>

              {/* 3-month trend chart */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">최근 3개월 근로시간 추이</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={threeMonthTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v, name) => [`${Number(v).toFixed(1)}시간`, name]} />
                        <Legend />
                        <Bar dataKey="정규시간" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="연장시간" fill="#f97316" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">최근 3개월 추정 급여 추이</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={threeMonthTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${fmtWon(Number(v))}원`, "추정 급여"]} />
                        <Bar dataKey="추정급여" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TAB 3: 인건비 분석 ============ */}
          {activeTab === "labor" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">설정</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">매출액 (원)</label>
                    <input type="number" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="매출액을 입력하세요" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">목표 인건비 비율 (%)</label>
                    <input type="number" value={targetRatio} onChange={(e) => setTargetRatio(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">총 추정 인건비</label>
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-semibold text-gray-800">{fmtWon(curSalary)}원</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">매출액 대비 인건비 비율 분석</h3>
                </div>
                {deptSalary.length === 0 ? (
                  <div className="p-12 text-center text-gray-400">데이터가 없습니다.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-900 text-white">
                        <th className="px-4 py-3 text-left font-medium">부서</th>
                        <th className="px-4 py-3 text-right font-medium">추정 인건비</th>
                        <th className="px-4 py-3 text-right font-medium">매출 대비 비율</th>
                        <th className="px-4 py-3 text-right font-medium">목표 비율</th>
                        <th className="px-4 py-3 text-center font-medium">달성 상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptSalary.map((d) => {
                        const ratio = revenue > 0 ? (d.cost / revenue) * 100 : 0;
                        const achieved = ratio <= targetRatio;
                        return (
                          <tr key={d.dept} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{d.dept}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmtWon(d.cost)}원</td>
                            <td className="px-4 py-3 text-right tabular-nums">{revenue > 0 ? ratio.toFixed(1) : "-"}%</td>
                            <td className="px-4 py-3 text-right tabular-nums">{targetRatio}%</td>
                            <td className="px-4 py-3 text-center">
                              {revenue > 0 ? (
                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${achieved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                  {achieved ? "달성" : "초과"}
                                </span>
                              ) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-blue-900 text-white font-bold">
                        <td className="px-4 py-3">합계</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtWon(curSalary)}원</td>
                        <td className="px-4 py-3 text-right tabular-nums">{revenue > 0 ? ((curSalary / revenue) * 100).toFixed(1) : "-"}%</td>
                        <td className="px-4 py-3 text-right tabular-nums">{targetRatio}%</td>
                        <td className="px-4 py-3 text-center">
                          {revenue > 0 ? (
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${(curSalary / revenue) * 100 <= targetRatio ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"}`}>
                              {(curSalary / revenue) * 100 <= targetRatio ? "달성" : "초과"}
                            </span>
                          ) : "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {revenue > 0 && deptSalary.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                  <h4 className="font-semibold text-yellow-800 mb-2">핵심 요약</h4>
                  <p className="text-sm text-yellow-700">
                    {month}월 총 추정 인건비는 <strong>{fmtWon(curSalary)}원</strong>이며,
                    매출액 <strong>{fmtWon(revenue)}원</strong> 대비 인건비 비율은{" "}
                    <strong>{((curSalary / revenue) * 100).toFixed(1)}%</strong>입니다.
                    {(curSalary / revenue) * 100 <= targetRatio
                      ? ` 목표 비율 ${targetRatio}% 이내로 달성하였습니다.`
                      : ` 목표 비율 ${targetRatio}%를 ${(((curSalary / revenue) * 100) - targetRatio).toFixed(1)}%p 초과하였습니다.`
                    }
                  </p>
                </div>
              )}

              {deptSalary.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="font-semibold text-gray-900 mb-4">부서별 추정 인건비</h3>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={deptSalary}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="dept" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                          <Tooltip formatter={(v) => [`${fmtWon(Number(v))}원`, "추정 인건비"]} />
                          <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {revenue > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="font-semibold text-gray-900 mb-4">부서별 매출 대비 인건비 비율</h3>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deptSalary.map(d => ({ ...d, ratio: Number(((d.cost / revenue) * 100).toFixed(1)), target: targetRatio }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="dept" tick={{ fontSize: 12 }} />
                            <YAxis unit="%" />
                            <Tooltip formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name === "ratio" ? "실제 비율" : "목표 비율"]} />
                            <Legend />
                            <Bar dataKey="ratio" name="실제 비율" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="target" name="목표 비율" fill="#d1d5db" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-400">로딩 중...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
