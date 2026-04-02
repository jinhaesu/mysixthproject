"use client";

import { useMemo } from "react";

interface HourlyChartProps {
  data: { hour: number; count: number; department?: string }[];
  title: string;
  departments?: string[];
  selectedDept?: string;
  onDeptChange?: (dept: string) => void;
  extraControls?: React.ReactNode;
  compact?: boolean;
}

const BAR_COLORS: Record<string, string> = {
  "물류1층": "#3b82f6", "물류": "#3b82f6",
  "생산2층": "#10b981", "생산3층": "#f59e0b",
  "생산 야간": "#8b5cf6", "물류 야간": "#6366f1",
  "기타": "#94a3b8",
};

const CHART_H = 200; // 바 영역 높이(px)

export default function HourlyChart({ data, title, departments, selectedDept, onDeptChange, extraControls, compact }: HourlyChartProps) {
  const startH = compact ? 5 : 0;
  const endH = compact ? 23 : 24;
  const hours = Array.from({ length: endH - startH }, (_, i) => i + startH);

  const { hourTotals, allDepts, maxCount, totalPeople } = useMemo(() => {
    // Aggregate
    const hm = new Map<number, Map<string, number>>();
    for (let h = 0; h < 24; h++) hm.set(h, new Map());
    for (const d of data) {
      const dept = d.department || '기타';
      const m = hm.get(d.hour)!;
      m.set(dept, (m.get(dept) || 0) + d.count);
    }

    const ht: { hour: number; total: number; segments: { dept: string; count: number }[] }[] = [];
    let mc = 0, tp = 0;
    for (let h = 0; h < 24; h++) {
      const m = hm.get(h)!;
      let total = 0;
      const segs: { dept: string; count: number }[] = [];
      if (selectedDept) {
        const c = m.get(selectedDept) || 0;
        if (c > 0) segs.push({ dept: selectedDept, count: c });
        total = c;
      } else {
        m.forEach((count, dept) => { if (count > 0) segs.push({ dept, count }); total += count; });
      }
      ht.push({ hour: h, total, segments: segs });
      if (total > mc) mc = total;
      tp += total;
    }

    const ad = departments || Array.from(new Set(data.map(d => d.department || '기타'))).sort();
    return { hourTotals: ht, allDepts: ad, maxCount: Math.max(1, mc), totalPeople: tp };
  }, [data, departments, selectedDept]);

  const yTicks = [maxCount, Math.round(maxCount * 0.75), Math.round(maxCount * 0.5), Math.round(maxCount * 0.25), 0];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{totalPeople}명</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {extraControls}
          {onDeptChange && (
            <select value={selectedDept || ''} onChange={e => onDeptChange(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white">
              <option value="">전체 부서</option>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Legend */}
        {!selectedDept && allDepts.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {allDepts.map(d => (
              <button key={d} onClick={() => onDeptChange?.(d)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-gray-200 hover:border-gray-400 transition-colors bg-white">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: BAR_COLORS[d] || '#94a3b8' }} />
                {d}
              </button>
            ))}
          </div>
        )}
        {selectedDept && (
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: BAR_COLORS[selectedDept] || '#94a3b8' }} />
              {selectedDept}
            </span>
            <button onClick={() => onDeptChange?.('')} className="text-xs text-gray-500 hover:text-gray-700">전체 보기</button>
          </div>
        )}

        {/* Chart */}
        <div className="flex">
          {/* Y-axis */}
          <div className="flex flex-col justify-between pr-2 py-0" style={{ height: `${CHART_H}px` }}>
            {yTicks.map((v, i) => (
              <span key={i} className="text-[10px] text-gray-400 leading-none text-right w-5">{v}</span>
            ))}
          </div>

          {/* Chart body */}
          <div className="flex-1 relative" style={{ height: `${CHART_H}px` }}>
            {/* Grid lines */}
            {yTicks.map((_, i) => (
              <div key={i} className="absolute w-full border-t border-gray-100"
                style={{ top: `${(i / (yTicks.length - 1)) * 100}%` }} />
            ))}

            {/* Bars */}
            <div className="absolute inset-0 flex items-end gap-[2px] px-1">
              {hours.map(h => {
                const ht = hourTotals[h];
                const barH = ht.total > 0 ? Math.max((ht.total / maxCount) * CHART_H, 4) : 0;

                return (
                  <div key={h} className="flex-1 relative group" style={{ height: '100%' }}>
                    {/* Tooltip */}
                    {ht.total > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                        <div className="font-bold mb-1">{h}:00 ~ {h + 1}:00</div>
                        {ht.segments.map(s => (
                          <div key={s.dept} className="flex items-center gap-2 py-0.5">
                            <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: BAR_COLORS[s.dept] || '#94a3b8' }} />
                            <span className="flex-1">{s.dept}</span>
                            <span className="font-bold ml-4">{s.count}명</span>
                          </div>
                        ))}
                        {ht.segments.length > 1 && <div className="border-t border-gray-600 mt-1 pt-1 text-right font-bold">합계 {ht.total}명</div>}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                      </div>
                    )}

                    {/* Count on top */}
                    {ht.total > 0 && (
                      <div className="absolute w-full text-center text-[10px] font-bold text-gray-700"
                        style={{ bottom: `${barH + 2}px` }}>
                        {ht.total}
                      </div>
                    )}

                    {/* Bar stack */}
                    <div className="absolute bottom-0 left-[10%] right-[10%] rounded-t-sm overflow-hidden group-hover:ring-2 group-hover:ring-blue-400 transition-shadow"
                      style={{ height: `${barH}px` }}>
                      {ht.segments.map((s, i) => {
                        const segH = ht.total > 0 ? (s.count / ht.total) * barH : 0;
                        return (
                          <div key={i} style={{ height: `${segH}px`, backgroundColor: BAR_COLORS[s.dept] || '#94a3b8' }} />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis */}
        <div className="flex ml-7 pl-1 mt-1">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center">
              <span className={`text-[10px] ${h % 2 === 0 ? 'text-gray-600 font-medium' : 'text-transparent'}`}>
                {h}
              </span>
            </div>
          ))}
        </div>
        <div className="ml-7 text-center text-[10px] text-gray-400">(시)</div>
      </div>
    </div>
  );
}
