"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  CalendarCheck,
  Loader2,
  Check,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getAttendanceSummaryRegular,
  getConfirmedList,
  confirmAttendance,
  deleteConfirmedRecord,
  getRegularVacations,
} from "@/lib/api";
import { getRegularDataVersion } from "@/lib/dataSignal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActualRecord {
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
}

interface ShiftRecord {
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
}

interface Employee {
  id: number | string;
  name: string;
  phone: string;
  department: string;
  team?: string;
  type?: string;
  actuals: ActualRecord[];
  shifts: ShiftRecord[];
}

interface DayEntry {
  emp: Employee;
  date: string;
  clockIn: string;
  clockOut: string;
  actualClockIn?: string;
  actualClockOut?: string;
  plannedClockIn?: string;
  plannedClockOut?: string;
  source: "planned" | "actual" | "vacation";
  confirmedId?: number;
  isConfirmed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_OPTIONS = ["전체", "물류", "생산2층", "생산3층"];
const EMPLOYEE_TYPE = "정규직";

const CACHE_TTL = 3 * 60 * 60 * 1000;
const _summaryCache: Record<string, { data: any; time: number }> = {};
const _confirmedCache: Record<string, { data: any[]; time: number }> = {};
const _cacheVersion: { v: string } = { v: '' }; // cross-page signal 추적

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
const floor30Min = (min: number) => Math.floor(min / 30) * 30;

function calcHours(clockIn: string, clockOut: string, vacationType?: string) {
  // 반차: 실제 근무시간과 무관하게 기본 4h(실근무) + 반차 4h = regular 8h 고정, 연장 0, 휴게 0
  if (vacationType && vacationType.includes('반차')) {
    // 야간 시간만 실제 clock-in/out에서 계산 (반차 시간대가 야간과 겹칠 경우)
    let night = 0;
    if (clockIn && clockOut) {
      const [h1, m1] = clockIn.split(":").map(Number);
      const [h2, m2] = clockOut.split(":").map(Number);
      if (!isNaN(h1) && !isNaN(h2)) {
        const startMin = ceil30Min(h1 * 60 + (m1 || 0));
        let endMin = floor30Min(h2 * 60 + (m2 || 0));
        if (endMin <= startMin) endMin += 1440;
        let nightMin = 0;
        for (let min = startMin; min < endMin; min++) {
          const h = Math.floor((min % 1440) / 60);
          if (h >= 22 || h < 6) nightMin++;
        }
        night = Math.round(nightMin / 60 * 10) / 10;
      }
    }
    return { regular: 8, overtime: 0, night, breakH: 0 };
  }
  // 연차(전일 휴가): 출근/퇴근 입력해도 regular 8h, 연장/야간/휴게 모두 0
  if (vacationType === '연차') {
    return { regular: 8, overtime: 0, night: 0, breakH: 0 };
  }
  if (!clockIn || !clockOut) return { regular: 0, overtime: 0, night: 0, breakH: 1 };
  const [h1, m1] = clockIn.split(":").map(Number);
  const [h2, m2] = clockOut.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0, night: 0, breakH: 1 };
  const startMin = ceil30Min(h1 * 60 + (m1 || 0));
  let endMin = floor30Min(h2 * 60 + (m2 || 0));
  if (endMin <= startMin) endMin += 1440;
  const totalRawH = (endMin - startMin) / 60;
  // 기본 점심 휴게 1h. 연장근로 2h 이상(총 10h 초과)이면 저녁식사 휴게 30분 추가
  const preOvertime = Math.max(totalRawH - 1 - 8, 0);
  const breakH = preOvertime >= 2 ? 1.5 : 1;
  const workH = Math.max(totalRawH - breakH, 0);
  // 야간 22:00~06:00 (기본/연장과 분리)
  let nightMin = 0;
  for (let min = startMin; min < endMin; min++) {
    const h = Math.floor((min % 1440) / 60);
    if (h >= 22 || h < 6) nightMin++;
  }
  const night = Math.round(nightMin / 60 * 10) / 10;
  const dayWork = Math.max(workH - night, 0);
  return {
    regular: Math.min(dayWork, 8),
    overtime: Math.max(dayWork - 8, 0),
    night,
    breakH,
  };
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  if (t.length === 5) return t; // "09:00"
  if (t.length === 8) return t.slice(0, 5); // "09:00:00"
  // ISO string "2026-04-01T14:29:00.000Z"
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return t; }
}
function formatDateTime(t: string | null | undefined): string {
  if (!t) return "-";
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2,'0')}시 ${String(d.getMinutes()).padStart(2,'0')}분`;
  } catch { return t; }
}

function buildDayKey(name: string, date: string) {
  return `${name}__${date}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfirmCalendarRegularPage() {
  const today = new Date();
  const [year, setYear] = usePersistedState("ccr_year", today.getFullYear());
  const [month, setMonth] = usePersistedState(
    "ccr_month",
    today.getMonth() + 1
  );
  const [deptFilter, setDeptFilter] = usePersistedState("ccr_dept", "전체");

  const [summaryData, setSummaryData] = useState<Employee[]>([]);
  const [confirmedData, setConfirmedData] = useState<any[]>([]);
  const [vacationMap, setVacationMap] = useState<Record<string, string>>({}); // `${name}|${date}` → type
  const [loading, setLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState<"미확정" | "확정" | "전체">("전체");
  const [popupEmp, setPopupEmp] = useState<Employee | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      try {
        // 크로스 페이지 invalidation signal 체크:
        // 다른 페이지에서 데이터를 변경했다면 signal 버전이 바뀌어 있으므로 캐시 무효화
        const currentVer = getRegularDataVersion();
        if ((_cacheVersion as any).v !== currentVer) {
          Object.keys(_summaryCache).forEach(k => delete _summaryCache[k]);
          Object.keys(_confirmedCache).forEach(k => delete _confirmedCache[k]);
          (_cacheVersion as any).v = currentVer;
          forceRefresh = true;
        }

        // Summary
        const sKey = `reg-${year}-${month}`;
        let summary = _summaryCache[sKey];
        if (
          forceRefresh ||
          !summary ||
          Date.now() - summary.time > CACHE_TTL
        ) {
          const raw = await getAttendanceSummaryRegular(year, month);
          const employees: Employee[] = raw?.employees || [];
          _summaryCache[sKey] = { data: employees, time: Date.now() };
          summary = _summaryCache[sKey];
        }
        setSummaryData(summary.data);

        // Confirmed — filter to 정규직 only
        const cKey = `reg-confirmed-${yearMonth}`;
        let confirmed = _confirmedCache[cKey];
        if (
          forceRefresh ||
          !confirmed ||
          Date.now() - confirmed.time > CACHE_TTL
        ) {
          const raw = await getConfirmedList(yearMonth, EMPLOYEE_TYPE);
          const filtered = (raw || []).filter(
            (r: any) =>
              r.type === "정규직" || r.employee_type === "정규직"
          );
          _confirmedCache[cKey] = { data: filtered, time: Date.now() };
          confirmed = _confirmedCache[cKey];
        }
        setConfirmedData(confirmed.data);

        // 휴가(연차/반차) map 로드 - 확정 계산 시 반차 여부 판단용
        try {
          const vacations = await getRegularVacations({ status: 'approved' });
          const vmap: Record<string, string> = {};
          for (const v of (vacations || [])) {
            const start = new Date(v.start_date + 'T00:00:00+09:00');
            const end = new Date(v.end_date + 'T00:00:00+09:00');
            for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
              const y2 = dt.getFullYear();
              const m2 = String(dt.getMonth() + 1).padStart(2, '0');
              const d2 = String(dt.getDate()).padStart(2, '0');
              vmap[`${v.employee_name}|${y2}-${m2}-${d2}`] = v.type || '연차';
            }
          }
          setVacationMap(vmap);
        } catch {}
      } catch (e: any) {
        alert(e.message);
      } finally {
        setLoading(false);
      }
    },
    [year, month, yearMonth]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 탭 포커스 시 cross-page signal 체크 → 다른 페이지에서 변경됐으면 재조회
  useEffect(() => {
    const handler = () => {
      const currentVer = getRegularDataVersion();
      if ((_cacheVersion as any).v !== currentVer) {
        loadData(true);
      }
    };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [loadData]);

  // ── Derived data ────────────────────────────────────────────────────────────

  /**
   * Build confirmed map and all day entries from summary + confirmed data.
   */
  const { confirmedMap, allEntries } = useMemo(() => {
    const cMap: Record<string, { id: number; clockIn: string; clockOut: string; source: string; confirmed_clock_in: string; confirmed_clock_out: string }> = {};

    for (const item of confirmedData) {
      if (item.date && item.employee_name) {
        const k = buildDayKey(item.employee_name, item.date);
        cMap[k] = {
          id: item.id,
          clockIn: formatTime(item.confirmed_clock_in),
          clockOut: formatTime(item.confirmed_clock_out),
          source: item.source || 'actual',
          confirmed_clock_in: item.confirmed_clock_in || '',
          confirmed_clock_out: item.confirmed_clock_out || '',
        };
      }
      // Grouped format
      if (item.records && item.name) {
        for (const r of item.records) {
          const k = buildDayKey(item.name, r.date);
          cMap[k] = {
            id: r.id,
            clockIn: formatTime(r.confirmed_clock_in),
            clockOut: formatTime(r.confirmed_clock_out),
            source: r.source || 'actual',
            confirmed_clock_in: r.confirmed_clock_in || '',
            confirmed_clock_out: r.confirmed_clock_out || '',
          };
        }
      }
    }

    // Helper: find planned times for a date from shifts
    const getPlanned = (shifts: any[], date: string) => {
      const d = new Date(date + 'T00:00:00+09:00');
      const dow = d.getDay();
      const dayOfMonth = d.getDate();
      const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
      const so = (firstDow + 6) % 7;
      const wn = Math.ceil((dayOfMonth + so) / 7);
      for (const s of shifts) {
        if (s.week_number && s.week_number !== wn) continue;
        const daysStr = s.days_of_week || String(s.day_of_week || '');
        if (!daysStr) continue;
        const days = daysStr.split(',').map(Number);
        if (days.includes(dow)) return { in: s.planned_clock_in, out: s.planned_clock_out };
      }
      if (shifts?.length > 0) return { in: shifts[0].planned_clock_in, out: shifts[0].planned_clock_out };
      return null;
    };

    const entries: DayEntry[] = [];
    for (const emp of summaryData) {
      for (const a of emp.actuals || []) {
        if (!a.clock_in_time && !a.clock_out_time) continue;
        const k = buildDayKey(emp.name, a.date);
        const confirmed = cMap[k];
        const planned = getPlanned(emp.shifts || [], a.date);
        const actIn = formatTime(a.clock_in_time);
        const actOut = formatTime(a.clock_out_time);
        const plnIn = planned?.in || '';
        const plnOut = planned?.out || '';
        entries.push({
          emp, date: a.date,
          clockIn: confirmed ? (confirmed.confirmed_clock_in || actIn) : actIn,
          clockOut: confirmed ? (confirmed.confirmed_clock_out || actOut) : actOut,
          actualClockIn: actIn, actualClockOut: actOut,
          plannedClockIn: plnIn, plannedClockOut: plnOut,
          source: confirmed ? ((confirmed.source || "actual") as "planned" | "actual" | "vacation") : "actual",
          confirmedId: confirmed?.id,
          isConfirmed: !!confirmed,
        });
      }
    }

    return { confirmedMap: cMap, allEntries: entries };
  }, [summaryData, confirmedData]);

  /** Per-date counts */
  const dateCounts = useMemo(() => {
    const map: Record<string, { unconfirmed: number; confirmed: number }> = {};
    for (const e of allEntries) {
      if (!map[e.date]) map[e.date] = { unconfirmed: 0, confirmed: 0 };
      if (e.isConfirmed) map[e.date].confirmed++;
      else map[e.date].unconfirmed++;
    }
    return map;
  }, [allEntries]);

  /** Entries for selected date, filtered by dept + tab */
  const selectedEntries = useMemo(() => {
    if (!selectedDate) return [];
    return allEntries.filter((e) => {
      if (e.date !== selectedDate) return false;
      if (deptFilter !== "전체" && e.emp.department !== deptFilter) return false;
      if (tabFilter === "미확정" && e.isConfirmed) return false;
      if (tabFilter === "확정" && !e.isConfirmed) return false;
      return true;
    });
  }, [allEntries, selectedDate, deptFilter, tabFilter]);

  // ── Calendar helpers ────────────────────────────────────────────────────────

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const calendarCells = useMemo(() => {
    const firstDow = days[0].getDay();
    const offset = (firstDow + 6) % 7; // Mon=0
    const cells: (Date | null)[] = Array(offset).fill(null).concat(days);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [days]);

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
    setSelectedDate(null);
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
    setSelectedDate(null);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleConfirm = useCallback(
    async (entry: DayEntry, useSource: "actual" | "planned" = "actual") => {
      const key = buildDayKey(entry.emp.name, entry.date);
      setActionLoading(key);
      try {
        const clockIn = useSource === "planned" && entry.plannedClockIn ? entry.plannedClockIn : (entry.actualClockIn || entry.clockIn);
        const clockOut = useSource === "planned" && entry.plannedClockOut ? entry.plannedClockOut : (entry.actualClockOut || entry.clockOut);
        const vType = vacationMap[`${entry.emp.name}|${entry.date}`];
        const { regular, overtime, night, breakH } = calcHours(clockIn, clockOut, vType);
        const record = {
          employee_type: EMPLOYEE_TYPE,
          employee_name: entry.emp.name,
          employee_phone: entry.emp.phone,
          department: entry.emp.department,
          date: entry.date,
          confirmed_clock_in: clockIn,
          confirmed_clock_out: clockOut,
          source: useSource,
          regular_hours: Math.round(regular * 10) / 10,
          overtime_hours: Math.round(overtime * 10) / 10,
          night_hours: Math.round(night * 10) / 10,
          break_hours: breakH,
          year_month: yearMonth,
        };
        await confirmAttendance([record]);
        delete _confirmedCache[`reg-confirmed-${yearMonth}`];
        await loadData(true);
      } catch (e: any) {
        alert(e.message);
      } finally {
        setActionLoading(null);
      }
    },
    [yearMonth, loadData, vacationMap]
  );

  const handleCancelConfirm = useCallback(
    async (entry: DayEntry) => {
      if (!entry.confirmedId) return;
      const key = buildDayKey(entry.emp.name, entry.date);
      setActionLoading(key);
      try {
        await deleteConfirmedRecord(entry.confirmedId);
        delete _confirmedCache[`reg-confirmed-${yearMonth}`];
        await loadData(true);
      } catch (e: any) {
        alert(e.message);
      } finally {
        setActionLoading(null);
      }
    },
    [yearMonth, loadData]
  );

  const handlePopupConfirm = useCallback(
    async (
      emp: Employee,
      date: string,
      clockIn: string,
      clockOut: string,
      source: "actual" | "planned",
      confirmedId?: number
    ) => {
      const key = buildDayKey(emp.name, date);
      setActionLoading(key);
      try {
        if (confirmedId) {
          await deleteConfirmedRecord(confirmedId);
        } else {
          const vType = vacationMap[`${emp.name}|${date}`];
          const { regular, overtime, night, breakH } = calcHours(clockIn, clockOut, vType);
          await confirmAttendance([
            {
              employee_type: EMPLOYEE_TYPE,
              employee_name: emp.name,
              employee_phone: emp.phone,
              department: emp.department,
              date,
              confirmed_clock_in: clockIn,
              confirmed_clock_out: clockOut,
              source,
              regular_hours: Math.round(regular * 10) / 10,
              overtime_hours: Math.round(overtime * 10) / 10,
              night_hours: Math.round(night * 10) / 10,
              break_hours: breakH,
              year_month: yearMonth,
            },
          ]);
        }
        delete _confirmedCache[`reg-confirmed-${yearMonth}`];
        await loadData(true);
      } catch (e: any) {
        alert(e.message);
      } finally {
        setActionLoading(null);
      }
    },
    [yearMonth, loadData, vacationMap]
  );

  // ── Popup data ───────────────────────────────────────────────────────────────

  const popupEntries = useMemo(() => {
    if (!popupEmp) return [];
    const emp = popupEmp;
    const result: Array<{
      date: string;
      clockIn: string;
      clockOut: string;
      source: "actual" | "planned";
      isConfirmed: boolean;
      confirmedId?: number;
    }> = [];

    const actualDates = new Set((emp.actuals || []).map((a) => a.date));

    for (const a of emp.actuals || []) {
      if (!a.clock_in_time && !a.clock_out_time) continue;
      const k = buildDayKey(emp.name, a.date);
      const c = confirmedMap[k];
      result.push({
        date: a.date,
        clockIn: formatTime(a.clock_in_time),
        clockOut: formatTime(a.clock_out_time),
        source: "actual",
        isConfirmed: !!c,
        confirmedId: c?.id,
      });
    }
    for (const s of emp.shifts || []) {
      if (actualDates.has(s.date)) continue;
      if (!s.clock_in_time && !s.clock_out_time) continue;
      const k = buildDayKey(emp.name, s.date);
      const c = confirmedMap[k];
      result.push({
        date: s.date,
        clockIn: formatTime(s.clock_in_time),
        clockOut: formatTime(s.clock_out_time),
        source: "planned",
        isConfirmed: !!c,
        confirmedId: c?.id,
      });
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [popupEmp, confirmedMap]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-emerald-600" />
            미확정 캘린더 관리 (정규직)
          </h1>
          <p className="text-sm text-[#8A8F98] mt-1">
            날짜를 클릭하여 미확정 근태를 확인하고 확정하세요.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month navigator */}
          <div className="flex items-center gap-1 bg-[#0F1011] border border-[#23252A] rounded-lg px-2 py-1.5">
            <button
              onClick={prevMonth}
              className="p-1 hover:bg-[#141516]/5 rounded"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold w-24 text-center">
              {year}년 {month}월
            </span>
            <button
              onClick={nextMonth}
              className="p-1 hover:bg-[#141516]/5 rounded"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {/* Dept filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]"
          >
            {DEPT_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {/* Refresh */}
          <button
            onClick={() => {
              delete _summaryCache[`reg-${year}-${month}`];
              delete _confirmedCache[`reg-confirmed-${yearMonth}`];
              loadData(true);
            }}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "새로고침"
            )}
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      )}

      {!loading && (
        <>
          {/* Calendar */}
          <div className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden mb-6">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-[#23252A]">
              {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                <div
                  key={d}
                  className={`py-2 text-center text-xs font-semibold ${
                    i === 5
                      ? "text-[#7070FF]"
                      : i === 6
                      ? "text-[#EB5757]"
                      : "text-[#8A8F98]"
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {calendarCells.map((day, idx) => {
                if (!day) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[80px] border-b border-r border-[#23252A] bg-[#08090A]/50"
                    />
                  );
                }
                const dateStr = toDateStr(day);
                const dow = (day.getDay() + 6) % 7; // Mon=0, Sat=5, Sun=6
                const isSat = dow === 5;
                const isSun = dow === 6;
                const isToday =
                  dateStr === toDateStr(new Date());
                const isSelected = selectedDate === dateStr;
                const counts = dateCounts[dateStr];

                let filteredUnconfirmed = counts?.unconfirmed ?? 0;
                let filteredConfirmed = counts?.confirmed ?? 0;
                if (deptFilter !== "전체") {
                  const dayEntries = allEntries.filter(
                    (e) =>
                      e.date === dateStr && e.emp.department === deptFilter
                  );
                  filteredUnconfirmed = dayEntries.filter(
                    (e) => !e.isConfirmed
                  ).length;
                  filteredConfirmed = dayEntries.filter(
                    (e) => e.isConfirmed
                  ).length;
                }

                return (
                  <button
                    key={dateStr}
                    onClick={() =>
                      setSelectedDate(
                        selectedDate === dateStr ? null : dateStr
                      )
                    }
                    className={`min-h-[80px] border-b border-r border-[#23252A] p-1.5 text-left flex flex-col gap-1 transition-colors ${
                      isSelected
                        ? "bg-emerald-50 border-emerald-200"
                        : "hover:bg-[#141516]/5"
                    }`}
                  >
                    <span
                      className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday
                          ? "bg-emerald-600 text-white"
                          : isSun
                          ? "text-[#EB5757]"
                          : isSat
                          ? "text-[#7070FF]"
                          : "text-[#D0D6E0]"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {filteredUnconfirmed > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EB5757]/15 text-[#EB5757] w-fit">
                        미확정 {filteredUnconfirmed}
                      </span>
                    )}
                    {filteredConfirmed > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#27A644]/15 text-[#27A644] w-fit">
                        확정 {filteredConfirmed}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected date detail panel */}
          {selectedDate && (
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A]">
              <div className="px-4 py-3 border-b border-[#23252A] flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <h2 className="text-base font-semibold text-[#F7F8F8]">
                  {selectedDate} 근태 목록
                </h2>
                <div className="flex gap-1">
                  {(["전체", "미확정", "확정"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTabFilter(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        tabFilter === t
                          ? "bg-emerald-600 text-white"
                          : "bg-[#141516] text-[#8A8F98] hover:bg-[#141516]/7"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {selectedEntries.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#62666D]">
                  해당 날짜에 근태 기록이 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-[#23252A]">
                  {selectedEntries.map((entry) => {
                    const key = buildDayKey(entry.emp.name, entry.date);
                    const isActioning = actionLoading === key;
                    return (
                      <div
                        key={key}
                        className="px-4 py-3 flex flex-wrap items-center gap-3"
                      >
                        {/* Name */}
                        <button
                          onClick={() => setPopupEmp(entry.emp)}
                          className="text-sm font-semibold text-emerald-700 hover:underline min-w-[4rem]"
                        >
                          {entry.emp.name}
                        </button>
                        {/* Dept */}
                        <span className="text-xs text-[#8A8F98]">
                          {entry.emp.department}
                        </span>
                        {/* Type badge */}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                          정규직
                        </span>
                        {/* Times: actual + planned */}
                        <div className="flex flex-col text-xs">
                          <span className="text-[#D0D6E0]">실제: <b>{entry.actualClockIn || "--:--"} ~ {entry.actualClockOut || "--:--"}</b></span>
                          {entry.plannedClockIn && <span className="text-[#7070FF]">계획: {entry.plannedClockIn} ~ {entry.plannedClockOut}</span>}
                        </div>
                        {/* Source of confirmed */}
                        {entry.isConfirmed && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${entry.source === "actual" ? "bg-[#27A644]/10 text-[#27A644]" : "bg-[#4EA7FC]/10 text-[#828FFF]"}`}>
                            {entry.source === "actual" ? "실제확정" : "계획확정"}
                          </span>
                        )}
                        {/* Status + action */}
                        <div className="ml-auto flex items-center gap-2">
                          {entry.isConfirmed ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#27A644]/15 text-[#27A644]">
                                확정 ({entry.clockIn}~{entry.clockOut})
                              </span>
                              <button onClick={() => handleCancelConfirm(entry)} disabled={isActioning}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#EB5757]/10 text-[#EB5757] hover:bg-[#EB5757]/15 disabled:opacity-50">
                                {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                취소
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#EB5757]/15 text-[#EB5757]">미확정</span>
                              <button onClick={() => handleConfirm(entry, "actual")} disabled={isActioning}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[#27A644] text-white hover:bg-green-700 disabled:opacity-50">
                                {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                실제확정
                              </button>
                              {entry.plannedClockIn && (
                                <button onClick={() => handleConfirm(entry, "planned")} disabled={isActioning}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[#5E6AD2] text-white hover:bg-[#828FFF] disabled:opacity-50">
                                  {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  계획확정
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Employee popup modal */}
      {popupEmp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPopupEmp(null);
          }}
        >
          <div className="bg-[#0F1011] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Popup header */}
            <div className="px-5 py-4 border-b border-[#23252A] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#F7F8F8]">
                  {popupEmp.name}{" "}
                  <span className="text-sm font-normal text-[#8A8F98]">
                    {popupEmp.department}
                  </span>
                </h3>
                <p className="text-xs text-[#8A8F98] mt-0.5">
                  {year}년 {month}월 전체 근태
                </p>
              </div>
              <button
                onClick={() => setPopupEmp(null)}
                className="text-[#62666D] hover:text-[#D0D6E0] text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Popup body */}
            <div className="overflow-y-auto flex-1">
              {popupEntries.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#62666D]">
                  이번 달 근태 기록이 없습니다.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#08090A] text-left sticky top-0">
                      <th className="py-2 px-4 text-xs font-medium text-[#8A8F98]">
                        날짜
                      </th>
                      <th className="py-2 px-4 text-xs font-medium text-[#8A8F98]">
                        출근
                      </th>
                      <th className="py-2 px-4 text-xs font-medium text-[#8A8F98]">
                        퇴근
                      </th>
                      <th className="py-2 px-4 text-xs font-medium text-[#8A8F98]">
                        기준
                      </th>
                      <th className="py-2 px-4 text-xs font-medium text-[#8A8F98]">
                        상태
                      </th>
                      <th className="py-2 px-4 text-xs font-medium text-[#8A8F98]">
                        관리
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#23252A]">
                    {popupEntries.map((row) => {
                      const k = buildDayKey(popupEmp.name, row.date);
                      const isActioning = actionLoading === k;
                      return (
                        <tr key={row.date} className="hover:bg-[#141516]/5">
                          <td className="py-2 px-4 text-[#D0D6E0]">
                            {row.date}
                          </td>
                          <td className="py-2 px-4 text-[#D0D6E0]">
                            {row.clockIn || "--:--"}
                          </td>
                          <td className="py-2 px-4 text-[#D0D6E0]">
                            {row.clockOut || "--:--"}
                          </td>
                          <td className="py-2 px-4">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                row.source === "actual"
                                  ? "bg-[#27A644]/10 text-[#27A644]"
                                  : "bg-[#4EA7FC]/10 text-[#828FFF]"
                              }`}
                            >
                              {row.source === "actual" ? "실제" : "계획"}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                row.isConfirmed
                                  ? "bg-[#27A644]/15 text-[#27A644]"
                                  : "bg-[#EB5757]/15 text-[#EB5757]"
                              }`}
                            >
                              {row.isConfirmed ? "확정" : "미확정"}
                            </span>
                          </td>
                          <td className="py-2 px-4">
                            {row.isConfirmed ? (
                              <button
                                onClick={() =>
                                  handlePopupConfirm(
                                    popupEmp,
                                    row.date,
                                    row.clockIn,
                                    row.clockOut,
                                    row.source,
                                    row.confirmedId
                                  )
                                }
                                disabled={isActioning}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#EB5757]/10 text-[#EB5757] hover:bg-[#EB5757]/15 disabled:opacity-50"
                              >
                                {isActioning ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                취소
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  handlePopupConfirm(
                                    popupEmp,
                                    row.date,
                                    row.clockIn,
                                    row.clockOut,
                                    row.source
                                  )
                                }
                                disabled={isActioning}
                                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {isActioning ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                확정
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
