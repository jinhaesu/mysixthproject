"use client";

import { useMemo } from "react";

interface HourlyChartProps {
  data: { hour: number; count: number; department?: string }[];
  title: string;
  departments?: string[];
  selectedDept?: string;
  onDeptChange?: (dept: string) => void;
  /** Optional: extra controls rendered next to the dept filter */
  extraControls?: React.ReactNode;
  /** Show only working hours 5~23 instead of 0~24 */
  compact?: boolean;
}

const DEPT_COLORS: Record<string, { bg: string; text: string }> = {
  "물류1층": { bg: "#dbeafe", text: "#1d4ed8" },
  "물류":   { bg: "#dbeafe", text: "#1d4ed8" },
  "생산2층": { bg: "#d1fae5", text: "#047857" },
  "생산3층": { bg: "#fef3c7", text: "#b45309" },
  "생산 야간": { bg: "#ede9fe", text: "#6d28d9" },
  "물류 야간": { bg: "#e0e7ff", text: "#4338ca" },
  "기타":   { bg: "#f1f5f9", text: "#475569" },
};
const BAR_COLORS: Record<string, string> = {
  "물류1층": "#3b82f6", "물류": "#3b82f6",
  "생산2층": "#10b981", "생산3층": "#f59e0b",
  "생산 야간": "#8b5cf6", "물류 야간": "#6366f1",
  "기타": "#94a3b8",
};

export default function HourlyChart({ data, title, departments, selectedDept, onDeptChange, extraControls, compact }: HourlyChartProps) {
  const startH = compact ? 5 : 0;
  const endH = compact ? 23 : 24;
  const hours = Array.from({ length: endH - startH }, (_, i) => i + startH);

  const { hourMap, allDepts, maxCount, totalPeople } = useMemo(() => {
    const hm = new Map<number, Map<string, number>>();
    for (let h = 0; h < 24; h++) hm.set(h, new Map());
    for (const d of data) {
      const dept = d.department || '기타';
      const m = hm.get(d.hour)!;
      m.set(dept, (m.get(dept) || 0) + d.count);
    }
    const ad = departments || Array.from(new Set(data.map(d => d.department || '기타'))).sort();
    let mc = 0;
    let tp = 0;
    for (const [, m] of hm) {
      let sum = 0;
      if (selectedDept) { sum = m.get(selectedDept) || 0; }
      else { m.forEach(v => sum += v); }
      if (sum > mc) mc = sum;
      tp += sum;
    }
    return { hourMap: hm, allDepts: ad, maxCount: Math.max(1, mc), totalPeople: tp };
  }, [data, departments, selectedDept]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-500">총 {totalPeople}명</span>
        </div>
        <div className="flex items-center gap-2">
          {extraControls}
          {onDeptChange && (
            <select value={selectedDept || ''} onChange={e => onDeptChange(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white min-w-[80px]">
              <option value="">전체 부서</option>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {/* Legend */}
        {!selectedDept && allDepts.length > 1 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
            {allDepts.map(d => {
              const c = DEPT_COLORS[d] || DEPT_COLORS['기타'];
              return (
                <button key={d} onClick={() => onDeptChange?.(d)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: c.bg, color: c.text }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: BAR_COLORS[d] || '#94a3b8' }} />
                  {d}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart area */}
        <div className="relative">
          {/* Y-axis guides */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: '160px' }}>
            {[maxCount, Math.round(maxCount * 0.5), 0].map((v, i) => (
              <div key={i} className="flex items-center">
                <span className="text-[10px] text-gray-400 w-6 text-right mr-2">{v}</span>
                <div className="flex-1 border-t border-gray-100" />
              </div>
            ))}
          </div>

          {/* Bars */}
          <div className="flex items-end gap-[3px] ml-8" style={{ height: '160px' }}>
            {hours.map(h => {
              const hMap = hourMap.get(h)!;
              let total = 0;
              const segments: { dept: string; count: number }[] = [];
              if (selectedDept) {
                const c = hMap.get(selectedDept) || 0;
                if (c > 0) segments.push({ dept: selectedDept, count: c });
                total = c;
              } else {
                hMap.forEach((count, dept) => {
                  if (count > 0) segments.push({ dept, count });
                  total += count;
                });
              }
              const heightPct = total > 0 ? (total / maxCount) * 100 : 0;
              const isActive = total > 0;

              return (
                <div key={h} className="flex-1 flex flex-col items-center group relative min-w-0">
                  {/* Tooltip */}
                  {isActive && (
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none"
                      style={{ left: '50%', transform: 'translateX(-50%)' }}>
                      <div className="font-semibold mb-1">{h}:00 ~ {h + 1}:00</div>
                      {segments.map(s => (
                        <div key={s.dept} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: BAR_COLORS[s.dept] || '#94a3b8' }} />
                          <span>{s.dept}</span>
                          <span className="font-semibold ml-auto pl-3">{s.count}명</span>
                        </div>
                      ))}
                      {segments.length > 1 && <div className="border-t border-gray-700 mt-1 pt-1 text-right font-semibold">합계 {total}명</div>}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
                    </div>
                  )}

                  {/* Count label on top */}
                  {isActive && (
                    <div className="text-[10px] font-semibold text-gray-600 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {total}
                    </div>
                  )}

                  {/* Bar */}
                  <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                    <div className={`w-full rounded-t overflow-hidden flex flex-col-reverse transition-all duration-200 ${isActive ? 'group-hover:ring-2 group-hover:ring-blue-400/50' : ''}`}
                      style={{ height: `${heightPct}%`, minHeight: isActive ? '3px' : '0' }}>
                      {segments.map((s, i) => {
                        const segPct = total > 0 ? (s.count / total) * 100 : 0;
                        return (
                          <div key={i} className="transition-all duration-200"
                            style={{ height: `${segPct}%`, backgroundColor: BAR_COLORS[s.dept] || '#94a3b8', minHeight: '2px' }} />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex ml-8 mt-1.5">
            {hours.map(h => (
              <div key={h} className="flex-1 text-center">
                <span className={`text-[10px] ${h % 2 === 0 ? 'text-gray-600 font-medium' : 'text-gray-300'}`}>
                  {h % 2 === 0 ? `${h}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="ml-8 text-center text-[10px] text-gray-400 mt-0.5">(시)</div>
        </div>
      </div>
    </div>
  );
}
