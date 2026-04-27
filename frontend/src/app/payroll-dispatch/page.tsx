"use client";

import { useState } from "react";
import { Calculator, Download, Loader2, AlertTriangle } from "lucide-react";
import {
  calculatePayroll,
  exportPayrollExcel,
} from "@/lib/api";

interface PayrollResult {
  name: string;
  category: string;
  work_days: number;
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  hourly_rate: number;
  base_pay: number;
  overtime_pay: number;
  night_pay: number;
  weekly_holiday_hours: number;
  weekly_holiday_pay: number;
  total_pay: number;
}

interface GrandTotal {
  workers: number;
  base_pay: number;
  overtime_pay: number;
  night_pay: number;
  weekly_holiday_pay: number;
  total_pay: number;
}

const CATEGORIES = ["파견", "알바", "사업소득"];

const fmt = new Intl.NumberFormat("ko-KR");

function getCategoryStyle(category: string): string {
  if (category === "알바") return "bg-[#FC7840]/10 text-[#FC7840]";
  if (category === "파견") return "bg-[#4EA7FC]/10 text-[#828FFF]";
  return "bg-[#08090A] text-[#8A8F98]";
}

function getCategoryTextColor(category: string): string {
  if (category === "알바") return "text-[#FC7840]";
  if (category === "파견") return "text-[#7070FF]";
  return "text-[#8A8F98]";
}

/** Returns true when overtime hours exceed the legal daily limit (12h) or total regular hours suggest data error (>200h/month). */
function isAnomalous(r: PayrollResult): boolean {
  return r.overtime_hours > 12 || r.regular_hours > 200;
}

export default function PayrollDispatchPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [results, setResults] = useState<PayrollResult[]>([]);
  const [grandTotal, setGrandTotal] = useState<GrandTotal | null>(null);
  const [loading, setLoading] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [exporting, setExporting] = useState(false);

  async function handleCalculate() {
    setLoading(true);
    setCalcError("");
    try {
      const data = await calculatePayroll(year, month);
      const filtered: PayrollResult[] = (data.results || []).filter(
        (r: PayrollResult) => CATEGORIES.includes(r.category)
      );
      setResults(filtered);

      // Build grand total from filtered set
      const total: GrandTotal = {
        workers: filtered.length,
        base_pay: 0,
        overtime_pay: 0,
        night_pay: 0,
        weekly_holiday_pay: 0,
        total_pay: 0,
      };
      filtered.forEach((r) => {
        total.base_pay += r.base_pay;
        total.overtime_pay += r.overtime_pay;
        total.night_pay += r.night_pay;
        total.weekly_holiday_pay += r.weekly_holiday_pay || 0;
        total.total_pay += r.total_pay;
      });
      setGrandTotal(total);
    } catch (err: any) {
      setCalcError(err.message || "계산에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportPayrollExcel(year, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `파견알바_노무비_${year}_${String(month).padStart(2, "0")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "엑셀 다운로드에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  const anomalies = results.filter(isAnomalous);
  const sortedResults = [...results].sort((a, b) => b.total_pay - a.total_pay);
  const maxPay = results.length > 0 ? Math.max(...results.map((r) => r.total_pay)) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
            <Calculator size={28} className="text-[#7070FF]" />
            사업소득(알바)/파견 노무비 관리
          </h1>
          <p className="text-sm text-[#8A8F98] mt-1">
            파견·알바·사업소득 근무자의 노무비를 관리합니다.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-[#0F1011] rounded-xl border border-[#23252A] shadow-[0px_1px_3px_rgba(0,0,0,0.2)] px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#D0D6E0]">연도</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-[#23252A] rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#D0D6E0]">월</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-[#23252A] rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2 bg-[#5E6AD2] text-white text-sm font-medium rounded-lg hover:bg-[#828FFF] disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            {loading ? "계산 중..." : "계산"}
          </button>
          {results.length > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#27A644] text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {exporting ? "다운로드 중..." : "엑셀 다운로드"}
            </button>
          )}
        </div>
      </div>

      {calcError && (
        <div className="p-3 bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-lg text-sm text-[#EB5757]">
          {calcError}
        </div>
      )}

      {/* Summary Cards */}
      {grandTotal && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-[#0F1011] rounded-xl border border-[#23252A] shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-4 text-center">
            <p className="text-2xl font-bold text-[#F7F8F8]">{grandTotal.workers}</p>
            <p className="text-xs text-[#8A8F98] mt-1">총 인원</p>
          </div>
          <div className="bg-[#4EA7FC]/10 rounded-xl border border-[#5E6AD2]/30 shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-4 text-center">
            <p className="text-lg font-bold text-[#828FFF]">{fmt.format(grandTotal.base_pay)}</p>
            <p className="text-xs text-[#7070FF] mt-1">기본급</p>
          </div>
          <div className="bg-[#F0BF00]/10 rounded-xl border border-[#F0BF00]/30 shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-4 text-center">
            <p className="text-lg font-bold text-[#F0BF00]">{fmt.format(grandTotal.overtime_pay)}</p>
            <p className="text-xs text-[#F0BF00] mt-1">연장수당</p>
          </div>
          <div className="bg-[#5E6AD2]/10 rounded-xl border border-[#5E6AD2]/30 shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-4 text-center">
            <p className="text-lg font-bold text-[#828FFF]">{fmt.format(grandTotal.night_pay)}</p>
            <p className="text-xs text-[#7070FF] mt-1">야간수당</p>
          </div>
          <div className="bg-[#27A644]/10 rounded-xl border border-[#27A644]/30 shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-4 text-center">
            <p className="text-xl font-bold text-[#27A644]">{fmt.format(grandTotal.total_pay)}</p>
            <p className="text-xs text-[#27A644] mt-1">총 노무비</p>
          </div>
        </div>
      )}

      {/* Bar Chart — plain CSS, no library */}
      {results.length > 0 && (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5">
          <h3 className="text-sm font-semibold text-[#D0D6E0] mb-4">개인별 노무비 현황</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sortedResults.map((r, i) => (
              <div key={`chart-${i}`} className="flex items-center gap-3 text-xs">
                <span className="w-16 text-[#D0D6E0] font-medium truncate shrink-0">{r.name}</span>
                <div className="flex-1 bg-[#141516] rounded-full h-5 relative overflow-hidden">
                  <div
                    className="bg-[#4EA7FC] rounded-full h-5 flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max((r.total_pay / maxPay) * 100, 5)}%` }}
                  >
                    <span className="text-[10px] text-white font-medium whitespace-nowrap">
                      {fmt.format(r.total_pay)}
                    </span>
                  </div>
                </div>
                <span className={`w-12 text-right shrink-0 font-medium ${getCategoryTextColor(r.category)}`}>
                  {r.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomaly Detection */}
      {anomalies.length > 0 && (
        <div className="bg-[#EB5757]/10 rounded-xl border border-[#EB5757]/30 shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-5">
          <h3 className="text-sm font-semibold text-[#EB5757] mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-[#EB5757]" />
            이상 감지 ({anomalies.length}건)
          </h3>
          <div className="space-y-2">
            {anomalies.map((r, i) => (
              <div key={`anomaly-${i}`} className="flex items-start gap-2 text-xs text-[#EB5757]">
                <AlertTriangle size={12} className="text-[#EB5757] mt-0.5 shrink-0" />
                <p>
                  <span className="font-semibold">{r.name}</span>
                  {" — "}
                  {r.overtime_hours > 12
                    ? `연장근로 ${r.overtime_hours}시간 (법정 한도 12시간 초과)`
                    : `총 정규 근로시간 ${r.regular_hours}시간 (월 200시간 초과, 데이터 확인 필요)`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] shadow-[0px_1px_3px_rgba(0,0,0,0.2)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#23252A]">
            <h2 className="text-lg font-semibold text-[#F7F8F8]">
              {year}년 {month}월 노무비 계산 결과
            </h2>
            <p className="text-sm text-[#8A8F98] mt-1">
              총 {grandTotal?.workers ?? 0}명 | 총 노무비: {fmt.format(grandTotal?.total_pay ?? 0)}원
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#08090A] border-b border-[#23252A]">
                  <th className="text-left px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">이름</th>
                  <th className="text-left px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">구분</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">근무일</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">정규시간</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">연장시간</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">야간시간</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">시급</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">기본급</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">연장수당</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">야간수당</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">주휴수당</th>
                  <th className="text-right px-4 py-3 font-semibold text-[#D0D6E0] whitespace-nowrap">총 노무비</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={`row-${i}`}
                    className={`border-b border-[#23252A] hover:bg-[#141516]/5 ${isAnomalous(r) ? "bg-[#EB5757]/10 hover:bg-[#EB5757]/15" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-[#F7F8F8] whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getCategoryStyle(r.category)}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#D0D6E0]">{r.work_days}</td>
                    <td className="px-4 py-3 text-right text-[#D0D6E0]">{r.regular_hours}</td>
                    <td className={`px-4 py-3 text-right font-medium ${r.overtime_hours > 12 ? "text-[#EB5757]" : "text-[#D0D6E0]"}`}>
                      {r.overtime_hours}
                    </td>
                    <td className="px-4 py-3 text-right text-[#D0D6E0]">{r.night_hours}</td>
                    <td className="px-4 py-3 text-right text-[#D0D6E0]">{fmt.format(r.hourly_rate)}</td>
                    <td className="px-4 py-3 text-right text-[#F7F8F8] font-medium">{fmt.format(r.base_pay)}</td>
                    <td className="px-4 py-3 text-right text-[#FC7840] font-medium">{fmt.format(r.overtime_pay)}</td>
                    <td className="px-4 py-3 text-right text-[#7070FF] font-medium">{fmt.format(r.night_pay)}</td>
                    <td className="px-4 py-3 text-right text-[#27A644] font-medium">{fmt.format(r.weekly_holiday_pay || 0)}</td>
                    <td className="px-4 py-3 text-right text-[#828FFF] font-bold whitespace-nowrap">{fmt.format(r.total_pay)}</td>
                  </tr>
                ))}
              </tbody>
              {grandTotal && (
                <tfoot>
                  <tr className="bg-[#4EA7FC]/10 border-t-2 border-[#5E6AD2]/30 font-bold">
                    <td className="px-4 py-3 text-[#4EA7FC]" colSpan={7}>
                      합계 ({grandTotal.workers}명)
                    </td>
                    <td className="px-4 py-3 text-right text-[#F7F8F8]">{fmt.format(grandTotal.base_pay)}</td>
                    <td className="px-4 py-3 text-right text-[#FC7840]">{fmt.format(grandTotal.overtime_pay)}</td>
                    <td className="px-4 py-3 text-right text-[#828FFF]">{fmt.format(grandTotal.night_pay)}</td>
                    <td className="px-4 py-3 text-right text-[#27A644]">{fmt.format(grandTotal.weekly_holiday_pay || 0)}</td>
                    <td className="px-4 py-3 text-right text-[#828FFF] whitespace-nowrap">{fmt.format(grandTotal.total_pay)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && !calcError && (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] shadow-[0px_1px_3px_rgba(0,0,0,0.2)] p-12 text-center">
          <Calculator size={48} className="mx-auto mb-4 text-[#62666D]" />
          <p className="text-[#8A8F98] text-sm">
            연도와 월을 선택한 후 "계산" 버튼을 눌러주세요.
          </p>
        </div>
      )}
    </div>
  );
}
