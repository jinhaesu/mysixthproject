"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, Save, Info, Clock, UserCheck,
  Plus, X, Trash2, Edit3, ChevronDown, ChevronUp
} from "lucide-react";
import { getWorkforcePlanSlots, saveWorkforcePlanSlotsBatch, getWorkforcePlanComparison } from "@/lib/api";
import {
  PageHeader, Card, CardHeader, Stat, Button, Badge, CenterSpinner,
  Table, THead, TBody, TR, TH, TD, useToast,
} from "@/components/ui";

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

const TYPE_COLORS: Record<WorkerType, { bg: string; border: string; bar: string; barHex: string; text: string; light: string }> = {
  "파견": { bg: "bg-[var(--warning-bg)]", border: "border-[var(--warning-border)]", bar: "bg-[#FC7840]", barHex: "#FC7840", text: "text-[var(--warning-fg)]", light: "bg-[#FC7840]/15" },
  "알바(사업소득)": { bg: "bg-[var(--success-bg)]", border: "border-[var(--success-border)]", bar: "bg-[var(--success-fg)]", barHex: "#34D399", text: "text-[var(--success-fg)]", light: "bg-[var(--success-bg)]" },
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
  const toast = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [addForm, setAddForm] = useState<{
    worker_type: WorkerType; start_hour: number; duration: number; headcount: number; memo: string;
  } | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [collapsedWeeks, setCollapsedWeeks] = useState<Set<number>>(new Set());
  const [comparison, setComparison] = useState<any>(null);
  const [showComparison, setShowComparison] = useState(false);

  const daysInMonth = getDaysInMonth(year, month);
  const [apiReady, setApiReady] = useState(true);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getWorkforcePlanSlots(year, month);
      setSlots(data.map((s: any) => ({ ...s, _localId: genLocalId() })));
      setHasChanges(false);
      setSaved(false);
      setSelectedDay(null);
      setApiReady(true);
    } catch (err: any) {
      if (err.message?.includes("404") || err.message?.includes("오류")) {
        setSlots([]);
        setApiReady(false);
      } else {
        setError(err.message);
      }
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

  const applyPreset = (day: number, preset: typeof PRESET_SHIFTS[0], type: WorkerType, headcount: number) => {
    addSlot(day, { worker_type: type, start_hour: preset.start, duration: preset.dur, headcount, memo: "" });
    setAddForm(null);
  };

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

  const loadComparison = async () => {
    try {
      const data = await getWorkforcePlanComparison(year, month);
      setComparison(data);
    } catch (err) {
      console.error(err);
    }
  };

  const MiniTimeline = ({ day }: { day: number }) => {
    const daySlots = slotsByDay[day] || [];
    if (daySlots.length === 0) return <div className="h-4 bg-[var(--bg-2)] rounded-sm" />;
    const hasMultiTypes = new Set(daySlots.map(s => s.worker_type)).size > 1;
    return (
      <div className="relative h-4 bg-[var(--bg-2)] rounded-sm overflow-hidden">
        {[6, 12, 18].map(h => (
          <div key={h} className="absolute top-0 h-full w-px bg-[var(--border-1)]" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        {daySlots.map(s => {
          const left = (s.start_hour / 24) * 100;
          const width = Math.min((s.duration / 24) * 100, 100 - left);
          const colors = TYPE_COLORS[s.worker_type as WorkerType];
          const isAlba = s.worker_type === "알바(사업소득)";
          const topStyle = hasMultiTypes ? (isAlba ? "top-[50%] h-[50%]" : "top-0 h-[50%]") : "top-0 h-full";
          return (
            <div
              key={s._localId}
              className={`absolute ${topStyle} ${colors.bar} border-l border-white/40`}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 1.5)}%`,
                boxShadow: `inset 0 0 0 0.5px rgba(255,255,255,0.3)`,
              }}
              title={`${s.worker_type} ${s.headcount}명 ${formatTimeRange(s.start_hour, s.duration)} (${formatHours(s.duration * s.headcount)}h)`}
            />
          );
        })}
      </div>
    );
  };

  const selectedDaySlots = selectedDay ? (slotsByDay[selectedDay] || []) : [];
  const selectedDayDow = selectedDay ? getDayOfWeek(year, month, selectedDay) : 0;

  return (
    <div className="flex gap-4">
      <div className={`flex-1 min-w-0 ${selectedDay ? "max-w-[calc(100%-380px)]" : ""}`}>
        <PageHeader
          eyebrow="인력 계획"
          title="인력 조달 계획 수립"
          description="일별 시간대 기반으로 인력 투입을 계획합니다."
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] px-2 py-1.5">
                <Button variant="ghost" size="xs" onClick={prevMonth} leadingIcon={<ChevronLeft size={16} />} />
                <span className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] min-w-[110px] text-center tabular">
                  {year}년 {month}월
                </span>
                <Button variant="ghost" size="xs" onClick={nextMonth} leadingIcon={<ChevronRight size={16} />} />
              </div>
              <Button
                variant={showComparison ? "primary" : "secondary"}
                size="sm"
                onClick={() => { setShowComparison(!showComparison); if (!showComparison) loadComparison(); }}
              >
                계획 vs 실적
              </Button>
              <Button
                variant={hasChanges ? "primary" : saved ? "secondary" : "ghost"}
                size="sm"
                onClick={handleSave}
                disabled={saving || !hasChanges}
                loading={saving}
                leadingIcon={<Save size={14} />}
              >
                {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
              </Button>
            </div>
          }
        />

        <Card tone="ghost" className="border-[var(--info-border)] bg-[var(--info-bg)] mb-4 flex items-start gap-3">
          <Info size={15} className="text-[var(--brand-400)] shrink-0 mt-0.5" />
          <p className="text-[var(--fs-caption)] text-[var(--brand-400)]">
            <strong>계획 수립용</strong>이며, 실제 운영 결과는 <strong>대시보드</strong>를 참고하세요.
            날짜를 클릭하면 00~24시 시간대별로 인력을 배치할 수 있습니다.
          </p>
        </Card>

        {!apiReady && (
          <Card tone="ghost" className="border-[var(--warning-border)] bg-[var(--warning-bg)] mb-4 flex items-start gap-3">
            <Info size={15} className="text-[var(--warning-fg)] shrink-0 mt-0.5" />
            <p className="text-[var(--fs-caption)] text-[var(--warning-fg)]">
              <strong>서버 배포 대기 중</strong> — PR을 머지하면 새 기능이 활성화됩니다.
              지금은 로컬에서 계획을 작성하고, 배포 후 저장할 수 있습니다.
            </p>
          </Card>
        )}
        {error && (
          <Card tone="ghost" className="border-[var(--danger-border)] bg-[var(--danger-bg)] mb-4">
            <p className="text-[var(--danger-fg)] text-[var(--fs-body)]">{error}</p>
          </Card>
        )}

        {showComparison && comparison && (
          <Card padding="none" className="mb-4 overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-1)]">
              <CardHeader title="계획 vs 실적 비교" />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>일</TH>
                    <TH numeric>계획(h)</TH>
                    <TH numeric>실적(h)</TH>
                    <TH numeric>인원</TH>
                    <TH>달성률</TH>
                  </TR>
                </THead>
                <TBody>
                  {comparison.days.filter((d: any) => d.planned_hours > 0 || d.actual_hours > 0).map((d: any) => {
                    const rate = d.planned_hours > 0 ? Math.round((d.actual_hours / d.planned_hours) * 100) : 0;
                    return (
                      <TR key={d.day}>
                        <TD emphasis>{d.day}일</TD>
                        <TD numeric><span className="text-[var(--brand-400)]">{d.planned_hours}</span></TD>
                        <TD numeric><span className="text-[var(--success-fg)]">{d.actual_hours}</span></TD>
                        <TD numeric>{d.worker_count}명</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-[var(--bg-3)] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${rate >= 100 ? 'bg-[var(--success-fg)]' : rate >= 70 ? 'bg-[var(--warning-fg)]' : 'bg-[var(--danger-fg)]'}`}
                                style={{ width: `${Math.min(rate, 100)}%` }}
                              />
                            </div>
                            <span className={`text-[var(--fs-caption)] font-medium tabular ${rate >= 100 ? 'text-[var(--success-fg)]' : rate >= 70 ? 'text-[var(--warning-fg)]' : 'text-[var(--danger-fg)]'}`}>
                              {rate}%
                            </span>
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Stat label="월간 총 시수" value={formatHours(monthlyTotals.total)} unit="h" tone="brand" icon={<Clock size={14} />} />
          <Stat label="파견 시수" value={formatHours(monthlyTotals.byType["파견"] || 0)} unit="h" tone="warning" icon={<UserCheck size={14} />} />
          <Stat label="알바 시수" value={formatHours(monthlyTotals.byType["알바(사업소득)"] || 0)} unit="h" tone="success" icon={<UserCheck size={14} />} />
          <Stat label="투입 일수" value={String(activeDays)} unit={`/ ${daysInMonth}일`} tone="info" />
          <Stat
            label="일평균 시수"
            value={activeDays > 0 ? formatHours(monthlyTotals.total / activeDays) : "0"}
            unit="h"
          />
        </div>

        {loading ? (
          <CenterSpinner />
        ) : (
          <div className="space-y-3">
            {weeks.map((week, wi) => {
              const collapsed = collapsedWeeks.has(wi);
              return (
                <Card key={wi} padding="none" className="overflow-hidden">
                  <div
                    className="px-4 py-2.5 bg-[var(--bg-0)] border-b border-[var(--border-1)] flex items-center justify-between cursor-pointer hover:bg-[var(--bg-1)] transition-colors"
                    onClick={() => toggleWeek(wi)}
                  >
                    <div className="flex items-center gap-2">
                      {collapsed ? <ChevronDown size={14} className="text-[var(--text-3)]" /> : <ChevronUp size={14} className="text-[var(--text-3)]" />}
                      <span className="font-semibold text-[var(--text-1)] text-[var(--fs-body)]">{week.week}주차</span>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--fs-caption)]">
                      <span className="text-[var(--warning-fg)] font-medium">파견: {formatHours(weeklyTotals[wi]?.byType["파견"] || 0)}h</span>
                      <span className="text-[var(--success-fg)] font-medium">알바: {formatHours(weeklyTotals[wi]?.byType["알바(사업소득)"] || 0)}h</span>
                      <span className="text-[var(--text-2)] font-semibold">합계: {formatHours(weeklyTotals[wi]?.total || 0)}h</span>
                    </div>
                  </div>
                  {!collapsed && (
                    <div className="divide-y divide-[var(--border-1)]">
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
                              isSelected
                                ? "bg-[var(--info-bg)] border-l-2 border-l-[var(--brand-400)]"
                                : weekend
                                ? "bg-[var(--warning-bg)]/30 hover:bg-[var(--warning-bg)]/60"
                                : "hover:bg-[var(--bg-2)]"
                            }`}
                            onClick={() => setSelectedDay(isSelected ? null : day)}
                          >
                            <div className="flex items-center gap-1.5 w-16 shrink-0">
                              <span className={`text-[var(--fs-body)] font-semibold tabular ${
                                dow === 0 ? "text-[var(--danger-fg)]" : dow === 6 ? "text-[var(--brand-400)]" : "text-[var(--text-1)]"
                              }`}>{day}일</span>
                              <span className={`text-[var(--fs-caption)] ${
                                dow === 0 ? "text-[var(--danger-fg)]" : dow === 6 ? "text-[var(--brand-400)]" : "text-[var(--text-4)]"
                              }`}>{dayName}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <MiniTimeline day={day} />
                            </div>
                            <div className="flex items-center gap-2 shrink-0 w-44 justify-end">
                              {ds && ds.totalHours > 0 ? (
                                <>
                                  {ds.byType["파견"] && (
                                    <Badge tone="warning" size="xs">
                                      파견 {ds.byType["파견"].people}명 {formatHours(ds.byType["파견"].hours)}h
                                    </Badge>
                                  )}
                                  {ds.byType["알바(사업소득)"] && (
                                    <Badge tone="success" size="xs">
                                      알바 {ds.byType["알바(사업소득)"].people}명 {formatHours(ds.byType["알바(사업소득)"].hours)}h
                                    </Badge>
                                  )}
                                  <span className="text-[var(--fs-caption)] font-bold text-[var(--text-2)] tabular">{formatHours(ds.totalHours)}h</span>
                                </>
                              ) : (
                                <span className="text-[var(--fs-caption)] text-[var(--text-4)]">-</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}

            <Card className="bg-[var(--bg-2)] border-[var(--border-2)]">
              <div className="flex items-center justify-between">
                <h3 className="text-[var(--fs-base)] font-bold text-[var(--text-1)]">{month}월 전체 계획 요약</h3>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-[var(--fs-caption)] text-[var(--warning-fg)]">파견</div>
                    <div className="text-[var(--fs-h4)] font-bold text-[var(--warning-fg)] tabular">
                      {formatHours(monthlyTotals.byType["파견"] || 0)}<span className="text-[var(--fs-caption)] font-normal ml-0.5">h</span>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[var(--fs-caption)] text-[var(--success-fg)]">알바</div>
                    <div className="text-[var(--fs-h4)] font-bold text-[var(--success-fg)] tabular">
                      {formatHours(monthlyTotals.byType["알바(사업소득)"] || 0)}<span className="text-[var(--fs-caption)] font-normal ml-0.5">h</span>
                    </div>
                  </div>
                  <div className="text-center border-l border-[var(--border-2)] pl-6">
                    <div className="text-[var(--fs-caption)] text-[var(--text-3)]">총 시수</div>
                    <div className="text-[var(--fs-h3)] font-bold text-[var(--text-1)] tabular">
                      {formatHours(monthlyTotals.total)}<span className="text-[var(--fs-caption)] font-normal ml-0.5">h</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {selectedDay && (
        <div className="w-[360px] shrink-0 sticky top-4 self-start">
          <Card padding="none" className="overflow-hidden shadow-[var(--elev-3)]">
            <div className="px-4 py-3 bg-[var(--bg-0)] border-b border-[var(--border-1)] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-1)]">
                  {month}월 {selectedDay}일
                  <span className={`ml-1.5 text-[var(--fs-body)] font-medium ${
                    selectedDayDow === 0 ? "text-[var(--danger-fg)]" : selectedDayDow === 6 ? "text-[var(--brand-400)]" : "text-[var(--text-3)]"
                  }`}>({DAY_NAMES[selectedDayDow]})</span>
                </h3>
                <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5">
                  총 <span className="tabular">{formatHours(dayStats[selectedDay]?.totalHours || 0)}</span>h / {dayStats[selectedDay]?.totalPeople || 0}명
                </p>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => { setSelectedDay(null); setAddForm(null); setEditingSlotId(null); }}
                leadingIcon={<X size={14} />}
              />
            </div>

            <div className="px-4 py-3 border-b border-[var(--border-1)]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-eyebrow">24시간 타임라인</div>
                <div className="flex items-center gap-2">
                  {WORKER_TYPES.map(type => {
                    const colors = TYPE_COLORS[type];
                    return (
                      <div key={type} className="flex items-center gap-1">
                        <div className={`w-2.5 h-2.5 rounded-sm ${colors.bar}`} />
                        <span className="text-[9px] text-[var(--text-3)]">{type === "알바(사업소득)" ? "알바" : type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="relative">
                <div className="flex h-5 border-b border-[var(--border-1)]">
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className="flex-1 border-l border-[var(--border-1)] text-center">
                      {i % 3 === 0 && <span className="text-[9px] text-[var(--text-4)] tabular">{String(i).padStart(2, "0")}</span>}
                    </div>
                  ))}
                  <div className="border-l border-[var(--border-1)] w-0" />
                </div>
                {WORKER_TYPES.map(type => {
                  const typeSlots = selectedDaySlots.filter(s => s.worker_type === type);
                  const colors = TYPE_COLORS[type];
                  return (
                    <div key={type} className="relative h-8 mt-px">
                      <div className="absolute inset-0 bg-[var(--bg-0)] rounded-sm" />
                      <div className="absolute inset-0 flex">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div key={i} className={`flex-1 border-l ${i % 6 === 0 ? "border-[var(--border-1)]" : "border-[var(--border-1)]/40"}`} />
                        ))}
                      </div>
                      <div className="absolute -left-0 top-0 h-full flex items-center z-10">
                        <span className={`text-[8px] font-semibold ${colors.text} bg-[var(--bg-1)] px-0.5 rounded`}>
                          {type === "알바(사업소득)" ? "알바" : type}
                        </span>
                      </div>
                      {typeSlots.length === 0 ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[9px] text-[var(--text-4)]">-</span>
                        </div>
                      ) : (
                        typeSlots.map((s) => {
                          const left = (s.start_hour / 24) * 100;
                          const width = Math.min((s.duration / 24) * 100, 100 - left);
                          const isEditing = editingSlotId === s._localId;
                          return (
                            <div
                              key={s._localId}
                              className={`absolute top-1 h-6 rounded cursor-pointer transition-all ${
                                isEditing ? "ring-2 ring-[var(--brand-400)] ring-offset-1 z-20" : "hover:brightness-110 z-10"
                              }`}
                              style={{
                                left: `${left}%`,
                                width: `${Math.max(width, 4)}%`,
                                backgroundColor: colors.barHex,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
                                border: "1px solid rgba(255,255,255,0.3)",
                              }}
                              onClick={() => setEditingSlotId(isEditing ? null : s._localId)}
                              title={`${formatTimeRange(s.start_hour, s.duration)} ${s.headcount}명 (${formatHours(s.duration * s.headcount)}h)`}
                            >
                              <div className="flex items-center justify-center h-full gap-0.5 px-1">
                                <span className="text-white text-[9px] font-bold truncate">{s.headcount}명</span>
                                {width > 12 && <span className="text-white/70 text-[8px] truncate">{s.duration}h</span>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
                {selectedDaySlots.length === 0 && (
                  <div className="h-10 flex items-center justify-center text-[var(--fs-caption)] text-[var(--text-4)]">시간 블록을 추가하세요</div>
                )}
              </div>
            </div>

            <div className="px-4 py-2 max-h-[300px] overflow-y-auto">
              <div className="text-eyebrow mb-2">배치 목록</div>
              {selectedDaySlots.length === 0 ? (
                <div className="text-center py-4 text-[var(--fs-caption)] text-[var(--text-4)]">아직 배치된 인력이 없습니다</div>
              ) : (
                <div className="space-y-1.5">
                  {selectedDaySlots.map(s => {
                    const colors = TYPE_COLORS[s.worker_type as WorkerType];
                    const isEditing = editingSlotId === s._localId;
                    return (
                      <div
                        key={s._localId}
                        className={`rounded-[var(--r-md)] border p-2 ${isEditing ? "border-[var(--brand-400)] bg-[var(--info-bg)]" : `${colors.border} ${colors.bg}`}`}
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <select
                                value={s.worker_type}
                                onChange={(e) => updateSlot(s._localId, { worker_type: e.target.value as WorkerType })}
                                className="text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-1.5 py-1 flex-1 bg-[var(--bg-2)] text-[var(--text-1)]"
                              >
                                {WORKER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input type="number" min={0} max={23} value={s.start_hour}
                                onChange={e => updateSlot(s._localId, { start_hour: parseInt(e.target.value) || 0 })}
                                className="w-14 text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-1.5 py-1 text-center bg-[var(--bg-2)] text-[var(--text-1)]" placeholder="시작"
                              />
                              <span className="text-[var(--fs-caption)] text-[var(--text-3)] self-center">~</span>
                              <input type="number" min={1} max={24} value={s.duration}
                                onChange={e => updateSlot(s._localId, { duration: parseFloat(e.target.value) || 1 })}
                                className="w-14 text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-1.5 py-1 text-center bg-[var(--bg-2)] text-[var(--text-1)]" placeholder="시간"
                              />
                              <span className="text-[9px] text-[var(--text-3)] self-center">h</span>
                            </div>
                            <div className="flex gap-2 items-center">
                              <span className="text-[var(--fs-caption)] text-[var(--text-3)]">인원:</span>
                              <input type="number" min={1} max={99} value={s.headcount}
                                onChange={e => updateSlot(s._localId, { headcount: parseInt(e.target.value) || 1 })}
                                className="w-14 text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-1.5 py-1 text-center bg-[var(--bg-2)] text-[var(--text-1)]"
                              />
                              <span className="text-[9px] text-[var(--text-3)]">명</span>
                              <span className="text-[9px] text-[var(--text-3)] ml-auto tabular">= {formatHours(s.duration * s.headcount)}h</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge tone={s.worker_type === "파견" ? "warning" : "success"} size="xs">
                                {s.worker_type === "알바(사업소득)" ? "알바" : s.worker_type}
                              </Badge>
                              <span className="text-[var(--fs-caption)] text-mono text-[var(--text-2)]">{formatTimeRange(s.start_hour, s.duration)}</span>
                              <span className="text-[var(--fs-caption)] font-medium text-[var(--text-1)]">{s.headcount}명</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-[var(--text-3)] mr-1 tabular">{formatHours(s.duration * s.headcount)}h</span>
                              <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setEditingSlotId(s._localId); }} leadingIcon={<Edit3 size={11} />} />
                              <Button variant="danger" size="xs" onClick={(e) => { e.stopPropagation(); removeSlot(s._localId); }} leadingIcon={<Trash2 size={11} />} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-[var(--border-1)]">
              {addForm ? (
                <div className="space-y-3">
                  <div className="text-eyebrow">시간 블록 추가</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_SHIFTS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => setAddForm(f => f ? { ...f, start_hour: p.start, duration: p.dur } : f)}
                        className={`px-2 py-1 text-[9px] rounded-[var(--r-sm)] border transition-colors ${
                          addForm.start_hour === p.start && addForm.duration === p.dur
                            ? "bg-[var(--info-bg)] border-[var(--brand-400)] text-[var(--brand-400)] font-medium"
                            : "bg-[var(--bg-0)] border-[var(--border-1)] text-[var(--text-3)] hover:bg-[var(--bg-2)]"
                        }`}
                      >
                        {p.label} <span className="text-[var(--text-4)]">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-[var(--text-3)]">유형</label>
                      <select
                        value={addForm.worker_type}
                        onChange={e => setAddForm(f => f ? { ...f, worker_type: e.target.value as WorkerType } : f)}
                        className="w-full text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-2 py-1.5 mt-0.5 bg-[var(--bg-2)] text-[var(--text-1)]"
                      >
                        {WORKER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-[var(--text-3)]">인원</label>
                      <input type="number" min={1} max={99} value={addForm.headcount}
                        onChange={e => setAddForm(f => f ? { ...f, headcount: parseInt(e.target.value) || 1 } : f)}
                        className="w-full text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-2 py-1.5 mt-0.5 text-center bg-[var(--bg-2)] text-[var(--text-1)]" />
                    </div>
                    <div>
                      <label className="text-[9px] text-[var(--text-3)]">시작 시간</label>
                      <select
                        value={addForm.start_hour}
                        onChange={e => setAddForm(f => f ? { ...f, start_hour: parseInt(e.target.value) } : f)}
                        className="w-full text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-2 py-1.5 mt-0.5 bg-[var(--bg-2)] text-[var(--text-1)]"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-[var(--text-3)]">근무 시간</label>
                      <select
                        value={addForm.duration}
                        onChange={e => setAddForm(f => f ? { ...f, duration: parseFloat(e.target.value) } : f)}
                        className="w-full text-[var(--fs-caption)] border border-[var(--border-2)] rounded-[var(--r-sm)] px-2 py-1.5 mt-0.5 bg-[var(--bg-2)] text-[var(--text-1)]"
                      >
                        {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24].map(h => (
                          <option key={h} value={h}>{h}시간</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[9px] text-[var(--text-3)] bg-[var(--bg-0)] rounded-[var(--r-sm)] p-2">
                    {formatTimeRange(addForm.start_hour, addForm.duration)} | {addForm.headcount}명 x {addForm.duration}h = <strong className="text-[var(--text-2)] tabular">{formatHours(addForm.duration * addForm.headcount)}h</strong>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        addSlot(selectedDay!, {
                          worker_type: addForm.worker_type,
                          start_hour: addForm.start_hour,
                          duration: addForm.duration,
                          headcount: addForm.headcount,
                          memo: addForm.memo,
                        });
                      }}
                    >
                      추가
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAddForm(null)}>닫기</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddForm({ worker_type: "파견", start_hour: 8, duration: 9, headcount: 1, memo: "" })}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-[var(--border-1)] rounded-[var(--r-md)] text-[var(--fs-caption)] text-[var(--text-3)] hover:border-[var(--brand-400)] hover:text-[var(--brand-400)] transition-colors"
                >
                  <Plus size={14} />
                  시간 블록 추가
                </button>
              )}
            </div>
          </Card>
        </div>
      )}

      {hasChanges && (
        <div className="fixed bottom-8 right-8 z-40">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSave}
            disabled={saving}
            loading={saving}
            leadingIcon={<Save size={16} />}
            className="shadow-[var(--elev-pop)] brand-glow"
          >
            {saving ? "저장 중..." : "변경사항 저장"}
          </Button>
        </div>
      )}
    </div>
  );
}
