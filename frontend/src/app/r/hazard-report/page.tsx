"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Flame,
  Droplets,
  Zap,
  Snowflake,
  Wrench,
  Slice,
  HardHat,
  Wind,
  Bug,
  Camera,
  CheckCircle,
  ShieldAlert,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface HazardType {
  code: string;
  label: string;
  icon: any;
}

const HAZARD_TYPES: HazardType[] = [
  { code: "burn", label: "화상·고온", icon: Flame },
  { code: "cut", label: "베임·절단", icon: Slice },
  { code: "slip", label: "미끄러짐·넘어짐", icon: Droplets },
  { code: "electric", label: "감전·전기", icon: Zap },
  { code: "cold", label: "동상·저온", icon: Snowflake },
  { code: "machine", label: "기계 협착·끼임", icon: Wrench },
  { code: "fall", label: "추락·낙하", icon: HardHat },
  { code: "chemical", label: "유해가스·화학물질", icon: Wind },
  { code: "pest", label: "이물·해충", icon: Bug },
  { code: "other", label: "기타 위험요인", icon: ShieldAlert },
];

const AREA_OPTIONS = [
  { code: "RAW_STORE", name: "원료 입고·창고" },
  { code: "MIXING", name: "배합·전처리" },
  { code: "FORMING", name: "성형·충전" },
  { code: "OVEN", name: "오븐·튀김·가열" },
  { code: "COLD_STORE", name: "냉각·냉동·냉장" },
  { code: "PACKAGING", name: "포장·출하" },
  { code: "COMMON", name: "공통·통로·비상구" },
];

function HazardReportContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";

  const [hazardType, setHazardType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [areaCode, setAreaCode] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [areas, setAreas] = useState<{ id: number; code: string; name: string }[]>([]);

  useEffect(() => {
    // 구역 목록은 public 이지만 관리자 API에 있음 → hardcoded fallback 사용
    // 서버가 area_id 를 요구하지 않고 area_name/code 로 저장 가능하도록 백엔드가 되어있음
    setAreas(AREA_OPTIONS.map((a, idx) => ({ id: idx + 1, code: a.code, name: a.name })));
  }, []);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("사진은 5MB 이하만 첨부 가능합니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoBase64(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!hazardType) {
      setError("위험 유형을 선택해주세요.");
      return;
    }
    if (!description.trim()) {
      setError("어떤 상황이었는지 간단히 설명해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const area = areas.find((a) => a.code === areaCode);
      const res = await fetch(`${API_URL}/api/regular-public/${token}/hazard/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hazard_type: hazardType,
          description: description.trim(),
          area_name: area?.name || "",
          is_anonymous: isAnonymous,
          photo_url: photoBase64 || "",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "제출 실패");
      setDone(true);
      setTimeout(() => router.push(`/r?token=${token}`), 1800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-2)] border border-[var(--border-1)] p-8 max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-[var(--danger-fg)] mx-auto" />
          <p className="mt-4 text-[var(--text-2)]">유효하지 않은 링크입니다.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
        <div className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-xl)] p-8 max-w-sm w-full text-center">
          <CheckCircle className="w-14 h-14 text-[var(--success-fg)] mx-auto" />
          <h2 className="mt-4 text-[var(--fs-lg)] font-semibold text-[var(--success-fg)]">신고가 접수되었습니다</h2>
          <p className="mt-2 text-[var(--text-2)]">안전관리자가 즉시 확인해 조치합니다.</p>
          <p className="mt-1 text-[var(--fs-caption)] text-[var(--text-3)]">홈 화면으로 이동합니다...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] fade-in">
      {/* Header — 경고 톤 */}
      <div className="text-white px-4 py-5" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => router.push(`/r?token=${token}`)} className="p-1 hover:bg-white/10 rounded-[var(--r-sm)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <ShieldAlert className="w-5 h-5" />
          <h1 className="text-[var(--fs-h4)] font-bold">아차사고·위험요인 신고</h1>
        </div>
        <p className="text-white/80 text-[var(--fs-caption)] pl-8">
          지금 목격한 위험 상황을 30초 안에 알려주세요.
        </p>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* 유형 */}
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <label className="block text-[var(--fs-base)] font-semibold text-[var(--text-1)] mb-3">
            1) 어떤 위험이었나요? <span className="text-[var(--danger-fg)]">*</span>
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {HAZARD_TYPES.map((h) => {
              const Icon = h.icon;
              const active = hazardType === h.code;
              return (
                <button
                  key={h.code}
                  type="button"
                  onClick={() => setHazardType(h.code)}
                  className={[
                    "flex flex-col items-center gap-1 py-3 px-1 rounded-[var(--r-md)] border transition-all",
                    active
                      ? "bg-[var(--danger-fg)] text-white border-[var(--danger-fg)] shadow-md"
                      : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)] hover:bg-[var(--bg-3)]",
                  ].join(" ")}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight text-center">{h.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 구역 */}
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <label className="block text-[var(--fs-base)] font-semibold text-[var(--text-1)] mb-2">
            2) 어디에서 발생했나요?
          </label>
          <select
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
            className="w-full px-3 py-2.5 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--brand-500)]"
          >
            <option value="">구역 선택 (선택)</option>
            {areas.map((a) => (
              <option key={a.code} value={a.code}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* 설명 */}
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <label className="block text-[var(--fs-base)] font-semibold text-[var(--text-1)] mb-2">
            3) 무슨 일이 있었나요? <span className="text-[var(--danger-fg)]">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="예: 오븐 앞 바닥에 기름이 흘러 미끄러질 뻔했습니다."
            className="w-full px-3 py-2.5 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--brand-500)]"
          />
        </div>

        {/* 사진 (선택) */}
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <label className="block text-[var(--fs-base)] font-semibold text-[var(--text-1)] mb-2">
            4) 사진 첨부 (선택)
          </label>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer hover:bg-[var(--bg-2)]">
              <Camera className="w-4 h-4 text-[var(--text-3)]" />
              <span className="text-[var(--fs-body)] text-[var(--text-3)]">
                {photoBase64 ? "사진 교체" : "사진 촬영·업로드"}
              </span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </label>
            {photoBase64 && (
              <button
                onClick={() => setPhotoBase64("")}
                className="text-[var(--fs-caption)] text-[var(--danger-fg)] underline"
              >
                제거
              </button>
            )}
          </div>
          {photoBase64 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoBase64} alt="첨부 사진 미리보기" className="mt-3 max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
          )}
        </div>

        {/* 익명 여부 */}
        <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-1)] border border-[var(--border-1)] p-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="mt-1 w-5 h-5"
            />
            <div>
              <p className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">익명으로 신고하기</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
                체크 시 이름·연락처가 저장되지 않으며 회신 SMS도 발송되지 않습니다.
              </p>
            </div>
          </label>
        </div>

        {error && (
          <div className="bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] px-4 py-3">
            <p className="text-[var(--fs-body)] text-[var(--danger-fg)]">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 bg-[var(--danger-fg)] hover:opacity-90 text-white rounded-[var(--r-md)] font-semibold text-[var(--fs-base)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> 접수 중...</>
          ) : (
            <><ShieldAlert className="w-5 h-5" /> 지금 신고하기</>
          )}
        </button>

        <p className="text-[var(--fs-caption)] text-[var(--text-3)] text-center leading-relaxed">
          접수와 동시에 안전관리자에게 알림이 전송됩니다. 익명이 아닐 경우 조치 결과가 문자로 회신됩니다.
        </p>
      </div>
    </div>
  );
}

export default function HazardReportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-400)]" />
      </div>
    }>
      <HazardReportContent />
    </Suspense>
  );
}
