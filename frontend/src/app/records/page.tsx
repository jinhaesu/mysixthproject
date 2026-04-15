"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getRecords, getFilters } from "@/lib/api";
import type { AttendanceRecord, FilterOptions } from "@/types/attendance";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

function RecordsContent() {
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type") || ""; // "regular" or "dispatch" or ""
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<Record<string, string>>({});
  const [nameSearch, setNameSearch] = useState("");
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const initQuery: Record<string, string> = { page: "1" };
    if (pageType === "regular") initQuery.category = "정규직";
    else if (pageType === "dispatch") initQuery.exclude_regular = "1";
    setQuery(initQuery);
    Promise.all([loadRecords(initQuery), getFilters().then(f => {
      if (f && pageType === "regular") {
        f.categories = f.categories.filter(c => c === "정규직");
      } else if (f && pageType === "dispatch") {
        f.categories = f.categories.filter(c => c !== "정규직");
      }
      setFilters(f);
    })]);
  }, [loadRecords, pageType]);

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
      <h2 className="text-2xl font-bold text-[#F7F8F8] mb-2">기록 조회</h2>
      <p className="text-[#8A8F98] mb-8">전체 근태 기록을 필터링하여 조회합니다.</p>

      {/* Filters */}
      <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#8A8F98] mb-1">시작일</label>
            <input
              type="date"
              onChange={(e) => handleFilterChange("startDate", e.target.value)}
              className="w-full border border-[#23252A] rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8A8F98] mb-1">종료일</label>
            <input
              type="date"
              onChange={(e) => handleFilterChange("endDate", e.target.value)}
              className="w-full border border-[#23252A] rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8A8F98] mb-1">이름 검색</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#62666D]" />
              <input
                type="text"
                value={nameSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setNameSearch(val);
                  if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
                  nameDebounceRef.current = setTimeout(() => {
                    handleFilterChange("name", val);
                  }, 400);
                }}
                placeholder="이름을 입력하세요"
                className="w-full border border-[#23252A] rounded-lg pl-8 pr-3 py-2 text-sm"
                list="name-suggestions"
              />
              <datalist id="name-suggestions">
                {filters?.names.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8A8F98] mb-1">구분</label>
            <select
              onChange={(e) => handleFilterChange("category", e.target.value)}
              className="w-full border border-[#23252A] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {filters?.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8A8F98] mb-1">부서</label>
            <select
              onChange={(e) => handleFilterChange("department", e.target.value)}
              className="w-full border border-[#23252A] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">전체</option>
              {filters?.departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#8A8F98] mb-1">근무지</label>
            <select
              onChange={(e) => handleFilterChange("workplace", e.target.value)}
              className="w-full border border-[#23252A] rounded-lg px-3 py-2 text-sm"
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
      <div className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#08090A] border-b border-[#23252A]">
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">날짜</th>
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">이름</th>
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">출근</th>
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">퇴근</th>
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">구분</th>
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">부서</th>
                <th className="text-left px-4 py-3 font-medium text-[#D0D6E0]">근무지</th>
                <th className="text-right px-4 py-3 font-medium text-[#D0D6E0]">총시간</th>
                <th className="text-right px-4 py-3 font-medium text-[#D0D6E0]">정규</th>
                <th className="text-right px-4 py-3 font-medium text-[#D0D6E0]">연장</th>
                <th className="text-right px-4 py-3 font-medium text-[#D0D6E0]">휴게</th>
                <th className="text-center px-4 py-3 font-medium text-[#D0D6E0]">연차</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-[#62666D]">
                    <div className="w-6 h-6 border-4 border-[#5E6AD2]/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-[#62666D]">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-[#23252A] hover:bg-[#141516]/5">
                    <td className="px-4 py-3 text-[#F7F8F8]">{r.date}</td>
                    <td className="px-4 py-3 font-medium text-[#F7F8F8]">{r.name}</td>
                    <td className="px-4 py-3 text-[#8A8F98]">{r.clock_in}</td>
                    <td className="px-4 py-3 text-[#8A8F98]">{r.clock_out}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        r.category === "정규직"
                          ? "bg-[#4EA7FC]/15 text-[#828FFF]"
                          : "bg-[#FC7840]/15 text-[#FC7840]"
                      }`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#8A8F98]">{r.department}</td>
                    <td className="px-4 py-3 text-[#8A8F98]">{r.workplace}</td>
                    <td className="text-right px-4 py-3 text-[#F7F8F8] tabular-nums">{r.total_hours.toFixed(1)}</td>
                    <td className="text-right px-4 py-3 text-[#8A8F98] tabular-nums">{r.regular_hours.toFixed(1)}</td>
                    <td className="text-right px-4 py-3 tabular-nums">
                      <span className={r.overtime_hours > 0 ? "text-[#EB5757] font-medium" : "text-[#62666D]"}>
                        {r.overtime_hours.toFixed(1)}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3 text-[#8A8F98] tabular-nums">{r.break_time.toFixed(1)}</td>
                    <td className="text-center px-4 py-3">
                      {r.annual_leave === "O" ? (
                        <span className="bg-[#27A644]/15 text-[#27A644] px-2 py-0.5 rounded text-xs font-medium">O</span>
                      ) : (
                        <span className="text-[#62666D]">-</span>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#23252A]">
            <span className="text-sm text-[#8A8F98]">
              총 {pagination.total.toLocaleString()}건 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}건
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg hover:bg-[#141516]/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-[#D0D6E0]">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg hover:bg-[#141516]/5 disabled:opacity-30 disabled:cursor-not-allowed"
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

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[#62666D]">로딩 중...</div>}>
      <RecordsContent />
    </Suspense>
  );
}
