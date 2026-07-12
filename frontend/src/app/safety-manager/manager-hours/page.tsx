"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, RefreshCw, Timer, Plus, Save,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast, StatTile,
} from "@/components/ui";
import {
  getManagerHours, listManagerHoursManagers, logManagerHoursManual,
  type ManagerHoursResponse,
} from "@/lib/api";

const ACTIVITY_COLOR: Record<string, string> = {
  safety_daily_inspection: "#5E6AD2",
  safety_committee: "#4CAF50",
  training_delivery: "#F5A524",
  risk_assessment: "#E53E3E",
  hazard_processing: "#38B2AC",
  manual: "#A0AEC0",
};

const ACTIVITY_TYPES = [
  "safety_daily_inspection",
  "safety_committee",
  "training_delivery",
  "risk_assessment",
  "hazard_processing",
  "manual",
];

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return Number(n).toFixed(digits);
}

export default function ManagerHoursPage() {
  const toast = useToast();
  const [data, setData] = useState<ManagerHoursResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [managerName, setManagerName] = useState<string>("");
  const [managers, setManagers] = useState<string[]>([]);

  // 수동 로깅 모달
  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState({
    activity_type: "manual",
    minutes: 30,
    manager_name: "",
    occurred_at: new Date().toISOString().slice(0, 16),
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getManagerHours(Number(year), managerName || undefined);
      setData(res);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally { setLoading(false); }
  }, [year, managerName, toast]);

  const loadManagers = useCallback(async () => {
    try {
      const res = await listManagerHoursManagers();
      setManagers(res.managers);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadManagers(); }, [loadManagers]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.monthly.map(m => {
      const row: any = { month: m.month };
      for (const [k, v] of Object.entries(m.by_activity)) row[k] = v;
      return row;
    });
  }, [data]);

  const activityKeys = useMemo(() => {
    if (!data) return [];
    // 실제로 값이 있는 activity_type 만 legend·bar 로 표시
    const s = new Set<string>();
    for (const m of data.monthly) for (const k of Object.keys(m.by_activity)) s.add(k);
    return Array.from(s);
  }, [data]);

  const doLog = async () => {
    try {
      await logManagerHoursManual({
        activity_type: logForm.activity_type,
        minutes: Number(logForm.minutes),
        manager_name: logForm.manager_name || undefined,
        occurred_at: new Date(logForm.occurred_at).toISOString(),
        notes: logForm.notes,
      });
      toast.success("기록 완료");
      setLogOpen(false);
      await load();
      await loadManagers();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="겸직 관리자 시간 결산"
        description="안전보건법 시행규칙 별표22 겸직 안전·보건관리자 최소 업무시간(반기 685~802h) 대비 실적 결산. 이벤트별 자동 로깅 + 수동 기록 병행."
        actions={
          <div className="flex gap-2">
            <Input value={year} onChange={(e) => setYear((e.target as HTMLInputElement).value)} className="w-24" placeholder="연도" />
            <Select value={managerName} onChange={(e) => setManagerName((e.target as HTMLSelectElement).value)} className="w-40">
              <option value="">전체 관리자</option>
              {managers.map(m => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setLogOpen(true)}><Plus className="w-4 h-4" /> 수동 기록</Button>
          </div>
        }
      />

      {/* KPI 게이지 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile
          label={`${year} 상반기 실적`}
          value={fmt(data?.half_summary.H1.hours || 0)}
          unit="시간"
          hint={`목표 ${data?.half_summary.H1.target_min ?? 685}h · 게이지 ${fmt(data?.half_summary.H1.gauge_pct || 0)}%`}
          icon={<Timer size={14} />}
          iconTone={data && data.half_summary.H1.gauge_pct >= 100 ? "success" : "warning"}
        />
        <StatTile
          label={`${year} 하반기 실적`}
          value={fmt(data?.half_summary.H2.hours || 0)}
          unit="시간"
          hint={`목표 ${data?.half_summary.H2.target_min ?? 685}h · 게이지 ${fmt(data?.half_summary.H2.gauge_pct || 0)}%`}
          icon={<Timer size={14} />}
          iconTone={data && data.half_summary.H2.gauge_pct >= 100 ? "success" : "warning"}
        />
        <StatTile
          label={`${year} 연간 누적`}
          value={fmt(data?.total_hours || 0)}
          unit="시간"
          hint={`연간 권장 ${(data?.half_summary.H1.target_max ?? 802) * 2}h`}
          icon={<Timer size={14} />}
          iconTone="brand"
        />
      </div>

      {/* 반기 게이지 바 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(["H1", "H2"] as const).map((h) => {
          const summary = data?.half_summary[h];
          if (!summary) return null;
          const pct = Math.min(150, summary.gauge_pct);
          return (
            <Card key={h}>
              <div className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{h === "H1" ? "상반기" : "하반기"}</h3>
                  {summary.gauge_pct >= 100
                    ? <Badge tone="success">목표 달성</Badge>
                    : summary.gauge_pct >= 80
                    ? <Badge tone="warning">목표 근접</Badge>
                    : <Badge tone="danger">부족</Badge>}
                </div>
                <div className="text-[var(--fs-caption)] text-[var(--text-3)] mb-2">
                  {fmt(summary.hours)}h / {summary.target_min}h ({fmt(summary.gauge_pct)}%)
                </div>
                <div className="relative w-full h-3 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full ${summary.gauge_pct >= 100 ? "bg-[var(--success-fg)]" : summary.gauge_pct >= 80 ? "bg-[var(--warning-fg)]" : "bg-[var(--danger-fg)]"}`}
                    style={{ width: `${pct}%` }}
                  />
                  {/* 최대 권장 눈금 (target_max = 802 = 117%) */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-[var(--text-3)]"
                    style={{ left: `${Math.min(150, (summary.target_max / summary.target_min) * 100)}%` }}
                    title={`권장 상한 ${summary.target_max}h`}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-[var(--text-3)] tabular">
                  <span>0h</span>
                  <span>{summary.target_min}h 최소</span>
                  <span>{summary.target_max}h 권장</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 월별 스택 차트 (활동유형별) */}
      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">월별 활동 시간 (활동유형별)</h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-1)" strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fill: "var(--text-3)", fontSize: 10 }} />
                <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", color: "var(--text-1)" }} />
                <Legend />
                {activityKeys.map(k => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="1"
                    fill={ACTIVITY_COLOR[k] || "#5E6AD2"}
                    name={data?.activity_labels[k] || k}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* 활동 유형별 breakdown 표 */}
      <Card>
        <div className="p-5">
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] mb-3">활동유형별 연간 집계</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[var(--fs-body)]">
              <thead className="text-[var(--fs-caption)] text-[var(--text-3)] border-b border-[var(--border-1)]">
                <tr>
                  <th className="text-left px-3 py-2">활동 유형</th>
                  <th className="text-right px-3 py-2">이벤트 수</th>
                  <th className="text-right px-3 py-2">시간(h)</th>
                  <th className="text-right px-3 py-2">비중</th>
                </tr>
              </thead>
              <tbody>
                {data && Object.entries(data.by_activity)
                  .sort(([, a], [, b]) => b.hours - a.hours)
                  .map(([k, v]) => {
                    const pct = data.total_hours ? Math.round((v.hours / data.total_hours) * 1000) / 10 : 0;
                    return (
                      <tr key={k} className="border-t border-[var(--border-1)]">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ACTIVITY_COLOR[k] || "#5E6AD2" }} />
                            {v.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular">{v.events}</td>
                        <td className="px-3 py-2 text-right tabular">{fmt(v.hours)}</td>
                        <td className="px-3 py-2 text-right tabular text-[var(--text-3)]">{pct}%</td>
                      </tr>
                    );
                  })}
                {data && Object.keys(data.by_activity).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--text-3)]">데이터 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* 관리자별 (필터가 없을 때만) */}
      {data && !managerName && data.per_manager.length > 0 && (
        <Card>
          <div className="p-5">
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] mb-3">관리자별 연간 집계</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="text-[var(--fs-caption)] text-[var(--text-3)] border-b border-[var(--border-1)]">
                  <tr>
                    <th className="text-left px-3 py-2">관리자</th>
                    <th className="text-right px-3 py-2">이벤트 수</th>
                    <th className="text-right px-3 py-2">시간(h)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_manager.map((r) => (
                    <tr key={r.name} className="border-t border-[var(--border-1)]">
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular">{r.event_count}</td>
                      <td className="px-3 py-2 text-right tabular">{fmt(r.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* 수동 로깅 모달 */}
      <Modal open={logOpen} onClose={() => setLogOpen(false)} title="관리자 활동 시간 수동 기록" size="md">
        <div className="space-y-3">
          <Field label="활동 유형">
            <Select value={logForm.activity_type} onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              const defaults: Record<string, number> = {
                safety_daily_inspection: 60, safety_committee: 120, training_delivery: 180,
                risk_assessment: 360, hazard_processing: 15, manual: 30,
              };
              setLogForm({ ...logForm, activity_type: v, minutes: defaults[v] || 30 });
            }}>
              <option value="safety_daily_inspection">일일 순회점검 (60분)</option>
              <option value="safety_committee">산업안전보건위원회 (120분)</option>
              <option value="training_delivery">교육 실시 (180분)</option>
              <option value="risk_assessment">위험성평가 (360분)</option>
              <option value="hazard_processing">아차사고·위험요인 처리 (15분)</option>
              <option value="manual">기타(수동 입력)</option>
            </Select>
          </Field>
          <Field label="시간(분)">
            <Input type="number" value={logForm.minutes} onChange={(e) => setLogForm({ ...logForm, minutes: Number((e.target as HTMLInputElement).value) })} />
          </Field>
          <Field label="관리자 이름 (선택 — 미지정 시 로그인 이메일)">
            <Input value={logForm.manager_name} onChange={(e) => setLogForm({ ...logForm, manager_name: (e.target as HTMLInputElement).value })} placeholder="예: 김안전 (안전관리자)" />
          </Field>
          <Field label="발생 시각">
            <Input type="datetime-local" value={logForm.occurred_at} onChange={(e) => setLogForm({ ...logForm, occurred_at: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field label="비고">
            <Textarea value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: (e.target as HTMLTextAreaElement).value })} rows={3} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogOpen(false)}>취소</Button>
            <Button onClick={doLog}><Save className="w-4 h-4" /> 기록</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
