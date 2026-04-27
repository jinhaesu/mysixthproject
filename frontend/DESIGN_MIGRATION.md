# Design Migration Guide

> Single source of truth for upgrading every page in `app/*` to the shared
> Linear-grade dark design system. Read this top-to-bottom before touching a
> page. Do not deviate.

## 1. What the design must look like

Linear-style: deep near-black background, subtle bordered panels, indigo brand
accents used sparingly, compact Inter typography (already loaded via
`next/font`), monospace tabular numerals on numbers, restrained motion.
Information density medium-high. No neon, no large empty whitespace, no playful
gradients. Borders before shadows; brand color only on the primary action and
focus states.

## 2. UI primitives (`@/components/ui`)

| Component | Important props |
|---|---|
| `Card` | `tone="default"\|"elevated"\|"ghost"`, `padding="none"\|"sm"\|"md"\|"lg"`, `interactive` |
| `CardHeader` | `title`, `subtitle`, `actions` |
| `Button` | `variant="primary"\|"secondary"\|"ghost"\|"danger"\|"outline"`, `size="xs"\|"sm"\|"md"\|"lg"`, `leadingIcon`, `trailingIcon`, `loading` |
| `Badge` | `tone="neutral"\|"brand"\|"success"\|"warning"\|"danger"\|"info"\|"violet"`, `size="xs"\|"sm"\|"md"`, `dot`, `pulse` |
| `Pill` | `active`, `onClick`, `icon` — for filter chips |
| `Stat` | `label`, `value`, `unit`, `icon`, `tone`, `trend?: number[]` (sparkline), `delta?: { value, format?, positiveIsGood? }`, `hint` |
| `StatTile` | alternate compact tile with `delta`, `deltaLabel`, `iconTone`, `invertDelta` |
| `PageHeader` | `title`, `description`, `eyebrow?`, `actions?`, `meta?` |
| `Section` | `title`, `subtitle`, `actions` — wraps a section block |
| `SectionHeader` | `title`, `description`, `eyebrow`, `action` |
| `Tabs` | `tabs=[{id,label,icon,count}]`, `value`, `onChange`, `variant="underline"\|"pill"`, `size` |
| `SegmentedControl` | `value`, `options=[{value,label,icon}]`, `onChange`, `size` |
| `Toolbar`, `ToolbarSpacer`, `ToolbarDivider`, `Segmented` | wrap filter rows |
| `Input`, `Select`, `Textarea` | `inputSize="sm"\|"md"\|"lg"`, `iconLeft`, `iconRight`, `invalid` |
| `Field` | `label`, `hint`, `error`, `required` — wrap input siblings |
| `Modal` | `open`, `onClose`, `title`, `description`, `size="sm"\|"md"\|"lg"\|"xl"`, `footer` |
| `EmptyState` | `icon`, `title`, `description`, `action` |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonChart`, `SkeletonTable` | loading placeholders |
| `Spinner`, `CenterSpinner` | inline / center loading |
| `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` | `numeric`, `align`, `muted`, `emphasis` |
| `useToast()` | returns `{ success, error, info, warning, push }`; Provider already mounted at root in `AppShell` |

Import: `import { Card, Button, ... } from "@/components/ui";`

## 3. Charts (`@/components/charts/...`)

```tsx
import ChartCard, { TOOLTIP_STYLE } from "@/components/charts/ChartCard";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, ChartTooltip, ChartGradients, ChartDefs, seriesColor } from "@/components/charts/theme";
import { CHART_COLORS, SEMANTIC_COLORS, CHART_GRADIENTS, getColor } from "@/lib/chartColors";
```

`ChartCard` props: `title`, `subtitle`, `eyebrow`, `delta`, `deltaLabel`,
`invertDelta`, `legend`, `actions`, `loading`, `empty`, `emptyState`, `footer`,
`height`, `className`.

Apply axis style:
```tsx
<XAxis dataKey="date" {...CHART_AXIS_PROPS} />
<YAxis {...CHART_AXIS_PROPS} />
<CartesianGrid {...CHART_GRID_PROPS} />
<Tooltip content={<ChartTooltip unit="시간" />} />
```

Gradient fills:
```tsx
<defs><ChartGradients keys={["brand", "green"]} /></defs>
<Area dataKey="hours" stroke="#7070FF" fill="url(#grad-brand)" />
```

## 4. Design tokens (CSS vars from globals.css)

| Group | Vars |
|---|---|
| Surfaces | `--bg-canvas` (deepest) → `--bg-1` → `--bg-2` → `--bg-3` (highest elevation) |
| Text | `--text-1` (primary) → `--text-2` → `--text-3` (muted) → `--text-4` (placeholder) |
| Borders | `--border-1` (default) → `--border-2` → `--border-3` (strong) |
| Brand | `--brand-400` (hover), `--brand-500` (default), `--brand-600`, `--brand-700` |
| Semantic | `--success-fg`/`-bg`/`-border`, same for `warning`, `danger`, `info` |
| Radii | `--r-sm` 6, `--r-md` 8, `--r-lg` 12, `--r-xl` 16, `--r-2xl` 20, `--r-pill` 999 |
| Font sizes | `--fs-micro` 11, `--fs-caption` 12, `--fs-body` 13, `--fs-base` 14, `--fs-lg` 16, `--fs-h4` 18, `--fs-h3` 21, `--fs-h2` 26, `--fs-h1` 32 |
| Tracking | `--tracking-tight` -0.015em, `--tracking-display` -0.025em |
| Elevation | `--elev-1`, `--elev-2`, `--elev-3`, `--elev-pop` |
| Motion | `--ease-out`, `--ease-spring`, `--d-fast`, `--d-base` |

Utility classes: `.text-eyebrow`, `.text-mono`, `.tabular`, `.fade-in`,
`.surface-bevel`, `.glass`, `.brand-glow`, `.text-gradient-brand`, `.hover-lift`,
`.gradient-brand`, `.skeleton`, `.bg-grid`.

## 5. Migration playbook (per page)

1. **Wrap with `<PageHeader>`** — title (Korean), description (Korean), eyebrow
   like `사업소득 · 파견`, actions: period selector / export buttons / etc.
2. **KPI boxes** (`bg-[#0F1011] rounded-xl border border-[#23252A] p-4`) → `<Stat label value unit icon tone trend delta hint>`. Use small `trend={[...]}` sparkline arrays where you have time-series data already on the page; otherwise omit. Use `delta={{ value: pctChange, positiveIsGood: true|false }}` when comparing periods.
3. **Generic card divs** → `<Card>` + `<CardHeader title subtitle actions>`.
4. **Charts** → `<ChartCard>` + axis/grid/tooltip from theme, gradient fills via `<ChartGradients>`, color via `seriesColor(i)` or `SEMANTIC_COLORS`.
5. **Form inputs** — Native `<input>`, `<select>`, `<textarea>` → `<Input>`, `<Select>`, `<Textarea>`. Wrap each with `<Field label="…" required>` if there's a label. Buttons → `<Button variant=…>`.
6. **Filter rows** — wrap in `<Toolbar>` or `<Card padding="sm">`. Type toggles → `<Segmented>` or `<SegmentedControl>`. Categories → `<Pill active>`.
7. **Tables** — for vanilla data tables, replace `<table>` with `<Table>`/`<THead>`/`<TBody>`/`<TR>`/`<TH numeric>`/`<TD numeric>`. For complex pivot/heatmap tables with custom cell rendering, keep the structure but swap inline hex (`#0F1011`, `#23252A`, `#8A8F98` etc.) for `var(--bg-1)`, `var(--border-1)`, `var(--text-3)` etc. Headers should always be `text-eyebrow`.
8. **`alert(…)`** → `useToast().error(…)` or `.success(…)` or `.info(…)`. Don't change `confirm()`.
9. **Loading state** → `<CenterSpinner>` or `<SkeletonChart>` / `<SkeletonTable>` / `<SkeletonCard>` while data is loading.
10. **Empty state** → `<EmptyState>`.
11. **Custom modals / inline overlays** → `<Modal>`.
12. **Public pages (`/login`, `/s`, `/r`, `/contract`, `/regular-contract`, `/report`, `/report-regular`)** — these don't render the `Sidebar`. They should have a self-contained centered or full-bleed layout that still uses the same tokens, components, and visual language. Hero copy can use `.text-gradient-brand`.

## 6. Hard rules

- **Do NOT** change API calls, state shape, business logic, math, navigation, or auth flow.
- **Do NOT** edit files outside the page directories you've been assigned. Specifically: keep `lib/api.ts`, `lib/usePersistedState.ts`, `lib/translations.ts`, `lib/dataSignal.ts`, `types/*`, `components/AuthProvider.tsx`, `components/AppShell.tsx`, `components/Sidebar.tsx`, `components/PasswordGate.tsx`, and the existing `components/ui/*` and `components/charts/*` files unchanged. (You may import from them.)
- **Do NOT** add new dependencies.
- **Do NOT** introduce comments narrating the migration.
- **Do** keep all existing functionality, including hidden states, edge cases, and event handlers.
- **Do** keep existing Korean labels verbatim. Only adjust visual chrome.
- **Do** run `npx tsc --noEmit` from `frontend/` after changes and resolve any errors before reporting done.

## 7. Tone reference snippet

A simple page should look like:

```tsx
import { PageHeader, Card, CardHeader, Section, Stat, Button, Badge, Pill, useToast } from "@/components/ui";
import ChartCard from "@/components/charts/ChartCard";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, ChartTooltip, ChartGradients } from "@/components/charts/theme";
import { Calendar, Download } from "lucide-react";

export default function Page() {
  const toast = useToast();
  return (
    <>
      <PageHeader
        eyebrow="파견 · 사업소득"
        title="근태 정보 종합 요약"
        description="2026년 4월 기준 부서별 근로 시수와 인원 추이"
        actions={
          <>
            <Button variant="secondary" size="sm" leadingIcon={<Calendar size={14} />}>4월 2026</Button>
            <Button variant="primary" size="sm" leadingIcon={<Download size={14} />}>엑셀 다운로드</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="총 근로자" value="148" unit="명" tone="brand" delta={{ value: 4.2 }} />
        <Stat label="총 근무일수" value="2,840" unit="일" tone="info" delta={{ value: -1.3 }} />
        <Stat label="총 근무시수" value="22,488.5" unit="h" tone="success" delta={{ value: 6.8 }} />
        <Stat label="1인 평균" value="151.9" unit="h" tone="warning" delta={{ value: 0.8 }} />
      </div>

      <ChartCard title="부서별 근무시수" subtitle="이번 달 합산" height={300}>
        <BarChart data={data}>
          <defs><ChartGradients keys={["brand"]} /></defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="dept" {...CHART_AXIS_PROPS} />
          <YAxis {...CHART_AXIS_PROPS} />
          <Tooltip content={<ChartTooltip unit="h" />} />
          <Bar dataKey="hours" fill="url(#grad-brand)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartCard>
    </>
  );
}
```

That's the bar to clear.
