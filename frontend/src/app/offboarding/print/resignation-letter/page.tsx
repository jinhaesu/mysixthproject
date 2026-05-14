"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, CenterSpinner } from "@/components/ui";
import { Printer } from "lucide-react";

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
  const name = data.employee_name ?? emp.name ?? "-";
  const department = data.department ?? emp.department ?? "-";
  const position = data.position_title ?? emp.position_title ?? "";
  const hireDate = data.hire_date ?? emp.hire_date ?? "-";
  const resignDate = data.resign_date ?? "-";
  const reason = data.resignation_letter_employee_reason || "";
  const detail = data.resignation_letter_detail || "";
  const signature = data.resignation_letter_signature_data || "";
  const submittedAt = data.resignation_letter_submitted_at
    ? new Date(data.resignation_letter_submitted_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 20mm; }
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
        }
        .doc-wrap {
          max-width: 794px;
          margin: 0 auto;
          padding: 48px 56px;
          background: white;
          color: #111;
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 14px;
          line-height: 1.8;
        }
        .doc-title {
          text-align: center;
          margin-bottom: 48px;
          letter-spacing: 16px;
          font-size: 32px;
          font-weight: 700;
          padding-right: 0;
          padding-left: 16px;
        }
        .info-table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 32px;
        }
        .info-table td {
          border: 1px solid #555;
          padding: 10px 14px;
          font-size: 13px;
        }
        .info-table .label {
          background: #f5f5f5;
          font-weight: 600;
          width: 22%;
          text-align: center;
        }
        .reason-block {
          margin: 32px 0;
        }
        .reason-block .reason-title {
          font-weight: 700;
          font-size: 15px;
          margin-bottom: 8px;
        }
        .reason-box {
          border: 1px solid #555;
          padding: 16px 20px;
          min-height: 100px;
          font-size: 13.5px;
          line-height: 1.9;
          white-space: pre-wrap;
        }
        .declaration {
          margin-top: 48px;
          text-align: center;
          font-size: 15px;
          font-weight: 500;
        }
        .sign-area {
          margin-top: 64px;
          text-align: right;
          font-size: 14px;
          line-height: 2.2;
        }
        .company-foot {
          margin-top: 96px;
          text-align: center;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 2px;
        }
        .no-print-banner {
          background: #f0f4ff;
          border: 1px solid #c7d2fe;
          padding: 12px 16px;
          border-radius: 8px;
          margin: 16px auto;
          max-width: 794px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .no-print-banner p { margin: 0; font-size: 13px; color: #374151; }
      `}</style>

      <div className="no-print no-print-banner">
        <p>브라우저 인쇄 다이얼로그에서 <strong>PDF로 저장</strong>을 선택하세요.</p>
        <Button variant="primary" size="sm" leadingIcon={<Printer size={14} />} onClick={() => window.print()}>
          PDF로 저장
        </Button>
      </div>

      <div className="doc-wrap">
        <div className="doc-title">사 직 서</div>

        <table className="info-table">
          <tbody>
            <tr>
              <td className="label">성명</td>
              <td>{name}</td>
              <td className="label">부서</td>
              <td>{department}{position ? ` / ${position}` : ""}</td>
            </tr>
            <tr>
              <td className="label">입사일</td>
              <td>{hireDate}</td>
              <td className="label">퇴직(예정)일</td>
              <td>{resignDate}</td>
            </tr>
          </tbody>
        </table>

        <div className="reason-block">
          <div className="reason-title">사 유</div>
          <div className="reason-box">
            {reason || "(직원이 작성한 사유가 없습니다.)"}
            {detail && (
              <>
                {"\n\n"}
                <span style={{ color: "#444" }}>{detail}</span>
              </>
            )}
          </div>
        </div>

        <div className="declaration">
          위와 같이 일신상의 사유로 사직하고자 하오니 이를 허락하여 주시기 바랍니다.
        </div>

        <div className="sign-area">
          <div>{submittedAt}</div>
          <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>성명 : {name}</span>
            {signature ? (
              <img
                src={signature}
                alt="서명"
                style={{ height: 56, width: "auto", marginLeft: 4, verticalAlign: "middle", filter: "contrast(1.15)" }}
              />
            ) : (
              <span style={{ marginLeft: 12 }}>(인)</span>
            )}
          </div>
        </div>

        <div className="company-foot">
          주식회사 조인앤조인 대표이사 귀하
        </div>
      </div>
    </>
  );
}

export default function ResignationLetterPrintPage() {
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
