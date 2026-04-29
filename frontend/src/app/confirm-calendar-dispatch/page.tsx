"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { PageHeader, Card, Badge, Button, SkeletonCard, EmptyState, Input, Select, Field, useToast } from "@/components/ui";
import {
  CalendarCheck,
  Check,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getAttendanceSummaryDispatch,
  getConfirmedList,
  confirmAttendance,
  deleteConfirmedRecord,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActualRecord {
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  planned_clock_in?: string;
  planned_clock_out?: string;
}

interface ShiftRecord {
  date: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  planned_clock_in?: string;
  planned_clock_out?: string;
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
  source: "planned" | "actual";
  confirmedId?: number;
  isConfirmed: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_OPTIONS = ["전체", "물류", "생산2층", "생산3층"];

const CACHE_TTL = 3 * 60 * 60 * 1000;
const _summaryCache: Record<string, { data: any; time: number }> = {};
const _confirmedCache: Record<string, { data: any[]; time: number }> = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
const floor30Min = (min: number) => Math.floor(min / 30) * 30;

function calcHours(clockIn: string, clockOut: string) {
  if (!clockIn || !clockOut) return { regular: 0, overtime: 0 };
  const [h1, m1] = clockIn.split(":").map(Number);
  const [h2, m2] = clockOut.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0 };
  const startMin = ceil30Min(h1 * 60 + (m1 || 0));
  let endMin = floor30Min(h2 * 60 + (m2 || 0));
  if (endMin <= startMin) endMin += 1440;
  const totalH = (endMin - startMin) / 60 - 1; // 1h break
  const workH = Math.max(totalH, 0);
  return {
    regular: Math.min(workH, 8),
    overtime: Math.max(workH - 8, 0),
  };
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  if (t.length === 5) return t;
  if (t.length === 8) return t.slice(0, 5);
  try { const d = new Date(t); if (!isNaN(d.getTime())) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch {}
  return t;
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

export default function ConfirmCalendarDispatchPage() {
  const toast = useToast();
  const today = new Date();
  const [year, setYear] = usePersistedState("ccd_year", today.getFullYear());
  const [month, setMonth] = usePersistedState(
    "ccd_month",
    today.getMonth() + 1
  );
  const [deptFilter, setDeptFilter] = usePersistedState("ccd_dept", "전체");

  const [summaryData, setSummaryData] = useState<Employee[]>([]);
  const [confirmedData, setConfirmedData] = useState<any[]>([]);
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
        // Summary
        const sKey = `disp-${year}-${month}`;
        let summary = _summaryCache[sKey];
        if (
          forceRefresh ||
          !summary ||
          Date.now() - summary.time > CACHE_TTL
        ) {
          const raw = await getAttendanceSummaryDispatch(year, month);
          const employees: Employee[] = (raw?.employees || []).filter(
            (e: any) => (e.type || "파견") !== "정규직"
          );
          _summaryCache[sKey] = { data: employees, time: Date.now() };
          summary = _summaryCache[sKey];
        }
        setSummaryData(summary.data);

        // Confirmed
        const cKey = `disp-confirmed-${yearMonth}`;
        let confirmed = _confirmedCache[cKey];
        if (
          forceRefresh ||
          !confirmed ||
          Date.now() - confirmed.time > CACHE_TTL
        ) {
          const raw = await getConfirmedList(yearMonth, "");
          const filtered = (raw || []).filter(
            (r: any) => r.type !== "정규직" && r.employee_type !== "정규직"
          );
          _confirmedCache[cKey] = { data: filtered, time: Date.now() };
          confirmed = _confirmedCache[cKey];
        }
        setConfirmedData(confirmed.data);
      } catch (e: any) {
        toast.error(e.message || "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [year, month, yearMonth]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Derived data ────────────────────────────────────────────────────────────

  /**
   * Build a flat map of all day entries across employees.
   * Each entry: actual attendance or planned shift, with confirmation state.
   */
  const { confirmedMap, allEntries } = useMemo(() => {
    // Build confirmed map: key = "name__date" -> { id, clockIn, clockOut }
    const cMap: Record<string, { id: number; clockIn: string; clockOut: string; source: string; confirmed_clock_in: string; confirmed_clock_out: string }> = {};

    for (const item of confirmedData) {
      if (item.date && item.employee_name) {
        const k = buildDayKey(item.employee_name, item.date);
        cMap[k] = { id: item.id, clockIn: formatTime(item.confirmed_clock_in), clockOut: formatTime(item.confirmed_clock_out), source: item.source || 'actual', confirmed_clock_in: item.confirmed_clock_in || '', confirmed_clock_out: item.confirmed_clock_out || '' };
      }
      if (item.records && item.name) {
        for (const r of item.records) {
          const k = buildDayKey(item.name, r.date);
          cMap[k] = { id: r.id, clockIn: formatTime(r.confirmed_clock_in), clockOut: formatTime(r.confirmed_clock_out), source: r.source || 'actual', confirmed_clock_in: r.confirmed_clock_in || '', confirmed_clock_out: r.confirmed_clock_out || '' };
        }
      }
    }

    const entries: DayEntry[] = [];
    for (const emp of summaryData) {
      // Get planned times for this employee
      const getPlanned = (date: string) => {
        const shifts = emp.shifts || [];
        if (shifts.length > 0) return { in: shifts[0].planned_clock_in || '', out: shifts[0].planned_clock_out || '' };
        return null;
      };
      for (const a of emp.actuals || []) {
        if (!a.clock_in_time && !a.clock_out_time) continue;
        const k = buildDayKey(emp.name, a.date);
        const confirmed = cMap[k];
        const planned = getPlanned(a.date);
        const actIn = formatTime(a.clock_in_time);
        const actOut = formatTime(a.clock_out_time);
        entries.push({
          emp, date: a.date,
          clockIn: confirmed ? (confirmed.confirmed_clock_in || actIn) : actIn,
          clockOut: confirmed ? (confirmed.confirmed_clock_out || actOut) : actOut,
          actualClockIn: actIn, actualClockOut: actOut,
          plannedClockIn: a.planned_clock_in || planned?.in || '', plannedClockOut: a.planned_clock_out || planned?.out || '',
          source: confirmed ? (confirmed.source as any || "actual") : "actual",
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
    const firstDow = days[0].getDay(); // 0=Sun
    // Shift so Mon=0
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
        const { regular, overtime } = calcHours(clockIn, clockOut);
        const record = {
          employee_type: entry.emp.type || "파견",
          employee_name: entry.emp.name,
          employee_phone: entry.emp.phone,
          department: entry.emp.department,
          date: entry.date,
          confirmed_clock_in: clockIn,
          confirmed_clock_out: clockOut,
          source: useSource,
          regular_hours: Math.round(regular * 10) / 10,
          overtime_hours: Math.round(overtime * 10) / 10,
          night_hours: 0,
          break_hours: 1,
          year_month: yearMonth,
        };
        await confirmAttendance([record]);
        delete _confirmedCache[`disp-confirmed-${yearMonth}`];
        await loadData(true);
      } catch (e: any) {
        toast.error(e.message || "오류가 발생했습니다.");
      } finally {
        setActionLoading(null);
      }
    },
    [yearMonth, loadData]
  );

  const handleCancelConfirm = useCallback(
    async (entry: DayEntry) => {
      if (!entry.confirmedId) return;
      const key = buildDayKey(entry.emp.name, entry.date);
      setActionLoading(key);
      try {
        await deleteConfirmedRecord(entry.confirmedId);
        delete _confirmedCache[`disp-confirmed-${yearMonth}`];
        await loadData(true);
      } catch (e: any) {
        toast.error(e.message || "오류가 발생했습니다.");
      } finally {
        setActionLoading(null);
      }
    },
    [yearMonth, loadData]
  );

  const handlePopupConfirm = useCallback(
    async (emp: Employee, date: string, clockIn: string, clockOut: string, source: "actual" | "planned", confirmedId?: number) => {
      const key = buildDayKey(emp.name, date);
      setActionLoading(key);
      try {
        if (confirmedId) {
          await deleteConfirmedRecord(confirmedId);
        } else {
          const { regular, overtime } = calcHours(clockIn, clockOut);
          await confirmAttendance([{
            employee_type: emp.type || "파견",
            employee_name: emp.name,
            employee_phone: emp.phone,
            department: emp.department,
            date,
            confirmed_clock_in: clockIn,
            confirmed_clock_out: clockOut,
            source,
            regular_hours: Math.round(regular * 10) / 10,
            overtime_hours: Math.round(overtime * 10) / 10,
            night_hours: 0,
            break_hours: 1,
            year_month: yearMonth,
          }]);
        }
        delete _confirmedCache[`disp-confirmed-${yearMonth}`];
        await loadData(true);
      } catch (e: any) {
        toast.error(e.message || "오류가 발생했습니다.");
      } finally {
        setActionLoading(null);
      }
    },
    [yearMonth, loadData]
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
      <PageHeader
        eyebrow={<><CalendarCheck className="w-3.5 h-3.5 inline-block mr-1" />캘린더 관리</>}
        title="미확정 캘린더 관리 (파견/알바)"
        description="날짜를 클릭하여 미확정 근태를 확인하고 확정하세요."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 border border-[var(--border-1)] rounded-[var(--r-md)] px-2 py-1.5 bg-[var(--bg-1)]">
              <button onClick={prevMonth} className="p-1 hover:bg-[var(--bg-2)] rounded-[var(--r-sm)]">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold w-24 text-center tabular">{year}년 {month}월</span>
              <button onClick={nextMonth} className="p-1 hover:bg-[var(--bg-2)] rounded-[var(--r-sm)]">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} inputSize="sm">
              {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => {
                delete _summaryCache[`disp-${year}-${month}`];
                delete _confirmedCache[`disp-confirmed-${yearMonth}`];
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
          <Card padding="none" className="overflow-hidden mb-6 fade-in">
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
                      className="min-h-[80px] border-b border-r border-[var(--border-1)] bg-[var(--bg-canvas)]/50"
                    />
                  );
                }
                const dateStr = toDateStr(day);
                const dow = (day.getDay() + 6) % 7; // Mon=0, Sat=5, Sun=6
                const isSat = dow === 5;
                const isSun = dow === 6;
                const isToday =
                  dateStr ===
                  toDateStr(new Date());
                const isSelected = selectedDate === dateStr;
                const counts = dateCounts[dateStr];
                const unconfirmedCount = counts?.unconfirmed ?? 0;
                const confirmedCount = counts?.confirmed ?? 0;

                // Dept-filtered counts
                let filteredUnconfirmed = unconfirmedCount;
                let filteredConfirmed = confirmedCount;
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
                        ? "bg-[var(--brand-500)]/10 border-[var(--brand-500)]/30"
                        : "hover:bg-[var(--bg-2)]/5"
                    }`}
                  >
                    <span
                      className={`text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full ${
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
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--danger-fg)]/15 text-[var(--danger-fg)] w-fit">
                        미확정 {filteredUnconfirmed}
                      </span>
                    )}
                    {filteredConfirmed > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--success-fg)]/15 text-[var(--success-fg)] w-fit">
                        확정 {filteredConfirmed}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Selected date detail panel */}
          {selectedDate && (
            <Card padding="none" className="fade-in">
              <div className="px-4 py-3 border-b border-[var(--border-1)] flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <h2 className="text-base font-semibold text-[var(--text-1)]">
                  {selectedDate} 근태 목록
                </h2>
                <div className="flex gap-1">
                  {(["전체", "미확정", "확정"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTabFilter(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        tabFilter === t
                          ? "bg-[var(--brand-500)] text-white"
                          : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
                      }`}
                    >
                      {t}
                    </button>
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
                        <Badge tone={entry.emp.type === "파견" ? "warning" : "success"} size="xs">
                          {entry.emp.type || "파견"}
                        </Badge>
                        {/* Times */}
                        <div className="flex flex-col text-xs">
                          <span className="text-[var(--text-2)]">실제: <b>{entry.actualClockIn || "--:--"} ~ {entry.actualClockOut || "--:--"}</b></span>
                          {entry.plannedClockIn && <span className="text-[var(--brand-400)]">계획: {entry.plannedClockIn} ~ {entry.plannedClockOut}</span>}
                        </div>
                        {entry.isConfirmed && (
                          <Badge tone={entry.source === "actual" ? "success" : "brand"} size="xs">
                            {entry.source === "actual" ? "실제확정" : "계획확정"}
                          </Badge>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          {entry.isConfirmed ? (
                            <>
                              <Badge tone="success" size="xs">확정 ({entry.clockIn}~{entry.clockOut})</Badge>
                              <Button variant="danger" size="xs" leadingIcon={<XCircle className="w-3 h-3" />} loading={isActioning} onClick={() => handleCancelConfirm(entry)}>취소</Button>
                            </>
                          ) : (
                            <>
                              <Badge tone="danger" size="xs">미확정</Badge>
                              <Button variant="secondary" size="xs" leadingIcon={<Check className="w-3 h-3" />} loading={isActioning} onClick={() => handleConfirm(entry, "actual")}>실제확정</Button>
                              {entry.plannedClockIn && (
                                <Button variant="primary" size="xs" leadingIcon={<Check className="w-3 h-3" />} loading={isActioning} onClick={() => handleConfirm(entry, "planned")}>계획확정</Button>
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
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-3)] border border-[var(--border-1)] w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Popup header */}
            <div className="px-5 py-4 border-b border-[var(--border-1)] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-1)]">
                  {popupEmp.name}{" "}
                  <span className="text-sm font-normal text-[var(--text-3)]">
                    {popupEmp.department}
                  </span>
                </h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
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
                    <tr className="bg-[var(--bg-canvas)] text-left sticky top-0">
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">날짜</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">출근</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">퇴근</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">기준</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">상태</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider text-[var(--text-3)]">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-1)]">
                    {popupEntries.map((row) => {
                      const k = buildDayKey(popupEmp.name, row.date);
                      const isActioning = actionLoading === k;
                      return (
                        <tr key={row.date} className="hover:bg-[var(--bg-2)]/5">
                          <td className="py-2 px-4 text-[var(--text-2)]">
                            {row.date}
                          </td>
                          <td className="py-2 px-4 text-[var(--text-2)]">
                            {row.clockIn || "--:--"}
                          </td>
                          <td className="py-2 px-4 text-[var(--text-2)]">
                            {row.clockOut || "--:--"}
                          </td>
                          <td className="py-2 px-4">
                            <Badge tone={row.source === "actual" ? "success" : "brand"} size="xs">
                              {row.source === "actual" ? "실제" : "계획"}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            <Badge tone={row.isConfirmed ? "success" : "danger"} size="xs">
                              {row.isConfirmed ? "확정" : "미확정"}
                            </Badge>
                          </td>
                          <td className="py-2 px-4">
                            {row.isConfirmed ? (
                              <Button
                                variant="danger"
                                size="xs"
                                leadingIcon={<XCircle className="w-3 h-3" />}
                                loading={isActioning}
                                onClick={() => handlePopupConfirm(popupEmp, row.date, row.clockIn, row.clockOut, row.source, row.confirmedId)}
                              >
                                취소
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                size="xs"
                                leadingIcon={<Check className="w-3 h-3" />}
                                loading={isActioning}
                                onClick={() => handlePopupConfirm(popupEmp, row.date, row.clockIn, row.clockOut, row.source)}
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
