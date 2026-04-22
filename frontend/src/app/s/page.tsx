"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchSurveyPublic, submitClockIn, submitClockOut } from "@/lib/api";
import { t } from "@/lib/translations";
import type { SurveyPublicData } from "@/types/survey";
import {
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  LogIn,
  LogOut,
  Navigation,
  ShieldAlert,
  XCircle,
  Car,
  Shield,
} from "lucide-react";

const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행",
  "기업은행", "카카오뱅크", "토스뱅크", "SC제일은행", "대구은행",
  "부산은행", "경남은행", "광주은행", "전북은행", "제주은행",
  "새마을금고", "신협", "우체국", "수협은행", "기타",
];

const LANGS = ["ko", "en", "zh", "vi"] as const;

function SurveyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SurveyPublicData | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Language state (F4)
  const [lang, setLang] = useState("ko");

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "acquired" | "denied" | "error">("acquiring");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // Clock-in form
  const [nameKo, setNameKo] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [memo, setMemo] = useState("");

  // Gender & Birth Year (F3)
  const [gender, setGender] = useState("");
  const [birthYear, setBirthYear] = useState("");

  // Agency & Overtime
  const [agency, setAgency] = useState("");
  const [overtimeWilling, setOvertimeWilling] = useState("");

  // Safety agreement (F5)
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // Worker type selection
  const [workerType, setWorkerType] = useState<"" | "dispatch" | "alba">("");
  // Contract
  const [contractDone, setContractDone] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [contractSubmitting, setContractSubmitting] = useState(false);
  const [signatureRef, setSignatureRef] = useState<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const loadSurvey = useCallback(async () => {
    if (!token) {
      setError("유효하지 않은 설문 링크입니다.");
      setLoading(false);
      return;
    }
    try {
      const result = await fetchSurveyPublic(token);
      setData(result);
      // Pre-fill from response
      if (result.response?.worker_name_ko) setNameKo(result.response.worker_name_ko);
      if (result.response?.worker_name_en) setNameEn(result.response.worker_name_en);
      // Pre-fill from worker profile
      if (result.worker) {
        if (result.worker.name_ko && !result.response?.worker_name_ko) setNameKo(result.worker.name_ko);
        if (result.worker.name_en && !result.response?.worker_name_en) setNameEn(result.worker.name_en);
        if (result.worker.bank_name) setBankName(result.worker.bank_name);
        if (result.worker.bank_account) setBankAccount(result.worker.bank_account);
        if (result.worker.emergency_contact) setEmergencyContact(result.worker.emergency_contact);
      }
      // Pre-fill from last response (same phone)
      if (result.lastResponse) {
        const lr = result.lastResponse;
        if (lr.worker_name_ko && !result.response?.worker_name_ko && !result.worker?.name_ko) setNameKo(lr.worker_name_ko);
        if (lr.worker_name_en && !result.response?.worker_name_en && !result.worker?.name_en) setNameEn(lr.worker_name_en);
        if (lr.id_number) setIdNumber(lr.id_number);
        if (lr.gender) setGender(lr.gender);
        if (lr.birth_year) setBirthYear(String(lr.birth_year));
        if (lr.agency) setAgency(lr.agency);
        if (lr.overtime_willing) setOvertimeWilling(lr.overtime_willing);
        if (lr.bank_name && !result.worker?.bank_name) setBankName(lr.bank_name);
        if (lr.bank_account && !result.worker?.bank_account) setBankAccount(lr.bank_account);
        if (lr.emergency_contact && !result.worker?.emergency_contact) setEmergencyContact(lr.emergency_contact);
        // Pre-fill worker type from last response or worker profile
        if (lr.worker_type === 'dispatch' || lr.worker_type === '파견') setWorkerType('dispatch');
        else if (lr.worker_type === 'alba' || lr.worker_type === '알바') setWorkerType('alba');
      }
      // Also check worker.category if lastResponse didn't have worker_type
      if (result.worker?.category && !workerType) {
        if (result.worker.category === '파견' || result.worker.category === 'dispatch') setWorkerType('dispatch');
        else if (result.worker.category === '알바' || result.worker.category === 'alba' || result.worker.category === '아르바이트') setWorkerType('alba');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Calculate distance to workplace
  const calcDistance = useCallback((lat: number, lng: number) => {
    if (!data?.workplace) return;
    const R = 6371000;
    const dLat = ((data.workplace.latitude - lat) * Math.PI) / 180;
    const dLng = ((data.workplace.longitude - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((data.workplace.latitude * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    setDistance(Math.round(R * c));
  }, [data?.workplace]);

  // Get GPS
  useEffect(() => {
    if (!data || data.status === "completed" || data.status === "expired") return;

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setGpsStatus("acquired");
        calcDistance(latitude, longitude);
      },
      (err) => {
        console.error("GPS error:", err);
        setGpsStatus(err.code === 1 ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [data, calcDistance]);

  useEffect(() => {
    loadSurvey();
  }, [loadSurvey]);

  const checkContract = useCallback(async () => {
    if (!token) return;
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/survey-public/${token}/contract`);
      if (res.ok) {
        const data = await res.json();
        if (data.has_contract) setContractDone(true);
      }
    } catch {}
  }, [token]);

  useEffect(() => { checkContract(); }, [checkContract]);

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (!signatureRef) return;
    setIsDrawing(true);
    const ctx = signatureRef.getContext('2d');
    if (!ctx) return;
    const rect = signatureRef.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || !signatureRef) return;
    const ctx = signatureRef.getContext('2d');
    if (!ctx) return;
    const rect = signatureRef.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#222';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    if (!signatureRef) return;
    const ctx = signatureRef.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, signatureRef.width, signatureRef.height);
  };

  const handleContractSubmit = async () => {
    if (!nameKo.trim() || !contractAddress.trim()) {
      alert('이름과 주소를 입력해주세요.');
      return;
    }
    if (!signatureRef) return;
    const signatureData = signatureRef.toDataURL();
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = signatureRef.width;
    blankCanvas.height = signatureRef.height;
    const blankCtx = blankCanvas.getContext('2d');
    if (blankCtx) { blankCtx.fillStyle = '#FFFFFF'; blankCtx.fillRect(0, 0, blankCanvas.width, blankCanvas.height); }
    if (signatureData === blankCanvas.toDataURL()) {
      alert('서명을 해주세요.');
      return;
    }

    setContractSubmitting(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${API_URL}/api/survey-public/${token}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_name: nameKo.trim(), address: contractAddress.trim(), signature_data: signatureData }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setContractDone(true);
      alert('근로계약서가 체결되었습니다. 문자로 확인서가 발송됩니다.');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setContractSubmitting(false);
    }
  };

  const handleClockIn = async () => {
    if (!nameKo.trim() || !nameEn.trim() || !bankName || !bankAccount.trim() || !idNumber.trim() || !emergencyContact.trim() || !gender || !birthYear || !agreementAccepted || !agency.trim() || !overtimeWilling) {
      alert(t(lang, 'allFieldsRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await submitClockIn(token, {
        latitude: coords?.lat,
        longitude: coords?.lng,
        worker_name_ko: nameKo.trim(),
        worker_name_en: nameEn.trim(),
        bank_name: bankName,
        bank_account: bankAccount,
        id_number: idNumber,
        emergency_contact: emergencyContact,
        memo,
        gender,
        birth_year: parseInt(birthYear),
        agreement_accepted: true,
        agreement_accepted_at: new Date().toISOString(),
        agency,
        overtime_willing: overtimeWilling,
        worker_type: workerType,
      });
      await loadSurvey();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockOut = async () => {
    if (!confirm(t(lang, 'clockOutConfirm'))) return;
    setSubmitting(true);
    try {
      await submitClockOut(token, {
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      await loadSurvey();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08090A]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#7070FF] mx-auto" />
          <p className="mt-3 text-[#8A8F98]">{t(lang, 'loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#08090A] p-4">
        <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-[#EB5757] mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-[#F7F8F8]">{t(lang, 'error')}</h2>
          <p className="mt-2 text-[#8A8F98]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasWorkplace = !!data.workplace;
  const isWithinRadius = hasWorkplace && distance !== null && distance <= data.workplace!.radius_meters;
  const isOutOfRange = hasWorkplace && gpsStatus === "acquired" && !isWithinRadius;
  const gpsReady = gpsStatus === "acquired";
  const canAct = hasWorkplace && gpsReady && isWithinRadius;
  const showForm = data.status === "sent" || data.status === "clock_in";

  return (
    <div className="min-h-screen bg-[#08090A]">
      {/* Header */}
      <div className="bg-[#5E6AD2] text-white px-4 py-5">
        <h1 className="text-lg font-bold">{t(lang, 'pageTitle')}</h1>
        <p className="text-blue-100 text-sm mt-1">{data.date} {t(lang, 'workDate')}</p>
        {(data.workplace || data.department) && (
          <div className="mt-2 bg-[#4EA7FC]/30 rounded-lg px-3 py-2 space-y-1">
            {data.workplace && (
              <p className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {data.workplace.name}
              </p>
            )}
            {data.workplace?.address && (
              <p className="text-blue-200 text-xs">{data.workplace.address}</p>
            )}
            {data.department && (
              <p className="text-sm font-semibold text-yellow-200 flex items-center gap-1.5">
                {t(lang, 'assignedDept')}: {data.department}
              </p>
            )}
          </div>
        )}

        {/* Parking Notice (F2) */}
        {showForm && (
          <div className="mt-3 bg-[#F0BF00]/100/20 border border-amber-400/40 rounded-lg px-3 py-2 flex items-start gap-2">
            <Car className="w-4 h-4 text-amber-200 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-100">{t(lang, 'parkingNotice')}</p>
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Language Selector (F4) */}
        <div className="flex justify-center gap-2">
          {LANGS.map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                lang === l
                  ? "bg-[#5E6AD2] text-white"
                  : "bg-[#0F1011] text-[#8A8F98] border border-[#23252A] hover:bg-[#141516]/5"
              }`}
            >
              {t(l, `lang${l.charAt(0).toUpperCase() + l.slice(1)}` as string)}
            </button>
          ))}
        </div>

        {/* GPS Status */}
        {showForm && (
          <>
            {/* GPS acquiring */}
            {gpsStatus === "acquiring" && (
              <div className="rounded-lg p-5 bg-[#4EA7FC]/10 border border-[#5E6AD2]/30 text-center">
                <Navigation className="w-8 h-8 text-blue-500 animate-pulse mx-auto" />
                <p className="mt-3 text-sm font-medium text-[#828FFF]">{t(lang, 'gpsAcquiring')}</p>
                <p className="text-xs text-blue-500 mt-1">{t(lang, 'gpsAllowPermission')}</p>
              </div>
            )}

            {/* GPS denied / error */}
            {(gpsStatus === "denied" || gpsStatus === "error") && (
              <div className="rounded-lg p-5 bg-[#EB5757]/10 border border-[#EB5757]/30 text-center">
                <ShieldAlert className="w-8 h-8 text-[#EB5757] mx-auto" />
                <p className="mt-3 text-sm font-medium text-[#EB5757]">
                  {gpsStatus === "denied" ? t(lang, 'gpsDenied') : t(lang, 'gpsUnavailable')}
                </p>
                <p className="text-xs text-[#EB5757] mt-1">
                  {t(lang, 'gpsRequiredNotice')}
                </p>
                {hasWorkplace && (
                  <p className="text-xs text-[#EB5757] mt-2 font-medium">
                    {t(lang, 'gpsCannotRecord')}
                  </p>
                )}
              </div>
            )}

            {/* GPS acquired + within range */}
            {gpsReady && isWithinRadius && (
              <div className="rounded-lg p-4 bg-[#27A644]/10 border border-[#27A644]/30 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#27A644] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#27A644]">
                    {data.workplace!.name} — {distance}m {t(lang, 'distance')}
                  </p>
                  <p className="text-xs text-[#27A644] mt-0.5">
                    {t(lang, 'withinRange')}
                  </p>
                </div>
              </div>
            )}

            {/* GPS acquired + out of range */}
            {isOutOfRange && (
              <div className="rounded-lg p-5 bg-[#EB5757]/10 border border-[#EB5757]/30 text-center">
                <XCircle className="w-8 h-8 text-[#EB5757] mx-auto" />
                <p className="mt-3 text-sm font-medium text-[#EB5757]">
                  {t(lang, 'outOfRange')}
                </p>
                <p className="text-base font-bold text-[#EB5757] mt-1">
                  {distance}m {t(lang, 'distance')} ({t(lang, 'allowed')}: {data.workplace!.radius_meters}m)
                </p>
                <p className="text-xs text-[#EB5757] mt-2">
                  {data.workplace!.name} {t(lang, 'moveCloser')}
                </p>
              </div>
            )}

            {/* No workplace assigned */}
            {!hasWorkplace && (
              <div className="rounded-lg p-5 bg-[#F0BF00]/10 border border-[#F0BF00]/30 text-center">
                <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-[#F0BF00]">
                  {t(lang, 'noWorkplace')}
                </p>
                <p className="text-xs text-[#F0BF00] mt-1">
                  {t(lang, 'contactAdmin')}
                </p>
              </div>
            )}
          </>
        )}

        {/* Safety Agreement (F5) - shown regardless of GPS, before clock-in */}
        {data.status === "sent" && !agreementAccepted && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5 space-y-4">
            <div className="flex items-center gap-2 text-[#EB5757] mb-2">
              <Shield className="w-5 h-5" />
              <h2 className="font-semibold">{t(lang, 'safetyAgreementTitle')}</h2>
            </div>

            <div className="max-h-72 overflow-y-auto border border-[#23252A] rounded-lg p-4 bg-[#08090A] space-y-4 text-sm text-[#D0D6E0]">
              <div>
                <p className="font-bold text-[#F7F8F8]">{t(lang, 'safetyRule1Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule1')}</p>
              </div>
              <div>
                <p className="font-bold text-[#F7F8F8]">{t(lang, 'safetyRule2Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule2')}</p>
              </div>
              <div>
                <p className="font-bold text-[#F7F8F8]">{t(lang, 'safetyRule3Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule3')}</p>
              </div>
              <div>
                <p className="font-bold text-[#F7F8F8]">{t(lang, 'safetyRule4Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule4')}</p>
              </div>
              <div>
                <p className="font-bold text-[#F7F8F8]">{t(lang, 'safetyRule5Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule5')}</p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 text-[#7070FF] rounded border-[#23252A] focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-[#F7F8F8]">{t(lang, 'agreementCheckbox')}</span>
            </label>

            {!agreementAccepted && (
              <p className="text-xs text-[#EB5757] font-medium">{t(lang, 'agreementRequired')}</p>
            )}
          </div>
        )}

        {/* Factory Guide Video - after agreement, shown regardless of GPS */}
        {data.status === "sent" && agreementAccepted && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-semibold text-[#F7F8F8] text-sm">
                {lang === 'ko' ? '조인앤조인 공장 진입 안내 영상' :
                 lang === 'en' ? 'Factory Entry Guide Video' :
                 lang === 'zh' ? '工厂入场指南视频' :
                 'Video hướng dẫn vào nhà máy'}
              </h2>
              <p className="text-xs text-[#8A8F98] mt-0.5">
                {lang === 'ko' ? '출근 기록 전 반드시 시청해 주세요.' :
                 lang === 'en' ? 'Please watch before clocking in.' :
                 lang === 'zh' ? '请在打卡前观看。' :
                 'Vui lòng xem trước khi chấm công.'}
              </p>
            </div>
            <div className="px-5 pb-4">
              <video
                controls
                playsInline
                preload="metadata"
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: '300px' }}
              >
                <source src="/videos/factory-guide.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        )}

        {/* Worker Type Selection */}
        {data.status === "sent" && agreementAccepted && !workerType && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5 space-y-4">
            <h2 className="font-semibold text-[#F7F8F8] text-center">근무 유형을 선택해주세요</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setWorkerType("dispatch")}
                className="py-6 bg-[#4EA7FC]/10 border-2 border-[#5E6AD2]/30 rounded-xl text-center hover:bg-[#4EA7FC]/15 hover:border-blue-400 transition-all"
              >
                <p className="text-2xl mb-1">🏢</p>
                <p className="font-bold text-[#828FFF]">파견</p>
                <p className="text-xs text-[#7070FF] mt-1">파견업체 소속</p>
              </button>
              <button
                onClick={() => setWorkerType("alba")}
                className="py-6 bg-[#FC7840]/10 border-2 border-[#FC7840]/30 rounded-xl text-center hover:bg-[#FC7840]/15 hover:border-orange-400 transition-all"
              >
                <p className="text-2xl mb-1">📋</p>
                <p className="font-bold text-[#FC7840]">알바</p>
                <p className="text-xs text-[#FC7840] mt-1">단기 근로계약</p>
              </button>
            </div>
          </div>
        )}

        {/* Labor Contract (Alba only) */}
        {data.status === "sent" && agreementAccepted && workerType === "alba" && !contractDone && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5 space-y-4">
            <h2 className="font-semibold text-[#F7F8F8] flex items-center gap-2">
              📋 단시간 근로자 표준근로계약서
            </h2>

            {/* Contract Content */}
            <div className="max-h-64 overflow-y-auto border border-[#23252A] rounded-lg p-4 bg-[#08090A] text-xs text-[#D0D6E0] space-y-2">
              <p className="font-bold text-center text-sm text-[#F7F8F8]">단시간 근로자 표준근로계약서</p>
              <p>조인앤조인 (이하 &quot;사업주&quot;라 함)과 <span className="font-bold text-[#828FFF]">{nameKo || '______'}</span> (이하 &quot;근로자&quot;이라 함)은 다음과 같이 근로계약을 체결한다.</p>
              <p><b>1. 근로계약기간:</b> {new Date().toLocaleDateString('sv-SE')} ~ {(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toLocaleDateString('sv-SE'); })()}</p>
              <p>- 본 계약은 위 기간 내에서 사업주의 업무 지시가 있는 날에 한하여 근로를 제공하는 호출형 단시간 근로계약이다.</p>
              <p><b>2. 근무 장소:</b> 경기도 안산시 단원구 신길동 1122</p>
              <p><b>3. 업무의 내용(직종):</b> 제조, 포장 및 이에 부수하는 업무</p>
              <p><b>4. 근로일 및 근로시간</b></p>
              <p>① 근로일은 사업주가 업무량·생산일정 등을 고려하여 결정하며, 근로 전일 18:00까지 또는 당일 근로 개시 1시간 전까지 근로자에게 통보한다.</p>
              <p>② 휴게시간: 4시간 근로 시 30분, 8시간 근로 시 1시간을 부여한다.</p>
              <p><b>5. 임금</b></p>
              <p>① 시급: 10,320원</p>
              <p>② 임금은 실제 근로한 시간을 기준으로 산정한다.</p>
              <p>③ 임금지급일: 매월 15일</p>
              <p>④ 지급방법: 근로자 명의 예금통장에 입금</p>
              <p><b>7. 근로시간 기록 및 확인</b> - 근로자는 매 근무 시작 및 종료 시 출퇴근 시간을 기록하여야 한다.</p>
              <p><b>8. 계약의 해지</b> - 사업주는 정당한 사유가 있는 경우 본 계약을 해지할 수 있다.</p>
              <p><b>9. 비밀유지</b> - 근로자는 근로 기간 중 알게 된 영업비밀을 제3자에게 누설하여서는 아니 된다.</p>
              <p><b>10. 기타</b> - 이 계약에 정함이 없는 사항은 근로기준법에 의한다.</p>
            </div>

            {/* Date */}
            <div className="text-center text-sm text-[#D0D6E0] font-medium">
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>

            {/* Employer info (fixed) */}
            <div className="bg-[#4EA7FC]/10 rounded-lg p-3 text-xs text-[#828FFF]">
              <p className="font-bold">(사업주)</p>
              <p>사업체명: (주)조인앤조인</p>
              <p>주소: 전북특별자치도 전주시 덕진구 기린대로 458</p>
              <p>대표자: 진해수</p>
            </div>

            {/* Worker info (editable) */}
            <div className="space-y-3">
              <p className="font-bold text-sm text-[#F7F8F8]">(근로자)</p>
              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">성명 <span className="text-[#EB5757]">*</span></label>
                <input type="text" value={nameKo} onChange={(e) => setNameKo(e.target.value)} placeholder="홍길동"
                  className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg text-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">주소 <span className="text-[#EB5757]">*</span></label>
                <input type="text" value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} placeholder="서울시 강남구..."
                  className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg text-base" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">서명 <span className="text-[#EB5757]">*</span></label>
                <div className="border-2 border-[#23252A] rounded-lg overflow-hidden relative" style={{ touchAction: 'none' }}>
                  <canvas
                    ref={(el) => {
                      setSignatureRef(el);
                      if (el) { const ctx = el.getContext('2d'); if (ctx) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, el.width, el.height); } }
                    }}
                    width={320}
                    height={150}
                    className="w-full cursor-crosshair bg-white"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  <button onClick={clearSignature}
                    className="absolute top-1 right-1 px-2 py-0.5 text-xs bg-[#141516] text-[#8A8F98] rounded hover:bg-[#141516]/7">
                    지우기
                  </button>
                </div>
                <p className="text-xs text-[#62666D] mt-1">위 영역에 서명해주세요</p>
              </div>
            </div>

            <button onClick={handleContractSubmit} disabled={contractSubmitting || !nameKo.trim() || !contractAddress.trim()}
              className="w-full py-3 bg-orange-600 text-white rounded-lg font-semibold text-base disabled:bg-[#28282C] hover:bg-orange-700 transition-colors">
              {contractSubmitting ? "처리 중..." : "근로계약서 서명 및 제출"}
            </button>
          </div>
        )}

        {/* Worker type badge (auto-filled from previous) */}
        {data.status === "sent" && agreementAccepted && workerType && (
          <div className="flex items-center justify-between bg-[#08090A] rounded-xl px-4 py-3 border border-[#23252A]">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#8A8F98]">근무 유형:</span>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${workerType === 'dispatch' ? 'bg-[#4EA7FC]/15 text-[#828FFF]' : 'bg-[#FC7840]/15 text-[#FC7840]'}`}>
                {workerType === 'dispatch' ? '파견' : '알바'}
              </span>
            </div>
            <button onClick={() => setWorkerType("")} className="text-xs text-[#8A8F98] hover:text-[#D0D6E0] underline">변경</button>
          </div>
        )}

        {/* Clock-in Form (F3) - GPS confirmed + within range + agreement accepted */}
        {data.status === "sent" && canAct && agreementAccepted && workerType && (workerType === "dispatch" || contractDone) && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5 space-y-4">
            <div className="flex items-center gap-2 text-[#828FFF] mb-2">
              <LogIn className="w-5 h-5" />
              <h2 className="font-semibold">{t(lang, 'clockInTitle')}</h2>
            </div>

            <div className="bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-lg p-3">
              <p className="text-xs text-[#EB5757] font-bold">
                {lang === 'ko' ? '정확하게 입력하지 않으면 급여가 지급되지 않습니다.' :
                 lang === 'en' ? 'Payment will not be made if information is not entered accurately.' :
                 lang === 'zh' ? '如未准确填写，将不予支付工资。' :
                 'Nếu không nhập chính xác, lương sẽ không được thanh toán.'}
              </p>
            </div>

            {/* Korean Name */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'nameKo')} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="text"
                value={nameKo}
                onChange={(e) => setNameKo(e.target.value)}
                placeholder="홍길동"
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
              />
            </div>

            {/* English Name */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'nameEn')} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Hong Gildong"
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
              />
            </div>

            {/* Bank Name */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'bankName')} <span className="text-[#EB5757]">*</span>
              </label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base bg-[#0F1011]"
              >
                <option value="">{t(lang, 'selectBank')}</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Bank Account */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'bankAccount')} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder={t(lang, 'bankAccountPlaceholder')}
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
                inputMode="numeric"
              />
            </div>

            {/* ID Number */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'idNumber')} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="password"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder={t(lang, 'idNumberPlaceholder')}
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
                inputMode="numeric"
              />
            </div>

            {/* Emergency Contact */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'emergencyContact')} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="tel"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
              />
            </div>

            {/* Gender (F3) */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-2">
                {t(lang, 'gender')} <span className="text-[#EB5757]">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === "male"}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-4 h-4 text-[#7070FF] border-[#23252A] focus:ring-blue-500"
                  />
                  <span className="text-sm text-[#D0D6E0]">{t(lang, 'male')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === "female"}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-4 h-4 text-[#7070FF] border-[#23252A] focus:ring-blue-500"
                  />
                  <span className="text-sm text-[#D0D6E0]">{t(lang, 'female')}</span>
                </label>
              </div>
            </div>

            {/* Birth Year (F3) */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {t(lang, 'birthYear')} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="text"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t(lang, 'birthYearPlaceholder')}
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
                inputMode="numeric"
                maxLength={4}
              />
            </div>

            {/* Agency */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {lang === 'ko' ? '연결 업체 (파견/알바)' : lang === 'en' ? 'Recruitment Agency' : lang === 'zh' ? '派遣公司' : 'Công ty phái cử'} <span className="text-[#EB5757]">*</span>
              </label>
              <input
                type="text"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                placeholder={lang === 'ko' ? '예: 주식회사 채용, 급구앱 등' : 'e.g. Agency name'}
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base"
              />
            </div>

            {/* Overtime Availability */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                {lang === 'ko' ? '추가 잔업 가능 시, 희망 여부' : lang === 'en' ? 'Overtime Availability' : lang === 'zh' ? '加班意愿' : 'Sẵn sàng làm thêm'} <span className="text-[#EB5757]">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="overtime" value="가능" checked={overtimeWilling === '가능'}
                    onChange={(e) => setOvertimeWilling(e.target.value)} className="accent-blue-600" />
                  <span className="text-sm text-[#D0D6E0]">{lang === 'ko' ? '가능(여)' : lang === 'en' ? 'Yes' : lang === 'zh' ? '可以' : 'Có'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="overtime" value="불가" checked={overtimeWilling === '불가'}
                    onChange={(e) => setOvertimeWilling(e.target.value)} className="accent-blue-600" />
                  <span className="text-sm text-[#D0D6E0]">{lang === 'ko' ? '불가(부)' : lang === 'en' ? 'No' : lang === 'zh' ? '不可以' : 'Không'}</span>
                </label>
              </div>
            </div>

            {/* Memo */}
            <div>
              <label className="block text-sm font-medium text-[#D0D6E0] mb-1">{t(lang, 'memo')}</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t(lang, 'memoPlaceholder')}
                rows={2}
                className="w-full px-3 py-2.5 border border-[#23252A] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] text-base resize-none"
              />
            </div>

            <button
              onClick={handleClockIn}
              disabled={submitting || !nameKo.trim() || !nameEn.trim() || !bankName || !bankAccount.trim() || !idNumber.trim() || !emergencyContact.trim() || !gender || !birthYear || !agreementAccepted || !agency.trim() || !overtimeWilling}
              className="w-full py-3 bg-[#5E6AD2] text-white rounded-lg font-semibold text-base disabled:bg-[#28282C] disabled:cursor-not-allowed hover:bg-[#828FFF] transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Clock className="w-5 h-5" />
                  {t(lang, 'clockInButton')}
                </>
              )}
            </button>
          </div>
        )}

        {/* Clock-in success / Waiting for clock-out */}
        {data.status === "clock_in" && (
          <div className="space-y-4">
            <div className="bg-[#27A644]/10 border border-[#27A644]/30 rounded-xl p-5">
              <div className="flex items-center gap-2 text-[#27A644] mb-3">
                <CheckCircle className="w-5 h-5" />
                <h2 className="font-semibold">{t(lang, 'clockInComplete')}</h2>
              </div>
              <div className="space-y-1 text-sm text-[#27A644]">
                <p><span className="font-medium">{t(lang, 'name')}:</span> {data.response?.worker_name_ko} ({data.response?.worker_name_en})</p>
                <p>
                  <span className="font-medium">{t(lang, 'clockInTime')}:</span>{" "}
                  {data.response?.clock_in_time
                    ? new Date(data.response.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                    : "-"}
                </p>
              </div>
            </div>

            {/* Clock-out button - only active within range */}
            {canAct && (
              <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5">
                <div className="flex items-center gap-2 text-[#FC7840] mb-4">
                  <LogOut className="w-5 h-5" />
                  <h2 className="font-semibold">{t(lang, 'clockOutTitle')}</h2>
                </div>
                <p className="text-sm text-[#8A8F98] mb-4">
                  {t(lang, 'clockOutDesc')}
                </p>
                <button
                  onClick={handleClockOut}
                  disabled={submitting}
                  className="w-full py-3 bg-orange-600 text-white rounded-lg font-semibold text-base disabled:bg-[#28282C] hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Clock className="w-5 h-5" />
                      {t(lang, 'clockOutButton')}
                    </>
                  )}
                </button>
                <div className="mt-3 bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-lg p-3">
                  <p className="text-xs text-[#EB5757] font-bold text-center">
                    {lang === 'ko' ? '퇴근 처리를 정확히 하지 않으면 급여가 지급되지 않습니다.' :
                     lang === 'en' ? 'Payment will not be made if clock-out is not recorded properly.' :
                     lang === 'zh' ? '如未正确记录下班，将不予支付工资。' :
                     'Nếu không chấm công ra chính xác, lương sẽ không được thanh toán.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed */}
        {data.status === "completed" && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-[#F7F8F8]">{t(lang, 'completedTitle')}</h2>
            <div className="mt-4 space-y-2 text-sm text-[#D0D6E0]">
              <p><span className="font-medium">{t(lang, 'name')}:</span> {data.response?.worker_name_ko} ({data.response?.worker_name_en})</p>
              <p>
                <span className="font-medium">{t(lang, 'clockIn')}:</span>{" "}
                {data.response?.clock_in_time
                  ? new Date(data.response.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                  : "-"}
              </p>
              <p>
                <span className="font-medium">{t(lang, 'clockOut')}:</span>{" "}
                {data.response?.clock_out_time
                  ? new Date(data.response.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                  : "-"}
              </p>
              {data.response?.clock_in_time && data.response?.clock_out_time && (
                <p className="font-medium text-[#828FFF] mt-2">
                  {t(lang, 'totalWorkHours')}:{" "}
                  {(
                    (new Date(data.response.clock_out_time).getTime() -
                      new Date(data.response.clock_in_time).getTime()) /
                    (1000 * 60 * 60)
                  ).toFixed(1)}
                  {t(lang, 'hours')}
                </p>
              )}
            </div>
            <p className="mt-6 text-[#8A8F98] text-sm">{t(lang, 'thankYou')}</p>
          </div>
        )}

        {/* Expired */}
        {data.status === "expired" && (
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-6 text-center">
            <AlertCircle className="w-12 h-12 text-[#62666D] mx-auto" />
            <h2 className="mt-4 text-lg font-semibold text-[#F7F8F8]">{t(lang, 'expiredTitle')}</h2>
            <p className="mt-2 text-[#8A8F98]">{t(lang, 'expiredDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SurveyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#08090A]">
          <Loader2 className="w-8 h-8 animate-spin text-[#7070FF]" />
        </div>
      }
    >
      <SurveyContent />
    </Suspense>
  );
}
