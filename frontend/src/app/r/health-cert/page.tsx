"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Camera,
  CheckCircle,
  CalendarClock,
  XCircle,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface CertData {
  employee: { name: string; department: string; team: string; role: string };
  today: string;
  certificate: {
    id: number;
    cert_type: string;
    issue_date: string;
    expiry_date: string;
    cert_photo_url: string;
    status: string;
    updated_at: string;
  } | null;
  days_until_expiry: number | null;
  status_hint: "none" | "valid" | "warning" | "urgent" | "expired";
}

function HealthCertContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CertData | null>(null);

  // Edit form
  const [editing, setEditing] = useState(false);
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/health/certificate`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "로드 실패");
      setData(body);
      if (body.certificate) {
        setIssueDate(body.certificate.issue_date || "");
        setExpiryDate(body.certificate.expiry_date || "");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("사진은 5MB 이하만 첨부 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!issueDate || !expiryDate) { alert("발급일과 만료일을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/${token}/health/certificate/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_date: issueDate, expiry_date: expiryDate, cert_photo_url: photo || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "저장 실패");
      setSavedOk(true);
      setEditing(false);
      setPhoto("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
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

  const daysLeft = data.days_until_expiry;
  const hint = data.status_hint;
  const toneClass =
    hint === "expired" || hint === "urgent"
      ? "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]"
      : hint === "warning"
        ? "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]"
        : hint === "valid"
          ? "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]"
          : "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-2)]";

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
          <ShieldCheck className="w-6 h-6" /> 보건증 관리
        </h1>
        <p className="text-white/80 text-[var(--fs-body)] mt-1">
          {data.employee.name} · {data.employee.department} {data.employee.team}
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {savedOk && (
          <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-xl)] p-4 flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-[var(--success-fg)] shrink-0 mt-0.5" />
            <p className="text-[var(--success-fg)] font-semibold">보건증 정보가 저장되었습니다.</p>
          </div>
        )}

        {/* 현재 상태 */}
        <div className={`rounded-[var(--r-xl)] border p-5 ${toneClass}`}>
          <div className="flex items-center gap-2 mb-2">
            {hint === "expired" || hint === "urgent" ? (
              <XCircle className="w-5 h-5" />
            ) : hint === "warning" ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CheckCircle className="w-5 h-5" />
            )}
            <h2 className="text-[var(--fs-lg)] font-bold">
              {hint === "expired" ? "보건증 만료" :
               hint === "urgent" ? "만료 임박 (D-30 이내)" :
               hint === "warning" ? "만료 예정 (D-60 이내)" :
               hint === "valid" ? "유효" :
               "보건증 미등록"}
            </h2>
          </div>
          {data.certificate ? (
            <>
              <p className="text-[var(--fs-body)] font-medium">
                발급일 <span className="tabular">{data.certificate.issue_date}</span>
              </p>
              <p className="text-[var(--fs-body)] font-medium">
                만료일 <span className="tabular">{data.certificate.expiry_date}</span>
              </p>
              {daysLeft !== null && (
                <p className="text-[var(--fs-lg)] font-bold mt-2 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" />
                  {daysLeft < 0 ? `${Math.abs(daysLeft)}일 지남` : `D-${daysLeft}`}
                </p>
              )}
              {data.certificate.cert_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.certificate.cert_photo_url} alt="보건증" className="mt-3 max-h-56 rounded-[var(--r-md)] border border-black/20" />
              )}
            </>
          ) : (
            <p className="text-[var(--fs-body)]">
              등록된 보건증이 없습니다. 보건소 또는 지정 의료기관에서 발급받아 아래에서 등록해주세요.
            </p>
          )}
        </div>

        {/* 게이팅 안내 */}
        {(hint === "urgent" || hint === "expired" || hint === "none") && (
          <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[var(--r-xl)] p-4 text-[var(--warning-fg)]">
            <p className="text-[var(--fs-body)] font-semibold">
              출근·퇴근 기록이 차단됩니다
            </p>
            <p className="text-[var(--fs-caption)] mt-1 opacity-90">
              식품위생법에 따라 보건증 미보유·만료(D-30 이내) 상태에서는 출퇴근 기록을 진행할 수 없습니다. 즉시 갱신해주세요.
            </p>
          </div>
        )}

        {/* 편집 폼 */}
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="w-full py-3 bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white rounded-[var(--r-md)] font-semibold"
          >
            {data.certificate ? "재발급·갱신 정보 입력" : "보건증 등록"}
          </button>
        ) : (
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] border border-[var(--border-1)] p-5 space-y-3">
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">보건증 정보 입력</h3>
            <div>
              <label className="block text-[var(--fs-body)] font-medium text-[var(--text-2)] mb-1">발급일</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)]"
              />
            </div>
            <div>
              <label className="block text-[var(--fs-body)] font-medium text-[var(--text-2)] mb-1">만료일</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)]"
              />
            </div>
            <div>
              <label className="block text-[var(--fs-body)] font-medium text-[var(--text-2)] mb-1">보건증 사진</label>
              <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer">
                <Camera className="w-4 h-4 text-[var(--text-3)]" />
                <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{photo ? "사진 교체" : "사진 업로드"}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
              </label>
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="새 보건증" className="mt-2 max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex-1 py-2.5 rounded-[var(--r-md)] border border-[var(--border-2)] text-[var(--text-2)] font-medium"
              >
                취소
              </button>
              <button
                onClick={save}
                disabled={saving || !issueDate || !expiryDate}
                className="flex-1 py-2.5 rounded-[var(--r-md)] bg-[var(--brand-500)] hover:bg-[var(--brand-600)] text-white font-semibold disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HealthCertPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>}>
      <HealthCertContent />
    </Suspense>
  );
}
