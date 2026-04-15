// Colorblind-safe chart palette (Okabe-Ito inspired)
export const CHART_COLORS = [
  '#3b82f6', // blue
  '#f97316', // orange
  '#10b981', // green
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#64748b', // slate
];

export const SEMANTIC_COLORS = {
  regular: '#3b82f6',   // 기본
  overtime: '#f59e0b',   // 연장
  night: '#8b5cf6',      // 야간
  holiday: '#f43f5e',    // 휴일
  vacation: '#a78bfa',   // 휴가
  gross: '#10b981',      // 지급액
  deduction: '#ef4444',  // 공제
  net: '#059669',        // 실지급
};

export function getColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
