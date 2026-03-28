"use client";

import { BookOpen } from "lucide-react";

export default function PolicyPage() {
  return (
    <div className="min-w-0 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-gray-600" />
          반영기준
        </h1>
        <p className="text-sm text-gray-500 mt-1">근태관리 시스템에 적용된 계산 기준 및 법령 근거입니다. (최종 업데이트: 2026.03.29)</p>
      </div>

      <div className="space-y-6">

        {/* 1. 시간 계산 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">1. 시간 계산 기준</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">30분 단위 내림</td><td className="py-2 text-gray-600">연장/휴일/야간 시간은 30분 단위로 내림 처리 (0.1~0.4h → 0h, 0.5h = 30분)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">기본 근로시간</td><td className="py-2 text-gray-600">1일 8시간 기준, 초과분은 연장근로</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">휴게시간</td><td className="py-2 text-gray-600">4시간 이상 근무 시 30분, 8시간 이상 근무 시 1시간 (근로기준법 제54조)</td></tr>
            </tbody>
          </table>
        </div>

        {/* 2. 수당 계산 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">2. 수당 계산 기준</h2>

          <h3 className="font-semibold text-gray-800 mt-4 mb-2">2-1. 정규직</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">연장수당</td><td className="py-2 text-gray-600">1일 8시간 초과 근무 시, 초과시간 × 시급 × 1.5배 (근로기준법 제56조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">야간수당</td><td className="py-2 text-gray-600">22:00~06:00 근무 시, 해당 시간 × 시급 × 0.5배 가산 (근로기준법 제56조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">휴일수당</td><td className="py-2 text-gray-600">토/일/법정공휴일 근무 시, 전체 근무시간 × 시급 × 1.5배 (근로기준법 제56조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">급여 구성</td><td className="py-2 text-gray-600">기본급 + 식대 + 상여 + 직책수당 + 기타수당 (월정액) + 연장/야간/휴일수당</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">결근 공제</td><td className="py-2 text-gray-600">월정액 ÷ 해당월 평일수 × 결근일수 차감</td></tr>
            </tbody>
          </table>

          <h3 className="font-semibold text-gray-800 mt-4 mb-2">2-2. 파견/알바 (사업소득)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">기본급</td><td className="py-2 text-gray-600">기본시간 × 시간당 급여</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">연장수당</td><td className="py-2 text-gray-600">floor30(연장시간) × 시급 × 1.5배</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">야간수당</td><td className="py-2 text-gray-600">22:00~06:00 근무 시, 해당 시간 × 시급 × 1.5배</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">휴일수당 (주5일 이하)</td><td className="py-2 text-gray-600 text-red-600 font-medium">발생하지 않음 (호출형 단시간 근로계약)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">휴일수당 (주5일 초과)</td><td className="py-2 text-gray-600">주 5일 초과 근무 시 휴일(토/일) 전체 → 휴일수당 × 1.5배</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">공휴일 근무</td><td className="py-2 text-gray-600 font-medium">무조건 휴일수당 적용 (근무일수 무관)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">주휴수당</td><td className="py-2 text-gray-600">주 15시간 이상 + 주 5일 개근 시 8시간 × 시급 발생 (근로기준법 제55조)</td></tr>
            </tbody>
          </table>
        </div>

        {/* 3. 법정 공휴일 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">3. 법정 공휴일 (2026년)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            {[
              { date: '01-01', name: '신정' },
              { date: '02-16~18', name: '설날 연휴' },
              { date: '03-01', name: '삼일절' },
              { date: '05-05', name: '어린이날' },
              { date: '05-24', name: '부처님오신날' },
              { date: '06-06', name: '현충일' },
              { date: '08-15', name: '광복절' },
              { date: '09-24~26', name: '추석 연휴' },
              { date: '10-03', name: '개천절' },
              { date: '10-09', name: '한글날' },
              { date: '12-25', name: '크리스마스' },
            ].map(h => (
              <div key={h.date} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-red-600 font-mono font-medium">{h.date}</span>
                <span className="text-gray-700">{h.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">※ 토/일요일도 휴일로 처리됩니다.</p>
        </div>

        {/* 4. 4대보험 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">4. 4대보험 요율</h2>

          <h3 className="font-semibold text-gray-800 mt-3 mb-2">정규직 (근로자 부담분)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">국민연금</td><td className="py-2 text-gray-600">4.5%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">건강보험</td><td className="py-2 text-gray-600">3.545%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">장기요양보험</td><td className="py-2 text-gray-600">건강보험료 × 12.81%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">고용보험</td><td className="py-2 text-gray-600">0.9%</td></tr>
            </tbody>
          </table>

          <h3 className="font-semibold text-gray-800 mt-4 mb-2">파견 (사업주 부담, 파견업체 청구)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">국민연금</td><td className="py-2 text-gray-600">4.75%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">건강보험</td><td className="py-2 text-gray-600">3.595%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">산재보험</td><td className="py-2 text-gray-600">1.436%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">고용보험</td><td className="py-2 text-gray-600">1.15%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">장기요양보험</td><td className="py-2 text-gray-600">건강보험료 × 13.14%</td></tr>
            </tbody>
          </table>

          <h3 className="font-semibold text-gray-800 mt-4 mb-2">알바 (사업소득)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">소득세</td><td className="py-2 text-gray-600">3.3%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">지방소득세</td><td className="py-2 text-gray-600">0.33%</td></tr>
            </tbody>
          </table>
        </div>

        {/* 5. 연차 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">5. 연차휴가 (정규직, 근로기준법 제60조)</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">1년 미만</td><td className="py-2 text-gray-600">1개월 개근 시 1일 발생 (최대 11일)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">1년 이상 ~ 3년 미만</td><td className="py-2 text-gray-600">연 15일</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">3년 이상</td><td className="py-2 text-gray-600">15일 + 2년마다 1일 추가 (최대 25일)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">자동 계산</td><td className="py-2 text-gray-600">입사일 기준 매일 서버에서 자동 갱신</td></tr>
            </tbody>
          </table>
        </div>

        {/* 6. 근로계약서 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">6. 근로계약서</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">정규직</td><td className="py-2 text-gray-600">2026.03.27 이후 입사자는 전자 근로계약서 체결 필수 (미체결 시 출근 불가)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">알바 (사업소득)</td><td className="py-2 text-gray-600">단시간 근로자 표준근로계약서, 출근 시 파견/알바 선택 후 계약서 작성</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">계약 기간</td><td className="py-2 text-gray-600">작성일로부터 1년, 이미 체결 시 만료일까지 재작성 불요</td></tr>
            </tbody>
          </table>
        </div>

        {/* 7. 시스템 기준 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900 mb-3">7. 시스템 기준</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 pr-4 font-medium text-gray-700 w-40">시간대</td><td className="py-2 text-gray-600">한국 표준시 (KST, UTC+9)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">대시보드 데이터</td><td className="py-2 text-gray-600">근태 확정 리스트 우선, 없으면 엑셀 업로드 데이터 폴백</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">정산 데이터</td><td className="py-2 text-gray-600">근태 확정 리스트 기반</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-gray-700">비밀번호 보호</td><td className="py-2 text-gray-600">파견/알바 정산, 기본급 관리, 급여 계산 접근 시</td></tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
