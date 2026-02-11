"use client";

import { useEffect, useState } from "react";
import { getPivotData } from "@/lib/api";
import type { PivotData } from "@/types/attendance";

const FIELD_LABELS: Record<string, string> = {
  name: "이름",
  category: "구분",
  department: "부서",
  workplace: "근무지",
  date: "날짜",
  annual_leave: "연차",
};

const VALUE_LABELS: Record<string, string> = {
  total_hours: "총 근로시간",
  regular_hours: "정규시간",
  overtime_hours: "연장시간",
  break_time: "휴게시간",
};

const AGG_LABELS: Record<string, string> = {
  sum: "합계",
  avg: "평균",
  count: "건수",
  min: "최소",
  max: "최대",
};

export default function PivotPage() {
  const [pivotData, setPivotData] = useState<PivotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    rowField: "name",
    colField: "department",
    valueField: "total_hours",
    aggFunc: "sum",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    loadPivot();
  }, []);

  async function loadPivot() {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        rowField: config.rowField,
        colField: config.colField,
        valueField: config.valueField,
        aggFunc: config.aggFunc,
      };
      if (config.startDate) params.startDate = config.startDate;
      if (config.endDate) params.endDate = config.endDate;
      const data = await getPivotData(params);
      setPivotData(data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">피벗 테이블</h2>
      <p className="text-gray-500 mb-8">조건을 설정하여 데이터를 교차분석합니다.</p>

      {/* Config */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">행 (Row)</label>
            <select
              value={config.rowField}
              onChange={(e) => setConfig((c) => ({ ...c, rowField: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">열 (Column)</label>
            <select
              value={config.colField}
              onChange={(e) => setConfig((c) => ({ ...c, colField: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">값 (Value)</label>
            <select
              value={config.valueField}
              onChange={(e) => setConfig((c) => ({ ...c, valueField: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(VALUE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">집계 함수</label>
            <select
              value={config.aggFunc}
              onChange={(e) => setConfig((c) => ({ ...c, aggFunc: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(AGG_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig((c) => ({ ...c, startDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig((c) => ({ ...c, endDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={loadPivot}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          분석 실행
        </button>
      </div>

      {/* Pivot Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : pivotData && pivotData.data.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {FIELD_LABELS[pivotData.rowField]} x {FIELD_LABELS[pivotData.colField]} |{" "}
              {AGG_LABELS[pivotData.aggFunc]}({VALUE_LABELS[pivotData.valueField]})
            </span>
            <span className="text-sm text-gray-500">{pivotData.data.length}행</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-700 sticky left-0 bg-gray-50">
                    {FIELD_LABELS[pivotData.rowField]}
                  </th>
                  {pivotData.columns.map((col) => (
                    <th key={col} className="text-right px-4 py-3 font-medium text-gray-700">
                      {col || "미분류"}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-semibold text-gray-900 bg-blue-50">합계</th>
                </tr>
              </thead>
              <tbody>
                {pivotData.data.map((row, i) => {
                  const rowTotal = pivotData.columns.reduce(
                    (sum, col) => sum + (row[col] || 0),
                    0
                  );
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white">
                        {row.rowKey || "미분류"}
                      </td>
                      {pivotData.columns.map((col) => (
                        <td key={col} className="text-right px-4 py-3 text-gray-600 tabular-nums">
                          {row[col] !== undefined ? row[col].toFixed(1) : "-"}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 font-semibold text-gray-900 bg-blue-50 tabular-nums">
                        {rowTotal.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
                {/* Column totals */}
                <tr className="bg-blue-50 font-semibold">
                  <td className="px-4 py-3 text-gray-900 sticky left-0 bg-blue-50">합계</td>
                  {pivotData.columns.map((col) => {
                    const colTotal = pivotData.data.reduce(
                      (sum, row) => sum + (row[col] || 0),
                      0
                    );
                    return (
                      <td key={col} className="text-right px-4 py-3 text-gray-900 tabular-nums">
                        {colTotal.toFixed(1)}
                      </td>
                    );
                  })}
                  <td className="text-right px-4 py-3 text-gray-900 tabular-nums">
                    {pivotData.data
                      .reduce(
                        (total, row) =>
                          total +
                          pivotData.columns.reduce((sum, col) => sum + (row[col] || 0), 0),
                        0
                      )
                      .toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          데이터가 없습니다. 먼저 엑셀 파일을 업로드해주세요.
        </div>
      )}
    </div>
  );
}
