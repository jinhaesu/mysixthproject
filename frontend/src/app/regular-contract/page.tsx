"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Button, Card, CardHeader, CenterSpinner, EmptyState, Field, Input, Modal, SectionHeader, SegmentedControl, useToast } from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { FilePreview } from "@/components/FilePreview";

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
    ctx.strokeStyle = '#222';
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

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
      <Card padding="none" tone="ghost" className="overflow-hidden" style={{ touchAction: 'none' }}>
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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  const ctx = blank.getContext('2d');
  if (ctx) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, blank.width, blank.height); }
  return canvas.toDataURL() === blank.toDataURL();
}

function clearCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function ContractArticles({ c }: { c: any }) {
  const kind: 'production' | 'cafe' = c.contract_kind === 'cafe' ? 'cafe' : 'production';
  const isCafe = kind === 'cafe';

  // Cafe defaults — 카페 정규직 3인(황금빛/신아름누리/전서현) 계약서 문구.
  // 매장별 근무장소는 백엔드 send 시점에 이미 department → 주소로 매핑되어 c.work_place 에 저장.
  const workPlace = c.work_place || (isCafe
    ? '널담은공간 매장'
    : '전북특별자치도 전주시 덕진구 기린대로 458');
  const workDuties = c.work_duties || (isCafe
    ? '카페 매장 운영, 음료·베이커리 제조 및 판매, 매장 청결·재고 관리 및 이에 부수하는 업무'
    : '제조, 포장 및 이에 부수하는 업무');
  const workHours = c.work_hours || (isCafe
    ? '매장 영업 스케줄에 따라 부여 (1일 8시간, 주 40시간 기준)'
    : '09:00 ~ 18:00');
  const breakTime = c.break_time || (isCafe
    ? '근로기준법 제54조에 따른 휴게시간 (매장 스케줄에 따라 부여)'
    : '1시간 (점심)');
  const workDays = c.work_days || (isCafe
    ? '주 5일 (매장 스케줄에 따른 로테이션)'
    : '월요일 ~ 금요일');
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
    <div className="space-y-3 text-[var(--fs-caption)] text-[var(--text-1)] leading-relaxed">
      <p className="text-center font-bold text-[var(--fs-body)] text-[var(--text-1)]">근 로 계 약 서</p>
      <p>
        <span className="font-semibold">(주)조인앤조인</span> (이하 &quot;사업주&quot;)과{' '}
        <span className="font-semibold text-[var(--brand-400)]">{c.worker_name}</span> (이하 &quot;근로자&quot;)은 다음과 같이 근로계약을 체결합니다.
      </p>

      <div className="border border-[var(--border-2)] rounded-[var(--r-md)] overflow-hidden">
        <table className="w-full text-[var(--fs-caption)]">
          <tbody>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)] w-1/3">근로 개시일</td>
              <td className="px-3 py-2 tabular">{workStartDate}</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">근무부서 / 직책</td>
              <td className="px-3 py-2">{department} / {positionTitle}</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">근무 장소</td>
              <td className="px-3 py-2">{workPlace}</td>
            </tr>
            <tr className="border-b border-[var(--border-1)]">
              <td className="bg-[var(--bg-0)] px-3 py-2 font-medium text-[var(--text-3)]">담당 업무</td>
              <td className="px-3 py-2">{workDuties}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제1조 (근로계약기간)</p>
        <p>근로계약기간은 근로 개시일({workStartDate})부터 정함이 없는 기간으로 합니다. 단, 수습기간은 입사일로부터 3개월로 하며, 수습기간 중 업무능력 및 적합성이 부족하다고 판단될 경우 사업주는 본 계약을 해지할 수 있습니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제2조 (근무 장소 및 담당 업무)</p>
        <p>① 근무 장소: {workPlace}</p>
        <p>② 담당 업무: {workDuties}</p>
        <p>③ 사업주는 업무상 필요에 따라 근무 장소 및 담당 업무를 변경할 수 있으며, 근로자는 정당한 이유 없이 이를 거부할 수 없습니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제3조 (근로시간 및 휴게시간)</p>
        <p>① 근로시간: {workHours} (1일 8시간, 주 40시간 기준)</p>
        <p>② 휴게시간: {breakTime}</p>
        <p>③ 근무일: {workDays}</p>
        <p>④ 업무 필요에 따라 연장·야간·휴일 근로가 발생할 수 있으며, 이 경우 근로기준법에 따른 가산수당을 지급합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제4조 (임금)</p>
        <p>① 연봉총액: {annualSalary ? <span className="tabular">{annualSalary} 원</span> : '별도 협의'}</p>
        <p>② 월 급여 구성</p>
        <div className="ml-3 space-y-0.5">
          {basePay && <p>- 기본급: <span className="tabular">{basePay} 원</span></p>}
          {mealAllowance && <p>- 식대: <span className="tabular">{mealAllowance} 원</span></p>}
          {otherAllowance && <p>- 기타수당: <span className="tabular">{otherAllowance} 원</span></p>}
        </div>
        <p>③ 급여일: 매월 {payDay}일 ({payMethod})</p>
        <p>④ 상기 임금은 4대보험 및 소득세 등 관련 법령에 따른 공제 전 금액입니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제5조 (휴일 및 휴가)</p>
        <p>① 주휴일: 일요일 (1주 소정근로일 개근 시)</p>
        <p>② 연차유급휴가: 근로기준법 제60조에 따라 부여합니다.</p>
        <p>③ 법정 공휴일은 근로기준법 및 관련 규정에 따릅니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제6조 (4대보험)</p>
        <p>사업주와 근로자는 국민연금, 건강보험, 고용보험, 산재보험에 관련 법령에 따라 가입합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제7조 (복무 및 취업규칙 준수)</p>
        <p>근로자는 회사의 취업규칙, 인사규정 및 기타 사규를 성실히 준수하여야 하며, 사업주의 정당한 업무 지시에 따라야 합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제8조 (비밀유지 의무)</p>
        <p>근로자는 재직 중은 물론 퇴직 후에도 업무상 취득한 회사의 영업비밀, 고객정보, 기술정보 등 일체의 기밀을 제3자에게 누설하거나 회사 이외의 목적으로 사용하여서는 안 됩니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제9조 (겸업금지)</p>
        <p>근로자는 사업주의 사전 서면 동의 없이 경쟁 관계에 있는 타 업체에 취업하거나 사업을 영위할 수 없습니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제10조 (징계 및 해고)</p>
        <p>근로자가 취업규칙 또는 이 계약을 위반하거나 회사에 현저한 손해를 끼친 경우 취업규칙이 정하는 바에 따라 징계 또는 해고할 수 있습니다. 해고 시에는 근로기준법이 정한 절차를 따릅니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제11조 (퇴직)</p>
        <p>근로자가 퇴직하고자 할 때에는 퇴직 희망일 30일 전에 사업주에게 서면으로 통보하여야 합니다. 퇴직금은 근로자퇴직급여보장법에 따라 지급합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제12조 (손해배상)</p>
        <p>근로자가 고의 또는 중대한 과실로 회사에 손해를 입힌 경우 그 손해를 배상하여야 합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제13조 (안전 및 보건)</p>
        <p>사업주는 산업안전보건법에 따라 근로자의 안전·보건을 위한 필요한 조치를 취하며, 근로자는 이에 적극 협조하여야 합니다.</p>
      </div>

      <div>
        <p className="font-semibold text-[var(--text-1)] mb-1">제14조 (기타)</p>
        <p>본 계약서에 명시되지 않은 사항은 근로기준법, 최저임금법 등 관련 노동 법령 및 회사 취업규칙에 따릅니다.</p>
      </div>
    </div>
  );
}

function ConsentText({ name }: { name: string }) {
  return (
    <div className="text-[var(--fs-caption)] text-[var(--text-2)] leading-relaxed space-y-2">
      <p className="font-semibold text-[var(--text-1)] text-[var(--fs-body)] text-center">개인정보 수집·이용 동의서</p>
      <p>
        <span className="font-semibold">{name}</span>님은 근로계약 체결 및 인사관리 목적으로 (주)조인앤조인이 아래와 같이 개인정보를 수집·이용하는 것에 동의합니다.
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
      <p className="text-[var(--text-3)]">※ 위 개인정보 수집·이용에 동의하지 않을 권리가 있으나, 동의하지 않을 경우 근로계약 체결이 불가합니다.</p>
    </div>
  );
}

// ── Info-only form (DEPRECATED — moved to /onboarding-info page) ──────
function _UnusedOnboardingFixForm({ contract, token }: { contract: any; token: string }) {
  const [email, setEmail] = useState(contract.email || "");
  const [address, setAddress] = useState(contract.address || "");
  const [idNumber, setIdNumber] = useState(contract.id_number || "");
  const [birthDate, setBirthDate] = useState(contract.birth_date || "");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [nationality, setNationality] = useState<"KR" | "FOREIGN">((contract.nationality as any) || "KR");
  const [visaType, setVisaType] = useState(contract.visa_type || "");
  const [visaExpiry, setVisaExpiry] = useState(contract.visa_expiry || "");
  const [bankSlipFile, setBankSlipFile] = useState<string>(contract.bank_slip_data || "");
  const [foreignIdFile, setForeignIdFile] = useState<string>(contract.foreign_id_card_data || "");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const body: any = {};
      if (email) body.email = email;
      if (address) body.address = address;
      if (idNumber) body.id_number = idNumber;
      if (birthDate) body.birth_date = birthDate;
      if (bankName) body.bank_name = bankName;
      if (bankAccount) body.bank_account = bankAccount;
      body.nationality = nationality;
      if (nationality === "FOREIGN") {
        if (visaType) body.visa_type = visaType;
        if (visaExpiry) body.visa_expiry = visaExpiry;
        if (foreignIdFile) body.foreign_id_card_data = foreignIdFile;
      }
      if (bankSlipFile) body.bank_slip_data = bankSlipFile;

      const r = await fetch(`${API_URL}/api/regular-public/contract/${token}/update-info`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'HTTP ' + r.status);
      setDone(true);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center px-4">
        <Card padding="lg" className="max-w-md w-full text-center">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-[var(--success-fg)]" />
          <h1 className="text-[18px] font-semibold mb-2">제출 완료</h1>
          <p className="text-[var(--text-3)] text-[13px]">입력하신 정보가 회사에 자동 전달되었습니다. 4대보험 신고에 활용됩니다.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] py-8 px-4 fade-in">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card padding="none" tone="default" className="shadow-[var(--elev-2)] overflow-hidden surface-bevel">
          <div className="border-b border-[var(--info-border)] bg-[var(--info-bg)] px-6 py-4">
            <h1 className="text-[var(--fs-lg)] font-bold text-[var(--info-fg)]">추가 정보 입력</h1>
            <p className="text-[var(--fs-caption)] text-[var(--text-2)] mt-1">
              {contract.worker_name} 님, 4대보험 신고에 필요한 추가 정보만 입력해주세요. <b>이미 서명한 근로계약은 그대로 유지됩니다.</b>
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">
            {error && <div className="bg-[var(--danger-bg)] text-[var(--danger-fg)] border border-[var(--danger-border)] rounded-md p-3 text-[12.5px]">{error}</div>}

            <Field label="이메일 *" hint="회사 통지·증빙 발송용">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
            </Field>

            <Field label="주소" hint="현 거주지">
              <Input value={address} onChange={e => setAddress(e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="주민등록번호">
                <Input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="000000-0000000" />
              </Field>
              <Field label="생년월일">
                <Input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="은행명">
                <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="국민/신한/카카오 등" />
              </Field>
              <Field label="계좌번호">
                <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} />
              </Field>
            </div>

            <Field label="통장사본 첨부 *" hint="급여 입금 확인용 (이미지/PDF)">
              <div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px]">
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    setBankSlipFile(await fileToBase64(f));
                  }} />
                  파일 선택
                </label>
                {bankSlipFile && (
                  <div className="mt-2 text-[11.5px] text-[var(--success-fg)]">✓ 파일 업로드됨 ({Math.round(bankSlipFile.length / 1024)} KB)</div>
                )}
              </div>
            </Field>

            <Field label="국적">
              <SegmentedControl
                value={nationality}
                onChange={(v) => setNationality(v as "KR" | "FOREIGN")}
                options={[{ value: "KR", label: "한국" }, { value: "FOREIGN", label: "외국인" }]}
              />
            </Field>

            {nationality === "FOREIGN" && (
              <div className="space-y-3 p-3 rounded-md bg-[var(--info-bg)] border border-[var(--info-border)]">
                <Field label="비자 종류 *">
                  <Input value={visaType} onChange={e => setVisaType(e.target.value)} placeholder="E-9, F-4, F-5 등" />
                </Field>
                <Field label="비자 만료일 *">
                  <Input type="date" value={visaExpiry} onChange={e => setVisaExpiry(e.target.value)} />
                </Field>
                <Field label="외국인등록증 사본 *">
                  <div>
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px]">
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setForeignIdFile(await fileToBase64(f));
                      }} />
                      파일 선택
                    </label>
                    {foreignIdFile && (
                      <div className="mt-2 text-[11.5px] text-[var(--success-fg)]">✓ 파일 업로드됨 ({Math.round(foreignIdFile.length / 1024)} KB)</div>
                    )}
                  </div>
                </Field>
              </div>
            )}

            <Button variant="primary" size="lg" loading={submitting} onClick={submit} className="w-full">
              제출
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── CAFE branch (contract_kind='cafe') ─────────────────────────────────
// 백엔드가 완성된 근로계약서 HTML(도장/서명 placeholder 포함)을 내려주면
// 프런트는 .cf-stamp / .cf-consent 요소에 클릭 서명 UX만 붙인다.
// 11개 필수 도장 키 — 백엔드 /sign 밸리데이션과 1:1로 맞춰야 함.
const STAMP_KEYS = [
  "stamp_art3",
  "stamp_art4",
  "stamp_art5",
  "stamp_art6",
  "stamp_art8",
  "stamp_art9",
  "stamp_art11",
  "stamp_contract",
  "stamp_salary_art2",
  "stamp_salary",
  "stamp_rulebook",
] as const;

const STAMP_LABELS: Record<string, string> = {
  stamp_art3: "제3조",
  stamp_art4: "제4조",
  stamp_art5: "제5조",
  stamp_art6: "제6조",
  stamp_art8: "제8조",
  stamp_art9: "제9조",
  stamp_art11: "제11조",
  stamp_contract: "근로계약서 서명",
  stamp_salary_art2: "연봉계약서 제2조",
  stamp_salary: "연봉계약서 서명",
  stamp_rulebook: "취업규칙 확인",
};

function stampLabel(key: string): string {
  if (STAMP_LABELS[key]) return STAMP_LABELS[key];
  if (key.endsWith("_consent")) {
    const base = key.slice(0, -"_consent".length);
    return `${STAMP_LABELS[base] || base} 동의`;
  }
  return key;
}

// 서명 확정 시 placeholder(.cf-stamp/.cf-consent) innerHTML을 서명 미리보기 이미지로 교체.
// 자리표시자 자체의 border-radius를 그대로 물려받는다.
function paintCafeSignature(container: HTMLElement, key: string, dataUrl: string) {
  const el = container.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
  if (!el) return;
  const radius = getComputedStyle(el).borderRadius;
  el.innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:6px;">` +
    `<img src="${dataUrl}" alt="서명" style="max-height:40px;border-radius:${radius};display:block;" />` +
    `<a href="#" class="cf-resign-link" data-key="${key}" style="font-size:11px;color:var(--brand-400);text-decoration:underline;white-space:nowrap;">재서명</a>` +
    `</span>`;
}

function CafeStampModal({
  open,
  keyName,
  isConsent,
  defaultName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  keyName: string;
  isConsent: boolean;
  defaultName: string;
  onClose: () => void;
  onConfirm: (dataUrl: string, name: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState(defaultName);
  const toast = useToast();

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || isCanvasBlank(canvas)) {
      toast.error("서명을 입력해주세요.");
      return;
    }
    if (isConsent && !name.trim()) {
      toast.error("성명을 입력해주세요.");
      return;
    }
    onConfirm(canvas.toDataURL(), name.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stampLabel(keyName)}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={confirm}>확인</Button>
        </>
      }
    >
      <div className="space-y-3">
        {isConsent && (
          <Field label="성명" required hint="본인 확인을 위해 성명을 입력해주세요.">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <SignaturePad
          canvasRef={canvasRef}
          label="서명"
          onClear={() => clearCanvas(canvasRef)}
        />
      </div>
    </Modal>
  );
}

function CafeContractView({
  contract,
  token,
  html,
  initialSignatures,
  viewOnly,
}: {
  contract: any;
  token: string;
  html: string;
  initialSignatures: Record<string, string>;
  viewOnly: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [address, setAddress] = useState(contract.address || "");
  const [birthDate, setBirthDate] = useState(contract.birth_date || "");
  const [idNumber, setIdNumber] = useState(contract.id_number || "");
  const [email, setEmail] = useState(contract.email || "");

  const [signatures, setSignatures] = useState<Record<string, string>>({});
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [modalIsConsent, setModalIsConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // 열람 모드: 백엔드가 이미 인라인한 서명이 없을 경우를 대비한 방어적 인라인 처리.
  useEffect(() => {
    if (!viewOnly) return;
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll<HTMLElement>(".cf-stamp-signed[data-key]");
    nodes.forEach((el) => {
      if (el.querySelector("img")) return; // 이미 백엔드가 인라인한 경우
      const key = el.dataset.key;
      if (!key) return;
      const dataUrl = initialSignatures[key];
      if (!dataUrl) return;
      const radius = getComputedStyle(el).borderRadius;
      el.innerHTML = `<img src="${dataUrl}" alt="서명" style="max-height:40px;border-radius:${radius};display:block;" />`;
    });
  }, [viewOnly, html, initialSignatures]);

  // 이벤트 위임: 컨테이너 하나에만 클릭 리스너를 붙이고 .cf-stamp/.cf-consent/.cf-resign-link 를 closest() 로 판별.
  // (동적으로 dangerouslySetInnerHTML 주입된 하위 요소마다 개별 리스너를 붙이지 않음)
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (viewOnly) return;
    const target = e.target as HTMLElement;

    const resign = target.closest(".cf-resign-link") as HTMLElement | null;
    if (resign) {
      e.preventDefault();
      const parent = resign.closest(".cf-stamp[data-key], .cf-consent[data-key]") as HTMLElement | null;
      if (parent?.dataset.key) {
        setModalIsConsent(parent.classList.contains("cf-consent"));
        setModalKey(parent.dataset.key);
      }
      return;
    }

    const stampEl = target.closest(".cf-stamp[data-key], .cf-consent[data-key]") as HTMLElement | null;
    if (!stampEl?.dataset.key) return;
    setModalIsConsent(stampEl.classList.contains("cf-consent"));
    setModalKey(stampEl.dataset.key);
  };

  const closeModal = () => setModalKey(null);

  const confirmModal = (dataUrl: string) => {
    if (!modalKey) return;
    setSignatures((prev) => ({ ...prev, [modalKey]: dataUrl }));
    if (containerRef.current) paintCafeSignature(containerRef.current, modalKey, dataUrl);
    setModalKey(null);
  };

  const canSubmit =
    STAMP_KEYS.every((k) => !!signatures[k]) && !!address.trim() && !!birthDate.trim();

  const handleSubmit = async () => {
    const missingKey = STAMP_KEYS.find((k) => !signatures[k]);
    if (missingKey) {
      const el = containerRef.current?.querySelector(`[data-key="${CSS.escape(missingKey)}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      toast.error(`${stampLabel(missingKey)} 서명이 빠졌습니다`);
      return;
    }
    if (!address.trim()) { toast.error("주소를 입력해주세요."); return; }
    if (!birthDate.trim()) { toast.error("생년월일을 입력해주세요."); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/regular-public/contract/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          birth_date: birthDate.trim(),
          id_number: idNumber.trim() || undefined,
          email: email.trim() || undefined,
          signature_data: signatures["stamp_contract"],
          consent_signature_data: signatures["stamp_art3_consent"] || signatures["stamp_art3"],
          consent_signed: 1,
          signatures,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(body.missing) && body.missing.length) {
          toast.error(`서명이 누락되었습니다: ${body.missing.map(stampLabel).join(", ")}`);
        } else {
          toast.error(body.error || "제출에 실패했습니다.");
        }
        return;
      }
      setSubmitted(true);
    } catch (e: any) {
      toast.error(e.message || "제출 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] flex items-center justify-center px-4 py-10 fade-in">
        <Card padding="lg" className="max-w-md w-full text-center space-y-4 shadow-[var(--elev-2)]">
          <CheckCircle className="w-10 h-10 mx-auto text-[var(--success-fg)]" />
          <div>
            <h1 className="text-[18px] font-semibold text-[var(--text-1)]">근로계약서 제출 완료</h1>
            <p className="text-[13px] text-[var(--text-3)] mt-1">
              {contract.worker_name}님, 계약서 제출이 정상적으로 완료되었습니다.
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="secondary" className="w-full" onClick={() => router.push("/rulebook")}>
              취업규칙 다시 보기
            </Button>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => router.push(`/regular-contract?token=${encodeURIComponent(token)}&mode=view`)}
            >
              제출한 계약서 보기
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] py-6 px-4 fade-in">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card padding="md" tone="default" className="text-center surface-bevel"
              style={{ background: 'linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)' }}>
          <h1 className="text-[var(--fs-lg)] font-bold text-white">
            {viewOnly ? "근로계약서 열람" : "카페 근로계약서 서명"}
          </h1>
          <p className="text-[var(--brand-200)] text-[var(--fs-body)] mt-1">
            {viewOnly
              ? `${contract.worker_name}님이 서명한 계약서입니다.`
              : `${contract.worker_name}님, 각 조항의 서명란을 눌러 서명해주세요.`}
          </p>
        </Card>

        <Card padding="md" tone="default" className="shadow-[var(--elev-1)] space-y-3">
          <SectionHeader eyebrow="근로자 정보" title="정보 확인" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="성명">
              <Input value={contract.worker_name || ""} readOnly disabled inputSize="md" />
            </Field>
            <Field label="연락처">
              <Input value={contract.phone || ""} readOnly disabled inputSize="md" />
            </Field>
          </div>
          <Field label="생년월일" required={!viewOnly}>
            <Input
              type="date"
              inputSize="md"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              disabled={viewOnly}
            />
          </Field>
          <Field label="주소" required={!viewOnly}>
            <Input
              inputSize="md"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예: 전북 전주시 덕진구 ..."
              disabled={viewOnly}
            />
          </Field>
          <Field label="신분증번호(주민등록번호)" hint="4대보험 신고 목적으로만 사용됩니다.">
            <Input
              inputSize="md"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="000000-0000000"
              disabled={viewOnly}
            />
          </Field>
          <Field label="이메일 (선택)">
            <Input
              type="email"
              inputSize="md"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              disabled={viewOnly}
            />
          </Field>
        </Card>

        <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
          <SectionHeader
            eyebrow="근로계약서"
            title={viewOnly ? "계약서 본문" : "계약서 본문 — 각 조항의 서명란을 눌러 서명"}
          />
          <div
            ref={containerRef}
            onClick={handleContainerClick}
            className="cf-html-container text-[13px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>

        {!viewOnly && (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              loading={submitting}
              disabled={submitting || !canSubmit}
              className="w-full"
            >
              {submitting ? "제출 중..." : "계약서 제출"}
            </Button>
            <p className="text-center text-[var(--fs-caption)] text-[var(--text-4)] pb-4">
              본 계약서에 서명함으로써 위 내용에 동의하는 것으로 간주됩니다.
            </p>
          </>
        )}
      </div>

      <CafeStampModal
        open={!!modalKey}
        keyName={modalKey || ""}
        isConsent={modalIsConsent}
        defaultName={contract.worker_name || ""}
        onClose={closeModal}
        onConfirm={confirmModal}
      />
    </div>
  );
}

function RegularContractContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const mode = searchParams.get("mode") || "";  // "onboarding-fix" = info-only mode for already-signed contracts

  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");

  // Additional onboarding fields
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState<"KR" | "FOREIGN">("KR");
  const [visaType, setVisaType] = useState("");
  const [visaExpiry, setVisaExpiry] = useState("");
  const [bankSlipFile, setBankSlipFile] = useState<string>("");
  const [foreignIdFile, setForeignIdFile] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);

  const contractSigRef = useRef<HTMLCanvasElement>(null);
  const consentSigRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); setLoading(false); return; }
    fetch(`${API_URL}/api/regular-public/contract/${token}`)
      .then(async r => {
        if (!r.ok) {
          // 백엔드의 실제 에러 메시지 노출 (이전: 일괄 '계약서를 찾을 수 없습니다.' 덮어쓰기)
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `계약서를 찾을 수 없습니다. (HTTP ${r.status})`);
        }
        return r.json();
      })
      .then(d => setContract(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // contract_kind='cafe' 여부 판별 — /html?mode=... 400 not_cafe_contract 면 기존 레거시 폼 유지.
  const [cafeCheck, setCafeCheck] = useState<"pending" | "not_cafe" | "ready">("pending");
  const [cafeHtml, setCafeHtml] = useState("");
  const [cafeSignatures, setCafeSignatures] = useState<Record<string, string>>({});
  const [cafeViewOnly, setCafeViewOnly] = useState(false);

  useEffect(() => {
    if (!contract || !token) return;
    const desiredMode = contract.status === "signed" || mode === "view" ? "view" : "sign";
    fetch(`${API_URL}/api/regular-public/contract/${token}/html?mode=${desiredMode}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          setCafeCheck("not_cafe");
          return;
        }
        setCafeHtml(body.html || "");
        setCafeSignatures(body.signatures || {});
        setCafeViewOnly(desiredMode === "view");
        setCafeCheck("ready");
      })
      .catch(() => setCafeCheck("not_cafe"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, token, mode]);

  const handleSign = async () => {
    if (!birthDate.trim()) return alert("생년월일을 입력해주세요.");
    if (!address.trim()) return alert("주소를 입력해주세요.");
    if (!idNumber.trim()) return alert("주민등록번호를 입력해주세요.");
    if (!email.trim()) return alert("이메일을 입력해주세요.");
    if (!bankSlipFile) return alert("통장사본을 첨부해주세요.");
    if (nationality === "FOREIGN") {
      if (!visaType.trim()) return alert("비자종류를 입력해주세요.");
      if (!visaExpiry.trim()) return alert("비자만료일을 입력해주세요.");
      if (!foreignIdFile) return alert("외국인등록증 사본을 첨부해주세요.");
    }

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
          email: email.trim(),
          nationality,
          visa_type: nationality === "FOREIGN" ? visaType.trim() : undefined,
          visa_expiry: nationality === "FOREIGN" ? visaExpiry.trim() : undefined,
          bank_slip_data: bankSlipFile || undefined,
          foreign_id_card_data: nationality === "FOREIGN" ? foreignIdFile || undefined : undefined,
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

  // contract_kind='cafe' 여부 아직 판별 중 — 레거시/카페 어느 쪽으로도 확정 렌더하지 않음.
  if (cafeCheck === "pending") return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
      <CenterSpinner />
    </div>
  );

  if (cafeCheck === "ready") {
    return (
      <CafeContractView
        contract={contract}
        token={token}
        html={cafeHtml}
        initialSignatures={cafeSignatures}
        viewOnly={cafeViewOnly}
      />
    );
  }

  if (contract.status === 'signed') {
    return (
      <div className="min-h-screen bg-[var(--bg-canvas)] py-8 px-4 fade-in">
        <div className="max-w-2xl mx-auto">
          <Card padding="none" tone="default" className="shadow-[var(--elev-3)] overflow-hidden surface-bevel">
            <div className="border-b border-[var(--success-border)] text-white px-6 py-5 text-center"
                 style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' }}>
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <h1 className="text-[var(--fs-lg)] font-bold">근로계약서 체결 완료</h1>
              <p className="text-green-200 text-eyebrow mt-1">전자문서 · (주)조인앤조인</p>
            </div>

            <div className="px-6 py-6 space-y-5 text-[var(--fs-body)] text-[var(--text-1)]">
              <ContractArticles c={contract} />

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
                    <p className="text-[var(--fs-caption)]">성명: <b>{contract.worker_name}</b></p>
                    {contract.birth_date && <p className="text-[var(--fs-caption)]">생년월일: {contract.birth_date}</p>}
                    {contract.address && <p className="text-[var(--fs-caption)]">주소: {contract.address}</p>}
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

              {/* 첨부 서류 — 통장사본 / 외국인등록증 */}
              {(contract.bank_slip_data || contract.foreign_id_card_data) && (
                <div className="border-t border-[var(--border-1)] pt-4 space-y-3">
                  <p className="font-bold text-[var(--text-2)] text-[var(--fs-body)]">첨부 서류</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {contract.bank_slip_data && (
                      <FilePreview
                        label="통장사본"
                        data={contract.bank_slip_data}
                        filenamePrefix={`통장사본_${contract.worker_name || ''}`}
                        maxHeight={192}
                      />
                    )}
                    {contract.foreign_id_card_data && (
                      <FilePreview
                        label="외국인등록증"
                        data={contract.foreign_id_card_data}
                        filenamePrefix={`외국인등록증_${contract.worker_name || ''}`}
                        maxHeight={192}
                      />
                    )}
                  </div>
                </div>
              )}

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
        {/* Header */}
        <Card padding="md" tone="default" className="text-center surface-bevel"
              style={{ background: 'linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%)' }}>
          <h1 className="text-[var(--fs-lg)] font-bold text-white">근로계약서 서명</h1>
          <p className="text-[var(--brand-200)] text-[var(--fs-body)] mt-1">{contract.worker_name}님, 아래 내용을 확인하고 서명해주세요.</p>
        </Card>

        {/* Contract text */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
          <SectionHeader eyebrow="근로계약서" title="계약서 본문" />
          <div className="max-h-72 overflow-y-auto border border-[var(--border-2)] rounded-[var(--r-md)] p-3 bg-[var(--bg-0)]">
            <ContractArticles c={contract} />
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
            <p className="font-bold text-[var(--fs-body)] text-[var(--text-1)]">(근로자) {contract.worker_name}</p>

            <Field label="생년월일" required>
              <Input
                type="date"
                inputSize="md"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
              />
            </Field>

            <Field label="주소" required>
              <Input
                type="text"
                inputSize="md"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="예: 전북 전주시 덕진구 ..."
              />
            </Field>

            <Field label="주민등록번호" required hint="4대보험 신고 목적으로만 사용됩니다.">
              <Input
                type="text"
                inputSize="md"
                value={idNumber}
                onChange={e => setIdNumber(e.target.value)}
                placeholder="000000-0000000"
              />
            </Field>

            <Field label="이메일" required>
              <Input
                type="email"
                inputSize="md"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
              />
            </Field>
          </div>
        </Card>

        {/* Additional onboarding info */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)] space-y-4">
          <SectionHeader eyebrow="추가 정보" title="4대보험 취득신고 정보" />

          <Field label="국적">
            <SegmentedControl
              value={nationality}
              options={[
                { value: "KR", label: "한국" },
                { value: "FOREIGN", label: "외국인" },
              ]}
              onChange={(v) => setNationality(v as "KR" | "FOREIGN")}
              size="md"
            />
          </Field>

          {nationality === "FOREIGN" && (
            <>
              <Field label="비자종류" required>
                <Input
                  inputSize="md"
                  value={visaType}
                  onChange={e => setVisaType(e.target.value)}
                  placeholder="E-9, H-2 등"
                />
              </Field>
              <Field label="비자만료일" required>
                <Input
                  type="date"
                  inputSize="md"
                  value={visaExpiry}
                  onChange={e => setVisaExpiry(e.target.value)}
                />
              </Field>
              <div className="space-y-2">
                <p className="text-[12px] font-medium text-[var(--text-2)]">
                  외국인등록증 사본 <span className="text-[var(--danger-fg)]">*</span>
                </p>
                {foreignIdFile ? (
                  <div className="space-y-1">
                    <img src={foreignIdFile} alt="외국인등록증" className="max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
                    <label className="inline-block cursor-pointer">
                      <span className="text-[var(--fs-caption)] text-[var(--brand-400)] underline">교체</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setForeignIdFile(await fileToBase64(f));
                      }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-2)] bg-grid cursor-pointer hover:border-[var(--brand-400)] transition-colors">
                    <span className="text-[var(--fs-body)] text-[var(--text-4)]">파일 첨부 (클릭 또는 드래그)</span>
                    <span className="text-[var(--fs-caption)] text-[var(--text-4)]">JPG, PNG, PDF</span>
                    <input type="file" accept="image/*" className="hidden" onChange={async e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      setForeignIdFile(await fileToBase64(f));
                    }} />
                  </label>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <p className="text-[12px] font-medium text-[var(--text-2)]">
              통장사본 <span className="text-[var(--danger-fg)]">*</span>
            </p>
            <p className="text-[var(--fs-caption)] text-[var(--text-4)]">급여 지급 및 4대보험 환급 계좌 확인용입니다.</p>
            {bankSlipFile ? (
              <div className="space-y-1">
                <img src={bankSlipFile} alt="통장사본" className="max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
                <label className="inline-block cursor-pointer">
                  <span className="text-[var(--fs-caption)] text-[var(--brand-400)] underline">교체</span>
                  <input type="file" accept="image/*" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    setBankSlipFile(await fileToBase64(f));
                  }} />
                </label>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 p-5 rounded-[var(--r-lg)] border-2 border-dashed border-[var(--border-2)] bg-grid cursor-pointer hover:border-[var(--brand-400)] transition-colors">
                <span className="text-[var(--fs-body)] text-[var(--text-4)]">파일 첨부 (클릭 또는 드래그)</span>
                <span className="text-[var(--fs-caption)] text-[var(--text-4)]">JPG, PNG, PDF</span>
                <input type="file" accept="image/*" className="hidden" onChange={async e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setBankSlipFile(await fileToBase64(f));
                }} />
              </label>
            )}
          </div>
        </Card>

        {/* Signature section */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)] space-y-3">
          <SectionHeader eyebrow="서명" title="근로계약서 서명" />
          <SignaturePad
            canvasRef={contractSigRef}
            label="근로계약서 서명 (서명/인)"
            onClear={() => clearCanvas(contractSigRef)}
          />
        </Card>

        {/* Consent section */}
        <Card padding="md" tone="default" className="shadow-[var(--elev-1)] space-y-3">
          <SectionHeader eyebrow="개인정보" title="개인정보 수집·이용 동의" />
          <div className="border border-[var(--border-2)] rounded-[var(--r-md)] p-3 bg-[var(--bg-0)] max-h-52 overflow-y-auto">
            <ConsentText name={contract.worker_name} />
          </div>
          <SignaturePad
            canvasRef={consentSigRef}
            label="개인정보 동의서 서명 (서명/인)"
            onClear={() => clearCanvas(consentSigRef)}
          />
        </Card>

        {/* Submit */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleSign}
          loading={submitting}
          disabled={submitting || !birthDate.trim() || !address.trim() || !idNumber.trim() || !email.trim() || !bankSlipFile}
          className="w-full"
        >
          {submitting ? "처리 중..." : "근로계약서 서명 완료"}
        </Button>

        <p className="text-center text-[var(--fs-caption)] text-[var(--text-4)] pb-4">
          본 계약서에 서명함으로써 위 내용에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}

export default function RegularContractPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <CenterSpinner />
      </div>
    }>
      <RegularContractContent />
    </Suspense>
  );
}
