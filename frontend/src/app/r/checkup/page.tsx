"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Stethoscope,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  CheckCircle,
  CalendarClock,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface CheckupItem {
  id: number;
  checkup_type: string;
  scheduled_year: number | null;
  scheduled_month: string | null;
  received_at: string | null;
  result_grade: string;
  result_notes: string;
  followup_required: number;
  followup_actions: string;
  followup_completed_at: string | null;
}

interface CheckupStatus {
  employee: { name: string; department: string; team: string; role: string };
  checkups: CheckupItem[];
}

function typeLabel(t: string): string {
  if (t === "general") return "일반건강진단";
  if (t === "special") return "특수건강진단";
  if (t === "placement") return "배치전건강진단";
  if (t === "temp") return "임시건강진단";
  return t;
}

function CheckupContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CheckupStatus | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/health/checkup-status`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "로드 실패");
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const markReceived = async (checkupId: number) => {
    if (!confirm("건강진단 수검을 완료했다고 표시할까요?")) return;
    setSaving(checkupId);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/health/checkup/received`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkup_id: checkupId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "저장 실패");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-2)] border border-[var(--border-1)] p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-[var(--danger-fg)] mx-auto" />
          <h2 className="mt-4 text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">오류</h2>
          <p className="mt-2 text-[var(--text-3)]">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const pending = data.checkups.filter((c) => !c.received_at);
  const done = data.checkups.filter((c) => c.received_at);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] pb-16">
      <div
        className="text-white px-4 py-5"
        style={{ background: "linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)" }}
      >
        <button
          onClick={() => router.push(`/r?token=${token}`)}
          className="flex items-center gap-1 text-white/80 hover:text-white text-[var(--fs-caption)] mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> 홈으로
        </button>
        <h1 className="text-[var(--fs-h4)] font-bold flex items-center gap-2">
          <Stethoscope className="w-6 h-6" /> 건강진단 안내
        </h1>
        <p className="text-white/80 text-[var(--fs-body)] mt-1">
          {data.employee.name} · {data.employee.department} {data.employee.team}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {data.checkups.length === 0 && (
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] border border-[var(--border-1)] p-6 text-center">
            <p className="text-[var(--text-2)] text-[var(--fs-body)]">
              현재 등록된 건강진단 예정이 없습니다.
            </p>
            <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-2">
              일반건강진단은 매년, 특수건강진단은 유해요인 종사자에 한해 실시됩니다.
            </p>
          </div>
        )}

        {pending.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-[var(--warning-fg)]" /> 수검 예정
            </h2>
            {pending.map((c) => (
              <div key={c.id} className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[var(--r-xl)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[var(--fs-base)] font-semibold text-[var(--warning-fg)]">{typeLabel(c.checkup_type)}</h3>
                  <span className="text-[var(--fs-caption)] tabular text-[var(--warning-fg)]">
                    {c.scheduled_year || "-"} / {c.scheduled_month || "-"}
                  </span>
                </div>
                <button
                  onClick={() => markReceived(c.id)}
                  disabled={saving === c.id}
                  className="w-full py-2.5 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold disabled:opacity-50"
                >
                  {saving === c.id ? "저장 중..." : "수검 완료로 표시"}
                </button>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[var(--success-fg)]" /> 완료 기록
            </h2>
            {done.map((c) => (
              <div key={c.id} className="bg-[var(--bg-1)] border border-[var(--border-1)] rounded-[var(--r-xl)] p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">{typeLabel(c.checkup_type)}</h3>
                  <span className="text-[var(--fs-caption)] tabular text-[var(--text-3)]">
                    {c.scheduled_year || "-"} / {c.scheduled_month || "-"}
                  </span>
                </div>
                <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
                  수검일 {new Date(c.received_at as string).toLocaleDateString("ko-KR")}
                </p>
                {c.result_grade && (
                  <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1">
                    판정 <b>{c.result_grade}</b>
                  </p>
                )}
                {c.followup_required === 1 && !c.followup_completed_at && (
                  <div className="mt-2 p-2 rounded-[var(--r-md)] bg-[var(--warning-bg)] border border-[var(--warning-border)]">
                    <p className="text-[var(--fs-caption)] text-[var(--warning-fg)]">
                      사후조치 필요: {c.followup_actions || "관리자에게 문의"}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] border border-[var(--border-1)] p-4 text-[var(--fs-caption)] text-[var(--text-3)] leading-relaxed">
          <p>· 산업안전보건법 제129~130조에 따라 근로자는 정기적으로 건강진단을 받아야 합니다.</p>
          <p>· 결과에 이상 소견이 있을 경우 회사가 사후관리 조치를 진행합니다.</p>
          <p>· 결과지·문진표 등 상세 정보는 관리자를 통해 확인해주세요.</p>
        </div>
      </div>
    </div>
  );
}

export default function CheckupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>}>
      <CheckupContent />
    </Suspense>
  );
}
