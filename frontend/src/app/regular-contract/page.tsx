"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Canvas signature pad component
function SignaturePad({
  canvasRef,
  label,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  label: string;
}) {
  const isDrawing = useRef(false);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-gray-600">{label} <span className="text-red-500">*</span></label>
        <button type="button" onClick={clear} className="text-xs text-gray-400 hover:text-gray-600 underline">지우기</button>
      </div>
      <div className="border-2 border-gray-300 rounded-lg bg-white relative" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={120}
          className="w-full cursor-crosshair block"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <p className="text-xs text-gray-400 mt-0.5">위 영역에 서명해주세요</p>
    </div>
  );
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

// Full contract articles
function ContractArticles({ c }: { c: any }) {
  const workPlace = c.work_place || '전북특별자치도 전주시 덕진구 기린대로 458';
  const workDuties = c.work_duties || '제조, 포장 및 이에 부수하는 업무';
  const workHours = c.work_hours || '09:00 ~ 18:00';
  const breakTime = c.break_time || '1시간 (점심)';
  const workDays = c.work_days || '월요일 ~ 금요일';
  const annualSalary = c.annual_salary || '';
  const basePay = c.base_pay || '';
  const mealAllowance = c.meal_allowance || '';
  const otherAllowance = c.other_allowance || '';
  const payDay = c.pay_day || '10';
  const payMethod = c.pay_method || '계좌이체';
  const department = c.department || '';
  const positionTitle = c.position_title || '사원';
  const workStartDate = c.work_start_date || c.contract_start || '';

  return (
    <div className="space-y-3 text-xs text-gray-800 leading-relaxed">
      <p className="text-center font-bold text-sm text-gray-900">근 로 계 약 서</p>
      <p>
        <span className="font-semibold">(주)조인앤조인</span> (이하 &quot;사업주&quot;)과{' '}
        <span className="font-semibold text-blue-700">{c.worker_name}</span> (이하 &quot;근로자&quot;)은 다음과 같이 근로계약을 체결합니다.
      </p>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600 w-1/3">근로 개시일</td>
              <td className="px-3 py-2">{workStartDate}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600">근무부서 / 직책</td>
              <td className="px-3 py-2">{department} / {positionTitle}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600">근무 장소</td>
              <td className="px-3 py-2">{workPlace}</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600">담당 업무</td>
              <td className="px-3 py-2">{workDuties}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제1조 (근로계약기간)</p>
        <p>근로계약기간은 근로 개시일({workStartDate})부터 정함이 없는 기간으로 합니다. 단, 수습기간은 입사일로부터 3개월로 하며, 수습기간 중 업무능력 및 적합성이 부족하다고 판단될 경우 사업주는 본 계약을 해지할 수 있습니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제2조 (근무 장소 및 담당 업무)</p>
        <p>① 근무 장소: {workPlace}</p>
        <p>② 담당 업무: {workDuties}</p>
        <p>③ 사업주는 업무상 필요에 따라 근무 장소 및 담당 업무를 변경할 수 있으며, 근로자는 정당한 이유 없이 이를 거부할 수 없습니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제3조 (근로시간 및 휴게시간)</p>
        <p>① 근로시간: {workHours} (1일 8시간, 주 40시간 기준)</p>
        <p>② 휴게시간: {breakTime}</p>
        <p>③ 근무일: {workDays}</p>
        <p>④ 업무 필요에 따라 연장·야간·휴일 근로가 발생할 수 있으며, 이 경우 근로기준법에 따른 가산수당을 지급합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제4조 (임금)</p>
        <p>① 연봉총액: {annualSalary ? annualSalary + ' 원' : '별도 협의'}</p>
        <p>② 월 급여 구성</p>
        <div className="ml-3 space-y-0.5">
          {basePay && <p>- 기본급: {basePay} 원</p>}
          {mealAllowance && <p>- 식대: {mealAllowance} 원</p>}
          {otherAllowance && <p>- 기타수당: {otherAllowance} 원</p>}
        </div>
        <p>③ 급여일: 매월 {payDay}일 ({payMethod})</p>
        <p>④ 상기 임금은 4대보험 및 소득세 등 관련 법령에 따른 공제 전 금액입니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제5조 (휴일 및 휴가)</p>
        <p>① 주휴일: 일요일 (1주 소정근로일 개근 시)</p>
        <p>② 연차유급휴가: 근로기준법 제60조에 따라 부여합니다.</p>
        <p>③ 법정 공휴일은 근로기준법 및 관련 규정에 따릅니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제6조 (4대보험)</p>
        <p>사업주와 근로자는 국민연금, 건강보험, 고용보험, 산재보험에 관련 법령에 따라 가입합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제7조 (복무 및 취업규칙 준수)</p>
        <p>근로자는 회사의 취업규칙, 인사규정 및 기타 사규를 성실히 준수하여야 하며, 사업주의 정당한 업무 지시에 따라야 합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제8조 (비밀유지 의무)</p>
        <p>근로자는 재직 중은 물론 퇴직 후에도 업무상 취득한 회사의 영업비밀, 고객정보, 기술정보 등 일체의 기밀을 제3자에게 누설하거나 회사 이외의 목적으로 사용하여서는 안 됩니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제9조 (겸업금지)</p>
        <p>근로자는 사업주의 사전 서면 동의 없이 경쟁 관계에 있는 타 업체에 취업하거나 사업을 영위할 수 없습니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제10조 (징계 및 해고)</p>
        <p>근로자가 취업규칙 또는 이 계약을 위반하거나 회사에 현저한 손해를 끼친 경우 취업규칙이 정하는 바에 따라 징계 또는 해고할 수 있습니다. 해고 시에는 근로기준법이 정한 절차를 따릅니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제11조 (퇴직)</p>
        <p>근로자가 퇴직하고자 할 때에는 퇴직 희망일 30일 전에 사업주에게 서면으로 통보하여야 합니다. 퇴직금은 근로자퇴직급여보장법에 따라 지급합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제12조 (손해배상)</p>
        <p>근로자가 고의 또는 중대한 과실로 회사에 손해를 입힌 경우 그 손해를 배상하여야 합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제13조 (안전 및 보건)</p>
        <p>사업주는 산업안전보건법에 따라 근로자의 안전·보건을 위한 필요한 조치를 취하며, 근로자는 이에 적극 협조하여야 합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-gray-900 mb-1">제14조 (기타)</p>
        <p>본 계약서에 명시되지 않은 사항은 근로기준법, 최저임금법 등 관련 노동 법령 및 회사 취업규칙에 따릅니다.</p>
      </div>
    </div>
  );
}

// Personal info consent text
function ConsentText({ name }: { name: string }) {
  return (
    <div className="text-xs text-gray-700 leading-relaxed space-y-2">
      <p className="font-semibold text-gray-900 text-sm text-center">개인정보 수집·이용 동의서</p>
      <p>
        <span className="font-semibold">{name}</span>님은 근로계약 체결 및 인사관리 목적으로 (주)조인앤조인이 아래와 같이 개인정보를 수집·이용하는 것에 동의합니다.
      </p>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600 w-1/3">수집 항목</td>
              <td className="px-3 py-2">성명, 생년월일, 주소, 주민등록번호, 연락처, 서명</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600">수집 목적</td>
              <td className="px-3 py-2">근로계약 체결, 급여 지급, 4대보험 신고, 세금 신고</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600">보유 기간</td>
              <td className="px-3 py-2">근로관계 종료 후 5년 (관련 법령에 따름)</td>
            </tr>
            <tr>
              <td className="bg-gray-50 px-3 py-2 font-medium text-gray-600">제3자 제공</td>
              <td className="px-3 py-2">4대보험 공단, 국세청 등 법령에 의한 경우에 한함</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-gray-500">※ 위 개인정보 수집·이용에 동의하지 않을 권리가 있으나, 동의하지 않을 경우 근로계약 체결이 불가합니다.</p>
    </div>
  );
}

function RegularContractContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Worker-entered fields
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // Two signature pads
  const contractSigRef = useRef<HTMLCanvasElement>(null);
  const consentSigRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    fetch(`${API_URL}/api/regular-public/contract/${token}`)
      .then(r => { if (!r.ok) throw new Error("계약서를 찾을 수 없습니다."); return r.json(); })
      .then(d => setContract(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSign = async () => {
    if (!birthDate.trim()) return alert("생년월일을 입력해주세요.");
    if (!address.trim()) return alert("주소를 입력해주세요.");
    if (!idNumber.trim()) return alert("주민등록번호를 입력해주세요.");

    const contractCanvas = contractSigRef.current;
    const consentCanvas = consentSigRef.current;
    if (!contractCanvas || !consentCanvas) return;

    if (isCanvasBlank(contractCanvas)) return alert("근로계약서 서명을 해주세요.");
    if (isCanvasBlank(consentCanvas)) return alert("개인정보 동의서 서명을 해주세요.");

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/contract/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          birth_date: birthDate.trim(),
          address: address.trim(),
          id_number: idNumber.trim(),
          signature_data: contractCanvas.toDataURL(),
          consent_signature_data: consentCanvas.toDataURL(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      alert("근로계약서가 체결되었습니다. 확인 문자가 발송됩니다.");
      setContract({
        ...contract,
        status: 'signed',
        birth_date: birthDate.trim(),
        address: address.trim(),
        signature_data: contractCanvas.toDataURL(),
        consent_signature_data: consentCanvas.toDataURL(),
      });
    } catch (e: any) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
  if (error || !contract) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <p className="text-lg font-semibold text-gray-700">오류</p>
        <p className="text-sm text-gray-500 mt-2">{error}</p>
      </div>
    </div>
  );

  // ── Signed view ──────────────────────────────────────────────────────────────
  if (contract.status === 'signed') {
    return (
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-green-700 text-white px-6 py-5 text-center">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" />
            <h1 className="text-lg font-bold">근로계약서 체결 완료</h1>
            <p className="text-green-200 text-xs mt-1">전자문서 | (주)조인앤조인</p>
          </div>

          <div className="px-6 py-6 space-y-5 text-sm text-gray-800">
            <ContractArticles c={contract} />

            <div className="border-t border-gray-200 pt-4 space-y-2">
              <p className="text-center text-xs text-gray-500">
                {(() => {
                  const d = new Date();
                  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
                })()}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                  <p className="font-bold text-blue-900 text-xs mb-1">(사업주)</p>
                  <p className="text-xs">사업체명: (주)조인앤조인</p>
                  <p className="text-xs">주소: 전북특별자치도 전주시 덕진구 기린대로 458</p>
                  <p className="text-xs">대표자: 진해수 (인)</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                  <p className="font-bold text-green-900 text-xs mb-1">(근로자)</p>
                  <p className="text-xs">성명: <b>{contract.worker_name}</b></p>
                  {contract.birth_date && <p className="text-xs">생년월일: {contract.birth_date}</p>}
                  {contract.address && <p className="text-xs">주소: {contract.address}</p>}
                  <p className="text-xs">연락처: {contract.phone}</p>
                  {contract.signature_data && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">서명:</p>
                      <div className="bg-white rounded border p-1 inline-block">
                        <img src={contract.signature_data} alt="서명" className="max-h-16" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-3">
              <ConsentText name={contract.worker_name} />
              <div className="bg-gray-50 rounded-lg p-3 border">
                <p className="text-xs font-medium text-gray-700 mb-1">동의자 서명:</p>
                <p className="text-xs">성명: {contract.worker_name}</p>
                {contract.consent_signature_data && (
                  <div className="mt-2">
                    <div className="bg-white rounded border p-1 inline-block">
                      <img src={contract.consent_signature_data} alt="동의서명" className="max-h-16" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="text-center text-xs text-gray-400 pt-2">
              본 계약서는 전자적으로 작성되었으며 법적 효력을 가집니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Signing form ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-blue-600 text-white rounded-xl p-5 text-center">
          <h1 className="text-lg font-bold">근로계약서 서명</h1>
          <p className="text-blue-200 text-sm mt-1">{contract.worker_name}님, 아래 내용을 확인하고 서명해주세요.</p>
        </div>

        {/* Contract text */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="max-h-72 overflow-y-auto border rounded-lg p-3 bg-gray-50">
            <ContractArticles c={contract} />
          </div>
        </div>

        {/* Date + parties */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <p className="text-center text-sm text-gray-700 font-medium">
            {(() => {
              const d = new Date();
              return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
            })()}
          </p>

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-900 border border-blue-100">
            <p className="font-bold">(사업주) (주)조인앤조인</p>
            <p>주소: 전북특별자치도 전주시 덕진구 기린대로 458</p>
            <p>대표자: 진해수 (인)</p>
          </div>

          {/* Worker info inputs */}
          <div className="space-y-3">
            <p className="font-bold text-sm text-gray-900">(근로자) {contract.worker_name}</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                생년월일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                주소 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="예: 전북 전주시 덕진구 ..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                주민등록번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={idNumber}
                onChange={e => setIdNumber(e.target.value)}
                placeholder="000000-0000000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-0.5">4대보험 신고 목적으로만 사용됩니다.</p>
            </div>

            <SignaturePad canvasRef={contractSigRef} label="근로계약서 서명 (서명/인)" />
          </div>
        </div>

        {/* Consent section */}
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <div className="border rounded-lg p-3 bg-gray-50 max-h-52 overflow-y-auto">
            <ConsentText name={contract.worker_name} />
          </div>
          <SignaturePad canvasRef={consentSigRef} label="개인정보 동의서 서명 (서명/인)" />
        </div>

        {/* Submit */}
        <button
          onClick={handleSign}
          disabled={submitting || !birthDate.trim() || !address.trim() || !idNumber.trim()}
          className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-semibold disabled:bg-gray-300 hover:bg-blue-700 text-sm"
        >
          {submitting ? "처리 중..." : "근로계약서 서명 완료"}
        </button>

        <p className="text-center text-xs text-gray-400 pb-4">
          본 계약서에 서명함으로써 위 내용에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}

export default function RegularContractPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <RegularContractContent />
    </Suspense>
  );
}
