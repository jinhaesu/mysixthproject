"use client";

import { BookOpen } from "lucide-react";

export default function PolicyPage() {
  return (
    <div className="min-w-0 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#8A8F98]" />
          반영기준
        </h1>
        <p className="text-sm text-[#8A8F98] mt-1">근태관리 시스템에 적용된 계산 기준 및 법령 근거입니다. (최종 업데이트: 2026.04.01 v2)</p>
      </div>

      <div className="space-y-6">

        {/* 1. 시간 계산 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">1. 시간 계산 기준</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">출근시간 올림</td><td className="py-2 text-[#8A8F98]">30분 단위 올림 (예: 8:03 → 8:30, 8:00 → 8:00, 8:31 → 9:00)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">퇴근시간 내림</td><td className="py-2 text-[#8A8F98]">30분 단위 내림 (예: 17:25 → 17:00, 17:30 → 17:30, 17:50 → 17:30)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">연장/휴일/야간 내림</td><td className="py-2 text-[#8A8F98]">연장/휴일/야간 시간은 30분 단위로 내림 처리 (0.1~0.4h → 0h, 0.5h = 30분)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">기본 근로시간</td><td className="py-2 text-[#8A8F98]">1일 8시간 기준, 초과분은 연장근로</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">휴게시간 (점심)</td><td className="py-2 text-[#8A8F98]">4시간 이상 근무 시 30분, 8시간 이상 근무 시 1시간 (근로기준법 제54조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">휴게시간 (식사)</td><td className="py-2 text-[#8A8F98]">연장근로 2시간 이상 시 식사 30분 추가 휴게 (기본 적용, 관리자 해제 가능). 연장 2시간 미만은 미해당.</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">야간조</td><td className="py-2 text-[#8A8F98]">21시 출근 ~ 다음날 06시 퇴근, 자정 넘김 시에도 퇴근 정상 처리</td></tr>
            </tbody>
          </table>
        </div>

        {/* 2. 수당 계산 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">2. 수당 계산 기준</h2>

          <h3 className="font-semibold text-[#F7F8F8] mt-4 mb-2">2-1. 정규직</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">연장수당</td><td className="py-2 text-[#8A8F98]">1일 8시간 초과 근무 시, 초과시간 × 시급 × 1.5배 (근로기준법 제56조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">야간수당</td><td className="py-2 text-[#8A8F98]">22:00~06:00 근무 시, 야간시간은 기본에서 분리 → 야간시간 × 시급 × 1.5배 (근로기준법 제56조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">휴일수당</td><td className="py-2 text-[#8A8F98]">토/일/법정공휴일 근무 시, 전체 근무시간 × 시급 × 1.5배 (근로기준법 제56조)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">급여 구성</td><td className="py-2 text-[#8A8F98]">기본급 + 식대 + 상여 + 직책수당 + 기타수당 (월정액) + 연장/야간/휴일수당</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">결근 공제</td><td className="py-2 text-[#8A8F98]">월정액 ÷ 해당월 평일수 × 결근일수 차감</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">유급휴가</td><td className="py-2 text-[#8A8F98]">승인된 휴가일은 기본근무 8시간으로 인정 (무단결근 아님)</td></tr>
            </tbody>
          </table>

          <h3 className="font-semibold text-[#F7F8F8] mt-4 mb-2">2-2. 파견/알바 (사업소득)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">기본급</td><td className="py-2 text-[#8A8F98]">기본시간 × 시간당 급여</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">연장수당</td><td className="py-2 text-[#8A8F98]">floor30(연장시간) × 시급 × 1.5배</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">야간수당</td><td className="py-2 text-[#8A8F98]">22:00~06:00 근무 시, 해당 시간 × 시급 × 1.5배</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">휴일수당 (주5일 이하)</td><td className="py-2 text-[#8A8F98] text-[#EB5757] font-medium">공휴일만 휴일수당 적용 (주말은 미적용, 호출형 단시간 근로계약)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">휴일수당 (주5일 초과)</td><td className="py-2 text-[#8A8F98]">주 5일 초과 근무 시 휴일(토/일/공휴일) 전체 → 휴일수당 × 1.5배</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">주휴수당</td><td className="py-2 text-[#8A8F98]">주 15시간 이상 + 주 5일 개근 시 8시간 × 시급 발생 (근로기준법 제55조)</td></tr>
            </tbody>
          </table>
        </div>

        {/* 3. 법정 공휴일 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">3. 법정 공휴일 (2026년)</h2>
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
              <div key={h.date} className="flex items-center gap-2 bg-[#08090A] rounded-lg px-3 py-2">
                <span className="text-[#EB5757] font-mono font-medium">{h.date}</span>
                <span className="text-[#D0D6E0]">{h.name}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#8A8F98] mt-2">※ 토/일요일도 휴일로 처리됩니다.</p>
        </div>

        {/* 4. 4대보험 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">4. 4대보험 요율</h2>

          <h3 className="font-semibold text-[#F7F8F8] mt-3 mb-2">정규직 (근로자 부담분)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">국민연금</td><td className="py-2 text-[#8A8F98]">4.5%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">건강보험</td><td className="py-2 text-[#8A8F98]">3.545%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">장기요양보험</td><td className="py-2 text-[#8A8F98]">건강보험료 × 12.81%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">고용보험</td><td className="py-2 text-[#8A8F98]">0.9%</td></tr>
            </tbody>
          </table>

          <h3 className="font-semibold text-[#F7F8F8] mt-4 mb-2">파견 (사업주 부담, 파견업체 청구)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">국민연금</td><td className="py-2 text-[#8A8F98]">4.75%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">건강보험</td><td className="py-2 text-[#8A8F98]">3.595%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">산재보험</td><td className="py-2 text-[#8A8F98]">1.436%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">고용보험</td><td className="py-2 text-[#8A8F98]">1.15%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">장기요양보험</td><td className="py-2 text-[#8A8F98]">건강보험료 × 13.14%</td></tr>
            </tbody>
          </table>

          <h3 className="font-semibold text-[#F7F8F8] mt-4 mb-2">알바 (사업소득)</h3>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">소득세</td><td className="py-2 text-[#8A8F98]">3.3%</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">지방소득세</td><td className="py-2 text-[#8A8F98]">0.33%</td></tr>
            </tbody>
          </table>
        </div>

        {/* 5. 연차 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">5. 연차휴가 (정규직, 근로기준법 제60조)</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">1년 미만</td><td className="py-2 text-[#8A8F98]">1개월 완전한 달 기준 1일 발생 (최대 11일)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">1년 이상 ~ 3년 미만</td><td className="py-2 text-[#8A8F98]">연 15일</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">3년 이상</td><td className="py-2 text-[#8A8F98]">15일 + 2년마다 1일 추가 (최대 25일)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">자동 계산</td><td className="py-2 text-[#8A8F98]">입사일 기준 매일 서버에서 자동 갱신</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">급여 반영 (연차)</td><td className="py-2 text-[#8A8F98]">승인된 유급휴가 = 기본근무 8시간 인정</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">급여 반영 (반차)</td><td className="py-2 text-[#8A8F98]">오전반차(09~14시) 또는 오후반차(14~18시) + 실근무 4h = 기본 8h. 반차일 근무는 휴게시간 없이 계산</td></tr>
            </tbody>
          </table>
        </div>

        {/* 6. 근로계약서 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">6. 근로계약서</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">정규직 순서</td><td className="py-2 text-[#8A8F98]">웹링크 접속 → 개인정보 입력 → 관리자 확인 → 근로계약서 체결 → 출퇴근 가능</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">알바 (사업소득)</td><td className="py-2 text-[#8A8F98]">단시간 근로자 표준근로계약서, 출근 시 파견/알바 선택 후 계약서 작성</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">계약 기간</td><td className="py-2 text-[#8A8F98]">작성일로부터 1년, 이미 체결 시 만료일까지 재작성 불요</td></tr>
            </tbody>
          </table>
        </div>

        {/* 7. 부서 구분 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">7. 부서 구분</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">정규직</td><td className="py-2 text-[#8A8F98]">생산2층, 생산3층, 물류1층, 생산 야간, 물류 야간</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">파견/알바</td><td className="py-2 text-[#8A8F98]">물류, 생산2층, 생산3층</td></tr>
            </tbody>
          </table>
        </div>

        {/* 8. 시스템 기준 */}
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-5">
          <h2 className="text-lg font-bold text-[#F7F8F8] mb-3">8. 시스템 기준</h2>
          <table className="w-full text-sm border-collapse">
            <tbody className="divide-y divide-[#23252A]">
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0] w-40">시간대</td><td className="py-2 text-[#8A8F98]">한국 표준시 (KST, UTC+9)</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">대시보드 데이터</td><td className="py-2 text-[#8A8F98]">근태 확정 리스트 우선, 없으면 엑셀 업로드 데이터 폴백</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">정산 데이터</td><td className="py-2 text-[#8A8F98]">근태 확정 리스트 기반</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">비밀번호 보호</td><td className="py-2 text-[#8A8F98]">파견/알바 정산, 기본급 관리, 급여 계산 접근 시 + 주민번호 열람 시</td></tr>
              <tr><td className="py-2 pr-4 font-medium text-[#D0D6E0]">주민번호 보호</td><td className="py-2 text-[#8A8F98]">마스킹 표시 (●●●●●●-●●●●●●●), 비밀번호 인증 후 열람 가능</td></tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
