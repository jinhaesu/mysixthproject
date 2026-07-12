"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ShieldCheck, AlertTriangle, CheckCircle, Loader2, ArrowLeft } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface Item {
  id: number;
  item_no: number;
  item_title: string;
  item_detail: string;
  requires_photo_on_x: number;
}
interface Template { id: number; name: string; kind: string; frequency: string; }
interface LoadedData {
  employee: { name: string; department: string; team: string; role: string };
  template: Template;
  items: Item[];
  already_done: boolean;
  already_response: any | null;
  business_date: string;
}

type Answer = "O" | "X" | null;

function SafetyCheckContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const kind = (params.get("kind") || "precheck") as "precheck" | "postcheck";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LoadedData | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [globalNote, setGlobalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/regular-public/${token}/safety/template/${kind}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "로드 실패");
        setData(body);
        if (body.already_done && body.already_response) {
          try {
            const prev = typeof body.already_response === 'string'
              ? JSON.parse(body.already_response) : body.already_response;
            const preAnswers: Record<number, Answer> = {};
            const preNotes: Record<number, string> = {};
            for (const it of prev.items || []) {
              preAnswers[it.id] = it.answer;
              if (it.note) preNotes[it.id] = it.note;
            }
            setAnswers(preAnswers);
            setNotes(preNotes);
            setGlobalNote(prev.notes || "");
          } catch {}
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, kind]);

  const handleSubmit = async () => {
    if (!data) return;
    const missing = data.items.filter((it) => !answers[it.id]);
    if (missing.length > 0) {
      alert(`${missing.length}개 항목이 미응답입니다. 모두 확인 후 제출해주세요.`);
      return;
    }
    const anyX = data.items.some((it) => answers[it.id] === "X");
    if (anyX) {
      const xItems = data.items.filter((it) => answers[it.id] === "X");
      const missingNotes = xItems.filter((it) => !(notes[it.id] || "").trim());
      if (missingNotes.length > 0) {
        alert(`X로 표시한 항목은 사유를 반드시 기재해주세요.`);
        return;
      }
      if (!confirm("이상 항목이 있습니다. 이대로 제출하면 안전관리자에게 알림이 전송됩니다. 계속하시겠습니까?")) return;
    }
    setSubmitting(true);
    try {
      const payload = {
        items: data.items.map((it) => ({
          id: it.id,
          item_no: it.item_no,
          answer: answers[it.id],
          note: notes[it.id] || "",
        })),
        notes: globalNote,
      };
      const res = await fetch(`${API_URL}/api/regular-public/${token}/safety/submit/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "제출 실패");
      setSubmitDone(true);
      setTimeout(() => router.push(`/r?token=${token}`), 1500);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const titleForKind = kind === "precheck" ? "출근 전 안전 셀프체크" : "퇴근 전 안전 셀프체크";
  const guideForKind = kind === "precheck"
    ? "위생복 갈아입기 전에 오늘 근무 준비 상태를 확인해주세요. 모든 항목 완료 후 출근 기록이 가능합니다."
    : "오늘 근무 중 발생한 이상 유무를 확인해주세요. 모든 항목 완료 후 퇴근 기록이 가능합니다.";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
      <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
      <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-2)] border border-[var(--border-1)] p-8 max-w-sm w-full text-center">
        <AlertTriangle className="w-12 h-12 text-[var(--danger-fg)] mx-auto" />
        <h2 className="mt-4 text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">오류</h2>
        <p className="mt-2 text-[var(--text-3)]">{error}</p>
        <button onClick={() => router.push(`/r?token=${token}`)} className="mt-4 px-4 py-2 bg-[var(--brand-500)] text-white rounded-[var(--r-md)]">홈으로</button>
      </div>
    </div>
  );

  if (submitDone) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
      <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-xl)] p-8 max-w-sm w-full text-center">
        <CheckCircle className="w-14 h-14 text-[var(--success-fg)] mx-auto" />
        <h2 className="mt-4 text-[var(--fs-lg)] font-semibold text-[var(--success-fg)]">셀프체크 완료</h2>
        <p className="mt-2 text-[var(--text-2)]">홈 화면으로 돌아갑니다...</p>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] fade-in">
      {/* Header */}
      <div className="bg-[var(--brand-600)] text-white px-4 py-5" style={{ background: 'linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)' }}>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => router.push(`/r?token=${token}`)} className="p-1 hover:bg-white/10 rounded-[var(--r-sm)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <ShieldCheck className="w-5 h-5" />
          <h1 className="text-[var(--fs-h4)] font-bold">{titleForKind}</h1>
        </div>
        <p className="text-[var(--brand-200)] text-[var(--fs-caption)] pl-8">{data.business_date} · {data.employee.name} ({data.employee.department || '-'})</p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Guide */}
        <div className="bg-[var(--info-bg)] border border-[var(--info-border)] rounded-[var(--r-lg)] p-4">
          <p className="text-[var(--fs-body)] text-[var(--info-fg)] font-medium">{guideForKind}</p>
        </div>

        {data.already_done && (
          <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[var(--r-lg)] p-4">
            <p className="text-[var(--fs-body)] text-[var(--warning-fg)] font-semibold">
              오늘 이미 완료된 셀프체크입니다. 필요 시 재제출할 수 있습니다.
            </p>
          </div>
        )}

        {/* Items */}
        {data.items.map((it) => (
          <div key={it.id} className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
            <div className="flex items-start gap-2 mb-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--brand-100)] text-[var(--brand-700)] text-[var(--fs-caption)] font-bold shrink-0">
                {it.item_no}
              </span>
              <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">{it.item_title}</h3>
            </div>
            {it.item_detail && (
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] pl-8 mb-3">{it.item_detail}</p>
            )}
            <div className="pl-8 flex gap-2">
              <button
                type="button"
                onClick={() => setAnswers((p) => ({ ...p, [it.id]: "O" }))}
                className={[
                  "flex-1 py-2.5 rounded-[var(--r-md)] font-semibold text-[var(--fs-body)] transition-colors border",
                  answers[it.id] === "O"
                    ? "bg-[var(--success-fg)] text-white border-[var(--success-fg)]"
                    : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)] hover:bg-[var(--bg-3)]",
                ].join(" ")}
              >
                양호 (O)
              </button>
              <button
                type="button"
                onClick={() => setAnswers((p) => ({ ...p, [it.id]: "X" }))}
                className={[
                  "flex-1 py-2.5 rounded-[var(--r-md)] font-semibold text-[var(--fs-body)] transition-colors border",
                  answers[it.id] === "X"
                    ? "bg-[var(--danger-fg)] text-white border-[var(--danger-fg)]"
                    : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)] hover:bg-[var(--bg-3)]",
                ].join(" ")}
              >
                이상 (X)
              </button>
            </div>
            {answers[it.id] === "X" && (
              <div className="pl-8 mt-3">
                <label className="block text-[var(--fs-caption)] font-medium text-[var(--danger-fg)] mb-1">
                  이상 사유·상세 (필수)
                </label>
                <textarea
                  value={notes[it.id] || ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [it.id]: e.target.value }))}
                  rows={2}
                  placeholder="예: 위생모 파손 / 오전 오븐존 화상 우려 등"
                  className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--danger-fg)]"
                />
              </div>
            )}
          </div>
        ))}

        {/* Optional global note */}
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <label className="block text-[var(--fs-body)] font-semibold text-[var(--text-1)] mb-2">
            추가 의견 (선택)
          </label>
          <textarea
            value={globalNote}
            onChange={(e) => setGlobalNote(e.target.value)}
            rows={3}
            placeholder="관리자에게 전달할 내용이 있으면 자유롭게 기재하세요."
            className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand-500)]"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold text-[var(--fs-base)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" /> 셀프체크 제출</>}
        </button>
        <p className="text-[var(--fs-caption)] text-[var(--text-3)] text-center">
          제출 후 홈 화면으로 이동합니다. {kind === "precheck" ? "출근" : "퇴근"} 기록 버튼이 활성화됩니다.
        </p>
      </div>
    </div>
  );
}

export default function SafetyCheckPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>}>
      <SafetyCheckContent />
    </Suspense>
  );
}
