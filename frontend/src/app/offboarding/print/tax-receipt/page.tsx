"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CenterSpinner } from "@/components/ui";
import { Printer } from "lucide-react";

const REASON_LABELS: Record<string, string> = {
  "11": "개인사정으로 인한 자진퇴사",
  "22": "근로계약기간만료/공사종료",
  "23": "경영상필요/회사사정 (권고사직 등)",
  "26": "정년퇴직",
  "31": "기타 사용자 사정",
  "41": "사망",
};

function fmt(v: any): string {
  if (v == null || v === "") return "-";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString() + " 원";
}

function maskIdNumber(id: string | undefined | null): string {
  if (!id) return "-";
  const clean = id.replace(/[^0-9]/g, "");
  if (clean.length >= 13) {
    return `${clean.slice(0, 6)}-${clean.slice(6, 7)}******`;
  }
  return id;
}

function TaxReceiptContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("ID가 없습니다."); setLoading(false); return; }
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    fetch(`${API_URL}/api/offboarding/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
      <CenterSpinner />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <p style={{ color: "red" }}>오류: {error || "데이터를 불러올 수 없습니다."}</p>
    </div>
  );

  const emp = data.employee || {};
  const name = data.name ?? emp.name ?? "-";
  const department = data.department ?? emp.department ?? "-";
  const idNumber = maskIdNumber(data.id_number ?? emp.id_number);
  const address = data.address ?? emp.address ?? "-";
  const resignDate = data.resign_date ?? "-";
  const reasonLabel = REASON_LABELS[data.reason_code ?? ""] ?? data.reason_code ?? "-";
  const tb = data.tax_breakdown;
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const payYearMonth = resignDate !== "-" ? resignDate.slice(0, 7) : "-";

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; color: black !important; font-family: 'Inter', -apple-system, sans-serif; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #888; padding: 6px 10px; font-size: 11.5px; }
          thead { background: #f5f5f5; }
          h1 { font-size: 22px; }
          h2 { font-size: 14px; }
        }
        .doc-wrap {
          max-width: 794px;
          margin: 0 auto;
          padding: 32px;
          background: white;
          color: #111;
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 13px;
          line-height: 1.6;
        }
        .doc-title { text-align: center; margin-bottom: 32px; }
        .doc-title h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px 0; }
        .doc-title p { font-size: 13px; color: #555; margin: 0; }
        .section-title {
          font-size: 14px;
          font-weight: 700;
          margin: 24px 0 8px 0;
          padding-bottom: 4px;
          border-bottom: 2px solid #333;
        }
        .doc-table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        .doc-table td, .doc-table th {
          border: 1px solid #888;
          padding: 6px 10px;
          font-size: 11.5px;
        }
        .doc-table th {
          background: #f5f5f5;
          font-weight: 600;
          text-align: left;
          width: 35%;
        }
        .doc-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .disclaimer-box {
          margin-top: 24px;
          background: #fffbf0;
          border: 1px solid #f59e0b;
          border-radius: 6px;
          padding: 12px 16px;
          font-size: 12px;
          color: #92400e;
        }
        .disclaimer-box strong { display: block; margin-bottom: 4px; }
        .issuer-box {
          border: 1px solid #888;
          padding: 12px 16px;
          font-size: 12px;
          margin-bottom: 16px;
        }
        .issuer-box .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .sign-row { display: flex; justify-content: space-between; margin-top: 24px; gap: 24px; }
        .sign-box { flex: 1; border: 1px solid #888; padding: 12px 16px; min-height: 64px; font-size: 12px; }
        .sign-label { font-size: 11px; color: #555; margin-bottom: 4px; }
        .no-print-banner {
          background: #f0f4ff;
          border: 1px solid #c7d2fe;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .no-print-banner p { margin: 0; font-size: 13px; color: #374151; }
        .draft-stamp {
          display: inline-block;
          border: 3px solid #ef4444;
          color: #ef4444;
          padding: 2px 12px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.05em;
          margin-left: 12px;
          vertical-align: middle;
          transform: rotate(-5deg);
        }
      `}</style>

      <div className="no-print no-print-banner">
        <p>브라우저 인쇄 다이얼로그에서 <strong>PDF로 저장</strong>을 선택하세요.</p>
        <Button variant="primary" size="sm" leadingIcon={<Printer size={14} />} onClick={() => window.print()}>
          PDF로 저장
        </Button>
      </div>

      <div className="doc-wrap">
        <div className="doc-title">
          <p style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>주식회사 조인앤조인</p>
          <h1>
            원천징수영수증
            <span className="draft-stamp">임시본</span>
          </h1>
          <p>퇴직소득 · 작성일: {today}</p>
        </div>

        <div className="section-title">1. 발급기관</div>
        <div className="issuer-box">
          <div className="row"><span>법인명</span><span>주식회사 조인앤조인</span></div>
          <div className="row"><span>대표자</span><span>진해수</span></div>
          <div className="row"><span>소재지</span><span>전북특별자치도 전주시 덕진구 기린대로 458</span></div>
          <div className="row"><span>연락처</span><span>1533-791</span></div>
        </div>

        <div className="section-title">2. 소득자 정보</div>
        <table className="doc-table">
          <tbody>
            <tr><th>성명</th><td>{name}</td><th>부서</th><td>{department}</td></tr>
            <tr><th>주민등록번호</th><td>{idNumber}</td><th>퇴직일</th><td>{resignDate}</td></tr>
            <tr><th>주소</th><td colSpan={3}>{address}</td></tr>
          </tbody>
        </table>

        <div className="section-title">3. 지급내역</div>
        <table className="doc-table">
          <thead>
            <tr><th>지급년월</th><th>퇴직사유</th><th style={{ textAlign: "right" }}>지급액</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{payYearMonth}</td>
              <td>{reasonLabel}</td>
              <td className="num">{fmt(data.severance_final)}</td>
            </tr>
          </tbody>
        </table>

        {tb && (
          <>
            <div className="section-title">4. 산출세액</div>
            <table className="doc-table">
              <thead>
                <tr><th>항목</th><th style={{ textAlign: "right" }}>금액</th></tr>
              </thead>
              <tbody>
                {tb.retirement_income != null && (
                  <tr><td>퇴직소득금액</td><td className="num">{fmt(tb.retirement_income)}</td></tr>
                )}
                {tb.tenure_deduction != null && (
                  <tr><td>근속연수공제</td><td className="num">{fmt(tb.tenure_deduction)}</td></tr>
                )}
                {tb.taxable_base != null && (
                  <tr><td>과세표준</td><td className="num">{fmt(tb.taxable_base)}</td></tr>
                )}
                {tb.annualized_income != null && (
                  <tr><td>환산급여</td><td className="num">{fmt(tb.annualized_income)}</td></tr>
                )}
                {tb.annualized_deduction != null && (
                  <tr><td>환산급여공제</td><td className="num">{fmt(tb.annualized_deduction)}</td></tr>
                )}
                {tb.annualized_taxable != null && (
                  <tr><td>환산과세표준</td><td className="num">{fmt(tb.annualized_taxable)}</td></tr>
                )}
                {tb.annualized_tax != null && (
                  <tr><td>환산산출세액</td><td className="num">{fmt(tb.annualized_tax)}</td></tr>
                )}
                {tb.income_tax != null && (
                  <tr><td>산출세액 (퇴직소득세)</td><td className="num">{fmt(tb.income_tax)}</td></tr>
                )}
                {tb.local_income_tax != null && (
                  <tr><td>지방소득세</td><td className="num">{fmt(tb.local_income_tax)}</td></tr>
                )}
                {tb.total_withholding != null && (
                  <tr>
                    <td style={{ fontWeight: 700 }}>총 원천징수세액</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(tb.total_withholding)}</td>
                  </tr>
                )}
                {tb.net_severance != null && (
                  <tr>
                    <td style={{ fontWeight: 700, background: "#f0f7ff" }}>실수령액</td>
                    <td className="num" style={{ fontWeight: 700, background: "#f0f7ff" }}>{fmt(tb.net_severance)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="sign-row">
          <div className="sign-box">
            <div className="sign-label">발급일</div>
            <div>{today}</div>
          </div>
          <div className="sign-box">
            <div className="sign-label">원천징수의무자 (서명 / 직인)</div>
            <div style={{ minHeight: 40 }}></div>
          </div>
        </div>

        <div className="disclaimer-box">
          <strong>본 영수증은 임시본입니다.</strong>
          정식 원천징수영수증은 국세청 시스템(홈택스) 또는 별도 법정 양식을 사용하여 발급하여야 합니다.
          이 문서는 내부 확인 목적으로만 사용하시기 바랍니다.
        </div>
      </div>
    </>
  );
}

export default function TaxReceiptPrintPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <CenterSpinner />
      </div>
    }>
      <TaxReceiptContent />
    </Suspense>
  );
}
