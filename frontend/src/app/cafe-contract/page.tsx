"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle } from "lucide-react";
import {
  Button,
  Card,
  CenterSpinner,
  EmptyState,
  Field,
  Input,
  SectionHeader,
} from "@/components/ui";
import {
  formatResidentNumber,
  validateResidentNumber,
} from "@/lib/koreanValidation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function SignaturePad({
  canvasRef,
  label,
  onClear,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  label: string;
  onClear: () => void;
}) {
  const isDrawing = useRef(false);

  const getPos = (e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
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
    const ctx = canvas.getContext("2d");
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
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#222";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawing.current = false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [canvasRef]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-[var(--text-2)]">
          {label} <span className="text-[var(--danger-fg)]">*</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          지우기
        </Button>
      </div>
      <Card padding="none" tone="ghost" className="overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={120}
          className="w-full cursor-crosshair block bg-white"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </Card>
      <p className="text-[var(--fs-caption)] text-[var(--text-4)] mt-1">위 영역에 서명해주세요</p>
    </div>
  );
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;
  const ctx = blank.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, blank.width, blank.height);
  }
  return canvas.toDataURL() === blank.toDataURL();
}

function clearCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function CafeContractArticles({ c }: { c: any }) {
  const rate = Number(c.hourly_rate) || 0;
  return (
    <div className="space-y-3 text-[var(--fs-caption)] text-[var(--text-1)] leading-relaxed">
      <p className="text-center font-bold text-[var(--fs-body)] text-[var(--text-1)]">
        단시간 근로자 표준근로계약서
      </p>
      <p>
        <span className="font-semibold">(주)조인앤조인</span> (이하 &quot;사업주&quot;)과{" "}
        <span className="font-semibold text-[var(--brand-400)]">{c.worker_name}</span> (이하 &quot;근로자&quot;)은 다음과 같이 근로계약을 체결합니다.
      </p>

      <div className="border border-[var(--border-2)] rounded-[var(--r-md)] overflow-hidden">
        <table className="w-full text-[var(--fs-caption)]">
          <tbody>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)] w-1/3">계약기간</td>
              <td className="px-3 py-2 tabular">{c.contract_start} ~ {c.contract_end}</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">매장</td>
              <td className="px-3 py-2">널담은공간 {c.store_name}점</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">근무 장소</td>
              <td className="px-3 py-2">{c.store_address}</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">담당 업무</td>
              <td className="px-3 py-2">카페 매장 관리 (음료·디저트 제조, 고객 응대, 매장 청결 유지 등)</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">근무 시간</td>
              <td className="px-3 py-2 tabular">{c.work_time_start} ~ {c.work_time_end} (휴게시간 1시간 포함)</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">근무 일</td>
              <td className="px-3 py-2">{c.work_days}</td>
            </tr>
            <tr>
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">시급</td>
              <td className="px-3 py-2 tabular">{rate.toLocaleString()}원</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제1조 (근로계약기간)</p>
        <p>본 계약의 기간은 위 표에 기재된 계약기간으로 한다. 계약기간 만료 시 별도의 갱신 합의가 없는 한 본 계약은 자동 종료된다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제2조 (근무 장소 및 담당 업무)</p>
        <p>① 근무 장소: 널담은공간 {c.store_name}점 ({c.store_address})</p>
        <p>② 담당 업무: 카페 매장 관리 (음료·디저트 제조, 고객 응대, 매장 청결 유지, 매장 운영에 부수하는 업무)</p>
        <p>③ 사업주는 업무상 필요에 따라 같은 운영 지역 내 매장 간 근무 장소를 변경할 수 있으며, 사전에 근로자에게 통보한다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제3조 (근로시간 및 휴게시간)</p>
        <p>① 근로시간: {c.work_time_start} ~ {c.work_time_end}</p>
        <p>② 휴게시간: 1시간 (근로기준법 제54조에 따라 8시간 근로 시 1시간 부여)</p>
        <p>③ 근무일: {c.work_days}</p>
        <p>④ 매장 운영 일정에 따라 시급제 단시간 근로 형태로 운영하며, 사업주의 통보에 따라 출근한다.</p>
        <p>⑤ 연장·야간·휴일근로가 발생할 경우 근로기준법에 따른 가산수당을 지급한다. 단, 4주 평균 1주 소정근로시간이 15시간 미만인 경우에는 가산수당을 적용하지 아니한다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제4조 (임금)</p>
        <p>① 시급: <span className="tabular font-semibold">{rate.toLocaleString()}원</span></p>
        <p>② 임금은 실제 근로한 시간(휴게시간 제외)을 기준으로 산정한다.</p>
        <p>③ 임금지급일: 매월 15일</p>
        <p>④ 지급방법: 근로자 명의 예금통장에 입금</p>
        <p>⑤ 상기 임금은 4대보험 및 소득세 등 관련 법령에 따른 공제 전 금액이다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제5조 (근로시간 기록)</p>
        <p>근로자는 매 근무 시작 및 종료 시 출퇴근 시간을 기록한다. 기록이 없는 경우 사업주가 기록한 근로시간을 기준으로 임금을 산정한다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제6조 (위생 및 안전)</p>
        <p>① 근로자는 식품위생법 등 관련 법령과 매장 위생 수칙을 준수한다.</p>
        <p>② 근로자는 매장 입사 후 위생 교육을 수료하여야 한다.</p>
        <p>③ 사업주는 산업안전보건법에 따라 근로자의 안전·보건을 위한 필요한 조치를 취한다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제7조 (계약의 해지)</p>
        <p>① 근로자가 정당한 사유 없이 출근하지 아니하거나, 매장 운영·위생·안전 수칙을 반복하여 위반한 경우 사업주는 본 계약을 해지할 수 있다.</p>
        <p>② 근로자의 귀책사유로 매장에 중대한 손해를 끼친 경우 사업주는 본 계약을 즉시 해지할 수 있다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제8조 (비밀유지)</p>
        <p>근로자는 재직 중 및 퇴직 후에도 업무상 알게 된 회사의 영업비밀, 레시피, 거래처 정보, 고객정보 등을 제3자에게 누설하여서는 아니 된다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제9조 (기타)</p>
        <p>① 본 계약에 정함이 없는 사항은 근로기준법, 최저임금법 등 관련 노동 법령에 따른다.</p>
        <p>② 본 계약서는 전자(디지털)로 작성하여 사업주와 근로자가 각 보관한다.</p>
      </div>
    </div>
  );
}

function ConsentText({ name }: { name: string }) {
  return (
    <div className="text-[var(--fs-caption)] text-[var(--text-2)] leading-relaxed space-y-2">
      <p className="font-semibold text-[var(--text-1)] text-[var(--fs-body)] text-center">
        개인정보 수집·이용 및 매장 운영 동의서
      </p>
      <p>
        <span className="font-semibold">{name}</span>님은 근로계약 체결 및 카페 매장 운영 목적으로 (주)조인앤조인이 아래와 같이 개인정보를 수집·이용하고 매장 운영 사항에 동의하는 것에 동의합니다.
      </p>
      <div className="border border-[var(--border-2)] rounded-[var(--r-md)] overflow-hidden">
        <table className="w-full text-[var(--fs-caption)]">
          <tbody>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)] w-1/3">수집 항목</td>
              <td className="px-3 py-2">성명, 생년월일, 주소, 주민등록번호, 연락처, 서명</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">수집 목적</td>
              <td className="px-3 py-2">근로계약 체결, 급여 지급, 4대보험 신고, 세금 신고</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">보유 기간</td>
              <td className="px-3 py-2">근로관계 종료 후 5년 (관련 법령에 따름)</td>
            </tr>
            <tr>
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">제3자 제공</td>
              <td className="px-3 py-2">4대보험 공단, 국세청 등 법령에 의한 경우에 한함</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pt-2 space-y-2">
        <p className="font-semibold text-[var(--text-1)]">카페 매장 운영 추가 동의 사항</p>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <b>CCTV 영상 수집·이용 동의</b> — 매장 내 CCTV를 통해 영상이 촬영·저장될 수 있으며, 매장 보안·도난 방지·근로자 안전 확보 목적으로 이용됨에 동의합니다. (보유기간 30일, 사고 발생 시 사고 조사 종료 시까지)
          </li>
          <li>
            <b>위생 교육 수료 의무 동의</b> — 입사 후 식품위생법에 따른 위생 교육을 수료할 의무가 있으며, 미수료 시 매장 근무가 제한될 수 있음에 동의합니다.
          </li>
          <li>
            <b>알레르기 사고 책임 한정 동의</b> — 고객에게 메뉴 제공 시 사업주가 사전에 안내한 알레르기 표시·고지 절차를 준수해야 하며, 절차 미준수로 발생한 사고에 대해서는 근로자가 1차 책임을 진다는 점에 동의합니다.
          </li>
          <li>
            <b>매장 SNS·홍보 사진 노출 동의</b> — 매장 운영·홍보 목적으로 매장 내 활동 사진·영상이 회사 공식 SNS·홍보물에 사용될 수 있음에 동의합니다. 동의 철회 의사가 있을 경우 서면으로 요청 시 즉시 반영됩니다.
          </li>
        </ol>
      </div>

      <p className="text-[var(--text-3)]">※ 위 개인정보 수집·이용 및 매장 운영 추가 동의에 동의하지 않을 권리가 있으나, 동의하지 않을 경우 근로계약 체결이 불가합니다.</p>
    </div>
  );
}

function CafeContractContent() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [address, setAddress] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const contractSigRef = useRef<HTMLCanvasElement>(null);
  const consentSigRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!token) {
      setError("유효하지 않은 링크입니다.");
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/cafe-contract-public/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `계약서를 불러올 수 없습니다. (HTTP ${r.status})`);
        }
        return r.json();
      })
      .then((d) => setContract(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSign = async () => {
    if (!birthDate.trim()) return alert("생년월일을 입력해주세요.");
    if (!address.trim()) return alert("주소를 입력해주세요.");
    if (!idNumber.trim()) return alert("주민등록번호를 입력해주세요.");
    const idRes = validateResidentNumber(idNumber);
    if (!idRes.valid) return alert(`주민등록번호 오류: ${idRes.error}`);

    const cSig = contractSigRef.current;
    const sSig = consentSigRef.current;
    if (!cSig || !sSig) return;
    if (isCanvasBlank(cSig)) return alert("근로계약서 서명을 해주세요.");
    if (isCanvasBlank(sSig)) return alert("개인정보 동의서 서명을 해주세요.");

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/cafe-contract-public/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          birth_date: birthDate.trim(),
          id_number: idNumber.trim(),
          signature_data: cSig.toDataURL(),
          consent_signature_data: sSig.toDataURL(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      alert("근로계약서가 체결되었습니다. 확인 문자가 발송됩니다.");
      setContract({
        ...contract,
        status: "signed",
        birth_date: birthDate.trim(),
        address: address.trim(),
        id_number: idNumber.trim(),
        signature_data: cSig.toDataURL(),
        consent_signature_data: sSig.toDataURL(),
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <CenterSpinner />
      </div>
    );

  if (error || !contract)
    return (
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

  if (contract.status === "signed") {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] py-8 px-4 fade-in">
        <div className="max-w-2xl mx-auto">
          <Card padding="none" tone="default" className="shadow-[var(--elev-3)] overflow-hidden surface-bevel">
            <div
              className="border-b border-[var(--success-border)] text-white px-6 py-5 text-center"
              style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)" }}
            >
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <h1 className="text-[var(--fs-lg)] font-bold">근로계약서 체결 완료</h1>
              <p className="text-green-200 text-eyebrow mt-1">전자문서 · (주)조인앤조인 카페팀</p>
            </div>

            <div className="px-6 py-6 space-y-5 text-[var(--fs-body)] text-[var(--text-1)]">
              <CafeContractArticles c={contract} />

              <div className="border-t border-[var(--border-1)] pt-4 space-y-2">
                <p className="text-center text-[var(--fs-caption)] text-[var(--text-3)]">
                  {(() => {
                    const d = new Date();
                    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
                  })()}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[var(--info-bg)] rounded-[var(--r-md)] p-3 border border-[var(--info-border)]">
                    <p className="font-bold text-[var(--info-fg)] text-[var(--fs-caption)] mb-1">(사업주)</p>
                    <p className="text-[var(--fs-caption)]">사업체명: (주)조인앤조인</p>
                    <p className="text-[var(--fs-caption)]">주소: 전북특별자치도 전주시 덕진구 기린대로 458</p>
                    <p className="text-[var(--fs-caption)]">대표자: 진해수 (인)</p>
                  </div>
                  <div className="bg-[var(--success-bg)] rounded-[var(--r-md)] p-3 border border-[var(--success-border)]">
                    <p className="font-bold text-[var(--success-fg)] text-[var(--fs-caption)] mb-1">(근로자)</p>
                    <p className="text-[var(--fs-caption)]">
                      성명: <b>{contract.worker_name}</b>
                    </p>
                    {contract.birth_date && (
                      <p className="text-[var(--fs-caption)]">생년월일: {contract.birth_date}</p>
                    )}
                    {contract.address && (
                      <p className="text-[var(--fs-caption)]">주소: {contract.address}</p>
                    )}
                    <p className="text-[var(--fs-caption)]">연락처: {contract.phone}</p>
                    {contract.signature_data && (
                      <div className="mt-2">
                        <p className="text-[var(--fs-caption)] text-[var(--text-3)] mb-1">서명:</p>
                        <div className="bg-white rounded-[var(--r-sm)] border p-1 inline-block">
                          <img src={contract.signature_data} alt="서명" className="max-h-16" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border-1)] pt-4 space-y-3">
                <ConsentText name={contract.worker_name} />
                <div className="bg-[var(--bg-0)] rounded-[var(--r-md)] p-3 border border-[var(--border-2)]">
                  <p className="text-[var(--fs-caption)] font-medium text-[var(--text-2)] mb-1">동의자 서명:</p>
                  <p className="text-[var(--fs-caption)]">성명: {contract.worker_name}</p>
                  {contract.consent_signature_data && (
                    <div className="mt-2">
                      <div className="bg-white rounded-[var(--r-sm)] border p-1 inline-block">
                        <img src={contract.consent_signature_data} alt="동의서명" className="max-h-16" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-center text-[var(--fs-caption)] text-[var(--text-4)] pt-2">
                본 계약서는 전자적으로 작성되었으며 법적 효력을 가집니다.
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] py-6 px-4 fade-in">
      <div className="max-w-lg mx-auto space-y-4">
        <Card
          padding="md"
          tone="default"
          className="text-center surface-bevel"
          style={{ background: "linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)" }}
        >
          <h1 className="text-[var(--fs-lg)] font-bold text-white">널담은공간 {contract.store_name}점 근로계약</h1>
          <p className="text-[var(--brand-200)] text-[var(--fs-body)] mt-1">
            {contract.worker_name}님, 아래 내용을 확인하고 서명해주세요.
          </p>
        </Card>

        {/* Contract text */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
          <SectionHeader eyebrow="근로계약서" title="계약서 본문" />
          <div className="max-h-72 overflow-y-auto border border-[var(--border-2)] rounded-[var(--r-md)] p-3 bg-[var(--bg-0)]">
            <CafeContractArticles c={contract} />
          </div>
        </Card>

        {/* Date + parties */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)] space-y-3">
          <p className="text-center text-[var(--fs-body)] text-[var(--text-2)] font-medium">
            {(() => {
              const d = new Date();
              return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
            })()}
          </p>

          <div className="bg-[var(--info-bg)] rounded-[var(--r-md)] p-3 text-[var(--fs-caption)] text-[var(--info-fg)] border border-[var(--info-border)]">
            <p className="font-bold">(사업주) (주)조인앤조인</p>
            <p>주소: 전북특별자치도 전주시 덕진구 기린대로 458</p>
            <p>대표자: 진해수 (인)</p>
          </div>

          <div className="space-y-3">
            <p className="font-bold text-[var(--fs-body)] text-[var(--text-1)]">
              (근로자) {contract.worker_name}
            </p>

            <Field label="생년월일" required>
              <Input type="date" inputSize="md" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>

            <Field label="주소" required>
              <Input
                type="text"
                inputSize="md"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 서울 용산구 ..."
              />
            </Field>

            <Field
              label="주민등록번호"
              required
              hint={(() => {
                if (!idNumber) return "4대보험 신고 목적으로만 사용됩니다.";
                const r = validateResidentNumber(idNumber);
                return r.valid ? "✓ 유효" : r.error;
              })()}
            >
              <Input
                type="text"
                inputSize="md"
                value={idNumber}
                onChange={(e) => setIdNumber(formatResidentNumber(e.target.value))}
                placeholder="000000-0000000"
                inputMode="numeric"
                maxLength={14}
              />
            </Field>

            <SignaturePad
              canvasRef={contractSigRef}
              label="근로계약서 서명"
              onClear={() => clearCanvas(contractSigRef)}
            />
          </div>
        </Card>

        {/* Consent */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)] space-y-3">
          <SectionHeader eyebrow="동의서" title="개인정보 수집·이용 및 매장 운영 동의" />
          <div className="max-h-72 overflow-y-auto border border-[var(--border-2)] rounded-[var(--r-md)] p-3 bg-[var(--bg-0)]">
            <ConsentText name={contract.worker_name} />
          </div>
          <SignaturePad
            canvasRef={consentSigRef}
            label="동의서 서명"
            onClear={() => clearCanvas(consentSigRef)}
          />
        </Card>

        <Button variant="primary" size="lg" loading={submitting} onClick={handleSign} className="w-full">
          계약서 체결 / 동의 제출
        </Button>
      </div>
    </div>
  );
}

export default function CafeContractPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
          <CenterSpinner />
        </div>
      }
    >
      <CafeContractContent />
    </Suspense>
  );
}
