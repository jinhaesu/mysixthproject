// Color-blind safe chart palette tuned for dark UI (paired with design tokens).
// Keep these as raw hex (not CSS vars) because Recharts SVG accepts hex only.
export const CHART_COLORS = [
  '#6E7CFF', // brand indigo
  '#34D399', // emerald
  '#F5BB42', // amber
  '#F87171', // coral
  '#C084FC', // violet
  '#22D3EE', // cyan
  '#FB923C', // orange
  '#94A3B8', // slate
];

export const SEMANTIC_COLORS = {
  regular:   '#6E7CFF',  // 기본 — brand
  overtime:  '#F5BB42',  // 연장 — amber
  night:     '#C084FC',  // 야간 — violet
  holiday:   '#F87171',  // 휴일 — coral
  vacation:  '#A78BFA',  // 휴가 — light violet
  gross:     '#34D399',  // 지급액 — emerald
  deduction: '#F87171',  // 공제 — coral
  net:       '#10B981',  // 실지급 — deeper emerald
};

export const AXIS_STYLE = {
  fontSize: 11,
  fill: '#8A8F98',
};

export const GRID_STROKE = '#1F2226';

// Linear-style gradient pairs for area/bar fills (premium look).
export const CHART_GRADIENTS = {
  brand:  { from: '#828FFF', to: '#5E6AD2' },
  sky:    { from: '#7DC1FE', to: '#3B82F6' },
  teal:   { from: '#5EEAD4', to: '#22D3EE' },
  green:  { from: '#6EE7B7', to: '#34D399' },
  gold:   { from: '#FCD34D', to: '#F5BB42' },
  orange: { from: '#FDBA74', to: '#FB923C' },
  rose:   { from: '#FCA5A5', to: '#F87171' },
  violet: { from: '#DDD6FE', to: '#C084FC' },
} as const;

export type GradientKey = keyof typeof CHART_GRADIENTS;
const GRADIENT_KEYS: GradientKey[] = [
  'brand', 'green', 'gold', 'rose', 'violet', 'teal', 'orange', 'sky',
];

export function getColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function getGradient(index: number) {
  return CHART_GRADIENTS[GRADIENT_KEYS[index % GRADIENT_KEYS.length]];
}
