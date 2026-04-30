"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Field, Select, Textarea } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

function Inner() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("유효하지 않은 링크입니다."); return; }
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/offboarding-public/by-token/${token}`);
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setInfo(b);
        if (b.already_submitted) setDone(true);
      } catch (e: any) { setError(e.message); }
    })();
  }, [token]);

  const submit = async () => {
    if (!reason) { alert("사유를 선택해주세요."); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API_URL}/api/offboarding-public/submit/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason_label: reason, detail }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setDone(true);
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card padding="lg" className="max-w-md w-full text-center">
        <p className="text-[var(--danger-fg)]">{error}</p>
      </Card>
    </div>
  );
  if (!info) return <div className="min-h-screen flex items-center justify-center text-[var(--text-3)]">불러오는 중…</div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card padding="lg" className="max-w-md w-full text-center">
        <h1 className="text-[20px] font-semibold mb-2">제출 완료</h1>
        <p className="text-[var(--text-3)] text-[13px]">사직서가 정상적으로 접수되었습니다. 처리 결과는 회사로부터 별도 안내됩니다.</p>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card padding="lg" className="max-w-lg w-full">
        <h1 className="text-[22px] font-semibold mb-1">사직서 작성</h1>
        <p className="text-[13px] text-[var(--text-3)] mb-5">아래 정보를 확인하고 사유를 입력해주세요. 제출하면 회사에 자동 전달됩니다.</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-[var(--bg-2)] border border-[var(--border-1)] text-[12.5px]">
            <div><span className="text-[var(--text-3)]">이름</span><div className="text-[var(--text-1)] font-medium">{info.employee_name}</div></div>
            <div><span className="text-[var(--text-3)]">연락처</span><div className="text-[var(--text-1)] font-medium">{info.employee_phone}</div></div>
            <div><span className="text-[var(--text-3)]">입사일</span><div className="text-[var(--text-1)] font-medium">{info.hire_date || '-'}</div></div>
            <div><span className="text-[var(--text-3)]">퇴직일 (마지막 근무일)</span><div className="text-[var(--text-1)] font-medium">{info.resign_date}</div></div>
          </div>
          <Field label="사직 사유" required>
            <Select value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">선택</option>
              {info.reasons.map((r: any) => (
                <option key={r.code} value={r.label}>{r.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="상세 설명 (선택)" hint="필요 시 자세한 사유를 적어주세요.">
            <Textarea rows={4} value={detail} onChange={e => setDetail(e.target.value)} />
          </Field>
          <Button variant="primary" size="lg" loading={submitting} onClick={submit}>제출</Button>
        </div>
      </Card>
    </div>
  );
}

export default function ResignationLetterPage() {
  return <Suspense fallback={<div/>}><Inner/></Suspense>;
}
