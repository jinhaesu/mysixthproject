"use client";

import { useEffect, useState } from "react";
import { getStats, getFilters } from "@/lib/api";
import type { StatsData, FilterOptions } from "@/types/attendance";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const formatHours = (val: number | undefined) => val != null ? `${val.toFixed(1)}h` : "-";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [dateRange, setDateRange] = useState({ startDate: "", endDate: "" });
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(params: Record<string, string> = {}) {
    setLoading(true);
    try {
      const [s, f] = await Promise.all([getStats(params), getFilters()]);
      setStats(s);
      setFilters(f);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  function handleFilter() {
    const params: Record<string, string> = {};
    if (dateRange.startDate) params.startDate = dateRange.startDate;
    if (dateRange.endDate) params.endDate = dateRange.endDate;
    loadData(params);
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">대시보드</h2>
          <p className="text-gray-500 mt-1">근태 데이터를 다양한 관점에서 분석합니다.</p>
        </div>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center gap-4 flex-wrap">
        <label className="text-sm font-medium text-gray-700">기간 필터:</label>
        <input
          type="date"
          value={dateRange.startDate}
          onChange={(e) => setDateRange((d) => ({ ...d, startDate: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <span className="text-gray-400">~</span>
        <input
          type="date"
          value={dateRange.endDate}
          onChange={(e) => setDateRange((d) => ({ ...d, endDate: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleFilter}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          적용
        </button>
        <button
          onClick={() => { setDateRange({ startDate: "", endDate: "" }); loadData(); }}
          className="text-gray-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          초기화
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* By Worker */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">근로자별 근태시간</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byWorker} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 12 }} />
                <Tooltip formatter={formatHours} />
                <Legend />
                <Bar dataKey="regular_hours" name="정규시간" fill="#3b82f6" stackId="a" />
                <Bar dataKey="overtime_hours" name="연장시간" fill="#ef4444" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Category (Pie) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">구분별 근태시간</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byCategory.map((c) => ({ name: c.category || "미분류", value: c.total_hours }))}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stats.byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={formatHours} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Department */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">부서별 근태시간</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byDepartment}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={formatHours} />
                <Legend />
                <Bar dataKey="regular_hours" name="정규시간" fill="#10b981" />
                <Bar dataKey="overtime_hours" name="연장시간" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Workplace */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">근무지별 근태시간</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byWorkplace}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="workplace" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={formatHours} />
                <Legend />
                <Bar dataKey="total_hours" name="총 근로시간" fill="#8b5cf6" />
                <Bar dataKey="overtime_hours" name="연장시간" fill="#ec4899" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily/Monthly Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">날짜별 근태 추이</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("daily")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === "daily"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                일별
              </button>
              <button
                onClick={() => setViewMode("monthly")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === "monthly"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                월별
              </button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={viewMode === "daily" ? stats.dailyTrend : stats.monthlyTrend}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={viewMode === "daily" ? "date" : "month"}
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_hours"
                  name="총 근로시간"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="overtime_hours"
                  name="연장시간"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="출근 인원"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
