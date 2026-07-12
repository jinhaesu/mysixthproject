"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { FileText, Loader2, Search, MessageSquare } from "lucide-react";
import { getSurveyStatus, getSafetySurveyResponses, type SurveyStatusRow } from "@/lib/api";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, useToast,
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
  for (let i = 0; i < 4; i++) {
    let py = y, ph = h - i;
    while (ph <= 0) { ph += 2; py -= 1; }
    opts.push(`${py}-H${ph}`);
  }
  return opts;
}

export default function SurveyStatusPage() {
  const toast = useToast();
  const [period, setPeriod] = useState<string>(currentHalfYearPeriod());
  const [data, setData] = useState<Awaited<ReturnType<typeof getSurveyStatus>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showKind, setShowKind] = useState<"musculoskeletal" | "opinion" | null>(null);
  const [respLoading, setRespLoading] = useState(false);
  const [responses, setResponses] = useState<Awaited<ReturnType<typeof getSafetySurveyResponses>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSurveyStatus(period);
      setData(res);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [period, toast]);

  useEffect(() => { load(); }, [load]);

  const openResponses = async (kind: "musculoskeletal" | "opinion") => {
    setShowKind(kind);
    setResponses(null);
    setRespLoading(true);
    try {
      const res = await getSafetySurveyResponses(kind, period);
      setResponses(res);
    } catch (e: any) { toast.error(e.message); }
    finally { setRespLoading(false); }
  };

  const filtered: SurveyStatusRow[] = useMemo(() => {
    if (!data) return [];
    const s = search.trim();
    if (!s) return data.rows;
    return data.rows.filter((r) =>
      (r.name || "").includes(s) || (r.department || "").includes(s) || (r.team || "").includes(s)
    );
  }, [data, search]);

  const rateOf = (done: number, total: number) => total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="반기 안전보건 설문 응답 현황"
        description="근골격계 증상 설문 · 안전보건 의견 설문. D-14 이내 미제출 시 퇴근 게이팅이 활성화됩니다."
      />

      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="반기">
            <Select value={period} onChange={(e) => setPeriod((e.target as HTMLSelectElement).value)}>
              {periodOptions().map((p) => <option key={p} value={p}>{p}</option>)}
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SumTile label="대상 인원" value={data.summary.target_count} tone="neutral" />
          <SumTile label="근골격계 응답" value={data.summary.musculoskeletal_done} tone="success" />
          <SumTile label="근골격계 미응답" value={data.summary.musculoskeletal_missing} tone="warning" />
          <SumTile label="의견 응답률"
            valueText={`${rateOf(data.summary.opinion_done, data.summary.target_count)}%`}
            tone={rateOf(data.summary.opinion_done, data.summary.target_count) >= 70 ? "success" : "warning"} />
        </div>
      )}

      <div className="flex gap-3">
        <Button onClick={() => openResponses("musculoskeletal")} variant="secondary">
          <MessageSquare className="w-4 h-4" />
          근골격계 응답 열람
        </Button>
        <Button onClick={() => openResponses("opinion")} variant="secondary">
          <MessageSquare className="w-4 h-4" />
          의견 응답 열람
        </Button>
      </div>

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
                    <th className="text-left py-2 pr-3">근골격계</th>
                    <th className="text-left py-2 pr-3">의견 설문</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.employee_id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 font-medium text-[var(--text-1)]">{r.name}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.department || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.team || "-"}</td>
                      <td className="py-2 pr-3">
                        {r.musculoskeletal_done ? <Badge tone="success">완료</Badge> : <Badge tone="warning">미제출</Badge>}
                      </td>
                      <td className="py-2 pr-3">
                        {r.opinion_done ? <Badge tone="success">완료</Badge> : <Badge tone="warning">미제출</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal open={!!showKind} onClose={() => { setShowKind(null); setResponses(null); }} size="lg">
        {showKind && (
          <div>
            <div className="pb-4 border-b border-[var(--border-1)] mb-4">
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
                {showKind === "musculoskeletal" ? "근골격계 증상 설문 응답" : "안전보건 의견 설문 응답"}
              </h3>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">{period} 반기 응답 목록</p>
            </div>
            {respLoading ? (
              <div className="py-12 flex items-center justify-center text-[var(--text-3)]">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : responses && responses.responses.length > 0 ? (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {responses.responses.map((r) => {
                  let parsed: any = null;
                  try {
                    parsed = typeof r.response_json === "string" ? JSON.parse(r.response_json) : r.response_json;
                  } catch {}
                  const resp = parsed?.response || {};
                  return (
                    <div key={r.id} className="border border-[var(--border-1)] rounded-[var(--r-md)] p-3">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)]">{r.name}</p>
                          <p className="text-[var(--fs-caption)] text-[var(--text-3)]">{r.department || "-"} / {r.team || "-"}</p>
                        </div>
                        <p className="text-[var(--fs-caption)] text-[var(--text-3)] tabular">
                          {new Date(r.submitted_at).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <pre className="text-[var(--fs-caption)] text-[var(--text-2)] whitespace-pre-wrap bg-[var(--bg-2)]/40 p-2 rounded-[var(--r-sm)] max-h-64 overflow-y-auto">
                        {JSON.stringify(resp, null, 2)}
                      </pre>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-[var(--text-3)]">응답이 없습니다.</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SumTile({ label, value, valueText, tone }: { label: string; value?: number; valueText?: string; tone: "neutral" | "success" | "warning" | "danger" }) {
  const cls = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-lg)] border p-4 ${cls}`}>
      <div className="text-[var(--fs-caption)] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{valueText ?? value}</div>
    </div>
  );
}
