"use client";

import { useMemo, useState } from "react";

interface DataPoint {
  hour: number;
  count: number;
  department?: string;
}

interface HourlyChartProps {
  /** 출근 데이터 */
  clockInData: DataPoint[];
  /** 퇴근 데이터 (optional) */
  clockOutData?: DataPoint[];
  title: string;
  departments?: string[];
  selectedDept?: string;
  onDeptChange?: (dept: string) => void;
  extraControls?: React.ReactNode;
  compact?: boolean;
}

const DEPT_COLORS: Record<string, string> = {
  "물류1층": "#3b82f6", "물류": "#3b82f6",
  "생산2층": "#10b981", "생산3층": "#f59e0b",
  "생산 야간": "#8b5cf6", "물류 야간": "#6366f1",
  "기타": "#94a3b8",
};

const CHART_H = 180;

function aggregate(data: DataPoint[], selectedDept: string) {
  const hm = new Map<number, number>();
  for (let h = 0; h < 24; h++) hm.set(h, 0);
  for (const d of data) {
    const dept = d.department || '기타';
    if (selectedDept && dept !== selectedDept) continue;
    hm.set(d.hour, (hm.get(d.hour) || 0) + d.count);
  }
  return hm;
}

export default function HourlyChart({ clockInData, clockOutData, title, departments, selectedDept, onDeptChange, extraControls, compact }: HourlyChartProps) {
  // 0~23시 전체 표시 (24개 슬롯)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const [viewMode, setViewMode] = useState<'both' | 'in' | 'out'>(clockOutData ? 'both' : 'in');

  const { inMap, outMap, maxCount, totalIn, totalOut, allDepts } = useMemo(() => {
    const im = aggregate(clockInData, selectedDept || '');
    const om = clockOutData ? aggregate(clockOutData, selectedDept || '') : new Map<number, number>();
    let mc = 0, ti = 0, to = 0;
    for (let h = 0; h < 24; h++) {
      const iv = im.get(h) || 0;
      const ov = om.get(h) || 0;
      ti += iv; to += ov;
      if (viewMode === 'both') mc = Math.max(mc, iv, ov);
      else if (viewMode === 'in') mc = Math.max(mc, iv);
      else mc = Math.max(mc, ov);
    }
    const ad = departments || Array.from(new Set(clockInData.map(d => d.department || '기타'))).sort();
    return { inMap: im, outMap: om, maxCount: Math.max(1, mc), totalIn: ti, totalOut: to, allDepts: ad };
  }, [clockInData, clockOutData, selectedDept, viewMode, departments]);

  const barH = (count: number) => count > 0 ? Math.max((count / maxCount) * CHART_H, 4) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-medium">출근 {totalIn}명</span>
          {clockOutData && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-medium">퇴근 {totalOut}명</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {extraControls}
          {clockOutData && (
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {([['both', '출퇴근'], ['in', '출근'], ['out', '퇴근']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setViewMode(k)}
                  className={`px-2.5 py-1 text-[11px] font-medium ${viewMode === k ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
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
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {(viewMode === 'both' || viewMode === 'in') && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span className="text-[11px] text-gray-600 font-medium">출근</span>
            </div>
          )}
          {clockOutData && (viewMode === 'both' || viewMode === 'out') && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-emerald-500" />
              <span className="text-[11px] text-gray-600 font-medium">퇴근</span>
            </div>
          )}
          {selectedDept && (
            <>
              <span className="text-[11px] text-gray-400">|</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: DEPT_COLORS[selectedDept] ? DEPT_COLORS[selectedDept] + '22' : '#f1f5f9', color: DEPT_COLORS[selectedDept] || '#475569' }}>
                {selectedDept}
              </span>
              <button onClick={() => onDeptChange?.('')} className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
            </>
          )}
        </div>

        {/* Chart */}
        <div className="flex">
          {/* Y-axis */}
          <div className="flex flex-col justify-between pr-2" style={{ height: `${CHART_H}px` }}>
            {[maxCount, Math.round(maxCount / 2), 0].map((v, i) => (
              <span key={i} className="text-[10px] text-gray-400 leading-none text-right w-5">{v}</span>
            ))}
          </div>

          {/* Chart body */}
          <div className="flex-1 relative" style={{ height: `${CHART_H}px` }}>
            {/* Grid */}
            {[0, 50, 100].map(pct => (
              <div key={pct} className="absolute w-full border-t border-dashed border-gray-100" style={{ top: `${pct}%` }} />
            ))}

            {/* Bars */}
            <div className="absolute inset-0 flex items-end px-0.5">
              {hours.map(h => {
                const iv = inMap.get(h) || 0;
                const ov = outMap.get(h) || 0;
                const showIn = viewMode === 'both' || viewMode === 'in';
                const showOut = clockOutData && (viewMode === 'both' || viewMode === 'out');
                const isBoth = showIn && showOut;

                return (
                  <div key={h} className="flex-1 group relative" style={{ height: '100%' }}>
                    {/* Tooltip */}
                    {(iv > 0 || ov > 0) && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
                        <div className="font-bold mb-1">{h}:00 ~ {h + 1}:00</div>
                        {iv > 0 && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded bg-blue-400" />출근 <span className="font-bold ml-auto">{iv}명</span></div>}
                        {ov > 0 && <div className="flex items-center gap-2"><span className="w-2 h-2 rounded bg-emerald-400" />퇴근 <span className="font-bold ml-auto">{ov}명</span></div>}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                      </div>
                    )}

                    {/* Bar group */}
                    <div className="absolute bottom-0 left-[5%] right-[5%] flex gap-[1px] items-end" style={{ height: '100%' }}>
                      {showIn && (
                        <div className={`${isBoth ? 'flex-1' : 'w-full'} relative`} style={{ height: '100%' }}>
                          <div className="absolute bottom-0 w-full rounded-t bg-blue-500 group-hover:bg-blue-600 transition-colors"
                            style={{ height: `${barH(iv)}px` }} />
                          {iv > 0 && (
                            <div className="absolute w-full text-center text-[9px] font-bold text-blue-700"
                              style={{ bottom: `${barH(iv) + 1}px` }}>{iv}</div>
                          )}
                        </div>
                      )}
                      {showOut && (
                        <div className={`${isBoth ? 'flex-1' : 'w-full'} relative`} style={{ height: '100%' }}>
                          <div className="absolute bottom-0 w-full rounded-t bg-emerald-500 group-hover:bg-emerald-600 transition-colors"
                            style={{ height: `${barH(ov)}px` }} />
                          {ov > 0 && (
                            <div className="absolute w-full text-center text-[9px] font-bold text-emerald-700"
                              style={{ bottom: `${barH(ov) + 1}px` }}>{ov}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis */}
        <div className="flex ml-7 mt-1">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center">
              <span className={`text-[10px] ${h % 2 === 0 ? 'text-gray-600 font-medium' : 'text-transparent'}`}>{h}</span>
            </div>
          ))}
        </div>
        <div className="ml-7 text-center text-[10px] text-gray-400">(시)</div>
      </div>
    </div>
  );
}
