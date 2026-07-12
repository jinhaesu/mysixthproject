"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, ShieldCheck, AlertOctagon, GraduationCap,
  ShieldAlert, Timer, Crown, ExternalLink, ArrowRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";
import {
  PageHeader, Card, Badge, Button, StatTile, useToast,
} from "@/components/ui";
import { getCeoDashboard, type CeoDashboardResponse } from "@/lib/api";

const CDPA_STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  in_progress: "이행 진행 중",
  ready_for_sign: "대표이사 서명 대기",
  signed: "확정·서명 완료",
};

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "-";
  return Number(n).toFixed(digits);
}

export default function CeoDashboardPage() {
  const toast = useToast();
  const [data, setData] = useState<CeoDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCeoDashboard(year);
      setData(res);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [toast, year]);

  useEffect(() => { load(); }, [load]);

  const k = data?.kpis;
  const trend = k?.hazard_trend || [];
  const monthly = k?.manager_hours?.monthly_breakdown || [];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="대표이사"
        title="안전보건 대시보드"
        description="중대재해처벌법 시행령 4조 대응 지표 5종 — 이행률·미조치·교육·아차사고·겸직 관리자 시간. 반기 서명 근거로 사용."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} 새로고침
          </Button>
        }
      />

      {/* 5 KPI 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          label="중처법 이행률"
          value={k?.cdpa_compliance.rate === null || k?.cdpa_compliance.rate === undefined ? "-" : fmt(k.cdpa_compliance.rate)}
          unit={k?.cdpa_compliance.rate === null || k?.cdpa_compliance.rate === undefined ? "" : "%"}
          hint={k?.cdpa_compliance.review_id
            ? `${k.cdpa_compliance.done}/${k.cdpa_compliance.total} 항목`
            : "당해 반기 이행점검 미생성"}
          icon={<Crown size={14} />}
          iconTone={k?.cdpa_compliance.rate && k.cdpa_compliance.rate >= 80 ? "success" : "warning"}
        />
        <StatTile
          label="미조치 지적사항"
          value={k?.open_tickets.open ?? "-"}
          unit="건"
          hint={k?.open_tickets.overdue ? `기한초과 ${k.open_tickets.overdue}건` : "기한초과 없음"}
          icon={<AlertOctagon size={14} />}
          iconTone={k?.open_tickets.overdue ? "danger" : "brand"}
        />
        <StatTile
          label="교육 이수율"
          value={k?.training_compliance.rate === null || k?.training_compliance.rate === undefined ? "-" : fmt(k.training_compliance.rate)}
          unit={k?.training_compliance.rate === null || k?.training_compliance.rate === undefined ? "" : "%"}
          hint={k?.training_compliance ? `${k.training_compliance.complete}/${k.training_compliance.target_count}명 (${k.training_compliance.period})` : "-"}
          icon={<GraduationCap size={14} />}
          iconTone={k && k.training_compliance.rate && k.training_compliance.rate >= 80 ? "success" : "warning"}
        />
        <StatTile
          label="아차사고 최근 1개월"
          value={trend[trend.length - 1]?.count ?? 0}
          unit="건"
          hint={`최근 6개월 총 ${trend.reduce((s, r) => s + r.count, 0)}건`}
          icon={<ShieldAlert size={14} />}
          iconTone={trend[trend.length - 1]?.count ? "warning" : "success"}
        />
        <StatTile
          label="관리자 시간(반기)"
          value={fmt(k?.manager_hours.current_half_hours || 0, 1)}
          unit="시간"
          hint={`목표 ${k?.manager_hours.half_target_min ?? 685}h · 게이지 ${fmt(k?.manager_hours.half_gauge_pct || 0, 1)}%`}
          icon={<Timer size={14} />}
          iconTone={k && k.manager_hours.half_gauge_pct >= 100 ? "success" : "warning"}
        />
      </div>

      {/* 상세 카드 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 중처법 이행률 상세 */}
        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--brand-400)]" />
                <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">중대재해처벌법 반기 이행점검</h3>
              </div>
              <Link href="/ceo/half-year-review">
                <Button size="sm" variant="secondary">
                  상세 이동 <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
            {k?.cdpa_compliance.review_id ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <div className="rounded-[var(--r-md)] bg-[var(--success-bg)] text-[var(--success-fg)] p-3">
                    <div className="text-[var(--fs-caption)]">완료</div>
                    <div className="text-[24px] font-semibold tabular">{k.cdpa_compliance.done}</div>
                  </div>
                  <div className="rounded-[var(--r-md)] bg-[var(--warning-bg)] text-[var(--warning-fg)] p-3">
                    <div className="text-[var(--fs-caption)]">진행 중</div>
                    <div className="text-[24px] font-semibold tabular">{k.cdpa_compliance.in_progress}</div>
                  </div>
                  <div className="rounded-[var(--r-md)] bg-white/[0.05] text-[var(--text-2)] p-3">
                    <div className="text-[var(--fs-caption)]">미시작</div>
                    <div className="text-[24px] font-semibold tabular">{k.cdpa_compliance.not_started}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[var(--fs-caption)] text-[var(--text-3)]">
                  <span>상태: {CDPA_STATUS_LABEL[k.cdpa_compliance.status || ""] || "-"}</span>
                  <span>{k.cdpa_compliance.ceo_signed_at
                    ? `서명 ${new Date(k.cdpa_compliance.ceo_signed_at).toLocaleDateString("ko-KR")}`
                    : "미서명"}</span>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-[var(--r-md)] bg-white/[0.03] text-[var(--fs-body)] text-[var(--text-3)]">
                당해 반기 이행점검이 아직 생성되지 않았습니다. 반기 이행점검 페이지에서 생성해주세요.
              </div>
            )}
          </div>
        </Card>

        {/* 아차사고 트렌드 */}
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">아차사고·위험요인 신고 (최근 6개월)</h3>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-1)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", color: "var(--text-1)" }} />
                  <Line type="monotone" dataKey="count" stroke="var(--brand-400)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* 미조치 지적사항 */}
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertOctagon className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">미조치 지적사항</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[var(--r-md)] bg-white/[0.05] p-3">
                <div className="text-[var(--fs-caption)] text-[var(--text-3)]">미조치</div>
                <div className="text-[26px] font-semibold tabular">{k?.open_tickets.open ?? 0}</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--danger-bg)] text-[var(--danger-fg)] p-3">
                <div className="text-[var(--fs-caption)]">기한초과</div>
                <div className="text-[26px] font-semibold tabular">{k?.open_tickets.overdue ?? 0}</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-[var(--warning-bg)] text-[var(--warning-fg)] p-3">
                <div className="text-[var(--fs-caption)]">고위험</div>
                <div className="text-[26px] font-semibold tabular">{k?.open_tickets.high_severity ?? 0}</div>
              </div>
            </div>
            <div className="mt-3">
              <Link href="/safety-manager/tickets">
                <Button size="sm" variant="secondary" className="w-full">
                  조치 티켓 이동 <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        {/* 관리자 시간 월별 */}
        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-[var(--brand-400)]" />
                <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">겸직 관리자 활동시간 (월별)</h3>
              </div>
              <Link href="/safety-manager/manager-hours">
                <Button size="sm" variant="secondary">
                  결산표 <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border-1)" strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fill: "var(--text-3)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", color: "var(--text-1)" }} />
                  <Bar dataKey="hours" fill="var(--brand-400)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-[var(--fs-caption)] text-[var(--text-3)]">
              반기 게이지 {fmt(k?.manager_hours.half_gauge_pct || 0, 1)}% · 반기 목표 {k?.manager_hours.half_target_min ?? 685}~{k?.manager_hours.half_target_max ?? 802}h
            </div>
          </div>
        </Card>
      </div>

      {data && (
        <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
          기준: {data.year}년 {data.half}반기 · {new Date(data.generated_at).toLocaleString("ko-KR")}
        </p>
      )}
    </div>
  );
}
