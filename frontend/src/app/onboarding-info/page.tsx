"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, AlertCircle } from "lucide-react";
import { Card, Button, Field, Input, SegmentedControl } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const FIELD_LABELS: Record<string, string> = {
  email: "이메일",
  address: "주소",
  id_number: "주민등록번호",
  birth_date: "생년월일",
  bank_name: "은행명",
  bank_account: "계좌번호",
  bank_slip_data: "통장사본",
  visa_type: "비자종류",
  visa_expiry: "비자만료일",
  foreign_id_card_data: "외국인등록증 사본",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function Inner() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // form state
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankSlip, setBankSlip] = useState("");
  const [nationality, setNationality] = useState<"KR" | "FOREIGN">("KR");
  const [visaType, setVisaType] = useState("");
  const [visaExpiry, setVisaExpiry] = useState("");
  const [foreignIdCard, setForeignIdCard] = useState("");

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); return; }
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/regular-public/${token}/onboarding-info`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error || "HTTP " + r.status);
        setInfo(b);
        setEmail(b.email || ""); setAddress(b.address || "");
        setIdNumber(b.id_number || ""); setBirthDate(b.birth_date || "");
        setBankName(b.bank_name || ""); setBankAccount(b.bank_account || "");
        setBankSlip(b.bank_slip_data || "");
        setNationality((b.nationality as any) || "KR");
        setVisaType(b.visa_type || ""); setVisaExpiry(b.visa_expiry || "");
        setForeignIdCard(b.foreign_id_card_data || "");
      } catch (e: any) { setError(e.message); }
    })();
  }, [token]);

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const body: any = { nationality };
      if (email) body.email = email;
      if (address) body.address = address;
      if (idNumber) body.id_number = idNumber;
      if (birthDate) body.birth_date = birthDate;
      if (bankName) body.bank_name = bankName;
      if (bankAccount) body.bank_account = bankAccount;
      if (bankSlip) body.bank_slip_data = bankSlip;
      if (nationality === "FOREIGN") {
        if (visaType) body.visa_type = visaType;
        if (visaExpiry) body.visa_expiry = visaExpiry;
        if (foreignIdCard) body.foreign_id_card_data = foreignIdCard;
      }
      const r = await fetch(`${API_URL}/api/regular-public/${token}/onboarding-info`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "HTTP " + r.status);
      setDone(true);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card padding="lg" className="max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-[var(--danger-fg)]" />
          <p className="text-[var(--danger-fg)]">{error}</p>
        </Card>
      </div>
    );
  }
  if (!info) return <div className="min-h-screen flex items-center justify-center text-[var(--text-3)]">불러오는 중…</div>;

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card padding="lg" className="max-w-md w-full text-center">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 text-[var(--success-fg)]" />
          <h1 className="text-[20px] font-semibold mb-2">제출 완료</h1>
          <p className="text-[var(--text-3)] text-[13px]">입력하신 정보가 회사에 자동 전달되었습니다. 4대보험 신고에 활용됩니다.</p>
        </Card>
      </div>
    );
  }

  const missingLabels = (info.missing_fields || []).map((f: string) => FIELD_LABELS[f] || f);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] py-8 px-4 fade-in">
      <div className="max-w-xl mx-auto">
        <Card padding="none" className="shadow-[var(--elev-2)] overflow-hidden">
          <div className="border-b border-[var(--info-border)] bg-[var(--info-bg)] px-6 py-4">
            <h1 className="text-[18px] font-bold text-[var(--info-fg)]">{info.name} 님 — 추가 정보 입력</h1>
            <p className="text-[12.5px] text-[var(--text-2)] mt-1">
              4대보험 취득신고에 필요한 정보입니다. <b>근로계약서와는 별개</b>이며 이미 서명한 계약서는 그대로 유지됩니다.
            </p>
            {missingLabels.length > 0 && (
              <p className="text-[11.5px] text-[var(--warning-fg)] mt-2">
                누락 항목: {missingLabels.join(", ")}
              </p>
            )}
          </div>
          <div className="px-6 py-5 space-y-4">
            {error && <div className="bg-[var(--danger-bg)] text-[var(--danger-fg)] border border-[var(--danger-border)] rounded-md p-3 text-[12.5px]">{error}</div>}

            <Field label="이메일" hint="회사 통지 발송용">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
            </Field>

            <Field label="주소">
              <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="현 거주지" />
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

            <Field label="통장사본 첨부" hint="급여 입금 확인용 (이미지/PDF)">
              <div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px]">
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]; if (!f) return;
                    setBankSlip(await fileToBase64(f));
                  }} />
                  파일 선택
                </label>
                {bankSlip && (
                  <div className="mt-2 text-[11.5px] text-[var(--success-fg)]">✓ 업로드됨 ({Math.round(bankSlip.length / 1024)} KB)</div>
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
                <Field label="비자 종류">
                  <Input value={visaType} onChange={e => setVisaType(e.target.value)} placeholder="E-9, F-4, F-5 등" />
                </Field>
                <Field label="비자 만료일">
                  <Input type="date" value={visaExpiry} onChange={e => setVisaExpiry(e.target.value)} />
                </Field>
                <Field label="외국인등록증 사본">
                  <div>
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--border-2)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[12.5px]">
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setForeignIdCard(await fileToBase64(f));
                      }} />
                      파일 선택
                    </label>
                    {foreignIdCard && (
                      <div className="mt-2 text-[11.5px] text-[var(--success-fg)]">✓ 업로드됨 ({Math.round(foreignIdCard.length / 1024)} KB)</div>
                    )}
                  </div>
                </Field>
              </div>
            )}

            <Button variant="primary" size="lg" loading={submitting} onClick={submit} className="w-full">제출</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function OnboardingInfoPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--text-3)]">불러오는 중…</div>}><Inner /></Suspense>;
}
