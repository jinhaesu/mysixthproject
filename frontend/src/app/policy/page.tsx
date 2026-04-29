"use client";

import { BookOpen } from "lucide-react";
import { PageHeader, Card, CardHeader, Section, Table, THead, TBody, TR, TH, TD } from "@/components/ui";

const HOLIDAYS_2026 = [
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
];

export default function PolicyPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="정책"
        title="반영기준"
        description="근태관리 시스템에 적용된 계산 기준 및 법령 근거입니다. (최종 업데이트: 2026.04.01 v2)"
      />

      <div className="space-y-4">

        <Section title="1. 시간 계산 기준">
          <Card padding="none">
            <Table>
              <TBody>
                <TR><TH className="w-44">출근시간 올림</TH><TD>30분 단위 올림 (예: 8:03 → 8:30, 8:00 → 8:00, 8:31 → 9:00)</TD></TR>
                <TR><TH className="w-44">퇴근시간 내림</TH><TD>30분 단위 내림 (예: 17:25 → 17:00, 17:30 → 17:30, 17:50 → 17:30)</TD></TR>
                <TR><TH>연장/휴일/야간 내림</TH><TD>연장/휴일/야간 시간은 30분 단위로 내림 처리 (0.1~0.4h → 0h, 0.5h = 30분)</TD></TR>
                <TR><TH>기본 근로시간</TH><TD>1일 8시간 기준, 초과분은 연장근로</TD></TR>
                <TR><TH>휴게시간 (점심)</TH><TD>4시간 이상 근무 시 30분, 8시간 이상 근무 시 1시간 (근로기준법 제54조)</TD></TR>
                <TR><TH>휴게시간 (식사)</TH><TD>연장근로 2시간 이상 시 식사 30분 추가 휴게 (기본 적용, 관리자 해제 가능). 연장 2시간 미만은 미해당.</TD></TR>
                <TR><TH>야간조</TH><TD>21시 출근 ~ 다음날 06시 퇴근, 자정 넘김 시에도 퇴근 정상 처리</TD></TR>
              </TBody>
            </Table>
          </Card>
        </Section>

        <Section title="2. 수당 계산 기준">
          <div className="space-y-3">
            <Card padding="none">
              <CardHeader title="2-1. 정규직" />
              <Table>
                <TBody>
                  <TR><TH className="w-44">연장수당</TH><TD>1일 8시간 초과 근무 시, 초과시간 × 시급 × 1.5배 (근로기준법 제56조)</TD></TR>
                  <TR><TH>야간수당</TH><TD>22:00~06:00 근무 시, 야간시간은 기본에서 분리 → 야간시간 × 시급 × 1.5배 (근로기준법 제56조)</TD></TR>
                  <TR><TH>휴일수당</TH><TD>토/일/법정공휴일 근무 시, 전체 근무시간 × 시급 × 1.5배 (근로기준법 제56조)</TD></TR>
                  <TR><TH>급여 구성</TH><TD>기본급 + 식대 + 상여 + 직책수당 + 기타수당 (월정액) + 연장/야간/휴일수당</TD></TR>
                  <TR><TH>결근 공제</TH><TD>월정액 ÷ 해당월 평일수 × 결근일수 차감</TD></TR>
                  <TR><TH>유급휴가</TH><TD>승인된 휴가일은 기본근무 8시간으로 인정 (무단결근 아님)</TD></TR>
                </TBody>
              </Table>
            </Card>

            <Card padding="none">
              <CardHeader title="2-2. 파견/알바 (사업소득)" />
              <Table>
                <TBody>
                  <TR><TH className="w-44">기본급</TH><TD>기본시간 × 시간당 급여</TD></TR>
                  <TR><TH>연장수당</TH><TD>floor30(연장시간) × 시급 × 1.5배</TD></TR>
                  <TR><TH>야간수당</TH><TD>22:00~06:00 근무 시, 해당 시간 × 시급 × 1.5배</TD></TR>
                  <TR><TH>휴일수당 (주5일 이하)</TH><TD><span className="text-[var(--danger-fg)] font-medium">공휴일만 휴일수당 적용 (주말은 미적용, 호출형 단시간 근로계약)</span></TD></TR>
                  <TR><TH>휴일수당 (주5일 초과)</TH><TD>주 5일 초과 근무 시 휴일(토/일/공휴일) 전체 → 휴일수당 × 1.5배</TD></TR>
                  <TR><TH>주휴수당</TH><TD>주 15시간 이상 + 주 5일 개근 시 8시간 × 시급 발생 (근로기준법 제55조)</TD></TR>
                </TBody>
              </Table>
            </Card>
          </div>
        </Section>

        <Section title="3. 법정 공휴일 (2026년)">
          <Card padding="md">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {HOLIDAYS_2026.map(h => (
                <div
                  key={h.date}
                  className="flex items-center gap-2 bg-[var(--bg-0)] rounded-[var(--r-md)] px-3 py-2"
                >
                  <span className="text-[var(--danger-fg)] text-mono text-[var(--fs-caption)] font-medium tabular">{h.date}</span>
                  <span className="text-[var(--text-2)] text-[var(--fs-caption)]">{h.name}</span>
                </div>
              ))}
            </div>
            <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-3">※ 토/일요일도 휴일로 처리됩니다.</p>
          </Card>
        </Section>

        <Section title="4. 4대보험 요율">
          <div className="space-y-3">
            <Card padding="none">
              <CardHeader title="정규직 (근로자 부담분)" />
              <Table>
                <TBody>
                  <TR><TH className="w-44">국민연금</TH><TD>4.5%</TD></TR>
                  <TR><TH>건강보험</TH><TD>3.545%</TD></TR>
                  <TR><TH>장기요양보험</TH><TD>건강보험료 × 12.81%</TD></TR>
                  <TR><TH>고용보험</TH><TD>0.9%</TD></TR>
                </TBody>
              </Table>
            </Card>

            <Card padding="none">
              <CardHeader title="파견 (사업주 부담, 파견업체 청구)" />
              <Table>
                <TBody>
                  <TR><TH className="w-44">국민연금</TH><TD>4.75%</TD></TR>
                  <TR><TH>건강보험</TH><TD>3.595%</TD></TR>
                  <TR><TH>산재보험</TH><TD>1.436%</TD></TR>
                  <TR><TH>고용보험</TH><TD>1.15%</TD></TR>
                  <TR><TH>장기요양보험</TH><TD>건강보험료 × 13.14%</TD></TR>
                </TBody>
              </Table>
            </Card>

            <Card padding="none">
              <CardHeader title="알바 (사업소득)" />
              <Table>
                <TBody>
                  <TR><TH className="w-44">소득세</TH><TD>3.3%</TD></TR>
                  <TR><TH>지방소득세</TH><TD>0.33%</TD></TR>
                </TBody>
              </Table>
            </Card>
          </div>
        </Section>

        <Section title="5. 연차휴가 (정규직, 근로기준법 제60조)">
          <Card padding="none">
            <Table>
              <TBody>
                <TR><TH className="w-44">1년 미만</TH><TD>1개월 완전한 달 기준 1일 발생 (최대 11일)</TD></TR>
                <TR><TH>1년 이상 ~ 3년 미만</TH><TD>연 15일</TD></TR>
                <TR><TH>3년 이상</TH><TD>15일 + 2년마다 1일 추가 (최대 25일)</TD></TR>
                <TR><TH>자동 계산</TH><TD>입사일 기준 매일 서버에서 자동 갱신</TD></TR>
                <TR><TH>급여 반영 (연차)</TH><TD>승인된 유급휴가 = 기본근무 8시간 인정</TD></TR>
                <TR><TH>급여 반영 (반차)</TH><TD>오전반차(09~14시) 또는 오후반차(14~18시) + 실근무 4h = 기본 8h. 반차일 근무는 휴게시간 없이 계산</TD></TR>
              </TBody>
            </Table>
          </Card>
        </Section>

        <Section title="6. 근로계약서">
          <Card padding="none">
            <Table>
              <TBody>
                <TR><TH className="w-44">정규직 순서</TH><TD>웹링크 접속 → 개인정보 입력 → 관리자 확인 → 근로계약서 체결 → 출퇴근 가능</TD></TR>
                <TR><TH>알바 (사업소득)</TH><TD>단시간 근로자 표준근로계약서, 출근 시 파견/알바 선택 후 계약서 작성</TD></TR>
                <TR><TH>계약 기간</TH><TD>작성일로부터 1년, 이미 체결 시 만료일까지 재작성 불요</TD></TR>
              </TBody>
            </Table>
          </Card>
        </Section>

        <Section title="7. 부서 구분">
          <Card padding="none">
            <Table>
              <TBody>
                <TR><TH className="w-44">정규직</TH><TD>생산2층, 생산3층, 물류, 생산 야간, 물류 야간</TD></TR>
                <TR><TH>파견/알바</TH><TD>물류, 생산2층, 생산3층</TD></TR>
              </TBody>
            </Table>
          </Card>
        </Section>

        <Section title="8. 시스템 기준">
          <Card padding="none">
            <Table>
              <TBody>
                <TR><TH className="w-44">시간대</TH><TD>한국 표준시 (KST, UTC+9)</TD></TR>
                <TR><TH>대시보드 데이터</TH><TD>근태 확정 리스트 우선, 없으면 엑셀 업로드 데이터 폴백</TD></TR>
                <TR><TH>정산 데이터</TH><TD>근태 확정 리스트 기반</TD></TR>
                <TR><TH>비밀번호 보호</TH><TD>파견/알바 정산, 기본급 관리, 급여 계산 접근 시 + 주민번호 열람 시</TD></TR>
                <TR><TH>주민번호 보호</TH><TD>마스킹 표시 (●●●●●●-●●●●●●●), 비밀번호 인증 후 열람 가능</TD></TR>
              </TBody>
            </Table>
          </Card>
        </Section>

      </div>
    </div>
  );
}
