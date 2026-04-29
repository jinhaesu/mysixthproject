"use client";

import { useState, useEffect } from "react";
import { Calculator, Download, Save, Settings } from "lucide-react";
import {
  calculatePayroll,
  getPayrollSettings,
  savePayrollSettings,
  exportPayrollExcel,
} from "@/lib/api";
import {
  PageHeader, Card, CardHeader, Badge, Button, Input, Select, Field, Tabs, EmptyState, SkeletonCard, useToast,
} from "@/components/ui";

interface PayrollSetting {
  id?: number;
  category: string;
  hourly_rate: number;
  overtime_multiplier: number;
  night_multiplier: number;
  weekly_holiday_enabled: number;
  memo: string;
}

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

const DEFAULT_CATEGORIES = ["파견", "알바", "사업소득", "정규직"];
const fmt = new Intl.NumberFormat("ko-KR");

type TabId = "calculate" | "settings";

export default function PayrollPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("calculate");

  const [settings, setSettings] = useState<PayrollSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [results, setResults] = useState<PayrollResult[]>([]);
  const [grandTotal, setGrandTotal] = useState<GrandTotal | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const data = await getPayrollSettings();
      if (data && data.length > 0) {
        setSettings(data);
      } else {
        setSettings(
          DEFAULT_CATEGORIES.map((cat) => ({
            category: cat,
            hourly_rate: 0,
            overtime_multiplier: 1.5,
            night_multiplier: 0.5,
            weekly_holiday_enabled: 1,
            memo: "",
          }))
        );
      }
    } catch (err: any) {
      setSettingsError(err.message || "설정을 불러오는데 실패했습니다.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleSaveSettings() {
    setSettingsSaving(true);
    setSettingsError("");
    setSettingsSaved(false);
    try {
      const updated = await savePayrollSettings(settings);
      setSettings(updated);
      setSettingsSaved(true);
      toast.success("설정이 저장되었습니다.");
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (err: any) {
      setSettingsError(err.message || "저장에 실패했습니다.");
    } finally {
      setSettingsSaving(false);
    }
  }

  function updateSetting(index: number, field: keyof PayrollSetting, value: any) {
    setSettings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleCalculate() {
    setCalcLoading(true);
    setCalcError("");
    try {
      const data = await calculatePayroll(year, month);
      setResults(data.results || []);
      setGrandTotal(data.grandTotal || null);
    } catch (err: any) {
      setCalcError(err.message || "계산에 실패했습니다.");
    } finally {
      setCalcLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await exportPayrollExcel(year, month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payroll_${year}-${String(month).padStart(2, "0")}.xlsx`;
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

  return (
    <div className="space-y-6 fade-in">
      <PageHeader
        eyebrow="급여"
        title="급여 자동계산"
        description="근태 데이터 기반 급여를 자동으로 계산합니다."
      />

      <Tabs<TabId>
        tabs={[
          { id: "calculate", label: "급여 계산", icon: <Calculator size={14} /> },
          { id: "settings", label: "단가 설정", icon: <Settings size={14} /> },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "settings" && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-1)] flex items-center justify-between">
            <CardHeader title="구분별 단가 설정" />
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Save size={14} />}
              loading={settingsSaving}
              onClick={handleSaveSettings}
            >
              저장
            </Button>
          </div>

          {settingsError && (
            <div className="mx-5 mt-4 p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] text-[var(--fs-caption)] text-[var(--danger-fg)]">
              {settingsError}
            </div>
          )}
          {settingsSaved && (
            <div className="mx-5 mt-4 p-3 bg-[var(--success-bg)] border border-[var(--success-border)] rounded-[var(--r-md)] text-[var(--fs-caption)] text-[var(--success-fg)]">
              설정이 저장되었습니다.
            </div>
          )}

          {settingsLoading ? (
            <div className="p-12 text-center text-[var(--text-4)]">설정 로딩 중...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="bg-[var(--bg-canvas)] border-b border-[var(--border-1)]">
                    {['구분','시급 (원)','연장배율','야간배율','주휴수당','메모'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-eyebrow">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settings.map((s, i) => (
                    <tr key={s.category} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)]">{s.category}</td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          inputSize="sm"
                          value={s.hourly_rate}
                          onChange={(e) => updateSetting(i, "hourly_rate", Number(e.target.value))}
                          className="w-32 text-right"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          inputSize="sm"
                          step="0.1"
                          value={s.overtime_multiplier}
                          onChange={(e) => updateSetting(i, "overtime_multiplier", Number(e.target.value))}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          inputSize="sm"
                          step="0.1"
                          value={s.night_multiplier}
                          onChange={(e) => updateSetting(i, "night_multiplier", Number(e.target.value))}
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={!!s.weekly_holiday_enabled}
                          onChange={(e) => updateSetting(i, "weekly_holiday_enabled", e.target.checked ? 1 : 0)}
                          className="w-4 h-4 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="text"
                          inputSize="sm"
                          value={s.memo || ""}
                          onChange={(e) => updateSetting(i, "memo", e.target.value)}
                          placeholder="메모"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === "calculate" && (
        <div className="space-y-6">
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
                <Button
                  variant="primary"
                  leadingIcon={<Calculator size={14} />}
                  loading={calcLoading}
                  onClick={handleCalculate}
                >
                  계산
                </Button>
              </div>
              {results.length > 0 && (
                <div className="self-end">
                  <Button
                    variant="secondary"
                    leadingIcon={<Download size={14} />}
                    loading={exporting}
                    onClick={handleExport}
                  >
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

          {results.length > 0 && (
            <Card padding="none" className="overflow-hidden hover-lift">
              <div className="px-5 py-3 border-b border-[var(--border-1)]">
                <CardHeader
                  title={`${year}년 ${month}월 급여 계산 결과`}
                  subtitle={`총 ${grandTotal?.workers || 0}명 | 총 급여: ${fmt.format(grandTotal?.total_pay || 0)}원`}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[var(--fs-body)]">
                  <thead>
                    <tr className="bg-[var(--bg-canvas)] border-b border-[var(--border-1)]">
                      {['이름','구분','근무일','정규시간','연장시간','야간시간','시급','기본급','연장수당','야간수당','주휴수당','총급여'].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-eyebrow whitespace-nowrap ${['근무일','정규시간','연장시간','야간시간','시급','기본급','연장수당','야간수당','주휴수당','총급여'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={`${r.name}-${i}`} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-[var(--text-1)] whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge tone="brand" size="sm">{r.category || "-"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.work_days}</td>
                        <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.regular_hours}</td>
                        <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.overtime_hours}</td>
                        <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{r.night_hours}</td>
                        <td className="px-4 py-3 text-right tabular text-[var(--text-2)]">{fmt.format(r.hourly_rate)}</td>
                        <td className="px-4 py-3 text-right tabular font-medium text-[var(--text-1)]">{fmt.format(r.base_pay)}</td>
                        <td className="px-4 py-3 text-right tabular font-medium text-[var(--warning-fg)]">{fmt.format(r.overtime_pay)}</td>
                        <td className="px-4 py-3 text-right tabular font-medium text-[var(--brand-400)]">{fmt.format(r.night_pay)}</td>
                        <td className="px-4 py-3 text-right tabular font-medium text-[var(--success-fg)]">{fmt.format(r.weekly_holiday_pay)}</td>
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
                        <td className="px-4 py-3 text-right tabular text-[var(--success-fg)]">{fmt.format(grandTotal.weekly_holiday_pay)}</td>
                        <td className="px-4 py-3 text-right tabular text-[var(--brand-400)] whitespace-nowrap">{fmt.format(grandTotal.total_pay)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}

          {!calcLoading && results.length === 0 && !calcError && (
            <EmptyState
              icon={<Calculator className="w-7 h-7" />}
              title="연도와 월을 선택 후 계산 버튼을 눌러주세요."
            />
          )}
        </div>
      )}
    </div>
  );
}
