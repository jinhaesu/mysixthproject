"use client";

import { useEffect, useState } from "react";
import { getPivotData } from "@/lib/api";
import type { PivotData } from "@/types/attendance";
import { BarChart2 } from "lucide-react";
import {
  PageHeader, Card, CardHeader, Button, Field, Select, Input, EmptyState, CenterSpinner,
} from "@/components/ui";

const FIELD_LABELS: Record<string, string> = {
  name: "이름",
  department: "부서",
  workplace: "근무층",
  category: "고용형태",
  shift: "근무시간대",
  date: "날짜",
  annual_leave: "연차 사용여부",
};

const VALUE_LABELS: Record<string, string> = {
  total_hours: "총 근무시간",
  regular_hours: "정규시간",
  overtime_hours: "연장시간",
  night_hours: "야간시간",
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
  const [error, setError] = useState("");
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
    setError("");
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
    } catch (err: any) {
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 fade-in">
      <PageHeader
        eyebrow="분석"
        title="피벗 테이블"
        description="조건을 설정하여 데이터를 교차분석합니다."
        actions={
          <Button variant="primary" size="sm" leadingIcon={<BarChart2 size={14} />} onClick={loadPivot} loading={loading}>
            분석 실행
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Field label="행 (Row)">
            <Select
              inputSize="sm"
              value={config.rowField}
              onChange={(e) => setConfig((c) => ({ ...c, rowField: e.target.value }))}
            >
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="열 (Column)">
            <Select
              inputSize="sm"
              value={config.colField}
              onChange={(e) => setConfig((c) => ({ ...c, colField: e.target.value }))}
            >
              {Object.entries(FIELD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="값 (Value)">
            <Select
              inputSize="sm"
              value={config.valueField}
              onChange={(e) => setConfig((c) => ({ ...c, valueField: e.target.value }))}
            >
              {Object.entries(VALUE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="집계 함수">
            <Select
              inputSize="sm"
              value={config.aggFunc}
              onChange={(e) => setConfig((c) => ({ ...c, aggFunc: e.target.value }))}
            >
              {Object.entries(AGG_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="시작일">
            <Input
              type="date"
              inputSize="sm"
              value={config.startDate}
              onChange={(e) => setConfig((c) => ({ ...c, startDate: e.target.value }))}
            />
          </Field>
          <Field label="종료일">
            <Input
              type="date"
              inputSize="sm"
              value={config.endDate}
              onChange={(e) => setConfig((c) => ({ ...c, endDate: e.target.value }))}
            />
          </Field>
        </div>
      </Card>

      {error && (
        <div className="p-3 bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] text-[var(--fs-caption)] text-[var(--danger-fg)]">
          {error}
        </div>
      )}

      {loading ? (
        <CenterSpinner />
      ) : pivotData && pivotData.data.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 bg-[var(--bg-canvas)] border-b border-[var(--border-1)] flex items-center justify-between">
            <CardHeader
              title={`${FIELD_LABELS[pivotData.rowField] || pivotData.rowField} × ${FIELD_LABELS[pivotData.colField] || pivotData.colField} | ${AGG_LABELS[pivotData.aggFunc] || pivotData.aggFunc}(${VALUE_LABELS[pivotData.valueField] || pivotData.valueField})`}
            />
            <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{pivotData.data.length}행</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular border-separate border-spacing-0">
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-[var(--bg-2)] border-b border-[var(--border-1)]">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] sticky left-0 bg-[var(--bg-2)]">
                    {FIELD_LABELS[pivotData.rowField] || pivotData.rowField}
                  </th>
                  {pivotData.columns.map((col) => (
                    <th key={col} className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] whitespace-nowrap">
                      {col || "미분류"}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-1)] border-b border-[var(--border-1)] bg-[var(--info-bg)]">합계</th>
                </tr>
              </thead>
              <tbody>
                {pivotData.data.map((row, i) => {
                  const rowTotal = pivotData.columns.reduce(
                    (sum, col) => sum + (row[col] || 0),
                    0
                  );
                  return (
                    <tr key={i} className="border-b border-[var(--border-1)] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-[var(--text-1)] sticky left-0 bg-[var(--bg-1)] border-b border-[var(--border-1)]">
                        {row.rowKey || "미분류"}
                      </td>
                      {pivotData.columns.map((col) => (
                        <td key={col} className="text-right px-4 py-3 text-[var(--text-3)] tabular border-b border-[var(--border-1)]">
                          {row[col] !== undefined && row[col] !== null ? Number(row[col]).toFixed(1) : "-"}
                        </td>
                      ))}
                      <td className="text-right px-4 py-3 font-semibold text-[var(--text-1)] bg-[var(--info-bg)] tabular border-b border-[var(--border-1)]">
                        {rowTotal.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-[var(--info-bg)] font-semibold border-t-2 border-[var(--info-border)]">
                  <td className="px-4 py-3 text-[var(--text-1)] sticky left-0 bg-[var(--info-bg)] border-b border-[var(--border-1)]">합계</td>
                  {pivotData.columns.map((col) => {
                    const colTotal = pivotData.data.reduce(
                      (sum, row) => sum + (row[col] || 0),
                      0
                    );
                    return (
                      <td key={col} className="text-right px-4 py-3 text-[var(--text-1)] tabular border-b border-[var(--border-1)]">
                        {colTotal.toFixed(1)}
                      </td>
                    );
                  })}
                  <td className="text-right px-4 py-3 text-[var(--text-1)] tabular border-b border-[var(--border-1)]">
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
        </Card>
      ) : pivotData ? (
        <EmptyState
          icon={<BarChart2 className="w-7 h-7" />}
          title="데이터 없음"
          description="먼저 엑셀 파일을 업로드해주세요."
        />
      ) : null}
    </div>
  );
}
