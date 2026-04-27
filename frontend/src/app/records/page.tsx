"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getRecords, getFilters } from "@/lib/api";
import type { AttendanceRecord, FilterOptions } from "@/types/attendance";
import { ChevronLeft, ChevronRight, Search, ClipboardList } from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Field, Select, Input, EmptyState, CenterSpinner, Toolbar,
} from "@/components/ui";

function RecordsContent() {
  const searchParams = useSearchParams();
  const pageType = searchParams.get("type") || "";
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
    <div className="space-y-4 fade-in">
      <PageHeader
        eyebrow="근태"
        title="기록 조회"
        description="전체 근태 기록을 필터링하여 조회합니다."
      />

      <Toolbar>
        <Field label="시작일">
          <Input
            type="date"
            inputSize="sm"
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
            className="w-36"
          />
        </Field>
        <Field label="종료일">
          <Input
            type="date"
            inputSize="sm"
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
            className="w-36"
          />
        </Field>
        <Field label="이름 검색">
          <Input
            type="text"
            inputSize="sm"
            value={nameSearch}
            iconLeft={<Search size={13} />}
            onChange={(e) => {
              const val = e.target.value;
              setNameSearch(val);
              if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
              nameDebounceRef.current = setTimeout(() => {
                handleFilterChange("name", val);
              }, 400);
            }}
            placeholder="이름을 입력하세요"
            className="w-40"
            list="name-suggestions"
          />
          <datalist id="name-suggestions">
            {filters?.names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="구분">
          <Select
            inputSize="sm"
            onChange={(e) => handleFilterChange("category", e.target.value)}
            className="w-28"
          >
            <option value="">전체</option>
            {filters?.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="부서">
          <Select
            inputSize="sm"
            onChange={(e) => handleFilterChange("department", e.target.value)}
            className="w-28"
          >
            <option value="">전체</option>
            {filters?.departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="근무지">
          <Select
            inputSize="sm"
            onChange={(e) => handleFilterChange("workplace", e.target.value)}
            className="w-28"
          >
            <option value="">전체</option>
            {filters?.workplaces.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </Select>
        </Field>
      </Toolbar>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular border-separate border-spacing-0">
            <thead className="sticky top-0 z-[1]">
              <tr className="bg-[var(--bg-2)] border-b border-[var(--border-1)]">
                {['날짜','이름','출근','퇴근'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] whitespace-nowrap">{h}</th>
                ))}
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] whitespace-nowrap">구분</th>
                {['부서','근무지'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] whitespace-nowrap">{h}</th>
                ))}
                {['총시간','정규','연장','휴게'].map(h => (
                  <th key={h} className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] whitespace-nowrap">{h}</th>
                ))}
                <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-3)] border-b border-[var(--border-1)] whitespace-nowrap">연차</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-16">
                    <CenterSpinner />
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-[var(--text-4)]">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border-1)] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-[var(--text-1)] border-b border-[var(--border-1)]">{r.date}</td>
                    <td className="px-4 py-3 font-medium text-[var(--text-1)] border-b border-[var(--border-1)]">{r.name}</td>
                    <td className="px-4 py-3 text-[var(--text-3)] border-b border-[var(--border-1)]">{r.clock_in}</td>
                    <td className="px-4 py-3 text-[var(--text-3)] border-b border-[var(--border-1)]">{r.clock_out}</td>
                    <td className="px-4 py-3 border-b border-[var(--border-1)]">
                      <Badge
                        tone={r.category === "정규직" ? "brand" : "warning"}
                        size="sm"
                      >
                        {r.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-3)] border-b border-[var(--border-1)]">{r.department}</td>
                    <td className="px-4 py-3 text-[var(--text-3)] border-b border-[var(--border-1)]">{r.workplace}</td>
                    <td className="text-right px-4 py-3 text-[var(--text-1)] tabular border-b border-[var(--border-1)]">{r.total_hours.toFixed(1)}</td>
                    <td className="text-right px-4 py-3 text-[var(--text-3)] tabular border-b border-[var(--border-1)]">{r.regular_hours.toFixed(1)}</td>
                    <td className="text-right px-4 py-3 tabular border-b border-[var(--border-1)]">
                      <span className={r.overtime_hours > 0 ? "text-[var(--danger-fg)] font-medium" : "text-[var(--text-4)]"}>
                        {r.overtime_hours.toFixed(1)}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3 text-[var(--text-3)] tabular border-b border-[var(--border-1)]">{r.break_time.toFixed(1)}</td>
                    <td className="text-center px-4 py-3 border-b border-[var(--border-1)]">
                      {r.annual_leave === "O" ? (
                        <Badge tone="success" size="sm">O</Badge>
                      ) : (
                        <span className="text-[var(--text-4)]">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-1)] bg-[var(--bg-1)]">
            <span className="text-[var(--fs-caption)] text-[var(--text-3)]">
              총 {pagination.total.toLocaleString()}건 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}건
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                leadingIcon={<ChevronLeft size={14} />}
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                이전
              </Button>
              <span className="text-[var(--fs-caption)] text-[var(--text-2)] px-2 tabular">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="ghost"
                size="xs"
                trailingIcon={<ChevronRight size={14} />}
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                다음
              </Button>
            </div>
          </div>
        )}
      </Card>

      {!loading && records.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="w-7 h-7" />}
          title="기록 없음"
          description="선택한 조건에 해당하는 기록이 없습니다."
        />
      )}
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<CenterSpinner />}>
      <RecordsContent />
    </Suspense>
  );
}
