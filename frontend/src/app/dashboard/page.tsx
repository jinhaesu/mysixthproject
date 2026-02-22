"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Calendar, TrendingUp, DollarSign, BarChart3, ChevronLeft, ChevronRight, AlertTriangle, Info } from "lucide-react";
import { getReportSummary, getReportDaily } from "@/lib/api";

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

type TabId = "summary" | "daily" | "salary" | "labor";

// --- Constants ---
const TABS: { id: TabId; label: string; icon: typeof Calendar }[] = [
  { id: "summary", label: "월별 근태 요약", icon: Calendar },
  { id: "daily", label: "일자별 출근 현황", icon: TrendingUp },
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

function sumTotals(rows: SummaryRow[]): Totals {
  return rows.reduce((a, r) => ({
    attendance_count: a.attendance_count + r.attendance_count,
    unique_workers: a.unique_workers + r.unique_workers,
    total_hours: a.total_hours + r.total_hours,
    regular_hours: a.regular_hours + r.regular_hours,
    overtime_hours: a.overtime_hours + r.overtime_hours,
    night_hours: a.night_hours + (r.night_hours || 0),
    annual_leave_days: a.annual_leave_days + r.annual_leave_days,
  }), { ...ZERO_TOTALS });
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
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [dailyData, setDailyData] = useState<DailyResponse | null>(null);
  const [twoMonthsAgoData, setTwoMonthsAgoData] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [baseRate, setBaseRate] = useState(9860);
  const [revenue, setRevenue] = useState(0);
  const [targetRatio, setTargetRatio] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [prevY, prevM] = getPrevYearMonth(year, month);
      const [summary, daily, twoMonthsAgoSummary] = await Promise.all([
        getReportSummary(year, month),
        getReportDaily(year, month),
        getReportSummary(prevY, prevM),
      ]);
      setSummaryData(summary);
      setDailyData(daily);
      setTwoMonthsAgoData(twoMonthsAgoSummary.previous || []);
    } catch (err: any) {
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  // Processed data
  const groups = useMemo(() => summaryData ? processSummaryGroups(summaryData.current) : [], [summaryData]);
  const grandTotal = useMemo(() => sumTotals(summaryData?.current || []), [summaryData]);
  const prevTotal = useMemo(() => sumTotals(summaryData?.previous || []), [summaryData]);
  const twoMonthsAgoTotal = useMemo(() => sumTotals(twoMonthsAgoData), [twoMonthsAgoData]);

  // Category-level totals for overtime ratio cards
  const categoryStats = useMemo(() => {
    const calc = (rows: SummaryRow[]) => {
      const map = new Map<string, Totals>();
      for (const r of rows) {
        const cat = r.category || "미분류";
        const prev = map.get(cat) || { ...ZERO_TOTALS };
        map.set(cat, {
          attendance_count: prev.attendance_count + r.attendance_count,
          unique_workers: prev.unique_workers + r.unique_workers,
          total_hours: prev.total_hours + r.total_hours,
          regular_hours: prev.regular_hours + r.regular_hours,
          overtime_hours: prev.overtime_hours + r.overtime_hours,
          night_hours: prev.night_hours + (r.night_hours || 0),
          annual_leave_days: prev.annual_leave_days + r.annual_leave_days,
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

  const calcSalary = useCallback((rows: SummaryRow[]) => {
    let total = 0;
    for (const r of rows) {
      if (r.shift === "야간") {
        total += r.regular_hours * baseRate * 1.5 + r.overtime_hours * baseRate * 2.0;
      } else {
        total += r.regular_hours * baseRate + r.overtime_hours * baseRate * 1.5;
      }
    }
    return total;
  }, [baseRate]);

  const curSalary = useMemo(() => calcSalary(summaryData?.current || []), [summaryData, calcSalary]);
  const prevSalary = useMemo(() => calcSalary(summaryData?.previous || []), [summaryData, calcSalary]);
  const twoMonthsAgoSalary = useMemo(() => calcSalary(twoMonthsAgoData), [twoMonthsAgoData, calcSalary]);

  const deptSalary = useMemo(() => {
    if (!summaryData) return [];
    const map = new Map<string, number>();
    for (const r of summaryData.current) {
      const dept = r.department || "미분류";
      const s = r.shift === "야간"
        ? r.regular_hours * baseRate * 1.5 + r.overtime_hours * baseRate * 2.0
        : r.regular_hours * baseRate + r.overtime_hours * baseRate * 1.5;
      map.set(dept, (map.get(dept) || 0) + s);
    }
    return Array.from(map.entries()).map(([dept, cost]) => ({ dept, cost }));
  }, [summaryData, baseRate]);

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
        야간시간: Math.round(twoMonthsAgoTotal.night_hours * 10) / 10,
        총근로시간: Math.round(twoMonthsAgoTotal.total_hours * 10) / 10,
        추정급여: twoMonthsAgoSalary,
      },
      {
        month: `${prevM}월`,
        출근횟수: prevTotal.attendance_count,
        정규시간: Math.round(prevTotal.regular_hours * 10) / 10,
        연장시간: Math.round(prevTotal.overtime_hours * 10) / 10,
        야간시간: Math.round(prevTotal.night_hours * 10) / 10,
        총근로시간: Math.round(prevTotal.total_hours * 10) / 10,
        추정급여: prevSalary,
      },
      {
        month: `${month}월`,
        출근횟수: grandTotal.attendance_count,
        정규시간: Math.round(grandTotal.regular_hours * 10) / 10,
        연장시간: Math.round(grandTotal.overtime_hours * 10) / 10,
        야간시간: Math.round(grandTotal.night_hours * 10) / 10,
        총근로시간: Math.round(grandTotal.total_hours * 10) / 10,
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
          <h2 className="text-2xl font-bold text-gray-900">대시보드</h2>
          <p className="text-gray-500 mt-1">근태 데이터를 다양한 관점에서 분석합니다.</p>
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
                ];
                const found = displayCats.filter(dc => dc.keys.some(k => categoryStats.current.has(k)));

                return (
                  <>
                    <div className={`grid grid-cols-1 ${found.length >= 3 ? "md:grid-cols-3" : found.length === 2 ? "md:grid-cols-2" : ""} gap-4`}>
                      {found.map(dc => {
                        const cur = dc.keys.reduce((a, k) => {
                          const t = categoryStats.current.get(k);
                          return t ? { total: a.total + t.total_hours, ot: a.ot + t.overtime_hours, night: a.night + t.night_hours } : a;
                        }, { total: 0, ot: 0, night: 0 });
                        const prev = dc.keys.reduce((a, k) => {
                          const t = categoryStats.previous.get(k);
                          return t ? { total: a.total + t.total_hours, ot: a.ot + t.overtime_hours, night: a.night + t.night_hours } : a;
                        }, { total: 0, ot: 0, night: 0 });

                        const curOtNight = cur.ot + cur.night;
                        const prevOtNight = prev.ot + prev.night;
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
                  <div className="p-12 text-center text-gray-400">데이터가 없습니다. 먼저 엑셀 파일을 업로드해주세요.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-900 text-white">
                          {["부서","근무층","고용형태","시간대"].map(h => <th key={h} className="text-left px-3 py-3 font-medium">{h}</th>)}
                          {["출근횟수","총근로시간","정규시간","연장시간","야간시간","연차일수","1인평균근로","1인평균연장"].map(h => <th key={h} className="text-right px-3 py-3 font-medium">{h}</th>)}
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
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.total_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.regular_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.overtime_hours)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{fmt(r.night_hours || 0)}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.annual_leave_days}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.unique_workers > 0 ? fmt(r.total_hours / r.unique_workers) : "-"}</td>
                                <td className="text-right px-3 py-2 tabular-nums">{r.unique_workers > 0 ? fmt(r.overtime_hours / r.unique_workers) : "-"}</td>
                              </tr>
                            );
                          });
                          fragment.push(
                            <tr key={`sub-${gi}`} className="bg-blue-50 border-b border-blue-200 font-semibold text-blue-900">
                              <td className="px-3 py-2" colSpan={4}>{g.key} 소계</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.attendance_count}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.total_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.regular_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.overtime_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{fmt(g.subtotal.night_hours)}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.annual_leave_days}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.unique_workers > 0 ? fmt(g.subtotal.total_hours / g.subtotal.unique_workers) : "-"}</td>
                              <td className="text-right px-3 py-2 tabular-nums">{g.subtotal.unique_workers > 0 ? fmt(g.subtotal.overtime_hours / g.subtotal.unique_workers) : "-"}</td>
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
                          const avgHoursCur = gt.unique_workers > 0 ? gt.total_hours / gt.unique_workers : 0;
                          const avgHoursPrev = pt.unique_workers > 0 ? pt.total_hours / pt.unique_workers : 0;
                          const avgOtCur = gt.unique_workers > 0 ? gt.overtime_hours / gt.unique_workers : 0;
                          const avgOtPrev = pt.unique_workers > 0 ? pt.overtime_hours / pt.unique_workers : 0;

                          return (
                            <tr className="bg-blue-900 text-white font-bold">
                              <td className="px-3 py-3" colSpan={4}>전체 합계</td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {gt.attendance_count}
                                {momBadge(gt.attendance_count, pt.attendance_count)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(gt.total_hours)}
                                {momBadge(gt.total_hours, pt.total_hours)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(gt.regular_hours)}
                                {momBadge(gt.regular_hours, pt.regular_hours)}
                              </td>
                              <td className="text-right px-3 py-2 tabular-nums">
                                {fmt(gt.overtime_hours)}
                                {momBadge(gt.overtime_hours, pt.overtime_hours)}
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

          {/* ============ TAB 2: 일자별 출근 현황 ============ */}
          {activeTab === "daily" && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">{year}년 {month}월 일자별 출근 현황</h3>
              </div>
              {!dailyData || dailyData.groups.length === 0 ? (
                <div className="p-12 text-center text-gray-400">데이터가 없습니다.</div>
              ) : (() => {
                const dGroups = dailyData.groups;
                const cats = dailyData.categories;
                const allDates = getDatesInMonth(year, month);
                const workDays = allDates.filter(d => !isWeekend(d)).length;

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-blue-900 text-white">
                          <th className="px-2 py-2 text-center font-medium sticky left-0 bg-blue-900 z-10" rowSpan={2}>날짜</th>
                          <th className="px-2 py-2 text-center font-medium" rowSpan={2}>요일</th>
                          {dGroups.map((g, i) => (
                            <th key={i} className="px-1 py-2 text-center font-medium border-l border-blue-700" colSpan={cats.length + 1}>
                              {gk(g.department, g.workplace) || "미분류"}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-medium border-l border-blue-700" rowSpan={2}>합계</th>
                        </tr>
                        <tr className="bg-blue-800 text-blue-100">
                          {dGroups.map((_, gi) =>
                            cats.map((c, ci) => (
                              <th key={`${gi}-${ci}`} className={`px-1 py-1.5 text-center font-medium ${ci === 0 ? "border-l border-blue-600" : ""}`}>{c}</th>
                            )).concat(
                              <th key={`${gi}-sub`} className="px-1 py-1.5 text-center font-medium bg-blue-700 border-l border-blue-600">소계</th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {allDates.map((date) => {
                          const dayName = getDayName(date);
                          const weekend = isWeekend(date);
                          let dateTotal = 0;

                          return (
                            <tr key={date} className={`border-b border-gray-100 ${weekend ? "bg-orange-50" : "hover:bg-gray-50"}`}>
                              <td className="px-2 py-1.5 text-center text-gray-700 whitespace-nowrap sticky left-0 bg-inherit">{date.slice(5)}</td>
                              <td className={`px-2 py-1.5 text-center font-medium ${dayName === "일" ? "text-red-500" : dayName === "토" ? "text-blue-500" : "text-gray-600"}`}>{dayName}</td>
                              {dGroups.map((g, gi) => {
                                let groupTotal = 0;
                                const cells = cats.map((c, ci) => {
                                  const cnt = getCount(date, g.department, g.workplace, c);
                                  groupTotal += cnt;
                                  dateTotal += cnt;
                                  return (
                                    <td key={`${gi}-${ci}`} className={`px-1 py-1.5 text-center tabular-nums ${ci === 0 ? "border-l border-gray-200" : ""} ${cnt === 0 ? "text-gray-300" : "text-gray-700"}`}>
                                      {cnt || "-"}
                                    </td>
                                  );
                                });
                                cells.push(
                                  <td key={`${gi}-sub`} className="px-1 py-1.5 text-center font-semibold tabular-nums bg-blue-50 border-l border-blue-100">
                                    {groupTotal || "-"}
                                  </td>
                                );
                                return cells;
                              })}
                              <td className="px-2 py-1.5 text-center font-bold tabular-nums border-l border-gray-300 bg-gray-50">
                                {dateTotal || "-"}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Total row */}
                        <tr className="bg-blue-900 text-white font-bold">
                          <td className="px-2 py-2 text-center sticky left-0 bg-blue-900" colSpan={2}>합계</td>
                          {dGroups.map((g, gi) => {
                            let gTotal = 0;
                            const cells = cats.map((c, ci) => {
                              const catTotal = allDates.reduce((s, d) => s + getCount(d, g.department, g.workplace, c), 0);
                              gTotal += catTotal;
                              return <td key={`t-${gi}-${ci}`} className={`px-1 py-2 text-center tabular-nums ${ci === 0 ? "border-l border-blue-700" : ""}`}>{catTotal}</td>;
                            });
                            cells.push(<td key={`t-${gi}-sub`} className="px-1 py-2 text-center tabular-nums border-l border-blue-700">{gTotal}</td>);
                            return cells;
                          })}
                          <td className="px-2 py-2 text-center tabular-nums border-l border-blue-700">
                            {allDates.reduce((s, d) => s + dGroups.reduce((gs, g) => gs + cats.reduce((cs, c) => cs + getCount(d, g.department, g.workplace, c), 0), 0), 0)}
                          </td>
                        </tr>
                        {/* Average row */}
                        <tr className="bg-gray-100 font-medium text-gray-700">
                          <td className="px-2 py-2 text-center sticky left-0 bg-gray-100" colSpan={2}>평균(평일)</td>
                          {dGroups.map((g, gi) => {
                            let gTotal = 0;
                            const cells = cats.map((c, ci) => {
                              const catTotal = allDates.reduce((s, d) => s + getCount(d, g.department, g.workplace, c), 0);
                              gTotal += catTotal;
                              return <td key={`a-${gi}-${ci}`} className={`px-1 py-2 text-center tabular-nums ${ci === 0 ? "border-l border-gray-300" : ""}`}>{workDays > 0 ? (catTotal / workDays).toFixed(1) : "0"}</td>;
                            });
                            cells.push(<td key={`a-${gi}-sub`} className="px-1 py-2 text-center tabular-nums border-l border-gray-300 bg-blue-50">{workDays > 0 ? (gTotal / workDays).toFixed(1) : "0"}</td>);
                            return cells;
                          })}
                          <td className="px-2 py-2 text-center tabular-nums border-l border-gray-300">
                            {workDays > 0 ? (allDates.reduce((s, d) => s + dGroups.reduce((gs, g) => gs + cats.reduce((cs, c) => cs + getCount(d, g.department, g.workplace, c), 0), 0), 0) / workDays).toFixed(1) : "0"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ============ TAB 3: 급여 추정 ============ */}
          {activeTab === "salary" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">단가 설정</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">정규시간 단가 (원/시간)</label>
                    <input type="number" value={baseRate} onChange={(e) => setBaseRate(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">연장근로</label>
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600">1.5배 ({fmtWon(baseRate * 1.5)}원)</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">야간근로</label>
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600">1.5배 ({fmtWon(baseRate * 1.5)}원)</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-semibold text-gray-900">전월 대비 비교</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-900 text-white">
                        <th className="px-4 py-3 text-left font-medium">항목</th>
                        <th className="px-4 py-3 text-right font-medium">당월 ({month}월)</th>
                        <th className="px-4 py-3 text-right font-medium">전월 ({summaryData?.prevMonth || "-"}월)</th>
                        <th className="px-4 py-3 text-right font-medium">증감</th>
                        <th className="px-4 py-3 text-right font-medium">증감률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "출근횟수", cur: grandTotal.attendance_count, prev: prevTotal.attendance_count, isInt: true },
                        { label: "정규시간", cur: grandTotal.regular_hours, prev: prevTotal.regular_hours, isInt: false },
                        { label: "연장시간", cur: grandTotal.overtime_hours, prev: prevTotal.overtime_hours, isInt: false },
                        { label: "야간시간", cur: grandTotal.night_hours, prev: prevTotal.night_hours, isInt: false },
                        { label: "총근로시간", cur: grandTotal.total_hours, prev: prevTotal.total_hours, isInt: false },
                      ].map((item) => {
                        const diff = item.cur - item.prev;
                        const rate = pct(item.cur, item.prev);
                        return (
                          <tr key={item.label} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{item.label}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{item.isInt ? item.cur : fmt(item.cur)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-500">{item.isInt ? item.prev : fmt(item.prev)}</td>
                            <td className={`px-4 py-3 text-right tabular-nums font-medium ${diff > 0 ? "text-red-600" : diff < 0 ? "text-blue-600" : ""}`}>
                              {diff > 0 ? "+" : ""}{item.isInt ? diff : fmt(diff)}
                            </td>
                            <td className={`px-4 py-3 text-right tabular-nums ${rate > 0 ? "text-red-600" : rate < 0 ? "text-blue-600" : ""}`}>
                              {rate > 0 ? "+" : ""}{rate}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-6">급여 추정</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl">
                      <span className="text-sm font-medium text-gray-700">당월 추정급여</span>
                      <span className="text-xl font-bold text-blue-700">{fmtWon(curSalary)}원</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
                      <span className="text-sm font-medium text-gray-700">전월 추정급여</span>
                      <span className="text-xl font-bold text-gray-600">{fmtWon(prevSalary)}원</span>
                    </div>
                    <div className={`flex justify-between items-center p-4 rounded-xl ${curSalary - prevSalary > 0 ? "bg-red-50" : "bg-green-50"}`}>
                      <span className="text-sm font-medium text-gray-700">급여 증감</span>
                      <span className={`text-xl font-bold ${curSalary - prevSalary > 0 ? "text-red-600" : "text-green-600"}`}>
                        {curSalary - prevSalary > 0 ? "+" : ""}{fmtWon(curSalary - prevSalary)}원
                      </span>
                    </div>
                    {prevSalary > 0 && (
                      <div className="text-center text-sm text-gray-500 mt-2">
                        전월 대비 {curSalary - prevSalary > 0 ? "+" : ""}{pct(curSalary, prevSalary)}%
                      </div>
                    )}
                  </div>
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
                        <Bar dataKey="야간시간" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
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

          {/* ============ TAB 4: 인건비 분석 ============ */}
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
