"use client";

import { useEffect, useState, useCallback } from "react";
import { getRecords, getFilters } from "@/lib/api";
import type { AttendanceRecord, FilterOptions } from "@/types/attendance";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function RecordsPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<Record<string, string>>({});

  const loadRecords = useCallback(async (params: Record<string, string>) => {
    setLoading(true);
    try {
      const data = await getRecords({ ...params, limit: "50" });
      setRecords(data.records);
      setPagination(data.pagination);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadRecords({ page: "1" }), getFilters().then(setFilters)]);
  }, [loadRecords]);

  function handleFilterChange(key: string, value: string) {
    const newQuery = { ...query };
    if (value) {
      newQuery[key] = value;
    } else {
      delete newQuery[key];
    }
    newQuery.page = "1";
    setQuery(newQuery);
    loadRecords(newQuery);
  }

  function handlePageChange(page: number) {
    const newQuery = { ...query, page: String(page) };
    setQuery(newQuery);
    loadRecords(newQuery);
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">기록 조회</h2>
      <p className="text-gray-500 mb-8">전체 근태 기록을 필터링하여 조회합니다.</p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">시작일</label>
            <input
              type="date"
              onChange={(e) => handleFilterChange("startDate", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">종료일</label>
            <input
              type="date"
              onChange={(e) => handleFilterChange("endDate", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">이름</label>
            <select
              onChange={(e) => handleFilterChange("name", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {filters?.names.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">구분</label>
            <select
              onChange={(e) => handleFilterChange("category", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {filters?.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">부서</label>
            <select
              onChange={(e) => handleFilterChange("department", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {filters?.departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">근무지</label>
            <select
              onChange={(e) => handleFilterChange("workplace", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {filters?.workplaces.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700">날짜</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">이름</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">출근</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">퇴근</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">구분</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">부서</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">근무지</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">총시간</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">정규</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">연장</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">휴게</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700">연차</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    <div className="w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{r.date}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.clock_in}</td>
                    <td className="px-4 py-3 text-gray-600">{r.clock_out}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        r.category === "정규직"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.department}</td>
                    <td className="px-4 py-3 text-gray-600">{r.workplace}</td>
                    <td className="text-right px-4 py-3 text-gray-900 tabular-nums">{r.total_hours.toFixed(1)}</td>
                    <td className="text-right px-4 py-3 text-gray-600 tabular-nums">{r.regular_hours.toFixed(1)}</td>
                    <td className="text-right px-4 py-3 tabular-nums">
                      <span className={r.overtime_hours > 0 ? "text-red-600 font-medium" : "text-gray-400"}>
                        {r.overtime_hours.toFixed(1)}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3 text-gray-600 tabular-nums">{r.break_time.toFixed(1)}</td>
                    <td className="text-center px-4 py-3">
                      {r.annual_leave === "O" ? (
                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">O</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-500">
              총 {pagination.total.toLocaleString()}건 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}건
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-700">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
