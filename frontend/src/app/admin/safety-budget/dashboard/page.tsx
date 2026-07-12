"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, PiggyBank, Wallet, TrendingUp, AlertTriangle, CheckCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  PageHeader, Card, Badge, Button, Select, useToast, StatTile,
} from "@/components/ui";
import {
  getSafetyBudgetSummary,
  type SafetyBudgetSummaryResponse, type SafetyBudgetSummaryCategory,
} from "@/lib/api";

const CATEGORY_COLOR: Record<string, string> = {
  ppe: "#5E6AD2",
  training: "#4CAF50",
  facility: "#F5A524",
  checkup: "#38B2AC",
  consulting: "#A78BFA",
  other: "#A0AEC0",
};

function fmtKRW(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR");
}

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return `${Number(n).toFixed(digits)}%`;
}

function rateTone(rate: number | null): "success" | "brand" | "warning" | "danger" {
  if (rate === null) return "brand";
  if (rate >= 90) return "success";
  if (rate >= 60) return "brand";
  if (rate >= 30) return "warning";
  return "danger";
}

export default function SafetyBudgetDashboardPage() {
  const toast = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [data, setData] = useState<SafetyBudgetSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSafetyBudgetSummary(year);
      setData(res);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [year, toast]);

  useEffect(() => { load(); }, [load]);

  const monthlyChart = useMemo(() => {
    if (!data) return [];
    return data.monthly.map((m) => {
      const row: any = { month: `${m.month}월` };
      for (const c of data.categories) {
        row[c.category] = m.by_category[c.category] || 0;
      }
      row._total = m.executed;
      return row;
    });
  }, [data]);

  const categories = data?.categories || [];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전보건 예산 (§4-4)"
        title="예산 집행률 대시보드"
        description="편성 대비 실제 집행률·카테고리별 게이지·월별·분기별 추이. 중처법 반기 이행점검 근거."
        actions={
          <div className="flex gap-2">
            <Select
              value={String(year)}
              onChange={(e) => setYear(Number((e.target as HTMLSelectElement).value))}
              className="w-28"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Link href="/admin/safety-budget">
              <Button variant="secondary"><PiggyBank className="w-4 h-4" /> 편성</Button>
            </Link>
            <Link href="/admin/safety-budget/execution">
              <Button variant="secondary"><Wallet className="w-4 h-4" /> 집행 등록</Button>
            </Link>
          </div>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatTile
          label={`${year} 총 편성액`}
          value={fmtKRW(data?.totals.planned || 0)}
          unit="원"
          hint={`${categories.length}개 카테고리`}
          icon={<PiggyBank size={14} />}
          iconTone="brand"
        />
        <StatTile
          label={`${year} 총 집행액`}
          value={fmtKRW(data?.totals.executed || 0)}
          unit="원"
          hint={`잔여 ${fmtKRW(data?.totals.remaining || 0)}원`}
          icon={<Wallet size={14} />}
          iconTone={rateTone(data?.totals.execution_rate ?? null)}
        />
        <StatTile
          label="전체 집행률"
          value={fmtPct(data?.totals.execution_rate ?? null)}
          unit=""
          hint="편성 대비 집행 비율"
          icon={<TrendingUp size={14} />}
          iconTone={rateTone(data?.totals.execution_rate ?? null)}
        />
        <StatTile
          label="편성/집행 상태"
          value={
            !data || data.totals.planned === 0
              ? "미편성"
              : (data.totals.execution_rate ?? 0) >= 30
              ? "정상 진행"
              : "집행 부진"
          }
          unit=""
          hint={
            !data || data.totals.planned === 0
              ? "연간 예산 편성 등록 필요"
              : (data.totals.execution_rate ?? 0) >= 30
              ? "이행점검 근거 확보"
              : "집행 촉진 필요"
          }
          icon={
            !data || data.totals.planned === 0
              ? <AlertTriangle size={14} />
              : (data.totals.execution_rate ?? 0) >= 30
              ? <CheckCircle size={14} />
              : <AlertTriangle size={14} />
          }
          iconTone={
            !data || data.totals.planned === 0
              ? "warning"
              : (data.totals.execution_rate ?? 0) >= 30
              ? "success"
              : "warning"
          }
        />
      </div>

      {/* 카테고리별 게이지 */}
      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
              카테고리별 편성·집행
            </h3>
          </div>

          {loading && !data && (
            <div className="text-center text-[var(--text-3)] py-6">
              <Loader2 className="w-5 h-5 animate-spin inline" /> 불러오는 중…
            </div>
          )}
          {!loading && categories.length === 0 && (
            <div className="text-center text-[var(--text-3)] py-6">
              해당 연도의 편성이 없습니다. 먼저{" "}
              <Link href="/admin/safety-budget" className="text-[var(--brand-400)] underline">편성 등록</Link>
              부터 진행하세요.
            </div>
          )}
          {categories.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {categories.map((c) => (
                <CategoryGauge key={c.category} c={c} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* 카테고리 표 */}
      {categories.length > 0 && (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">카테고리 집계</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="text-[var(--fs-caption)] text-[var(--text-3)] border-b border-[var(--border-1)]">
                  <tr>
                    <th className="text-left px-3 py-2">카테고리</th>
                    <th className="text-right px-3 py-2">편성(원)</th>
                    <th className="text-right px-3 py-2">집행(원)</th>
                    <th className="text-right px-3 py-2">잔여(원)</th>
                    <th className="text-right px-3 py-2">집행률</th>
                    <th className="text-right px-3 py-2">건수</th>
                    <th className="text-center px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.category} className="border-t border-[var(--border-1)]">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm"
                            style={{ background: CATEGORY_COLOR[c.category] || "#5E6AD2" }}
                          />
                          {c.category_label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular">{fmtKRW(c.planned)}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtKRW(c.executed)}</td>
                      <td className="px-3 py-2 text-right tabular text-[var(--text-3)]">{fmtKRW(c.remaining)}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtPct(c.execution_rate)}</td>
                      <td className="px-3 py-2 text-right tabular">{c.count}</td>
                      <td className="px-3 py-2 text-center">
                        {c.planned === 0
                          ? <Badge tone="neutral">미편성</Badge>
                          : (c.execution_rate ?? 0) >= 100
                          ? <Badge tone="success">완료</Badge>
                          : (c.execution_rate ?? 0) >= 60
                          ? <Badge tone="brand">진행중</Badge>
                          : (c.execution_rate ?? 0) >= 30
                          ? <Badge tone="warning">지연</Badge>
                          : <Badge tone="danger">부진</Badge>}
                      </td>
                    </tr>
                  ))}
                  {data && (
                    <tr className="border-t-2 border-[var(--border-2)] font-semibold">
                      <td className="px-3 py-2">합계</td>
                      <td className="px-3 py-2 text-right tabular">{fmtKRW(data.totals.planned)}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtKRW(data.totals.executed)}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtKRW(data.totals.remaining)}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtPct(data.totals.execution_rate)}</td>
                      <td className="px-3 py-2 text-right tabular">
                        {categories.reduce((s, c) => s + c.count, 0)}
                      </td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* 월별 추이 차트 */}
      {data && (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
                월별 집행 추이 (카테고리 스택)
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-1)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fill: "var(--text-3)", fontSize: 10 }} />
                  <YAxis
                    tick={{ fill: "var(--text-3)", fontSize: 11 }}
                    tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v.toLocaleString())}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}
                    formatter={(v: any) => `${fmtKRW(Number(v))} 원`}
                  />
                  <Legend />
                  {categories.map((c) => (
                    <Bar
                      key={c.category}
                      dataKey={c.category}
                      stackId="1"
                      fill={CATEGORY_COLOR[c.category] || "#5E6AD2"}
                      name={c.category_label}
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>
      )}

      {/* 분기별 표 */}
      {data && (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">분기별 집행</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {data.quarterly.map((q) => {
                const share = data.totals.executed > 0
                  ? Math.round((q.executed / data.totals.executed) * 1000) / 10
                  : 0;
                return (
                  <Card key={q.quarter}>
                    <div className="p-4">
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
                        Q{q.quarter} ({q.months.join("/")}월)
                      </div>
                      <div className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] mt-1">
                        {fmtKRW(q.executed)}원
                      </div>
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
                        연간 대비 {share}%
                      </div>
                      <div className="relative w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-2">
                        <div
                          className="h-full bg-[var(--brand-500)]"
                          style={{ width: `${Math.min(100, share)}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function CategoryGauge({ c }: { c: SafetyBudgetSummaryCategory }) {
  const pct = c.execution_rate ?? 0;
  const capped = Math.min(150, pct);
  const barColor =
    c.planned === 0
      ? "bg-[var(--border-2)]"
      : pct >= 100
      ? "bg-[var(--success-fg)]"
      : pct >= 60
      ? "bg-[var(--brand-500)]"
      : pct >= 30
      ? "bg-[var(--warning-fg)]"
      : "bg-[var(--danger-fg)]";

  return (
    <div className="border border-[var(--border-1)] rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ background: CATEGORY_COLOR[c.category] || "#5E6AD2" }}
          />
          <div className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
            {c.category_label}
          </div>
        </div>
        <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
          {c.count}건
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-[var(--fs-base)] tabular text-[var(--text-1)]">
          {fmtKRW(c.executed)} <span className="text-[var(--text-3)]">/ {fmtKRW(c.planned)} 원</span>
        </div>
        <div className="text-[var(--fs-body)] font-medium text-[var(--text-1)]">
          {fmtPct(c.execution_rate)}
        </div>
      </div>
      <div className="relative w-full h-2 rounded-full bg-white/[0.06] overflow-hidden mt-2">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(150, capped)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--text-3)] tabular">
        <span>잔여 {fmtKRW(c.remaining)}원</span>
        <span>{c.planned === 0 ? "미편성" : `${fmtPct(c.execution_rate)} 소화`}</span>
      </div>
    </div>
  );
}
