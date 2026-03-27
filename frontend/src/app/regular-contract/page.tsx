"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function RegularContractContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [signatureRef, setSignatureRef] = useState<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    fetch(`${API_URL}/api/regular-public/contract/${token}`)
      .then(r => { if (!r.ok) throw new Error("계약서를 찾을 수 없습니다."); return r.json(); })
      .then(d => setContract(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    if (!signatureRef) return;
    setIsDrawing(true);
    const ctx = signatureRef.getContext('2d');
    if (!ctx) return;
    const rect = signatureRef.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || !signatureRef) return;
    const ctx = signatureRef.getContext('2d');
    if (!ctx) return;
    const rect = signatureRef.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    ctx.lineTo(x, y); ctx.stroke();
  };
  const stopDrawing = () => setIsDrawing(false);
  const clearSignature = () => { if (signatureRef) signatureRef.getContext('2d')?.clearRect(0, 0, signatureRef.width, signatureRef.height); };

  const handleSign = async () => {
    if (!address.trim()) return alert("주소를 입력해주세요.");
    if (!signatureRef) return;
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = signatureRef.width; blankCanvas.height = signatureRef.height;
    if (signatureRef.toDataURL() === blankCanvas.toDataURL()) return alert("서명을 해주세요.");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/contract/${token}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim(), signature_data: signatureRef.toDataURL() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      alert("근로계약서가 체결되었습니다. 확인 문자가 발송됩니다.");
      setContract({ ...contract, status: 'signed', address: address.trim(), signature_data: signatureRef.toDataURL() });
    } catch (e: any) { alert(e.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (error || !contract) return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4"><div className="bg-white rounded-xl shadow-sm p-8 text-center"><p className="text-lg font-semibold text-gray-700">오류</p><p className="text-sm text-gray-500 mt-2">{error}</p></div></div>;

  // Signed contract view
  if (contract.status === 'signed') {
    return (
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-green-700 text-white px-6 py-4 text-center">
            <CheckCircle className="w-8 h-8 mx-auto mb-2" />
            <h1 className="text-lg font-bold">근로계약서 체결 완료</h1>
            <p className="text-green-200 text-xs mt-1">전자문서 | 조인앤조인</p>
          </div>
          <div className="px-6 py-6 space-y-4 text-sm text-gray-800">
            <p><b>조인앤조인</b> (이하 "사업주")과 <b className="text-blue-700">{contract.worker_name}</b> (이하 "근로자")은 다음과 같이 근로계약을 체결한다.</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="font-bold text-blue-800">근로계약기간</p>
              <p className="text-blue-700 font-semibold">{contract.contract_start} ~ {contract.contract_end}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border"><p className="font-bold">(사업주)</p><p>사업체명: (주)조인앤조인</p><p>주소: 전북특별자치도 전주시 덕진구 기린대로 458</p><p>대표자: 진해수</p></div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="font-bold">(근로자)</p>
              <p>성명: <b>{contract.worker_name}</b></p>
              {contract.address && <p>주소: {contract.address}</p>}
              <p>연락처: {contract.phone}</p>
              {contract.signature_data && <div className="mt-2"><p className="text-xs text-gray-500 mb-1">서명:</p><div className="bg-white rounded border p-2 inline-block"><img src={contract.signature_data} alt="서명" className="max-h-20" /></div></div>}
            </div>
            <p className="text-center text-xs text-gray-400">본 계약서는 전자적으로 작성되었으며 법적 효력을 가집니다.</p>
          </div>
        </div>
      </div>
    );
  }

  // Signing form
  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-blue-600 text-white rounded-xl p-5 text-center">
          <h1 className="text-lg font-bold">근로계약서 서명</h1>
          <p className="text-blue-200 text-sm mt-1">{contract.worker_name}님, 아래 내용을 확인하고 서명해주세요.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <p className="font-bold text-center text-gray-900">표준근로계약서</p>
          <div className="max-h-52 overflow-y-auto border rounded-lg p-3 bg-gray-50 text-xs text-gray-700 space-y-1.5">
            <p><b>조인앤조인</b> (이하 "사업주")과 <b>{contract.worker_name}</b> (이하 "근로자")은 다음과 같이 근로계약을 체결한다.</p>
            <p><b>1. 근로계약기간:</b> {contract.contract_start} ~ {contract.contract_end}</p>
            <p><b>2. 근무 장소:</b> 경기도 안산시 단원구 신길동 1122</p>
            <p><b>3. 업무:</b> 제조, 포장 및 이에 부수하는 업무</p>
            <p><b>4. 근로시간:</b> 사업주가 결정하여 사전 통보</p>
            <p><b>5. 임금:</b> 관련 법령에 따름</p>
            <p><b>6. 기타:</b> 이 계약에 정함이 없는 사항은 근로기준법에 의한다.</p>
          </div>

          <div className="text-center text-sm text-gray-700 font-medium">
            {(() => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; })()}
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800">
            <p className="font-bold">(사업주) (주)조인앤조인</p>
            <p>대표자: 진해수</p>
          </div>

          <div className="space-y-3">
            <p className="font-bold text-sm">(근로자) {contract.worker_name}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">주소 <span className="text-red-500">*</span></label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="서울시..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">서명 <span className="text-red-500">*</span></label>
              <div className="border-2 border-gray-300 rounded-lg bg-white relative" style={{ touchAction: 'none' }}>
                <canvas ref={el => setSignatureRef(el)} width={320} height={150} className="w-full cursor-crosshair"
                  onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
                <button onClick={clearSignature} className="absolute top-1 right-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">지우기</button>
              </div>
            </div>
          </div>

          <button onClick={handleSign} disabled={submitting || !address.trim()}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:bg-gray-300 hover:bg-blue-700">
            {submitting ? "처리 중..." : "근로계약서 서명 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegularContractPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>}>
      <RegularContractContent />
    </Suspense>
  );
}
