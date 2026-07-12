"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { GraduationCap, Loader2, Search } from "lucide-react";
import { getTrainingStatus, type TrainingStatusRow } from "@/lib/api";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, useToast,
} from "@/components/ui";

function currentHalfYearPeriod(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  return `${y}-H${m <= 6 ? 1 : 2}`;
}

function periodOptions(): string[] {
  const cur = currentHalfYearPeriod();
  const [yy, hh] = cur.split("-");
  const y = Number(yy);
  const h = Number(hh.replace("H", ""));
  const opts: string[] = [];
  // 이번 반기 포함해서 뒤로 4개
  for (let i = 0; i < 4; i++) {
    let py = y, ph = h - i;
    while (ph <= 0) { ph += 2; py -= 1; }
    opts.push(`${py}-H${ph}`);
  }
  return opts;
}

export default function TrainingStatusPage() {
  const toast = useToast();
  const [period, setPeriod] = useState<string>(currentHalfYearPeriod());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof getTrainingStatus>> | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTrainingStatus(period);
      setData(res);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [period, toast]);

  useEffect(() => { load(); }, [load]);

  const departments = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const r of data.rows) if (r.department) set.add(r.department);
    return Array.from(set).sort();
  }, [data]);

  const filtered: TrainingStatusRow[] = useMemo(() => {
    if (!data) return [];
    const s = search.trim();
    return data.rows.filter((r) => {
      if (deptFilter && r.department !== deptFilter) return false;
      if (s) {
        if (!(r.name || "").includes(s) && !(r.department || "").includes(s) && !(r.team || "").includes(s)) return false;
      }
      return true;
    });
  }, [data, search, deptFilter]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="반기 정기 안전보건교육 이수 현황"
        description="생산직 대상 필수 교육 이수 여부. 반기 마감 D-14 이내 미이수 시 퇴근 게이팅이 활성화됩니다."
      />

      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="반기">
            <Select value={period} onChange={(e) => setPeriod((e.target as HTMLSelectElement).value)}>
              {periodOptions().map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="부서 필터">
            <Select value={deptFilter} onChange={(e) => setDeptFilter((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="검색">
            <Input placeholder="이름·부서·팀" value={search} onChange={(e) => setSearch((e.target as HTMLInputElement).value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={load} disabled={loading} variant="secondary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              새로고침
            </Button>
          </div>
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile label="대상 인원" value={data.summary.target_count} tone="neutral" />
          <Tile label="필수 코스" value={data.summary.required_count} tone="neutral" />
          <Tile label="완료" value={data.summary.complete} tone="success" />
          <Tile label="일부 이수" value={data.summary.partial} tone="warning" />
          <Tile label="미시작" value={data.summary.not_started} tone="danger" />
        </div>
      )}

      {data && data.by_department.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="text-[var(--fs-base)] font-semibold mb-3 text-[var(--text-1)]">부서별 요약</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">부서</th>
                    <th className="text-left py-2 pr-3">대상</th>
                    <th className="text-left py-2 pr-3">완료</th>
                    <th className="text-left py-2 pr-3">일부</th>
                    <th className="text-left py-2 pr-3">미시작</th>
                    <th className="text-left py-2 pr-3">완료율</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_department.map((d) => {
                    const pct = d.total > 0 ? Math.round((d.complete / d.total) * 100) : 0;
                    return (
                      <tr key={d.dept} className="border-b border-[var(--border-1)]">
                        <td className="py-2 pr-3 font-medium text-[var(--text-1)]">{d.dept}</td>
                        <td className="py-2 pr-3 tabular text-[var(--text-2)]">{d.total}</td>
                        <td className="py-2 pr-3 tabular text-[var(--success-fg)]">{d.complete}</td>
                        <td className="py-2 pr-3 tabular text-[var(--warning-fg)]">{d.partial}</td>
                        <td className="py-2 pr-3 tabular text-[var(--danger-fg)]">{d.not_started}</td>
                        <td className="py-2 pr-3 tabular font-semibold">
                          <span className={pct >= 80 ? "text-[var(--success-fg)]" : pct >= 50 ? "text-[var(--warning-fg)]" : "text-[var(--danger-fg)]"}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">이름</th>
                    <th className="text-left py-2 pr-3">부서</th>
                    <th className="text-left py-2 pr-3">팀</th>
                    <th className="text-left py-2 pr-3">역할</th>
                    <th className="text-left py-2 pr-3">이수 코스</th>
                    <th className="text-left py-2 pr-3">인정 h</th>
                    <th className="text-left py-2 pr-3">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.employee_id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 font-medium text-[var(--text-1)]">{r.name}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.department || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.team || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.role || "-"}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">
                        {r.done_count} / {r.required_count}
                      </td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{r.credited_hours.toFixed(2)}h</td>
                      <td className="py-2 pr-3">
                        {r.status === "complete" ? <Badge tone="success">완료</Badge> :
                         r.status === "partial" ? <Badge tone="warning">일부 이수</Badge> :
                         r.status === "no_required" ? <Badge tone="neutral">-</Badge> :
                         <Badge tone="danger">미시작</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" }) {
  const cls = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-lg)] border p-4 ${cls}`}>
      <div className="text-[var(--fs-caption)] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
    </div>
  );
}
