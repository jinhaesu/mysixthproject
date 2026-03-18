"use client";

import { useState, useEffect } from "react";
import { Calculator, Download, Save, Loader2, Settings } from "lucide-react";
import {
  calculatePayroll,
  getPayrollSettings,
  savePayrollSettings,
  exportPayrollExcel,
} from "@/lib/api";

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

function formatNum(n: number): string {
  return fmt.format(n);
}

export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<"calculate" | "settings">("calculate");

  // Settings state
  const [settings, setSettings] = useState<PayrollSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Calculate state
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [results, setResults] = useState<PayrollResult[]>([]);
  const [grandTotal, setGrandTotal] = useState<GrandTotal | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [exporting, setExporting] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const data = await getPayrollSettings();
      if (data && data.length > 0) {
        setSettings(data);
      } else {
        // Initialize with defaults
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
      alert(err.message || "엑셀 다운로드에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calculator size={28} />
            급여 자동계산
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            근태 데이터 기반 급여를 자동으로 계산합니다.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab("calculate")}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "calculate"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Calculator size={16} className="inline mr-2" />
            급여 계산
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "settings"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Settings size={16} className="inline mr-2" />
            단가 설정
          </button>
        </nav>
      </div>

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">구분별 단가 설정</h2>
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {settingsSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {settingsSaving ? "저장 중..." : "저장"}
            </button>
          </div>

          {settingsError && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {settingsError}
            </div>
          )}
          {settingsSaved && (
            <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              설정이 저장되었습니다.
            </div>
          )}

          {settingsLoading ? (
            <div className="p-12 text-center text-gray-400">
              <Loader2 size={32} className="animate-spin mx-auto mb-2" />
              설정 로딩 중...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-6 py-3 font-semibold text-gray-700">구분</th>
                    <th className="text-right px-6 py-3 font-semibold text-gray-700">시급 (원)</th>
                    <th className="text-right px-6 py-3 font-semibold text-gray-700">연장배율</th>
                    <th className="text-right px-6 py-3 font-semibold text-gray-700">야간배율</th>
                    <th className="text-center px-6 py-3 font-semibold text-gray-700">주휴수당</th>
                    <th className="text-left px-6 py-3 font-semibold text-gray-700">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((s, i) => (
                    <tr key={s.category} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{s.category}</td>
                      <td className="px-6 py-3">
                        <input
                          type="number"
                          value={s.hourly_rate}
                          onChange={(e) => updateSetting(i, "hourly_rate", Number(e.target.value))}
                          className="w-32 text-right border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="number"
                          step="0.1"
                          value={s.overtime_multiplier}
                          onChange={(e) => updateSetting(i, "overtime_multiplier", Number(e.target.value))}
                          className="w-24 text-right border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="number"
                          step="0.1"
                          value={s.night_multiplier}
                          onChange={(e) => updateSetting(i, "night_multiplier", Number(e.target.value))}
                          className="w-24 text-right border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="px-6 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={!!s.weekly_holiday_enabled}
                          onChange={(e) => updateSetting(i, "weekly_holiday_enabled", e.target.checked ? 1 : 0)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-3">
                        <input
                          type="text"
                          value={s.memo || ""}
                          onChange={(e) => updateSetting(i, "memo", e.target.value)}
                          placeholder="메모"
                          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Calculate Tab */}
      {activeTab === "calculate" && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">연도</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">월</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleCalculate}
                disabled={calcLoading}
                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {calcLoading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                {calcLoading ? "계산 중..." : "계산"}
              </button>
              {results.length > 0 && (
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {exporting ? "다운로드 중..." : "엑셀 다운로드"}
                </button>
              )}
            </div>
          </div>

          {calcError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {calcError}
            </div>
          )}

          {/* Results Table */}
          {results.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {year}년 {month}월 급여 계산 결과
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  총 {grandTotal?.workers || 0}명 | 총 급여: {formatNum(grandTotal?.total_pay || 0)}원
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">이름</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">구분</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">근무일</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">정규시간</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">연장시간</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">야간시간</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">시급</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">기본급</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">연장수당</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">야간수당</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">주휴수당</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">총급여</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr
                        key={`${r.name}-${i}`}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                            {r.category || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.work_days}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.regular_hours}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.overtime_hours}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.night_hours}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatNum(r.hourly_rate)}</td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatNum(r.base_pay)}</td>
                        <td className="px-4 py-3 text-right text-orange-600 font-medium">{formatNum(r.overtime_pay)}</td>
                        <td className="px-4 py-3 text-right text-purple-600 font-medium">{formatNum(r.night_pay)}</td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">{formatNum(r.weekly_holiday_pay)}</td>
                        <td className="px-4 py-3 text-right text-blue-700 font-bold whitespace-nowrap">{formatNum(r.total_pay)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {grandTotal && (
                    <tfoot>
                      <tr className="bg-blue-50 border-t-2 border-blue-200 font-bold">
                        <td className="px-4 py-3 text-blue-900" colSpan={7}>
                          합계 ({grandTotal.workers}명)
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">{formatNum(grandTotal.base_pay)}</td>
                        <td className="px-4 py-3 text-right text-orange-700">{formatNum(grandTotal.overtime_pay)}</td>
                        <td className="px-4 py-3 text-right text-purple-700">{formatNum(grandTotal.night_pay)}</td>
                        <td className="px-4 py-3 text-right text-green-700">{formatNum(grandTotal.weekly_holiday_pay)}</td>
                        <td className="px-4 py-3 text-right text-blue-800 whitespace-nowrap">{formatNum(grandTotal.total_pay)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!calcLoading && results.length === 0 && !calcError && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <Calculator size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 text-sm">
                연도와 월을 선택한 후 "계산" 버튼을 눌러주세요.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
