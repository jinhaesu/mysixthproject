"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, Save, Info, Users, UserCheck, AlertTriangle } from "lucide-react";
import { getWorkforcePlans, saveWorkforcePlans } from "@/lib/api";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WORKER_TYPES = ["파견", "알바(사업소득)"] as const;
type WorkerType = typeof WORKER_TYPES[number];

interface DayPlan {
  [key: string]: number; // "파견" | "알바(사업소득)"
}

interface PlanMemo {
  [key: string]: string;
}

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

export default function WorkforcePlanPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [plans, setPlans] = useState<Record<number, DayPlan>>({});
  const [memos, setMemos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  const daysInMonth = getDaysInMonth(year, month);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getWorkforcePlans(year, month);
      const planMap: Record<number, DayPlan> = {};
      const memoMap: Record<string, string> = {};
      for (const item of data) {
        if (!planMap[item.day]) planMap[item.day] = {};
        planMap[item.day][item.worker_type] = item.planned_count;
        if (item.memo) {
          memoMap[`${item.day}-${item.worker_type}`] = item.memo;
        }
      }
      setPlans(planMap);
      setMemos(memoMap);
      setHasChanges(false);
      setSaved(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  };

  const updatePlan = (day: number, type: WorkerType, count: number) => {
    setPlans(prev => ({
      ...prev,
      [day]: { ...prev[day], [type]: Math.max(0, count) },
    }));
    setHasChanges(true);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const planItems: any[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        for (const type of WORKER_TYPES) {
          const count = plans[day]?.[type] || 0;
          const memo = memos[`${day}-${type}`] || "";
          if (count > 0 || memo) {
            planItems.push({ day, worker_type: type, planned_count: count, memo });
          }
        }
      }
      await saveWorkforcePlans(year, month, planItems);
      setHasChanges(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Group days by week
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
    if (currentDays.length > 0) {
      result.push({ week: currentWeek, days: currentDays });
    }
    return result;
  }, [year, month, daysInMonth]);

  // Weekly and monthly totals
  const weeklyTotals = useMemo(() => {
    return weeks.map(w => {
      const totals: Record<string, number> = {};
      for (const type of WORKER_TYPES) {
        totals[type] = w.days.reduce((sum, day) => sum + (plans[day]?.[type] || 0), 0);
      }
      totals.total = WORKER_TYPES.reduce((sum, type) => sum + totals[type], 0);
      return totals;
    });
  }, [weeks, plans]);

  const monthlyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const type of WORKER_TYPES) {
      totals[type] = Array.from({ length: daysInMonth }, (_, i) => i + 1)
        .reduce((sum, day) => sum + (plans[day]?.[type] || 0), 0);
    }
    totals.total = WORKER_TYPES.reduce((sum, type) => sum + totals[type], 0);
    return totals;
  }, [plans, daysInMonth]);

  const workDays = useMemo(() => {
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      if (!isWeekend(year, month, day)) count++;
    }
    return count;
  }, [year, month, daysInMonth]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">인력 조달 계획 수립</h2>
          <p className="text-gray-500 mt-1">월별 파견/알바 인력 투입 계획을 수립합니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-2">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={20} /></button>
            <span className="text-lg font-semibold text-gray-900 min-w-[120px] text-center">{year}년 {month}월</span>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={20} /></button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              hasChanges
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : saved
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <Save size={16} />
            {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
          </button>
        </div>
      </div>

      {/* Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <strong>계획 수립용</strong>이며, 실제 운영 결과는 <strong>대시보드</strong>를 참고하세요.
          파견과 알바(사업소득) 인원을 일별로 계획하여 인력 조달에 활용합니다.
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Users size={14} />
            월간 총 투입 (연인원)
          </div>
          <div className="text-2xl font-bold text-gray-900">{monthlyTotals.total}명</div>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
          <div className="flex items-center gap-2 text-sm text-orange-600 mb-1">
            <UserCheck size={14} />
            파견 (연인원)
          </div>
          <div className="text-2xl font-bold text-orange-700">{monthlyTotals["파견"]}명</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <div className="flex items-center gap-2 text-sm text-green-600 mb-1">
            <UserCheck size={14} />
            알바 (연인원)
          </div>
          <div className="text-2xl font-bold text-green-700">{monthlyTotals["알바(사업소득)"]}명</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">평일 기준</div>
          <div className="text-2xl font-bold text-gray-900">{workDays}일</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">일평균 투입</div>
          <div className="text-2xl font-bold text-gray-900">
            {workDays > 0 ? (monthlyTotals.total / workDays).toFixed(1) : "0"}명
          </div>
        </div>
      </div>

      {/* Plan Table by Week */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {weeks.map((week, wi) => (
            <div key={wi} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{week.week}주차</h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-orange-600 font-medium">파견: {weeklyTotals[wi]?.["파견"] || 0}명</span>
                  <span className="text-green-600 font-medium">알바: {weeklyTotals[wi]?.["알바(사업소득)"] || 0}명</span>
                  <span className="text-gray-700 font-semibold">합계: {weeklyTotals[wi]?.total || 0}명</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-20">구분</th>
                      {week.days.map(day => {
                        const dow = getDayOfWeek(year, month, day);
                        const dayName = DAY_NAMES[dow];
                        const weekend = dow === 0 || dow === 6;
                        return (
                          <th key={day} className={`text-center px-1 py-2.5 font-medium min-w-[60px] ${
                            weekend ? "bg-orange-50" : ""
                          }`}>
                            <div className={`${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-700"}`}>
                              {day}일
                            </div>
                            <div className={`text-xs ${dow === 0 ? "text-red-400" : dow === 6 ? "text-blue-400" : "text-gray-400"}`}>
                              {dayName}
                            </div>
                          </th>
                        );
                      })}
                      <th className="text-center px-3 py-2.5 font-semibold text-gray-700 bg-blue-50 min-w-[60px]">소계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WORKER_TYPES.map(type => {
                      const weekTotal = week.days.reduce((sum, day) => sum + (plans[day]?.[type] || 0), 0);
                      return (
                        <tr key={type} className="border-b border-gray-100">
                          <td className={`px-4 py-1.5 font-medium text-xs whitespace-nowrap ${
                            type === "파견" ? "text-orange-700" : "text-green-700"
                          }`}>{type === "알바(사업소득)" ? "알바" : type}</td>
                          {week.days.map(day => {
                            const count = plans[day]?.[type] || 0;
                            const weekend = isWeekend(year, month, day);
                            return (
                              <td key={day} className={`text-center px-0.5 py-1 ${weekend ? "bg-orange-50/50" : ""}`}>
                                <input
                                  type="number"
                                  min="0"
                                  max="99"
                                  value={count || ""}
                                  onChange={(e) => updatePlan(day, type, parseInt(e.target.value) || 0)}
                                  className={`w-full text-center border rounded px-1 py-1.5 text-sm tabular-nums ${
                                    count > 0
                                      ? type === "파견" ? "border-orange-300 bg-orange-50 text-orange-800 font-medium" : "border-green-300 bg-green-50 text-green-800 font-medium"
                                      : "border-gray-200 text-gray-400"
                                  }`}
                                  placeholder="0"
                                />
                              </td>
                            );
                          })}
                          <td className={`text-center px-3 py-1.5 font-semibold tabular-nums bg-blue-50 ${
                            type === "파견" ? "text-orange-700" : "text-green-700"
                          }`}>{weekTotal}</td>
                        </tr>
                      );
                    })}
                    {/* Daily total row */}
                    <tr className="bg-gray-50 font-medium">
                      <td className="px-4 py-2 text-xs text-gray-600">합계</td>
                      {week.days.map(day => {
                        const dayTotal = WORKER_TYPES.reduce((sum, type) => sum + (plans[day]?.[type] || 0), 0);
                        const weekend = isWeekend(year, month, day);
                        return (
                          <td key={day} className={`text-center px-1 py-2 tabular-nums text-gray-700 ${weekend ? "bg-orange-50/50" : ""}`}>
                            {dayTotal > 0 ? dayTotal : <span className="text-gray-300">-</span>}
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-2 font-bold tabular-nums text-gray-900 bg-blue-100">
                        {weeklyTotals[wi]?.total || 0}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Monthly Total */}
          <div className="bg-blue-900 rounded-xl p-5 text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{month}월 전체 계획 요약</h3>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-blue-200 text-xs">파견</div>
                  <div className="text-xl font-bold">{monthlyTotals["파견"]}명</div>
                </div>
                <div className="text-center">
                  <div className="text-blue-200 text-xs">알바(사업소득)</div>
                  <div className="text-xl font-bold">{monthlyTotals["알바(사업소득)"]}명</div>
                </div>
                <div className="text-center border-l border-blue-700 pl-6">
                  <div className="text-blue-200 text-xs">총 연인원</div>
                  <div className="text-2xl font-bold">{monthlyTotals.total}명</div>
                </div>
              </div>
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
