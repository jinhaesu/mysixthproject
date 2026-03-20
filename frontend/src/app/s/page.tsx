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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-gray-600">{t(lang, 'loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">{t(lang, 'error')}</h2>
          <p className="mt-2 text-gray-600">{error}</p>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-5">
        <h1 className="text-lg font-bold">{t(lang, 'pageTitle')}</h1>
        <p className="text-blue-100 text-sm mt-1">{data.date} {t(lang, 'workDate')}</p>
        {(data.workplace || data.department) && (
          <div className="mt-2 bg-blue-500/30 rounded-lg px-3 py-2 space-y-1">
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
          <div className="mt-3 bg-amber-500/20 border border-amber-400/40 rounded-lg px-3 py-2 flex items-start gap-2">
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
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
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
              <div className="rounded-lg p-5 bg-blue-50 border border-blue-200 text-center">
                <Navigation className="w-8 h-8 text-blue-500 animate-pulse mx-auto" />
                <p className="mt-3 text-sm font-medium text-blue-700">{t(lang, 'gpsAcquiring')}</p>
                <p className="text-xs text-blue-500 mt-1">{t(lang, 'gpsAllowPermission')}</p>
              </div>
            )}

            {/* GPS denied / error */}
            {(gpsStatus === "denied" || gpsStatus === "error") && (
              <div className="rounded-lg p-5 bg-red-50 border border-red-200 text-center">
                <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-red-700">
                  {gpsStatus === "denied" ? t(lang, 'gpsDenied') : t(lang, 'gpsUnavailable')}
                </p>
                <p className="text-xs text-red-500 mt-1">
                  {t(lang, 'gpsRequiredNotice')}
                </p>
                {hasWorkplace && (
                  <p className="text-xs text-red-600 mt-2 font-medium">
                    {t(lang, 'gpsCannotRecord')}
                  </p>
                )}
              </div>
            )}

            {/* GPS acquired + within range */}
            {gpsReady && isWithinRadius && (
              <div className="rounded-lg p-4 bg-green-50 border border-green-200 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-700">
                    {data.workplace!.name} — {distance}m {t(lang, 'distance')}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {t(lang, 'withinRange')}
                  </p>
                </div>
              </div>
            )}

            {/* GPS acquired + out of range */}
            {isOutOfRange && (
              <div className="rounded-lg p-5 bg-red-50 border border-red-200 text-center">
                <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-red-700">
                  {t(lang, 'outOfRange')}
                </p>
                <p className="text-base font-bold text-red-800 mt-1">
                  {distance}m {t(lang, 'distance')} ({t(lang, 'allowed')}: {data.workplace!.radius_meters}m)
                </p>
                <p className="text-xs text-red-500 mt-2">
                  {data.workplace!.name} {t(lang, 'moveCloser')}
                </p>
              </div>
            )}

            {/* No workplace assigned */}
            {!hasWorkplace && (
              <div className="rounded-lg p-5 bg-yellow-50 border border-yellow-200 text-center">
                <AlertCircle className="w-8 h-8 text-yellow-500 mx-auto" />
                <p className="mt-3 text-sm font-medium text-yellow-700">
                  {t(lang, 'noWorkplace')}
                </p>
                <p className="text-xs text-yellow-600 mt-1">
                  {t(lang, 'contactAdmin')}
                </p>
              </div>
            )}
          </>
        )}

        {/* Safety Agreement (F5) - shown before clock-in form */}
        {data.status === "sent" && canAct && !agreementAccepted && (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-700 mb-2">
              <Shield className="w-5 h-5" />
              <h2 className="font-semibold">{t(lang, 'safetyAgreementTitle')}</h2>
            </div>

            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4 text-sm text-gray-700">
              <div>
                <p className="font-bold text-gray-900">{t(lang, 'safetyRule1Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule1')}</p>
              </div>
              <div>
                <p className="font-bold text-gray-900">{t(lang, 'safetyRule2Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule2')}</p>
              </div>
              <div>
                <p className="font-bold text-gray-900">{t(lang, 'safetyRule3Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule3')}</p>
              </div>
              <div>
                <p className="font-bold text-gray-900">{t(lang, 'safetyRule4Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule4')}</p>
              </div>
              <div>
                <p className="font-bold text-gray-900">{t(lang, 'safetyRule5Title')}</p>
                <p className="whitespace-pre-line mt-1">{t(lang, 'safetyRule5')}</p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-800">{t(lang, 'agreementCheckbox')}</span>
            </label>

            {!agreementAccepted && (
              <p className="text-xs text-red-500 font-medium">{t(lang, 'agreementRequired')}</p>
            )}
          </div>
        )}

        {/* Factory Guide Video - after agreement, before clock-in form */}
        {data.status === "sent" && canAct && agreementAccepted && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h2 className="font-semibold text-gray-900 text-sm">
                {lang === 'ko' ? '조인앤조인 공장 진입 안내 영상' :
                 lang === 'en' ? 'Factory Entry Guide Video' :
                 lang === 'zh' ? '工厂入场指南视频' :
                 'Video hướng dẫn vào nhà máy'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
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

        {/* Clock-in Form (F3) - GPS confirmed + within range + agreement accepted */}
        {data.status === "sent" && canAct && agreementAccepted && (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <LogIn className="w-5 h-5" />
              <h2 className="font-semibold">{t(lang, 'clockInTitle')}</h2>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 font-medium">
                {t(lang, 'allFieldsRequired')}
              </p>
            </div>

            {/* Korean Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'nameKo')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameKo}
                onChange={(e) => setNameKo(e.target.value)}
                placeholder="홍길동"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            {/* English Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'nameEn')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Hong Gildong"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            {/* Bank Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'bankName')} <span className="text-red-500">*</span>
              </label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base bg-white"
              >
                <option value="">{t(lang, 'selectBank')}</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Bank Account */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'bankAccount')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder={t(lang, 'bankAccountPlaceholder')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                inputMode="numeric"
              />
            </div>

            {/* ID Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'idNumber')} <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder={t(lang, 'idNumberPlaceholder')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                inputMode="numeric"
              />
            </div>

            {/* Emergency Contact */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'emergencyContact')} <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            {/* Gender (F3) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t(lang, 'gender')} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === "male"}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{t(lang, 'male')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === "female"}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{t(lang, 'female')}</span>
                </label>
              </div>
            </div>

            {/* Birth Year (F3) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t(lang, 'birthYear')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder={t(lang, 'birthYearPlaceholder')}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                inputMode="numeric"
                maxLength={4}
              />
            </div>

            {/* Agency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {lang === 'ko' ? '연결 업체 (파견사)' : lang === 'en' ? 'Recruitment Agency' : lang === 'zh' ? '派遣公司' : 'Công ty phái cử'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
                placeholder={lang === 'ko' ? '예: 주식회사 채용, 급구앱 등' : 'e.g. Agency name'}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            {/* Overtime Availability */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {lang === 'ko' ? '추가 잔업 가능 여부' : lang === 'en' ? 'Overtime Availability' : lang === 'zh' ? '加班意愿' : 'Sẵn sàng làm thêm'} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="overtime" value="가능" checked={overtimeWilling === '가능'}
                    onChange={(e) => setOvertimeWilling(e.target.value)} className="accent-blue-600" />
                  <span className="text-sm text-gray-700">{lang === 'ko' ? '가능(여)' : lang === 'en' ? 'Yes' : lang === 'zh' ? '可以' : 'Có'}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="overtime" value="불가" checked={overtimeWilling === '불가'}
                    onChange={(e) => setOvertimeWilling(e.target.value)} className="accent-blue-600" />
                  <span className="text-sm text-gray-700">{lang === 'ko' ? '불가(부)' : lang === 'en' ? 'No' : lang === 'zh' ? '不可以' : 'Không'}</span>
                </label>
              </div>
            </div>

            {/* Memo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t(lang, 'memo')}</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t(lang, 'memoPlaceholder')}
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base resize-none"
              />
            </div>

            <button
              onClick={handleClockIn}
              disabled={submitting || !nameKo.trim() || !nameEn.trim() || !bankName || !bankAccount.trim() || !idNumber.trim() || !emergencyContact.trim() || !gender || !birthYear || !agreementAccepted || !agency.trim() || !overtimeWilling}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold text-base disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
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
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="flex items-center gap-2 text-green-700 mb-3">
                <CheckCircle className="w-5 h-5" />
                <h2 className="font-semibold">{t(lang, 'clockInComplete')}</h2>
              </div>
              <div className="space-y-1 text-sm text-green-800">
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
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center gap-2 text-orange-700 mb-4">
                  <LogOut className="w-5 h-5" />
                  <h2 className="font-semibold">{t(lang, 'clockOutTitle')}</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  {t(lang, 'clockOutDesc')}
                </p>
                <button
                  onClick={handleClockOut}
                  disabled={submitting}
                  className="w-full py-3 bg-orange-600 text-white rounded-lg font-semibold text-base disabled:bg-gray-300 hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
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
              </div>
            )}
          </div>
        )}

        {/* Completed */}
        {data.status === "completed" && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-gray-900">{t(lang, 'completedTitle')}</h2>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
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
                <p className="font-medium text-blue-700 mt-2">
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
            <p className="mt-6 text-gray-500 text-sm">{t(lang, 'thankYou')}</p>
          </div>
        )}

        {/* Expired */}
        {data.status === "expired" && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">{t(lang, 'expiredTitle')}</h2>
            <p className="mt-2 text-gray-500">{t(lang, 'expiredDesc')}</p>
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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <SurveyContent />
    </Suspense>
  );
}
