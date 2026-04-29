"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  CalendarCheck,
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
import { PageHeader, Badge, Button, Select, Card, EmptyState, SkeletonCard, useToast } from "@/components/ui";

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
const _cacheVersion: { v: string } = { v: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
const floor30Min = (min: number) => Math.floor(min / 30) * 30;

function calcHours(clockIn: string, clockOut: string, vacationType?: string) {
  const vt = vacationType || '';
  const isHalfLeave = vt.startsWith('오전') || vt.startsWith('오후');
  const isFullLeave = vt === '연차' || vt === '공가';
  if (isHalfLeave) {
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
  if (isFullLeave) {
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
  const preOvertime = Math.max(totalRawH - 1 - 8, 0);
  const breakH = preOvertime >= 2 ? 1.5 : 1;
  const workH = Math.max(totalRawH - breakH, 0);
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
  if (t.length === 5) return t;
  if (t.length === 8) return t.slice(0, 5);
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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

  const toast = useToast();
  const [summaryData, setSummaryData] = useState<Employee[]>([]);
  const [confirmedData, setConfirmedData] = useState<any[]>([]);
  const [vacationMap, setVacationMap] = useState<Record<string, string>>({});
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
        const currentVer = getRegularDataVersion();
        if ((_cacheVersion as any).v !== currentVer) {
          Object.keys(_summaryCache).forEach(k => delete _summaryCache[k]);
          Object.keys(_confirmedCache).forEach(k => delete _confirmedCache[k]);
          (_cacheVersion as any).v = currentVer;
          forceRefresh = true;
        }

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
        toast.error(e.message || "데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [year, month, yearMonth]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const dateCounts = useMemo(() => {
    const map: Record<string, { unconfirmed: number; confirmed: number }> = {};
    for (const e of allEntries) {
      if (!map[e.date]) map[e.date] = { unconfirmed: 0, confirmed: 0 };
      if (e.isConfirmed) map[e.date].confirmed++;
      else map[e.date].unconfirmed++;
    }
    return map;
  }, [allEntries]);

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
    const offset = (firstDow + 6) % 7;
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
        toast.error(e.message || "확정 처리 실패");
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
        toast.error(e.message || "취소 처리 실패");
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
        toast.error(e.message || "팝업 처리 실패");
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
    <div className="min-w-0 fade-in">
      <PageHeader
        eyebrow="정규직"
        title="미확정 캘린더 관리"
        description="날짜를 클릭하여 미확정 근태를 확인하고 확정하세요."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Month navigator */}
            <div className="flex items-center gap-1 bg-[var(--bg-1)] border border-[var(--border-1)] rounded-[var(--r-md)] px-2 py-1.5">
              <Button variant="ghost" size="xs" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold w-24 text-center tabular">
                {year}년 {month}월
              </span>
              <Button variant="ghost" size="xs" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {/* Dept filter */}
            <Select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              inputSize="sm"
            >
              {DEPT_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            {/* Refresh */}
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => {
                delete _summaryCache[`reg-${year}-${month}`];
                delete _confirmedCache[`reg-confirmed-${yearMonth}`];
                loadData(true);
              }}
            >
              새로고침
            </Button>
          </div>
        }
      />

      {loading && <SkeletonCard />}

      {!loading && (
        <>
          {/* Calendar */}
          <Card padding="none" className="overflow-hidden mb-6">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-[var(--border-1)]">
              {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                <div
                  key={d}
                  className={`py-2 text-center text-xs font-semibold ${
                    i === 5
                      ? "text-[var(--brand-400)]"
                      : i === 6
                      ? "text-[var(--danger-fg)]"
                      : "text-[var(--text-3)]"
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
                      className="min-h-[80px] border-b border-r border-[var(--border-1)] bg-[var(--bg-0)]/50"
                    />
                  );
                }
                const dateStr = toDateStr(day);
                const dow = (day.getDay() + 6) % 7;
                const isSat = dow === 5;
                const isSun = dow === 6;
                const isToday = dateStr === toDateStr(new Date());
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
                    className={`min-h-[80px] border-b border-r border-[var(--border-1)] p-1.5 text-left flex flex-col gap-1 transition-colors ${
                      isSelected
                        ? "bg-[var(--brand-500)]/15 border-[var(--brand-400)]"
                        : "hover:bg-[var(--bg-2)]"
                    }`}
                  >
                    <span
                      className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full tabular ${
                        isToday
                          ? "bg-[var(--brand-500)] text-white"
                          : isSun
                          ? "text-[var(--danger-fg)]"
                          : isSat
                          ? "text-[var(--brand-400)]"
                          : "text-[var(--text-2)]"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {filteredUnconfirmed > 0 && (
                      <Badge tone="danger" size="xs">
                        미확정 {filteredUnconfirmed}
                      </Badge>
                    )}
                    {filteredConfirmed > 0 && (
                      <Badge tone="success" size="xs">
                        확정 {filteredConfirmed}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Selected date detail panel */}
          {selectedDate && (
            <Card padding="none">
              <div className="px-4 py-3 border-b border-[var(--border-1)] flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <h2 className="text-base font-semibold text-[var(--text-1)] tabular">
                  {selectedDate} 근태 목록
                </h2>
                <div className="flex gap-1">
                  {(["전체", "미확정", "확정"] as const).map((t) => (
                    <Button
                      key={t}
                      size="xs"
                      variant={tabFilter === t ? "primary" : "ghost"}
                      onClick={() => setTabFilter(t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedEntries.length === 0 ? (
                <EmptyState icon={<CalendarCheck className="w-10 h-10" />} title="근태 기록 없음" description="해당 날짜에 근태 기록이 없습니다." />
              ) : (
                <div className="divide-y divide-[var(--border-1)]">
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
                          className="text-sm font-semibold text-[var(--brand-400)] hover:underline min-w-[4rem]"
                        >
                          {entry.emp.name}
                        </button>
                        {/* Dept */}
                        <span className="text-xs text-[var(--text-3)]">
                          {entry.emp.department}
                        </span>
                        {/* Type badge */}
                        <Badge tone="success" size="xs">정규직</Badge>
                        {/* Times */}
                        <div className="flex flex-col text-xs">
                          <span className="text-[var(--text-2)] tabular">실제: <b>{entry.actualClockIn || "--:--"} ~ {entry.actualClockOut || "--:--"}</b></span>
                          {entry.plannedClockIn && <span className="text-[var(--brand-400)] tabular">계획: {entry.plannedClockIn} ~ {entry.plannedClockOut}</span>}
                        </div>
                        {/* Source of confirmed */}
                        {entry.isConfirmed && (
                          <Badge tone={entry.source === "actual" ? "success" : "info"} size="xs">
                            {entry.source === "actual" ? "실제확정" : "계획확정"}
                          </Badge>
                        )}
                        {/* Status + action */}
                        <div className="ml-auto flex items-center gap-2">
                          {entry.isConfirmed ? (
                            <>
                              <Badge tone="success" size="sm">
                                확정 ({entry.clockIn}~{entry.clockOut})
                              </Badge>
                              <Button
                                variant="danger"
                                size="xs"
                                leadingIcon={<XCircle className="w-3 h-3" />} loading={isActioning}
                                onClick={() => handleCancelConfirm(entry)}
                                disabled={isActioning}
                              >
                                취소
                              </Button>
                            </>
                          ) : (
                            <>
                              <Badge tone="danger" size="sm">미확정</Badge>
                              <Button
                                variant="primary"
                                size="xs"
                                leadingIcon={<Check className="w-3 h-3" />} loading={isActioning}
                                onClick={() => handleConfirm(entry, "actual")}
                                disabled={isActioning}
                              >
                                실제확정
                              </Button>
                              {entry.plannedClockIn && (
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  leadingIcon={<Check className="w-3 h-3" />} loading={isActioning}
                                  onClick={() => handleConfirm(entry, "planned")}
                                  disabled={isActioning}
                                >
                                  계획확정
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
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
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-3)] w-full max-w-2xl max-h-[85vh] flex flex-col border border-[var(--border-1)]">
            {/* Popup header */}
            <div className="px-5 py-4 border-b border-[var(--border-1)] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-1)]">
                  {popupEmp.name}{" "}
                  <span className="text-sm font-normal text-[var(--text-3)]">
                    {popupEmp.department}
                  </span>
                </h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5 tabular">
                  {year}년 {month}월 전체 근태
                </p>
              </div>
              <button
                onClick={() => setPopupEmp(null)}
                className="text-[var(--text-4)] hover:text-[var(--text-2)] text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Popup body */}
            <div className="overflow-y-auto flex-1">
              {popupEntries.length === 0 ? (
                <EmptyState icon={<CalendarCheck className="w-10 h-10" />} title="근태 기록 없음" description="이번 달 근태 기록이 없습니다." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-0)] text-left sticky top-0">
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">날짜</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">출근</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">퇴근</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">기준</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">상태</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-1)]">
                    {popupEntries.map((row) => {
                      const k = buildDayKey(popupEmp.name, row.date);
                      const isActioning = actionLoading === k;
                      return (
                        <tr key={row.date} className="hover:bg-[var(--bg-2)]">
                          <td className="py-2 px-4 text-[var(--text-2)] tabular">
                            {row.date}
                          </td>
                          <td className="py-2 px-4 text-[var(--text-2)] tabular">
                            {row.clockIn || "--:--"}
                          </td>
                          <td className="py-2 px-4 text-[var(--text-2)] tabular">
                            {row.clockOut || "--:--"}
                          </td>
                          <td className="py-2 px-4">
                            <Badge
                              tone={row.source === "actual" ? "success" : "info"}
                              size="xs"
                            >
                              {row.source === "actual" ? "실제" : "계획"}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            <Badge
                              tone={row.isConfirmed ? "success" : "danger"}
                              size="xs"
                              dot
                            >
                              {row.isConfirmed ? "확정" : "미확정"}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            {row.isConfirmed ? (
                              <Button
                                variant="danger"
                                size="xs"
                                leadingIcon={<XCircle className="w-3 h-3" />} loading={isActioning}
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
                              >
                                취소
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="xs"
                                leadingIcon={<Check className="w-3 h-3" />} loading={isActioning}
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
                              >
                                확정
                              </Button>
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
