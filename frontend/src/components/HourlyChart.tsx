"use client";

interface HourlyChartProps {
  data: { hour: number; count: number; department?: string }[];
  title: string;
  departments?: string[];
  selectedDept?: string;
  onDeptChange?: (dept: string) => void;
}

const DEPT_COLORS: Record<string, string> = {
  "물류1층": "#3b82f6",
  "물류": "#3b82f6",
  "생산2층": "#10b981",
  "생산3층": "#f59e0b",
  "생산 야간": "#8b5cf6",
  "물류 야간": "#6366f1",
  "기타": "#94a3b8",
};

export default function HourlyChart({ data, title, departments, selectedDept, onDeptChange }: HourlyChartProps) {
  // Group by hour and department
  const hourMap = new Map<number, Map<string, number>>();
  for (let h = 0; h < 24; h++) hourMap.set(h, new Map());
  for (const d of data) {
    const dept = d.department || '기타';
    const hMap = hourMap.get(d.hour)!;
    hMap.set(dept, (hMap.get(dept) || 0) + d.count);
  }

  const allDepts = departments || Array.from(new Set(data.map(d => d.department || '기타')));
  const maxCount = Math.max(1, ...Array.from(hourMap.values()).map(m => {
    if (selectedDept) return m.get(selectedDept) || 0;
    let sum = 0; m.forEach(v => sum += v); return sum;
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {onDeptChange && (
          <select value={selectedDept || ''} onChange={e => onDeptChange(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white">
            <option value="">전체 부서</option>
            {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Legend */}
      {!selectedDept && allDepts.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-2">
          {allDepts.map(d => (
            <div key={d} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: DEPT_COLORS[d] || '#94a3b8' }} />
              <span className="text-[10px] text-gray-600">{d}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex items-end gap-[2px] h-32">
        {Array.from({ length: 24 }, (_, h) => {
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

          return (
            <div key={h} className="flex-1 flex flex-col items-center group relative">
              {/* Tooltip */}
              {total > 0 && (
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                  {h}시: {total}명
                  {segments.length > 1 && segments.map(s => (
                    <div key={s.dept}>{s.dept} {s.count}명</div>
                  ))}
                </div>
              )}
              {/* Bar */}
              <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                <div className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse" style={{ height: `${heightPct}%`, minHeight: total > 0 ? '2px' : '0' }}>
                  {segments.map((s, i) => {
                    const segPct = total > 0 ? (s.count / total) * 100 : 0;
                    return (
                      <div key={i} style={{ height: `${segPct}%`, backgroundColor: DEPT_COLORS[s.dept] || '#94a3b8', minHeight: '1px' }} />
                    );
                  })}
                </div>
              </div>
              {/* Label */}
              <span className={`text-[9px] mt-0.5 ${h % 3 === 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                {h % 3 === 0 ? h : ''}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 mt-0.5 px-1">
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>24시</span>
      </div>
    </div>
  );
}
