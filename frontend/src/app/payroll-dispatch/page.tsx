"use client";

import { useState } from "react";
import { Calculator, Download, AlertTriangle } from "lucide-react";
import { calculatePayroll, exportPayrollExcel } from "@/lib/api";
import {
  PageHeader, Card, CardHeader, Badge, Button, Field, Select, EmptyState, Stat, useToast,
} from "@/components/ui";

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

function getCategoryTone(category: string): "warning" | "brand" | "neutral" {
  if (category === "알바") return "warning";
  if (category === "파견") return "brand";
  return "neutral";
}

function isAnomalous(r: PayrollResult): boolean {
  return r.overtime_hours > 12 || r.regular_hours > 200;
}

export default function PayrollDispatchPage() {
  const toast = useToast();
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
      const total: GrandTotal = { workers: filtered.length, base_pay: 0, overtime_pay: 0, night_pay: 0, weekly_holiday_pay: 0, total_pay: 0 };
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
      toast.error(err.message || "엑셀 다운로드에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  const anomalies = results.filter(isAnomalous);
  const sortedResults = [...results].sort((a, b) => b.total_pay - a.total_pay);
  const maxPay = results.length > 0 ? Math.max(...results.map((r) => r.total_pay)) : 1;

  return (
    <div className="space-y-6 fade-in">
      <PageHeader
        eyebrow="노무비"
        title="사업소득(알바)/파견 노무비 관리"
        description="파견·알바·사업소득 근무자의 노무비를 관리합니다."
      />

      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <Field label="연도">
            <Select
              inputSize="sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </Select>
          </Field>
          <Field label="월">
            <Select
              inputSize="sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-20"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </Select>
          </Field>
          <div className="self-end">
            <Button variant="primary" leadingIcon={<Calculator size={14} />} loading={loading} onClick={handleCalculate}>
              계산
            </Button>
          </div>
          {results.length > 0 && (
            <div className="self-end">
              <Button variant="secondary" leadingIcon={<Download size={14} />} loading={exporting} onClick={handleExport}>
                엑셀 다운로드
              </Button>
            </div>
          )}
        </div>
      </Card>

      {calcError && (
        <div className="p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] text-[var(--fs-caption)] text-[var(--danger-fg)]">
          {calcError}
        </div>
      )}

      {grandTotal && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="총 인원" value={grandTotal.workers} unit="명" tone="neutral" />
          <Stat label="기본급" value={fmt.format(grandTotal.base_pay)} unit="원" tone="brand" />
          <Stat label="연장수당" value={fmt.format(grandTotal.overtime_pay)} unit="원" tone="warning" />
          <Stat label="야간수당" value={fmt.format(grandTotal.night_pay)} unit="원" tone="info" />
          <Stat label="총 노무비" value={fmt.format(grandTotal.total_pay)} unit="원" tone="success" />
        </div>
      )}

      {results.length > 0 && (
        <Card className="hover-lift">
          <CardHeader title="개인별 노무비 현황" className="mb-4" />
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sortedResults.map((r, i) => (
              <div key={`chart-${i}`} className="flex items-center gap-3 text-[var(--fs-caption)]">
                <span className="w-16 text-[var(--text-2)] font-medium truncate shrink-0">{r.name}</span>
                <div className="flex-1 bg-[var(--bg-3)] rounded-full h-5 relative overflow-hidden">
                  <div
                    className="bg-[var(--brand-500)] rounded-full h-5 flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max((r.total_pay / maxPay) * 100, 5)}%` }}
                  >
                    <span className="text-[10px] text-white font-medium whitespace-nowrap tabular">
                      {fmt.format(r.total_pay)}
                    </span>
                  </div>
                </div>
                <Badge tone={getCategoryTone(r.category)} size="xs">{r.category}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {anomalies.length > 0 && (
        <Card tone="ghost" className="border-[var(--danger-border)] bg-[var(--danger-bg)]">
          <h3 className="text-[var(--fs-body)] font-semibold text-[var(--danger-fg)] mb-3 flex items-center gap-2">
            <AlertTriangle size={16} />
            이상 감지 ({anomalies.length}건)
          </h3>
          <div className="space-y-2">
            {anomalies.map((r, i) => (
              <div key={`anomaly-${i}`} className="flex items-start gap-2 text-[var(--fs-caption)] text-[var(--danger-fg)]">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
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
        </Card>
      )}

      {results.length > 0 && (
        <Card padding="none" className="overflow-hidden hover-lift">
          <div className="px-5 py-3 border-b border-[var(--border-1)]">
            <CardHeader
              title={`${year}년 ${month}월 노무비 계산 결과`}
              subtitle={`총 ${grandTotal?.workers ?? 0}명 | 총 노무비: ${fmt.format(grandTotal?.total_pay ?? 0)}원`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[var(--fs-body)]">
              <thead>
                <tr className="bg-[var(--bg-canvas)] border-b border-[var(--border-1)]">
                  {['이름','구분','근무일','정규시간','연장시간','야간시간','시급','기본급','연장수당','야간수당','주휴수당','총 노무비'].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-eyebrow whitespace-nowrap ${['근무일','정규시간','연장시간','야간시간','시급','기본급','연장수당','야간수당','주휴수당','총 노무비'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={`row-${i}`}
                    className={`border-b border-[var(--border-1)] transition-colors ${isAnomalous(r) ? "bg-[var(--danger-bg)] hover:bg-[var(--danger-bg)]" : "hover:bg-[var(--bg-2)]/40"}`}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-1)] whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={getCategoryTone(r.category)} size="sm">{r.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.work_days}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.regular_hours}</td>
                    <td className={`px-4 py-3 text-right tabular font-medium ${r.overtime_hours > 12 ? "text-[var(--danger-fg)]" : "text-[var(--text-2)]"}`}>
                      {r.overtime_hours}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.night_hours}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{fmt.format(r.hourly_rate)}</td>
                    <td className="px-4 py-3 text-right tabular font-medium text-[var(--text-1)]">{fmt.format(r.base_pay)}</td>
                    <td className="px-4 py-3 text-right tabular font-medium text-[var(--warning-fg)]">{fmt.format(r.overtime_pay)}</td>
                    <td className="px-4 py-3 text-right tabular font-medium text-[var(--brand-400)]">{fmt.format(r.night_pay)}</td>
                    <td className="px-4 py-3 text-right tabular font-medium text-[var(--success-fg)]">{fmt.format(r.weekly_holiday_pay || 0)}</td>
                    <td className="px-4 py-3 text-right tabular font-bold text-[var(--brand-400)] whitespace-nowrap">{fmt.format(r.total_pay)}</td>
                  </tr>
                ))}
              </tbody>
              {grandTotal && (
                <tfoot>
                  <tr className="bg-[var(--brand-500)]/10 border-t-2 border-[var(--brand-500)]/30 font-bold">
                    <td className="px-4 py-3 text-[var(--brand-400)]" colSpan={7}>합계 ({grandTotal.workers}명)</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--text-1)]">{fmt.format(grandTotal.base_pay)}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--warning-fg)]">{fmt.format(grandTotal.overtime_pay)}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--brand-400)]">{fmt.format(grandTotal.night_pay)}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--success-fg)]">{fmt.format(grandTotal.weekly_holiday_pay || 0)}</td>
                    <td className="px-4 py-3 text-right tabular text-[var(--brand-400)] whitespace-nowrap">{fmt.format(grandTotal.total_pay)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {!loading && results.length === 0 && !calcError && (
        <EmptyState
          icon={<Calculator className="w-7 h-7" />}
          title="연도와 월을 선택한 후 계산 버튼을 눌러주세요."
        />
      )}
    </div>
  );
}
