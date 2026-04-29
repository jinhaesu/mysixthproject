"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CenterSpinner } from "@/components/ui";
import { Printer } from "lucide-react";

const SEVERANCE_METHODS: Record<string, string> = {
  avg_3m: "직전 3개월 평균임금 기준",
  fixed: "고정 금액 (관리자 입력)",
  dc: "DC형 (확정기여형) — 외부 적립",
  irp: "IRP 이전",
};

function fmt(v: any): string {
  if (v == null || v === "") return "-";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString() + " 원";
}

function calcTenure(hireDate?: string, resignDate?: string): string {
  if (!hireDate || !resignDate) return "-";
  const ms = new Date(resignDate).getTime() - new Date(hireDate).getTime();
  if (ms <= 0) return "-";
  const totalMonths = Math.floor(ms / (365.25 / 12 * 24 * 60 * 60 * 1000));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${years}년 ${months}개월`;
}

function PrintDocContent() {
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
  const position = data.position_title ?? emp.position_title ?? "-";
  const hireDate = data.hire_date ?? emp.hire_date ?? "-";
  const resignDate = data.resign_date ?? "-";
  const tenure = calcTenure(hireDate !== "-" ? hireDate : undefined, resignDate !== "-" ? resignDate : undefined);
  const tb = data.tax_breakdown;
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

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
        .sign-row { display: flex; justify-content: space-between; margin-top: 32px; gap: 24px; }
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
        .disclaimer { font-size: 11px; color: #888; text-align: center; margin-top: 32px; border-top: 1px solid #ddd; padding-top: 12px; }
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
          <h1>퇴직금 산정서</h1>
          <p>작성일: {today}</p>
        </div>

        <div className="section-title">1. 직원 정보</div>
        <table className="doc-table">
          <tbody>
            <tr><th>성명</th><td>{name}</td><th>부서</th><td>{department}</td></tr>
            <tr><th>직급</th><td>{position}</td><th>근속기간</th><td>{tenure}</td></tr>
            <tr><th>입사일</th><td>{hireDate}</td><th>퇴직일</th><td>{resignDate}</td></tr>
          </tbody>
        </table>

        <div className="section-title">2. 퇴직금 산정</div>
        <table className="doc-table">
          <thead>
            <tr><th>항목</th><th>내용</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>산정 기준 임금 방식</td>
              <td>{SEVERANCE_METHODS[data.severance_method] ?? data.severance_method ?? "-"}</td>
            </tr>
            <tr>
              <td>자동 산정 금액</td>
              <td className="num">{fmt(data.severance_auto)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>최종 지급 금액</td>
              <td className="num" style={{ fontWeight: 700 }}>{fmt(data.severance_final)}</td>
            </tr>
          </tbody>
        </table>

        {tb && (
          <>
            <div className="section-title">3. 세액 산정</div>
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
                  <tr><td>산출세액</td><td className="num">{fmt(tb.income_tax)}</td></tr>
                )}
                {tb.local_income_tax != null && (
                  <tr><td>지방소득세</td><td className="num">{fmt(tb.local_income_tax)}</td></tr>
                )}
                {tb.total_withholding != null && (
                  <tr>
                    <td style={{ fontWeight: 700 }}>총 원천세</td>
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
            <div className="sign-label">작성일</div>
            <div>{today}</div>
          </div>
          <div className="sign-box">
            <div className="sign-label">작성자 (서명)</div>
            <div style={{ minHeight: 40 }}></div>
          </div>
          <div className="sign-box">
            <div className="sign-label">확인자 (서명)</div>
            <div style={{ minHeight: 40 }}></div>
          </div>
        </div>

        <p className="disclaimer">
          본 문서는 내부 참고용 산정서입니다. 정식 퇴직금 지급 시 관련 법령 및 회계 담당자의 최종 확인을 거쳐야 합니다.
        </p>
      </div>
    </>
  );
}

export default function SeverancePrintPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-canvas)]">
        <CenterSpinner />
      </div>
    }>
      <PrintDocContent />
    </Suspense>
  );
}
