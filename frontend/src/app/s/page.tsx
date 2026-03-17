"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchSurveyPublic, submitClockIn, submitClockOut } from "@/lib/api";
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
} from "lucide-react";

const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "농협은행",
  "기업은행", "카카오뱅크", "토스뱅크", "SC제일은행", "대구은행",
  "부산은행", "경남은행", "광주은행", "전북은행", "제주은행",
  "새마을금고", "신협", "우체국", "수협은행", "기타",
];

function SurveyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SurveyPublicData | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  // Success messages
  const [clockInResult, setClockInResult] = useState<any>(null);
  const [clockOutResult, setClockOutResult] = useState<any>(null);

  const loadSurvey = useCallback(async () => {
    if (!token) {
      setError("유효하지 않은 설문 링크입니다.");
      setLoading(false);
      return;
    }
    try {
      const result = await fetchSurveyPublic(token);
      setData(result);
      if (result.response?.worker_name_ko) setNameKo(result.response.worker_name_ko);
      if (result.response?.worker_name_en) setNameEn(result.response.worker_name_en);
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
    if (!nameKo.trim() || !nameEn.trim()) {
      alert("한글 이름과 영문 이름을 모두 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitClockIn(token, {
        latitude: coords?.lat,
        longitude: coords?.lng,
        worker_name_ko: nameKo.trim(),
        worker_name_en: nameEn.trim(),
        bank_name: bankName,
        bank_account: bankAccount,
        id_number: idNumber,
        emergency_contact: emergencyContact,
        memo,
      });
      setClockInResult(result);
      await loadSurvey();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockOut = async () => {
    setSubmitting(true);
    try {
      const result = await submitClockOut(token, {
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      setClockOutResult(result);
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
          <p className="mt-3 text-gray-600">설문을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900">오류</h2>
          <p className="mt-2 text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isWithinRadius = data.workplace && distance !== null && distance <= data.workplace.radius_meters;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 py-5">
        <h1 className="text-lg font-bold">조인앤조인 출퇴근 기록</h1>
        <p className="text-blue-100 text-sm mt-1">{data.date} 근무</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* GPS Status */}
        {data.status !== "completed" && data.status !== "expired" && (
          <div className={`rounded-lg p-4 flex items-center gap-3 ${
            gpsStatus === "acquired"
              ? isWithinRadius ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"
              : gpsStatus === "denied" ? "bg-red-50 border border-red-200"
              : "bg-blue-50 border border-blue-200"
          }`}>
            <Navigation className={`w-5 h-5 ${
              gpsStatus === "acquired"
                ? isWithinRadius ? "text-green-600" : "text-yellow-600"
                : gpsStatus === "denied" ? "text-red-600" : "text-blue-600 animate-pulse"
            }`} />
            <div className="flex-1">
              {gpsStatus === "acquiring" && <p className="text-sm text-blue-700">GPS 위치를 확인하는 중...</p>}
              {gpsStatus === "denied" && (
                <div>
                  <p className="text-sm text-red-700 font-medium">GPS 권한이 거부되었습니다</p>
                  <p className="text-xs text-red-600 mt-0.5">브라우저 설정에서 위치 권한을 허용해주세요</p>
                </div>
              )}
              {gpsStatus === "error" && <p className="text-sm text-red-700">GPS를 사용할 수 없습니다</p>}
              {gpsStatus === "acquired" && data.workplace && (
                <div>
                  <p className={`text-sm font-medium ${isWithinRadius ? "text-green-700" : "text-yellow-700"}`}>
                    {data.workplace.name}에서 {distance}m 거리
                  </p>
                  <p className={`text-xs mt-0.5 ${isWithinRadius ? "text-green-600" : "text-yellow-600"}`}>
                    {isWithinRadius
                      ? "근무지 범위 내에 있습니다"
                      : `근무지 범위(${data.workplace.radius_meters}m) 밖입니다`}
                  </p>
                </div>
              )}
              {gpsStatus === "acquired" && !data.workplace && (
                <p className="text-sm text-green-700">GPS 위치 확인 완료</p>
              )}
            </div>
          </div>
        )}

        {/* Clock-in Form */}
        {data.status === "sent" && (
          <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <LogIn className="w-5 h-5" />
              <h2 className="font-semibold">출근 기록</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                한글 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameKo}
                onChange={(e) => setNameKo(e.target.value)}
                placeholder="홍길동"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                영문 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Hong Gildong"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">은행명</label>
              <select
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base bg-white"
              >
                <option value="">선택하세요</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">계좌번호</label>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="'-' 없이 숫자만 입력"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">주민등록번호</label>
              <input
                type="password"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="주민등록번호 13자리"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비상연락처</label>
              <input
                type="tel"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="전달사항이 있으면 입력해주세요"
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base resize-none"
              />
            </div>

            <button
              onClick={handleClockIn}
              disabled={submitting || !nameKo.trim() || !nameEn.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold text-base disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Clock className="w-5 h-5" />
                  출근 기록하기
                </>
              )}
            </button>

            {gpsStatus === "denied" && (
              <p className="text-xs text-center text-gray-500">
                GPS 없이도 기록할 수 있으나, 위치 미확인으로 표시됩니다.
              </p>
            )}
          </div>
        )}

        {/* Clock-in success / Waiting for clock-out */}
        {data.status === "clock_in" && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="flex items-center gap-2 text-green-700 mb-3">
                <CheckCircle className="w-5 h-5" />
                <h2 className="font-semibold">출근 완료</h2>
              </div>
              <div className="space-y-1 text-sm text-green-800">
                <p><span className="font-medium">이름:</span> {data.response?.worker_name_ko} ({data.response?.worker_name_en})</p>
                <p>
                  <span className="font-medium">출근 시간:</span>{" "}
                  {data.response?.clock_in_time
                    ? new Date(data.response.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                    : "-"}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center gap-2 text-orange-700 mb-4">
                <LogOut className="w-5 h-5" />
                <h2 className="font-semibold">퇴근 기록</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                퇴근 시 아래 버튼을 눌러주세요. 현재 위치가 자동으로 기록됩니다.
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
                    퇴근 기록하기
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Completed */}
        {data.status === "completed" && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="mt-4 text-xl font-bold text-gray-900">출퇴근 기록 완료</h2>
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p><span className="font-medium">이름:</span> {data.response?.worker_name_ko} ({data.response?.worker_name_en})</p>
              <p>
                <span className="font-medium">출근:</span>{" "}
                {data.response?.clock_in_time
                  ? new Date(data.response.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                  : "-"}
              </p>
              <p>
                <span className="font-medium">퇴근:</span>{" "}
                {data.response?.clock_out_time
                  ? new Date(data.response.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                  : "-"}
              </p>
              {data.response?.clock_in_time && data.response?.clock_out_time && (
                <p className="font-medium text-blue-700 mt-2">
                  총 근무시간:{" "}
                  {(
                    (new Date(data.response.clock_out_time).getTime() -
                      new Date(data.response.clock_in_time).getTime()) /
                    (1000 * 60 * 60)
                  ).toFixed(1)}
                  시간
                </p>
              )}
            </div>
            <p className="mt-6 text-gray-500 text-sm">감사합니다. 이 페이지를 닫으셔도 됩니다.</p>
          </div>
        )}

        {/* Expired */}
        {data.status === "expired" && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">설문이 만료되었습니다</h2>
            <p className="mt-2 text-gray-500">관리자에게 새 설문 링크를 요청해주세요.</p>
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
