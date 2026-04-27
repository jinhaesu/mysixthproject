"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CenterSpinner, EmptyState, SectionHeader } from "@/components/ui";
import { AlertTriangle } from "lucide-react";

function ContractContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_URL}/api/survey-public/contract/${id}`)
      .then(res => { if (!res.ok) throw new Error("계약서를 찾을 수 없습니다."); return res.json(); })
      .then(data => setContract(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
      <CenterSpinner />
    </div>
  );

  if (error || !contract) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)] p-4">
      <div className="w-full max-w-sm">
        <Card padding="lg" tone="default" className="shadow-[var(--elev-2)]">
          <EmptyState
            icon={<AlertTriangle className="w-6 h-6" />}
            title="오류"
            description={error || "계약서를 불러올 수 없습니다."}
          />
        </Card>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] py-8 px-4 fade-in">
      <div className="max-w-2xl mx-auto">
        <Card padding="none" tone="default" className="shadow-[var(--elev-3)] overflow-hidden surface-bevel">
          {/* Header */}
          <div className="bg-[var(--bg-0)] border-b border-[var(--border-1)] px-6 py-5 text-center">
            <h1 className="text-h4 font-bold text-[var(--text-1)]">단시간 근로자 표준근로계약서</h1>
            <p className="text-eyebrow mt-1.5">전자문서 · 조인앤조인</p>
          </div>

          <div className="px-6 py-6 space-y-5 text-[var(--fs-body)] text-[var(--text-1)] leading-relaxed">
            <p>
              <b>조인앤조인</b> (이하 &quot;사업주&quot;라 함)과{' '}
              <b className="text-[var(--brand-400)]">{contract.worker_name}</b>{' '}
              (이하 &quot;근로자&quot;이라 함)은 다음과 같이 근로계약을 체결한다.
            </p>

            {/* 계약기간 */}
            <div>
              <SectionHeader eyebrow="제1조" title="근로계약기간" />
              <div className="bg-[var(--info-bg)] border border-[var(--info-border)] rounded-[var(--r-md)] p-3">
                <p className="font-semibold text-[var(--info-fg)] tabular">{contract.contract_start} ~ {contract.contract_end}</p>
              </div>
              <div className="mt-2 space-y-1 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>- 본 계약은 위 기간 내에서 사업주의 업무 지시가 있는 날에 한하여 근로를 제공하는 호출형 단시간 근로계약이다.</p>
                <p>- 계약기간 만료 시 별도의 갱신 합의가 없는 한 본 계약은 자동 종료된다.</p>
              </div>
            </div>

            {/* 근무장소 */}
            <div>
              <SectionHeader eyebrow="제2조" title="근무 장소" />
              <p>경기도 안산시 단원구 신길동 1122</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">- 사업주는 업무상 필요에 따라 근무 장소를 변경할 수 있으며, 사전에 근로자에게 통보한다.</p>
            </div>

            {/* 업무내용 */}
            <div>
              <SectionHeader eyebrow="제3조" title="업무의 내용(직종)" />
              <p>제조, 포장 및 이에 부수하는 업무</p>
            </div>

            {/* 근로일 및 근로시간 */}
            <div>
              <SectionHeader eyebrow="제4조" title="근로일 및 근로시간" />
              <div className="space-y-1 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>① 근로일은 사업주가 업무량·생산일정 등을 고려하여 결정하며, 근로 전일 18:00까지 또는 당일 근로 개시 1시간 전까지 근로자에게 통보한다.</p>
                <p>② 근로시간 통보 방법: 문자 및 기타 사전 연락</p>
                <p>③ 사업주가 통보한 근로일에 근로자가 정당한 사유 없이 2회 이상 연속 불참하는 경우, 사업주는 이후 근로 호출을 하지 않을 수 있다.</p>
                <p>④ 휴게시간: 4시간 근로 시 30분, 8시간 근로 시 1시간을 부여한다.</p>
              </div>
            </div>

            {/* 임금 */}
            <div>
              <SectionHeader eyebrow="제5조" title="임금" />
              <div className="space-y-1 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>① 시급: <span className="tabular font-semibold text-[var(--text-1)]">10,320원</span></p>
                <p>② 임금은 실제 근로한 시간을 기준으로 산정한다.</p>
                <p>③ 연장·야간·휴일근로에 대하여는 관련 법령에 따라 가산수당을 지급한다. 단, 4주 평균 1주 소정근로시간이 15시간 미만인 경우 가산수당을 적용하지 아니한다. (근로기준법 제18조)</p>
                <p>④ 임금지급일: 매월 15일</p>
                <p>⑤ 지급방법: 근로자 명의 예금통장에 입금</p>
              </div>
            </div>

            {/* 근로시간 기록 */}
            <div>
              <SectionHeader eyebrow="제7조" title="근로시간 기록 및 확인" />
              <div className="space-y-1 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>- 근로자는 매 근무 시작 및 종료 시 출퇴근 시간을 기록하여야 한다.</p>
                <p>- 근로자는 매 근무 종료 후 근로시간 기록을 진행하여야 하며, 기록이 없는 경우 사업주가 기록한 근로시간을 기준으로 임금을 산정한다.</p>
              </div>
            </div>

            {/* 계약의 해지 */}
            <div>
              <SectionHeader eyebrow="제8조" title="계약의 해지" />
              <div className="space-y-1 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>① 사업주는 다음 각 호의 사유가 있는 경우 본 계약을 해지할 수 있다.</p>
                <p className="pl-4">가. 근로자가 정당한 사유 없이 통보된 근로일에 2회 이상 연속 불참한 경우</p>
                <p className="pl-4">나. 근로자가 업무 지시를 정당한 사유 없이 거부하는 경우</p>
                <p className="pl-4">다. 근로자의 귀책사유로 사업장에 중대한 손해를 끼친 경우</p>
                <p className="pl-4">라. 기타 근로기준법이 정하는 정당한 사유가 있는 경우</p>
              </div>
            </div>

            {/* 비밀유지 */}
            <div>
              <SectionHeader eyebrow="제9조" title="비밀유지" />
              <p className="text-[var(--fs-caption)] text-[var(--text-2)]">- 근로자는 근로 기간 중 알게 된 사업장의 생산공정, 거래처 정보, 제조기술 등 일체의 영업비밀을 계약 종료 후에도 제3자에게 누설하여서는 아니 된다.</p>
            </div>

            {/* 기타 */}
            <div>
              <SectionHeader eyebrow="제10조" title="기타" />
              <div className="space-y-1 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>- 이 계약에 정함이 없는 사항은 근로기준법에 의한다.</p>
                <p>- 본 계약서는 전자(디지털)로 작성하여 사업주와 근로자가 각 보관한다.</p>
              </div>
            </div>

            {/* Date */}
            <div className="text-center text-[var(--text-2)] font-medium pt-4 border-t border-[var(--border-1)]">
              {contract.contract_start && (() => {
                const d = new Date(contract.created_at || contract.contract_start);
                return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`;
              })()}
            </div>

            {/* Employer */}
            <Card padding="md" tone="elevated">
              <p className="font-bold text-[var(--text-1)] mb-2">(사업주)</p>
              <div className="space-y-0.5 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>사업체명: (주)조인앤조인</p>
                <p>주소: 전북특별자치도 전주시 덕진구 기린대로 458 (전화: 1533-791)</p>
                <div className="flex items-center justify-between mt-2">
                  <p>대표자: 진해수</p>
                  <div className="px-4 py-1 border border-[var(--border-2)] rounded-[var(--r-sm)] text-[var(--fs-caption)] text-[var(--text-3)]">직인</div>
                </div>
              </div>
            </Card>

            {/* Worker */}
            <div className="bg-[var(--warning-bg)] rounded-[var(--r-md)] p-4 border border-[var(--warning-border)]">
              <p className="font-bold text-[var(--text-1)] mb-2">(근로자)</p>
              <div className="space-y-0.5 text-[var(--fs-caption)] text-[var(--text-2)]">
                <p>성명: <b className="text-[var(--warning-fg)]">{contract.worker_name}</b></p>
                {contract.address && <p>주소: {contract.address}</p>}
                <p>연락처: {contract.phone}</p>
                {contract.signature_data && (
                  <div className="mt-3">
                    <p className="text-[var(--fs-caption)] text-[var(--text-3)] mb-1">서명:</p>
                    <div className="bg-white rounded-[var(--r-sm)] border border-orange-300 p-2 inline-block">
                      <img src={contract.signature_data} alt="서명" className="max-h-20" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-[var(--fs-caption)] text-[var(--text-4)] pt-4">
              <p>본 계약서는 전자적으로 작성되었으며 법적 효력을 가집니다.</p>
              <p className="mt-1">조인앤조인 근태관리시스템</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function ContractPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <CenterSpinner />
      </div>
    }>
      <ContractContent />
    </Suspense>
  );
}
