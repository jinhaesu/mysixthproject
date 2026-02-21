"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Save, Info, Clock, UserCheck,
  Plus, X, Trash2, Edit3, ChevronDown, ChevronUp
} from "lucide-react";
import { getWorkforcePlanSlots, saveWorkforcePlanSlotsBatch } from "@/lib/api";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WORKER_TYPES = ["파견", "알바(사업소득)"] as const;
type WorkerType = (typeof WORKER_TYPES)[number];

interface TimeSlot {
  id?: number;
  _localId: string;
  day: number;
  worker_type: WorkerType;
  start_hour: number;
  duration: number;
  headcount: number;
  memo: string;
}

const PRESET_SHIFTS = [
  { label: "주간", start: 8, dur: 9, desc: "08~17시" },
  { label: "오전", start: 6, dur: 6, desc: "06~12시" },
  { label: "오후", start: 13, dur: 5, desc: "13~18시" },
  { label: "석간", start: 17, dur: 5, desc: "17~22시" },
  { label: "야간", start: 22, dur: 8, desc: "22~06시" },
  { label: "풀타임", start: 0, dur: 24, desc: "00~24시" },
];

const TYPE_COLORS: Record<WorkerType, { bg: string; border: string; bar: string; text: string; light: string }> = {
  "파견": { bg: "bg-orange-50", border: "border-orange-300", bar: "bg-orange-400", text: "text-orange-700", light: "bg-orange-100" },
  "알바(사업소득)": { bg: "bg-green-50", border: "border-green-300", bar: "bg-green-400", text: "text-green-700", light: "bg-green-100" },
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getWeekOfMonth(year: number, month: number, day: number): number {
  const firstDay = new Date(year, month - 1, 1).getDay();
  return Math.ceil((day + firstDay) / 7);
}
function getDayOfWeek(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getDay();
}
function isWeekend(year: number, month: number, day: number): boolean {
  const dow = getDayOfWeek(year, month, day);
  return dow === 0 || dow === 6;
}
function formatHours(h: number): string {
  if (h === 0) return "0";
  if (Number.isInteger(h)) return h.toString();
  return h.toFixed(1);
}
function formatTimeRange(start: number, duration: number): string {
  const end = start + duration;
  const endDisplay = end > 24 ? end - 24 : end;
  const suffix = end > 24 ? "(+1)" : "";
  return `${String(start).padStart(2, "0")}:00~${String(endDisplay).padStart(2, "0")}:00${suffix}`;
}

let localIdCounter = 0;
function genLocalId() { return `local_${++localIdCounter}_${Date.now()}`; }

export default function WorkforcePlanPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  // Day detail panel
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Add form
  const [addForm, setAddForm] = useState<{
    worker_type: WorkerType; start_hour: number; duration: number; headcount: number; memo: string;
  } | null>(null);
  // Edit mode
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  // Collapsed weeks
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set());

  const daysInMonth = getDaysInMonth(year, month);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getWorkforcePlanSlots(year, month);
      setSlots(data.map((s: any) => ({ ...s, _localId: genLocalId() })));
      setHasChanges(false);
      setSaved(false);
      setSelectedDay(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = slots.map(s => ({
        day: s.day, worker_type: s.worker_type, start_hour: s.start_hour,
        duration: s.duration, headcount: s.headcount, memo: s.memo,
      }));
      const result = await saveWorkforcePlanSlotsBatch(year, month, payload);
      setSlots(result.map((s: any) => ({ ...s, _localId: genLocalId() })));
      setHasChanges(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Slot CRUD
  const addSlot = (day: number, slot: Omit<TimeSlot, "_localId" | "day">) => {
    setSlots(prev => [...prev, { ...slot, day, _localId: genLocalId() }]);
    setHasChanges(true);
    setSaved(false);
  };
  const removeSlot = (localId: string) => {
    setSlots(prev => prev.filter(s => s._localId !== localId));
    setHasChanges(true);
    setSaved(false);
  };
  const updateSlot = (localId: string, updates: Partial<TimeSlot>) => {
    setSlots(prev => prev.map(s => s._localId === localId ? { ...s, ...updates } : s));
    setHasChanges(true);
    setSaved(false);
    setEditingSlotId(null);
  };

  // Apply preset
  const applyPreset = (day: number, preset: typeof PRESET_SHIFTS[0], type: WorkerType, headcount: number) => {
    addSlot(day, { worker_type: type, start_hour: preset.start, duration: preset.dur, headcount, memo: "" });
    setAddForm(null);
  };

  // Computed
  const slotsByDay = useMemo(() => {
    const map: Record<number, TimeSlot[]> = {};
    for (const s of slots) {
      if (!map[s.day]) map[s.day] = [];
      map[s.day].push(s);
    }
    return map;
  }, [slots]);

  const dayStats = useMemo(() => {
    const stats: Record<number, { totalHours: number; totalPeople: number; byType: Record<string, { hours: number; people: number }> }> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const daySlots = slotsByDay[d] || [];
      const byType: Record<string, { hours: number; people: number }> = {};
      let totalH = 0, totalP = 0;
      for (const s of daySlots) {
        const h = s.duration * s.headcount;
        totalH += h;
        totalP += s.headcount;
        if (!byType[s.worker_type]) byType[s.worker_type] = { hours: 0, people: 0 };
        byType[s.worker_type].hours += h;
        byType[s.worker_type].people += s.headcount;
      }
      stats[d] = { totalHours: totalH, totalPeople: totalP, byType };
    }
    return stats;
  }, [slotsByDay, daysInMonth]);

  const monthlyTotals = useMemo(() => {
    let total = 0;
    const byType: Record<string, number> = {};
    for (const s of slots) {
      const h = s.duration * s.headcount;
      total += h;
      byType[s.worker_type] = (byType[s.worker_type] || 0) + h;
    }
    return { total, byType };
  }, [slots]);

  const weeks = useMemo(() => {
    const result: { week: number; days: number[] }[] = [];
    let currentWeek = 1;
    let currentDays: number[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const week = getWeekOfMonth(year, month, day);
      if (week !== currentWeek && currentDays.length > 0) {
        result.push({ week: currentWeek, days: currentDays });
        currentDays = [];
        currentWeek = week;
      }
      currentDays.push(day);
    }
    if (currentDays.length > 0) result.push({ week: currentWeek, days: currentDays });
    return result;
  }, [year, month, daysInMonth]);

  const weeklyTotals = useMemo(() => {
    return weeks.map(w => {
      let total = 0;
      const byType: Record<string, number> = {};
      for (const d of w.days) {
        const ds = dayStats[d];
        if (!ds) continue;
        total += ds.totalHours;
        for (const [t, v] of Object.entries(ds.byType)) {
          byType[t] = (byType[t] || 0) + v.hours;
        }
      }
      return { total, byType };
    });
  }, [weeks, dayStats]);

  const activeDays = useMemo(() => {
    let c = 0;
    for (let d = 1; d <= daysInMonth; d++) if ((slotsByDay[d] || []).length > 0) c++;
    return c;
  }, [slotsByDay, daysInMonth]);

  const toggleWeek = (wi: number) => {
    setCollapsedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(wi)) next.delete(wi); else next.add(wi);
      return next;
    });
  };

  // Mini 24h timeline bar for a day
  const MiniTimeline = ({ day }: { day: number }) => {
    const daySlots = slotsByDay[day] || [];
    if (daySlots.length === 0) return <div className="h-3 bg-gray-100 rounded-sm" />;
    return (
      <div className="relative h-3 bg-gray-100 rounded-sm overflow-hidden">
        {daySlots.map(s => {
          const left = (s.start_hour / 24) * 100;
          const width = Math.min((s.duration / 24) * 100, 100 - left);
          const colors = TYPE_COLORS[s.worker_type as WorkerType];
          return (
            <div
              key={s._localId}
              className={`absolute top-0 h-full ${colors.bar} opacity-80`}
              style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
              title={`${s.worker_type} ${s.headcount}명 ${formatTimeRange(s.start_hour, s.duration)}`}
            />
          );
        })}
      </div>
    );
  };

  // Full 24h timeline for day detail
  const FullTimeline = ({ day }: { day: number }) => {
    const daySlots = slotsByDay[day] || [];
    const hours = Array.from({ length: 25 }, (_, i) => i);
    return (
      <div className="relative">
        {/* Hour grid */}
        <div className="flex border-b border-gray-200">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-[10px] text-gray-400 border-l border-gray-100 py-0.5" style={{ minWidth: 0 }}>
              {h < 24 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
        {/* Slot bars by type */}
        {WORKER_TYPES.map(type => {
          const typeSlots = daySlots.filter(s => s.worker_type === type);
          if (typeSlots.length === 0) return null;
          const colors = TYPE_COLORS[type];
          return (
            <div key={type} className="relative h-8 bg-gray-50 border-b border-gray-100">
              {/* Hour grid lines */}
              <div className="absolute inset-0 flex">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="flex-1 border-l border-gray-100" />
                ))}
              </div>
              {/* Blocks */}
              {typeSlots.map(s => {
                const left = (s.start_hour / 24) * 100;
                const width = Math.min((s.duration / 24) * 100, 100 - left);
                const isEditing = editingSlotId === s._localId;
                return (
                  <div
                    key={s._localId}
                    className={`absolute top-0.5 h-7 ${colors.bar} rounded-sm flex items-center justify-center cursor-pointer transition-all ${
                      isEditing ? "ring-2 ring-blue-500 ring-offset-1" : "hover:opacity-90"
                    }`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                    onClick={() => setEditingSlotId(isEditing ? null : s._localId)}
                    title={`${formatTimeRange(s.start_hour, s.duration)} ${s.headcount}명`}
                  >
                    <span className="text-white text-[10px] font-bold truncate px-0.5">
                      {s.headcount}명
                    </span>
                  </div>
                );
              })}
              <div className={`absolute left-0 top-0 h-full w-0.5 ${colors.bar}`} />
            </div>
          );
        })}
        {/* Empty state */}
        {daySlots.length === 0 && (
          <div className="h-10 flex items-center justify-center text-xs text-gray-400">배치된 인력이 없습니다</div>
        )}
      </div>
    );
  };

  const selectedDaySlots = selectedDay ? (slotsByDay[selectedDay] || []) : [];
  const selectedDayDow = selectedDay ? getDayOfWeek(year, month, selectedDay) : 0;

  return (
    <div className="flex gap-4">
      {/* Main content */}
      <div className={`flex-1 min-w-0 ${selectedDay ? "max-w-[calc(100%-380px)]" : ""}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">인력 조달 계획 수립</h2>
            <p className="text-gray-500 mt-1 text-sm">일별 시간대 기반으로 인력 투입을 계획합니다.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={18} /></button>
              <span className="text-base font-semibold text-gray-900 min-w-[110px] text-center">{year}년 {month}월</span>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={18} /></button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasChanges ? "bg-blue-600 text-white hover:bg-blue-700"
                  : saved ? "bg-green-100 text-green-700 border border-green-200"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Save size={16} />
              {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
            </button>
          </div>
        </div>

        {/* Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-start gap-3">
          <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700">
            <strong>계획 수립용</strong>이며, 실제 운영 결과는 <strong>대시보드</strong>를 참고하세요.
            날짜를 클릭하면 00~24시 시간대별로 인력을 배치할 수 있습니다.
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm mb-4">{error}</div>}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Clock size={12} /> 월간 총 시수</div>
            <div className="text-xl font-bold text-gray-900">{formatHours(monthlyTotals.total)}<span className="text-xs font-normal text-gray-400 ml-0.5">h</span></div>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-3">
            <div className="flex items-center gap-1.5 text-xs text-orange-600 mb-1"><UserCheck size={12} /> 파견 시수</div>
            <div className="text-xl font-bold text-orange-700">{formatHours(monthlyTotals.byType["파견"] || 0)}<span className="text-xs font-normal text-orange-400 ml-0.5">h</span></div>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-3">
            <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1"><UserCheck size={12} /> 알바 시수</div>
            <div className="text-xl font-bold text-green-700">{formatHours(monthlyTotals.byType["알바(사업소득)"] || 0)}<span className="text-xs font-normal text-green-400 ml-0.5">h</span></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500 mb-1">투입 일수</div>
            <div className="text-xl font-bold text-gray-900">{activeDays}<span className="text-xs font-normal text-gray-400 ml-0.5">/ {daysInMonth}일</span></div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500 mb-1">일평균 시수</div>
            <div className="text-xl font-bold text-gray-900">
              {activeDays > 0 ? formatHours(monthlyTotals.total / activeDays) : "0"}<span className="text-xs font-normal text-gray-400 ml-0.5">h</span>
            </div>
          </div>
        </div>

        {/* Weekly Calendar with Timeline */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {weeks.map((week, wi) => {
              const collapsed = collapsedWeeks.has(wi);
              return (
                <div key={wi} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div
                    className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleWeek(wi)}
                  >
                    <div className="flex items-center gap-2">
                      {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      <h3 className="font-semibold text-gray-900 text-sm">{week.week}주차</h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-orange-600 font-medium">파견: {formatHours(weeklyTotals[wi]?.byType["파견"] || 0)}h</span>
                      <span className="text-green-600 font-medium">알바: {formatHours(weeklyTotals[wi]?.byType["알바(사업소득)"] || 0)}h</span>
                      <span className="text-gray-700 font-semibold">합계: {formatHours(weeklyTotals[wi]?.total || 0)}h</span>
                    </div>
                  </div>
                  {!collapsed && (
                    <div className="divide-y divide-gray-100">
                      {week.days.map(day => {
                        const dow = getDayOfWeek(year, month, day);
                        const dayName = DAY_NAMES[dow];
                        const weekend = isWeekend(year, month, day);
                        const ds = dayStats[day];
                        const isSelected = selectedDay === day;
                        return (
                          <div
                            key={day}
                            className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                              isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : weekend ? "bg-orange-50/30 hover:bg-orange-50/60" : "hover:bg-gray-50"
                            }`}
                            onClick={() => setSelectedDay(isSelected ? null : day)}
                          >
                            {/* Date label */}
                            <div className="flex items-center gap-1.5 w-16 shrink-0">
                              <span className={`text-sm font-semibold tabular-nums ${
                                dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-800"
                              }`}>{day}일</span>
                              <span className={`text-xs ${
                                dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-gray-400"
                              }`}>{dayName}</span>
                            </div>
                            {/* Mini 24h timeline */}
                            <div className="flex-1 min-w-0">
                              <MiniTimeline day={day} />
                            </div>
                            {/* Day stats */}
                            <div className="flex items-center gap-2 shrink-0 w-44 justify-end">
                              {ds && ds.totalHours > 0 ? (
                                <>
                                  {ds.byType["파견"] && (
                                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                                      파견 {ds.byType["파견"].people}명 {formatHours(ds.byType["파견"].hours)}h
                                    </span>
                                  )}
                                  {ds.byType["알바(사업소득)"] && (
                                    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                      알바 {ds.byType["알바(사업소득)"].people}명 {formatHours(ds.byType["알바(사업소득)"].hours)}h
                                    </span>
                                  )}
                                  <span className="text-xs font-bold text-gray-700 tabular-nums">{formatHours(ds.totalHours)}h</span>
                                </>
                              ) : (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Monthly Total */}
            <div className="bg-blue-900 rounded-xl p-4 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold">{month}월 전체 계획 요약</h3>
                <div className="flex items-center gap-5">
                  <div className="text-center">
                    <div className="text-blue-200 text-xs">파견</div>
                    <div className="text-lg font-bold">{formatHours(monthlyTotals.byType["파견"] || 0)}<span className="text-xs font-normal text-blue-300 ml-0.5">h</span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-blue-200 text-xs">알바</div>
                    <div className="text-lg font-bold">{formatHours(monthlyTotals.byType["알바(사업소득)"] || 0)}<span className="text-xs font-normal text-blue-300 ml-0.5">h</span></div>
                  </div>
                  <div className="text-center border-l border-blue-700 pl-5">
                    <div className="text-blue-200 text-xs">총 시수</div>
                    <div className="text-xl font-bold">{formatHours(monthlyTotals.total)}<span className="text-xs font-normal text-blue-300 ml-0.5">h</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Day Detail Side Panel */}
      {selectedDay && (
        <div className="w-[360px] shrink-0 sticky top-4 self-start">
          <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
            {/* Panel header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">
                  {month}월 {selectedDay}일
                  <span className={`ml-1.5 text-sm font-medium ${
                    selectedDayDow === 0 ? "text-red-500" : selectedDayDow === 6 ? "text-blue-500" : "text-gray-500"
                  }`}>({DAY_NAMES[selectedDayDow]})</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  총 {formatHours(dayStats[selectedDay]?.totalHours || 0)}h / {dayStats[selectedDay]?.totalPeople || 0}명
                </p>
              </div>
              <button onClick={() => { setSelectedDay(null); setAddForm(null); setEditingSlotId(null); }} className="p-1 hover:bg-gray-200 rounded">
                <X size={16} />
              </button>
            </div>

            {/* 24h Visual Timeline */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="text-xs text-gray-500 mb-2 font-medium">24시간 타임라인</div>
              {/* Hour labels */}
              <div className="flex mb-0.5">
                {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
                  <div
                    key={h}
                    className="text-[9px] text-gray-400 tabular-nums"
                    style={{ position: "absolute" as any, left: `calc(${(h / 24) * 100}% - 6px)` }}
                  >
                    {/* inline positioning handled below */}
                  </div>
                ))}
              </div>
              <div className="relative">
                {/* Hour markers */}
                <div className="flex h-4 border-b border-gray-200">
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className={`flex-1 border-l text-center ${
                      i % 6 === 0 ? "border-gray-300" : "border-gray-100"
                    }`}>
                      {i % 3 === 0 && <span className="text-[8px] text-gray-400">{String(i).padStart(2, "0")}</span>}
                    </div>
                  ))}
                  <div className="border-l border-gray-300 w-0" />
                </div>
                {/* Timeline bars */}
                {WORKER_TYPES.map(type => {
                  const typeSlots = selectedDaySlots.filter(s => s.worker_type === type);
                  if (typeSlots.length === 0) return null;
                  const colors = TYPE_COLORS[type];
                  return (
                    <div key={type} className="relative h-7 mt-0.5">
                      <div className="absolute inset-0 bg-gray-50 rounded-sm" />
                      {/* Hour grid lines */}
                      <div className="absolute inset-0 flex">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div key={i} className={`flex-1 border-l ${i % 6 === 0 ? "border-gray-200" : "border-gray-100"}`} />
                        ))}
                      </div>
                      {typeSlots.map(s => {
                        const left = (s.start_hour / 24) * 100;
                        const width = Math.min((s.duration / 24) * 100, 100 - left);
                        return (
                          <div
                            key={s._localId}
                            className={`absolute top-0.5 h-6 ${colors.bar} rounded-sm flex items-center justify-center cursor-pointer ${
                              editingSlotId === s._localId ? "ring-2 ring-blue-500" : "hover:brightness-110"
                            }`}
                            style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
                            onClick={() => setEditingSlotId(editingSlotId === s._localId ? null : s._localId)}
                          >
                            <span className="text-white text-[9px] font-bold truncate px-0.5">{s.headcount}명</span>
                          </div>
                        );
                      })}
                      <div className={`absolute -left-3 top-0 h-full flex items-center`}>
                        <span className={`text-[9px] font-medium ${colors.text}`}>{type === "알바(사업소득)" ? "알바" : type}</span>
                      </div>
                    </div>
                  );
                })}
                {selectedDaySlots.length === 0 && (
                  <div className="h-8 flex items-center justify-center text-xs text-gray-400">시간 블록을 추가하세요</div>
                )}
              </div>
            </div>

            {/* Slot list */}
            <div className="px-4 py-2 max-h-[300px] overflow-y-auto">
              <div className="text-xs text-gray-500 font-medium mb-2">배치 목록</div>
              {selectedDaySlots.length === 0 ? (
                <div className="text-center py-4 text-xs text-gray-400">아직 배치된 인력이 없습니다</div>
              ) : (
                <div className="space-y-1.5">
                  {selectedDaySlots.map(s => {
                    const colors = TYPE_COLORS[s.worker_type as WorkerType];
                    const isEditing = editingSlotId === s._localId;
                    return (
                      <div key={s._localId} className={`rounded-lg border p-2 ${isEditing ? "border-blue-300 bg-blue-50" : `${colors.border} ${colors.bg}`}`}>
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <select
                                value={s.worker_type}
                                onChange={(e) => updateSlot(s._localId, { worker_type: e.target.value as WorkerType })}
                                className="text-xs border rounded px-1.5 py-1 flex-1"
                              >
                                {WORKER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input type="number" min={0} max={23} value={s.start_hour}
                                onChange={e => updateSlot(s._localId, { start_hour: parseInt(e.target.value) || 0 })}
                                className="w-14 text-xs border rounded px-1.5 py-1 text-center" placeholder="시작"
                              />
                              <span className="text-xs text-gray-400 self-center">~</span>
                              <input type="number" min={1} max={24} value={s.duration}
                                onChange={e => updateSlot(s._localId, { duration: parseFloat(e.target.value) || 1 })}
                                className="w-14 text-xs border rounded px-1.5 py-1 text-center" placeholder="시간"
                              />
                              <span className="text-[10px] text-gray-400 self-center">h</span>
                            </div>
                            <div className="flex gap-2 items-center">
                              <span className="text-xs text-gray-500">인원:</span>
                              <input type="number" min={1} max={99} value={s.headcount}
                                onChange={e => updateSlot(s._localId, { headcount: parseInt(e.target.value) || 1 })}
                                className="w-14 text-xs border rounded px-1.5 py-1 text-center"
                              />
                              <span className="text-[10px] text-gray-400">명</span>
                              <span className="text-[10px] text-gray-500 ml-auto">= {formatHours(s.duration * s.headcount)}h</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.light} ${colors.text}`}>
                                {s.worker_type === "알바(사업소득)" ? "알바" : s.worker_type}
                              </span>
                              <span className="text-xs font-mono text-gray-700">{formatTimeRange(s.start_hour, s.duration)}</span>
                              <span className="text-xs font-medium text-gray-800">{s.headcount}명</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-500 mr-1">{formatHours(s.duration * s.headcount)}h</span>
                              <button onClick={(e) => { e.stopPropagation(); setEditingSlotId(s._localId); }} className="p-0.5 hover:bg-gray-200 rounded">
                                <Edit3 size={12} className="text-gray-400" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); removeSlot(s._localId); }} className="p-0.5 hover:bg-red-100 rounded">
                                <Trash2 size={12} className="text-red-400" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add new slot */}
            <div className="px-4 py-3 border-t border-gray-200">
              {addForm ? (
                <div className="space-y-3">
                  <div className="text-xs font-medium text-gray-700">시간 블록 추가</div>
                  {/* Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_SHIFTS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => setAddForm(f => f ? { ...f, start_hour: p.start, duration: p.dur } : f)}
                        className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                          addForm.start_hour === p.start && addForm.duration === p.dur
                            ? "bg-blue-100 border-blue-300 text-blue-700 font-medium"
                            : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {p.label} <span className="text-gray-400">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                  {/* Custom inputs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500">유형</label>
                      <select
                        value={addForm.worker_type}
                        onChange={e => setAddForm(f => f ? { ...f, worker_type: e.target.value as WorkerType } : f)}
                        className="w-full text-xs border rounded-md px-2 py-1.5 mt-0.5"
                      >
                        {WORKER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">인원</label>
                      <input type="number" min={1} max={99} value={addForm.headcount}
                        onChange={e => setAddForm(f => f ? { ...f, headcount: parseInt(e.target.value) || 1 } : f)}
                        className="w-full text-xs border rounded-md px-2 py-1.5 mt-0.5 text-center" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">시작 시간</label>
                      <select
                        value={addForm.start_hour}
                        onChange={e => setAddForm(f => f ? { ...f, start_hour: parseInt(e.target.value) } : f)}
                        className="w-full text-xs border rounded-md px-2 py-1.5 mt-0.5"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500">근무 시간</label>
                      <select
                        value={addForm.duration}
                        onChange={e => setAddForm(f => f ? { ...f, duration: parseFloat(e.target.value) } : f)}
                        className="w-full text-xs border rounded-md px-2 py-1.5 mt-0.5"
                      >
                        {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24].map(h => (
                          <option key={h} value={h}>{h}시간</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-2">
                    {formatTimeRange(addForm.start_hour, addForm.duration)} | {addForm.headcount}명 x {addForm.duration}h = <strong>{formatHours(addForm.duration * addForm.headcount)}h</strong>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        addSlot(selectedDay!, {
                          worker_type: addForm.worker_type,
                          start_hour: addForm.start_hour,
                          duration: addForm.duration,
                          headcount: addForm.headcount,
                          memo: addForm.memo,
                        });
                        // Keep form open for quick adding
                      }}
                      className="flex-1 bg-blue-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      추가
                    </button>
                    <button
                      onClick={() => setAddForm(null)}
                      className="px-3 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddForm({ worker_type: "파견", start_hour: 8, duration: 9, headcount: 1, memo: "" })}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Plus size={14} />
                  시간 블록 추가
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Save Button */}
      {hasChanges && (
        <div className="fixed bottom-8 right-8 z-40">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-medium shadow-lg hover:bg-blue-700 transition-all hover:shadow-xl"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={18} />
            )}
            {saving ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>
      )}
    </div>
  );
}
