"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, CheckCircle, Loader2, Search, Calendar, ExternalLink } from "lucide-react";
import { getSafetyWorkerCompliance, getSafetyWorkerDetail, type SafetyComplianceRow, type SafetyComplianceResponse } from "@/lib/api";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Modal,
  useToast,
} from "@/components/ui";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function statusBadge(s: SafetyComplianceRow["status"]) {
  if (s === "complete") return <Badge tone="success">완료</Badge>;
  if (s === "no_attendance") return <Badge tone="neutral">미출근</Badge>;
  if (s === "pre_missing") return <Badge tone="warning">출근 셀프 미완</Badge>;
  if (s === "post_missing") return <Badge tone="warning">퇴근 셀프 미완</Badge>;
  if (s === "has_issue") return <Badge tone="danger">이상 감지</Badge>;
  return <Badge tone="neutral">-</Badge>;
}

export default function WorkerCompliancePage() {
  const toast = useToast();
  const [date, setDate] = useState<string>(todayKST());
  const [dept, setDept] = useState<string>("");
  const [data, setData] = useState<SafetyComplianceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailFor, setDetailFor] = useState<SafetyComplianceRow | null>(null);
  const [detailLogs, setDetailLogs] = useState<any[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSafetyWorkerCompliance(date, dept || undefined);
      setData(res);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [date, dept, toast]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row: SafetyComplianceRow) => {
    setDetailFor(row);
    setDetailLogs(null);
    setDetailLoading(true);
    try {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      const fromStr = from.toISOString().slice(0, 10);
      const res = await getSafetyWorkerDetail(row.employee_id, fromStr, date);
      setDetailLogs(res.logs);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const s = search.trim();
    if (!s) return data.items;
    return data.items.filter((r) =>
      (r.name || "").includes(s) || (r.department || "").includes(s) || (r.team || "").includes(s)
    );
  }, [data, search]);

  const departments = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const r of data.items) if (r.department) set.add(r.department);
    return Array.from(set).sort();
  }, [data]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="근로자 안전 셀프체크 이행 현황"
        description="생산직 대상 매일 출·퇴근 전 셀프체크 완료 여부. 카페·사무직 제외."
      />

      {/* Filters */}
      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="기준일">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field label="부서 필터">
            <Select value={dept} onChange={(e) => setDept((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="이름·부서 검색">
            <Input
              placeholder="검색어"
              value={search}
              onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          </Field>
          <div className="flex items-end">
            <Button onClick={load} disabled={loading} variant="secondary">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              새로고침
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryTile label="대상 인원" value={data.summary.total} tone="neutral" />
          <SummaryTile label="완료" value={data.summary.complete} tone="success" />
          <SummaryTile label="출근 셀프 미완" value={data.summary.pre_missing} tone="warning" />
          <SummaryTile label="퇴근 셀프 미완" value={data.summary.post_missing} tone="warning" />
          <SummaryTile label="이상 감지" value={data.summary.has_issue} tone="danger" />
        </div>
      )}

      {/* Table */}
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
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">출근</th>
                    <th className="text-left py-2 pr-3">출근 셀프</th>
                    <th className="text-left py-2 pr-3">퇴근</th>
                    <th className="text-left py-2 pr-3">퇴근 셀프</th>
                    <th className="text-left py-2 pr-3">7일 미완</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.employee_id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 font-medium text-[var(--text-1)]">{r.name}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.department || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.team || "-"}</td>
                      <td className="py-2 pr-3">{statusBadge(r.status)}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{fmtTime(r.clock_in_time)}</td>
                      <td className="py-2 pr-3">
                        {r.precheck_done ? (
                          r.precheck_ok === false ? (
                            <span className="text-[var(--danger-fg)] font-medium">이상</span>
                          ) : (
                            <span className="text-[var(--success-fg)] tabular text-[var(--fs-caption)]">{fmtTime(r.precheck_completed_at)}</span>
                          )
                        ) : (
                          <span className="text-[var(--text-4)]">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{fmtTime(r.clock_out_time)}</td>
                      <td className="py-2 pr-3">
                        {r.postcheck_done ? (
                          r.postcheck_ok === false ? (
                            <span className="text-[var(--danger-fg)] font-medium">이상</span>
                          ) : (
                            <span className="text-[var(--success-fg)] tabular text-[var(--fs-caption)]">{fmtTime(r.postcheck_completed_at)}</span>
                          )
                        ) : (
                          <span className="text-[var(--text-4)]">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] text-[var(--text-3)]">
                        {(r.missing_pre_7d + r.missing_post_7d) > 0 ? (
                          <span className="text-[var(--warning-fg)] font-semibold">{r.missing_pre_7d + r.missing_post_7d}건</span>
                        ) : (
                          <span className="text-[var(--text-4)]">0</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => openDetail(r)}
                          className="text-[var(--brand-500)] hover:text-[var(--brand-400)] text-[var(--fs-caption)] underline"
                        >
                          상세
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Detail Modal */}
      <Modal open={!!detailFor} onClose={() => setDetailFor(null)} size="lg">
        {detailFor && (
          <div>
            <div className="pb-4 border-b border-[var(--border-1)] mb-4">
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">{detailFor.name} · 이행 상세</h3>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
                {detailFor.department || "-"} / {detailFor.team || "-"} · 최근 14일
              </p>
            </div>
            {detailLoading ? (
              <div className="py-12 flex items-center justify-center text-[var(--text-3)]">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : detailLogs && detailLogs.length > 0 ? (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {detailLogs.map((log) => {
                  let parsed: any = null;
                  try { parsed = typeof log.response_json === 'string' ? JSON.parse(log.response_json) : log.response_json; } catch {}
                  const items = parsed?.items || [];
                  return (
                    <div key={log.id} className="border border-[var(--border-1)] rounded-[var(--r-md)] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={log.task_type === 'precheck' ? 'brand' : 'warning'}>
                            {log.task_type === 'precheck' ? '출근 전' : '퇴근 전'}
                          </Badge>
                          <span className="text-[var(--fs-body)] font-medium text-[var(--text-1)]">{log.task_date}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[var(--fs-caption)] text-[var(--text-3)]">
                          {log.overall_ok ? (
                            <span className="text-[var(--success-fg)] flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> 정상</span>
                          ) : (
                            <span className="text-[var(--danger-fg)] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> 이상</span>
                          )}
                          <span>{fmtTime(log.completed_at)}</span>
                        </div>
                      </div>
                      {items.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {items.map((it: any) => (
                            <div key={it.id} className="text-[var(--fs-caption)] flex items-start gap-2">
                              <span className={it.answer === 'X' ? 'text-[var(--danger-fg)] font-bold' : 'text-[var(--success-fg)] font-bold'}>{it.answer}</span>
                              <span className="text-[var(--text-2)]">항목 #{it.item_no}</span>
                              {it.note && <span className="text-[var(--text-3)]">— {it.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {parsed?.notes && (
                        <div className="mt-2 pt-2 border-t border-[var(--border-1)] text-[var(--fs-caption)] text-[var(--text-3)]">
                          <span className="font-medium">근로자 의견: </span>{parsed.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-[var(--text-3)]">기간 내 셀프체크 기록이 없습니다.</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" }) {
  const toneClass = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-lg)] border p-4 ${toneClass}`}>
      <div className="text-[var(--fs-caption)] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
    </div>
  );
}
