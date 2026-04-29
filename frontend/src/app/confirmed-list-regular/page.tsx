"use client";

import React, { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Table2, Edit3, Trash2, Lock, Unlock } from "lucide-react";
import {
  getConfirmedList,
  updateConfirmedRecord,
  deleteConfirmedRecord,
  getRegularVacations,
  getPayrollClosing,
  closePayroll,
  cancelPayrollClosing,
} from "@/lib/api";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Field,
  Input,
  Select,
  EmptyState,
  SkeletonTable,
  useToast,
  cn,
} from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");

const HOLIDAYS: Record<number, string[]> = {
  2025: ["2025-01-01","2025-01-28","2025-01-29","2025-01-30","2025-03-01","2025-05-05","2025-05-06","2025-06-06","2025-08-15","2025-10-03","2025-10-05","2025-10-06","2025-10-07","2025-10-09","2025-12-25"],
  2026: ["2026-01-01","2026-02-16","2026-02-17","2026-02-18","2026-03-01","2026-05-05","2026-05-24","2026-06-06","2026-08-15","2026-09-24","2026-09-25","2026-09-26","2026-10-03","2026-10-09","2026-12-25"],
  2027: ["2027-01-01","2027-02-05","2027-02-06","2027-02-07","2027-03-01","2027-05-05","2027-05-13","2027-06-06","2027-08-15","2027-10-03","2027-10-09","2027-10-14","2027-10-15","2027-10-16","2027-12-25"],
};
function isHolidayOrWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00+09:00");
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}

const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
const floor30Min = (min: number) => Math.floor(min / 30) * 30;

function calcFromTimes(clockIn: string, clockOut: string, date: string) {
  if (!clockIn || !clockOut) return { regular: 0, overtime: 0, night: 0, breakH: 0 };
  const [h1, m1] = clockIn.split(":").map(Number);
  const [h2, m2] = clockOut.split(":").map(Number);
  if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0, night: 0, breakH: 0 };

  const startMin = ceil30Min(h1 * 60 + (m1 || 0));
  let endMin = floor30Min(h2 * 60 + (m2 || 0));
  if (endMin <= startMin) endMin += 1440;
  const totalMin = endMin - startMin;
  const totalH = totalMin / 60;

  let breakH = 0;
  if (totalH >= 8) breakH = 1;
  else if (totalH >= 4) breakH = 0.5;

  const workH = Math.max(totalH - breakH, 0);

  let nightMin = 0;
  for (let min = startMin; min < endMin; min++) {
    const h = Math.floor(min / 60) % 24;
    if (h >= 22 || h < 6) nightMin++;
  }
  const nightH = Math.round((nightMin / 60) * 10) / 10;
  const dayWork = Math.max(workH - nightH, 0);

  if (isHolidayOrWeekend(date)) {
    return { regular: 0, overtime: Math.round(dayWork * 10) / 10, night: nightH, breakH };
  }

  const regular = Math.min(dayWork, 8);
  const overtime = Math.max(dayWork - 8, 0);
  return {
    regular: Math.round(regular * 10) / 10,
    overtime: Math.round(overtime * 10) / 10,
    night: nightH,
    breakH,
  };
}

const _cache: Record<string, { data: any; vac: any; time: number }> = {};
const CACHE_TTL = 10 * 60 * 1000;

export default function ConfirmedListRegularPage() {
  const [yearMonth, setYearMonth] = usePersistedState(
    "clr_yearMonth",
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })()
  );
  const toast = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [nameSearch, setNameSearch] = usePersistedState("clr_nameSearch", "");
  const [deptFilter, setDeptFilter] = usePersistedState("clr_deptFilter", "");
  const [vacationMap, setVacationMap] = useState<Record<string, string>>({});
  const [isClosed, setIsClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<string | null>(null);

  const loadClosing = useCallback(async () => {
    try {
      const c = await getPayrollClosing(yearMonth);
      setIsClosed(c.is_closed);
      setClosedAt(c.closed_at);
    } catch {
      setIsClosed(false);
      setClosedAt(null);
    }
  }, [yearMonth]);

  useEffect(() => {
    loadClosing();
  }, [loadClosing]);

  const load = useCallback(async () => {
    const cacheKey = `clr-${yearMonth}`;
    const cached = _cache[cacheKey];
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      setData(cached.data);
      setVacationMap(cached.vac);
      return;
    }
    setLoading(true);
    try {
      const d = await getConfirmedList(yearMonth, "정규직");
      setData(d || []);
      try {
        const vacations = await getRegularVacations({ status: "approved" });
        const map: Record<string, string> = {};
        for (const v of vacations || []) {
          const start = new Date(v.start_date + "T00:00:00+09:00");
          const end = new Date(v.end_date + "T00:00:00+09:00");
          for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
            const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
            map[`${v.employee_name}|${dateStr}`] = v.type || "연차";
          }
        }
        setVacationMap(map);
        _cache[cacheKey] = { data: d || [], vac: map, time: Date.now() };
      } catch {}
    } catch (e: any) {
      toast.error(e.message || "데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!editingId) return;
    try {
      await updateConfirmedRecord(editingId, editForm);
      setEditingId(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "저장 실패");
    }
  };

  return (
    <div className="min-w-0 fade-in">
      <PageHeader
        eyebrow="정규직"
        title="근태 정보 확정 리스트"
        description="확정된 근태 정보를 확인하고 최종 수정합니다."
      />

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <Field label="연월">
          <Input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            inputSize="sm"
          />
        </Field>
        <Field label="부서">
          <Select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            inputSize="sm"
          >
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
            <option value="생산 야간">생산 야간</option>
            <option value="물류 야간">물류 야간</option>
            <option value="카페(해방촌)">카페(해방촌)</option>
            <option value="카페(행궁동)">카페(행궁동)</option>
            <option value="카페(경복궁)">카페(경복궁)</option>
          </Select>
        </Field>
        <Field label="이름 검색">
          <Input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="이름"
            inputSize="sm"
            className="w-28"
          />
        </Field>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            delete _cache[`clr-${yearMonth}`];
            load();
          }}
          disabled={loading}
        >
          조회
        </Button>

        {/* Payroll Closing — right side */}
        <div className="ml-auto flex items-center gap-2">
          {isClosed ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--success-bg)] text-[var(--success-fg)]">
                <Lock className="w-4 h-4" />
                마감 완료
                {closedAt && (
                  <span className="text-xs text-[var(--text-3)] ml-1">
                    ({new Date(closedAt).toLocaleDateString("ko-KR")})
                  </span>
                )}
              </span>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (
                    !confirm(
                      `${yearMonth} 급여 마감을 취소하시겠습니까?\n마감 취소 시 급여계산에서 기본급이 전액으로 복원됩니다.`
                    )
                  )
                    return;
                  try {
                    await cancelPayrollClosing(yearMonth);
                    setIsClosed(false);
                    setClosedAt(null);
                  } catch (e: any) {
                    toast.error(e.message || "마감 취소 실패");
                  }
                }}
              >
                <Unlock className="w-4 h-4" /> 마감 취소
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (
                  !confirm(
                    `${yearMonth} 근태를 최종 마감하시겠습니까?\n마감 후 급여계산에서 결근 차감이 반영됩니다.`
                  )
                )
                  return;
                try {
                  await closePayroll(yearMonth);
                  setIsClosed(true);
                  setClosedAt(new Date().toISOString());
                } catch (e: any) {
                  toast.error(e.message || "최종 마감 실패");
                }
              }}
            >
              <Lock className="w-4 h-4" /> 최종 마감
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={8} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Table2 className="w-8 h-8" />}
          title="확정된 데이터가 없습니다"
          description="연월을 선택하고 조회해 주세요."
        />
      ) : (
        (() => {
          const filtered = data.filter(
            (e: any) =>
              (!nameSearch || (e.name || "").includes(nameSearch)) &&
              (!deptFilter || (e.department || "").includes(deptFilter))
          );

          const totals = filtered.reduce(
            (acc: any, e: any) => {
              let empReg = 0,
                empOt = 0,
                empNight = 0,
                empHoliday = 0;
              for (const r of e.records || []) {
                const reg = parseFloat(r.regular_hours) || 0;
                const ot = parseFloat(r.overtime_hours) || 0;
                const nt = parseFloat(r.night_hours) || 0;
                if (isHolidayOrWeekend(r.date)) {
                  empHoliday += reg + ot;
                } else {
                  empReg += reg;
                  empOt += ot;
                }
                empNight += nt;
              }
              e._weekday_regular = Math.round(empReg * 10) / 10;
              e._weekday_overtime = Math.round(empOt * 10) / 10;
              e._holiday_hours = Math.round(empHoliday * 10) / 10;
              acc.regular += empReg;
              acc.overtime += empOt;
              acc.night += empNight;
              acc.holiday += empHoliday;
              return acc;
            },
            { regular: 0, overtime: 0, night: 0, holiday: 0 }
          );

          const vacCount = Object.entries(vacationMap)
            .filter(
              ([k]) =>
                k.includes(yearMonth) &&
                filtered.some((e: any) => e.name === k.split("|")[0])
            )
            .reduce((sum, [, vType]) => {
              if (typeof vType !== "string") return sum + 1;
              const isHalf = vType.startsWith("오전") || vType.startsWith("오후");
              return sum + (isHalf ? 0.5 : 1);
            }, 0);

          return (
            <>
              {/* Stats Board */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4">
                <Card className="text-center hover-lift">
                  <p className="text-2xl font-bold text-[var(--text-1)] tabular">{filtered.length}</p>
                  <p className="text-xs text-[var(--text-3)] mt-1">총 근무자</p>
                </Card>
                <Card className="text-center hover-lift border-[var(--brand-500)]/30">
                  <p className="text-2xl font-bold text-[var(--brand-400)] tabular">{totals.regular.toFixed(1)}</p>
                  <p className="text-xs text-[var(--text-3)] mt-1">기본시간(h)</p>
                </Card>
                <Card className="text-center hover-lift border-[var(--warning-border)]">
                  <p className="text-2xl font-bold text-[var(--warning-fg)] tabular">{totals.overtime.toFixed(1)}</p>
                  <p className="text-xs text-[var(--text-3)] mt-1">연장시간(h)</p>
                </Card>
                <Card className="text-center hover-lift border-[var(--danger-border)]">
                  <p className="text-2xl font-bold text-[var(--danger-fg)] tabular">{totals.holiday.toFixed(1)}</p>
                  <p className="text-xs text-[var(--text-3)] mt-1">휴일근무(h)</p>
                </Card>
                <Card className="text-center hover-lift border-[var(--brand-500)]/30">
                  <p className="text-2xl font-bold text-[var(--brand-400)] tabular">{totals.night.toFixed(1)}</p>
                  <p className="text-xs text-[var(--text-3)] mt-1">야간시간(h)</p>
                </Card>
                <Card className="text-center hover-lift" style={{ borderColor: "color-mix(in srgb, var(--brand-400) 30%, transparent)" }}>
                  <p className="text-2xl font-bold tabular" style={{ color: "var(--brand-400)" }}>
                    {vacCount % 1 === 0 ? vacCount : vacCount.toFixed(1)}
                  </p>
                  <p className="text-xs text-[var(--text-3)] mt-1">휴가 사용(일)</p>
                </Card>
              </div>

              {/* Summary Table */}
              <Card padding="none" className="mb-4 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--bg-0)] text-left border-b border-[var(--border-1)]">
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">이름</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">연락처</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">근무일</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">기본(h)</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">연장(h)</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">야간(h)</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">휴게(h)</th>
                      <th className="py-2 px-4 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">휴일(h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((emp: any) => {
                      const isExpanded = expandedEmp === emp.name;
                      return (
                        <React.Fragment key={emp.name}>
                          <tr
                            className={cn(
                              "cursor-pointer border-b border-[var(--border-1)] transition-colors",
                              isExpanded
                                ? "bg-[var(--brand-500)]/10"
                                : "hover:bg-[var(--bg-2)]/50"
                            )}
                            onClick={() => setExpandedEmp(isExpanded ? null : emp.name)}
                          >
                            <td className="py-2.5 px-4 font-medium text-[var(--text-1)]">
                              {emp.name}
                              {emp.department && (
                                <span className="ml-1 text-[10px] text-[var(--text-3)]">
                                  {emp.department}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-[var(--text-3)] tabular">{emp.phone}</td>
                            <td className="py-2.5 px-4 text-right tabular">{emp.days}</td>
                            <td className="py-2.5 px-4 text-right text-[var(--brand-400)] tabular">
                              {(() => {
                                const ym = yearMonth;
                                const recordDates = new Set(
                                  (emp.records || []).map((r: any) => r.date)
                                );
                                const vacDays = Object.entries(vacationMap).filter(
                                  ([k]) => k.startsWith(`${emp.name}|${ym}`)
                                );
                                let unconfirmedVacH = 0;
                                for (const [k, t] of vacDays) {
                                  const d = k.split("|")[1];
                                  if (recordDates.has(d)) continue;
                                  if (t === "연차") unconfirmedVacH += 8;
                                  else if (t?.includes("반차")) unconfirmedVacH += 4;
                                }
                                const weekdayReg = emp._weekday_regular || 0;
                                const total = weekdayReg + unconfirmedVacH;
                                if (unconfirmedVacH > 0)
                                  return (
                                    <>
                                      {total.toFixed(1)}{" "}
                                      <span className="text-[9px] text-[var(--danger-fg)] font-medium">
                                        (미확정 휴가{unconfirmedVacH}h 포함)
                                      </span>
                                    </>
                                  );
                                return <>{weekdayReg.toFixed(1)}</>;
                              })()}
                            </td>
                            <td className="py-2.5 px-4 text-right text-[var(--warning-fg)] tabular">
                              {(emp._weekday_overtime || 0).toFixed(1)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-[var(--brand-400)] tabular">
                              {(emp.night_hours || 0).toFixed(1)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-[var(--text-3)] tabular">
                              {(emp.break_hours || 0).toFixed(1)}
                            </td>
                            <td className="py-2.5 px-4 text-right text-[var(--danger-fg)] font-medium tabular">
                              {(emp._holiday_hours || 0).toFixed(1)}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="p-0">
                                <div className="bg-[var(--brand-500)]/10 border-b border-[var(--brand-500)]/30">
                                  <div className="px-4 py-2 bg-[var(--brand-500)]/10 border-b border-[var(--brand-500)]/30">
                                    <span className="text-xs font-semibold text-[var(--brand-400)]">
                                      {emp.name} 일별 상세
                                    </span>
                                  </div>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-[var(--bg-0)]/80 text-left">
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">날짜</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">출근</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">퇴근</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">기준</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">기본</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">연장</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">휴일</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">야간</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)] text-right">휴게</th>
                                        <th className="py-1.5 px-3 text-[10px] uppercase tracking-wider font-medium text-[var(--text-3)]">관리</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-1)]">
                                      {(() => {
                                        const recordDates = new Set(
                                          (emp.records || []).map((r: any) => r.date)
                                        );
                                        const ym = yearMonth;
                                        const vacOnlyRows = Object.entries(vacationMap)
                                          .filter(([k]) =>
                                            k.startsWith(`${emp.name}|${ym}`)
                                          )
                                          .map(([k, t]) => ({
                                            date: k.split("|")[1],
                                            type: t,
                                          }))
                                          .filter((v) => !recordDates.has(v.date));
                                        const allRows = [
                                          ...(emp.records || []).map((r: any) => ({
                                            ...r,
                                            isVacOnly: false,
                                          })),
                                          ...vacOnlyRows.map((v) => ({
                                            id: `vac-${v.date}`,
                                            date: v.date,
                                            isVacOnly: true,
                                            vacType: v.type,
                                          })),
                                        ].sort((a: any, b: any) =>
                                          a.date.localeCompare(b.date)
                                        );
                                        return allRows;
                                      })().map((r: any) => {
                                        if (r.isVacOnly) {
                                          return (
                                            <tr
                                              key={r.id}
                                              className="bg-[var(--brand-400)]/10"
                                            >
                                              <td className="py-1.5 px-3 tabular">
                                                {r.date}
                                                <Badge
                                                  tone="brand"
                                                  size="xs"
                                                  className="ml-1"
                                                >
                                                  {r.vacType}
                                                  {r.vacType === "오전반차"
                                                    ? " 09~14시"
                                                    : r.vacType === "오후반차"
                                                    ? " 14~18시"
                                                    : ""}
                                                </Badge>
                                              </td>
                                              <td className="py-1.5 px-3 text-[var(--brand-400)]">휴가</td>
                                              <td className="py-1.5 px-3 text-[var(--brand-400)]">휴가</td>
                                              <td className="py-1.5 px-3">
                                                <Badge tone="brand" size="xs">휴가</Badge>
                                              </td>
                                              <td className="py-1.5 px-3 text-right text-[var(--brand-400)] tabular">
                                                {r.vacType?.includes("반차") ? "4.0" : "8.0"}
                                              </td>
                                              <td className="py-1.5 px-3 text-right tabular">0.0</td>
                                              <td className="py-1.5 px-3 text-right tabular">0.0</td>
                                              <td className="py-1.5 px-3 text-right tabular">0.0</td>
                                              <td className="py-1.5 px-3 text-right tabular">0.0</td>
                                              <td className="py-1.5 px-3"></td>
                                            </tr>
                                          );
                                        }

                                        const vType =
                                          vacationMap[`${emp.name}|${r.date}`];
                                        const isHoliday = isHolidayOrWeekend(r.date);
                                        const holidayLabel = (() => {
                                          if (!isHoliday) return null;
                                          const d = new Date(
                                            r.date + "T00:00:00+09:00"
                                          );
                                          const dow = d.getDay();
                                          if (dow === 6) return "토요일";
                                          if (dow === 0) return "일요일";
                                          return "공휴일";
                                        })();

                                        return (
                                          <tr
                                            key={r.id}
                                            className={cn(
                                              r.source === "vacation"
                                                ? "bg-[var(--brand-400)]/10"
                                                : isHoliday
                                                ? "bg-[var(--danger-bg)]"
                                                : vType?.includes("반차")
                                                ? "bg-[var(--warning-bg)]"
                                                : vType
                                                ? "bg-[var(--brand-400)]/10"
                                                : "hover:bg-[var(--bg-2)]/60"
                                            )}
                                          >
                                            <td className="py-1.5 px-3 tabular">
                                              {r.date}
                                              {holidayLabel && (
                                                <Badge tone="danger" size="xs" className="ml-1">
                                                  {holidayLabel}
                                                </Badge>
                                              )}
                                              {r.source === "vacation" && (
                                                <Badge tone="brand" size="xs" className="ml-1">
                                                  {r.memo || "연차"}
                                                </Badge>
                                              )}
                                              {r.source !== "vacation" && vType && (
                                                <Badge
                                                  tone={vType.includes("반차") ? "warning" : "brand"}
                                                  size="xs"
                                                  className="ml-1"
                                                >
                                                  {vType}
                                                </Badge>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3 tabular">
                                              {editingId === r.id ? (
                                                <input
                                                  type="time"
                                                  value={editForm.confirmed_clock_in}
                                                  onChange={(e) => {
                                                    const ci = e.target.value;
                                                    const calc = calcFromTimes(
                                                      ci,
                                                      editForm.confirmed_clock_out,
                                                      r.date
                                                    );
                                                    setEditForm({
                                                      ...editForm,
                                                      confirmed_clock_in: ci,
                                                      regular_hours: calc.regular,
                                                      overtime_hours: calc.overtime,
                                                      night_hours: calc.night,
                                                      break_hours: calc.breakH,
                                                    });
                                                  }}
                                                  className="w-20 px-1 py-0.5 border border-[var(--border-2)] rounded text-xs bg-[var(--bg-2)] text-[var(--text-1)]"
                                                />
                                              ) : (
                                                r.confirmed_clock_in
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3 tabular">
                                              {editingId === r.id ? (
                                                <input
                                                  type="time"
                                                  value={editForm.confirmed_clock_out}
                                                  onChange={(e) => {
                                                    const co = e.target.value;
                                                    const calc = calcFromTimes(
                                                      editForm.confirmed_clock_in,
                                                      co,
                                                      r.date
                                                    );
                                                    setEditForm({
                                                      ...editForm,
                                                      confirmed_clock_out: co,
                                                      regular_hours: calc.regular,
                                                      overtime_hours: calc.overtime,
                                                      night_hours: calc.night,
                                                      break_hours: calc.breakH,
                                                    });
                                                  }}
                                                  className="w-20 px-1 py-0.5 border border-[var(--border-2)] rounded text-xs bg-[var(--bg-2)] text-[var(--text-1)]"
                                                />
                                              ) : (
                                                r.confirmed_clock_out
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3">
                                              <Badge
                                                tone={r.source === "actual" ? "success" : "brand"}
                                                size="xs"
                                              >
                                                {r.source === "actual" ? "실제" : "계획"}
                                              </Badge>
                                            </td>
                                            <td className="py-1.5 px-3 text-right tabular">
                                              {isHoliday ? (
                                                "0.0"
                                              ) : editingId === r.id ? (
                                                <span className="text-xs text-[var(--brand-400)] font-medium">
                                                  {editForm.regular_hours}
                                                </span>
                                              ) : (
                                                parseFloat(r.regular_hours).toFixed(1)
                                              )}
                                              {vType?.includes("반차") && (
                                                <span className="ml-0.5 text-[9px] text-[var(--danger-fg)] font-medium">
                                                  +반차4h
                                                </span>
                                              )}
                                              {vType === "연차" && (
                                                <span className="ml-0.5 text-[9px] text-[var(--danger-fg)] font-medium">
                                                  +휴가8h
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3 text-right text-[var(--warning-fg)] tabular">
                                              {isHoliday
                                                ? "0.0"
                                                : editingId === r.id
                                                ? editForm.overtime_hours
                                                : parseFloat(r.overtime_hours).toFixed(1)}
                                            </td>
                                            <td className="py-1.5 px-3 text-right text-[var(--danger-fg)] font-medium tabular">
                                              {isHoliday
                                                ? (
                                                    (parseFloat(r.regular_hours) || 0) +
                                                    (parseFloat(r.overtime_hours) || 0)
                                                  ).toFixed(1)
                                                : "0.0"}
                                            </td>
                                            <td className="py-1.5 px-3 text-right tabular">
                                              {editingId === r.id ? (
                                                <span className="text-xs text-[var(--brand-400)] font-medium">
                                                  {editForm.night_hours}
                                                </span>
                                              ) : (
                                                parseFloat(r.night_hours).toFixed(1)
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3 text-right text-[var(--text-3)] tabular">
                                              {editingId === r.id ? (
                                                <span className="text-xs text-[var(--text-3)]">
                                                  {editForm.break_hours}
                                                </span>
                                              ) : (
                                                parseFloat(r.break_hours).toFixed(1)
                                              )}
                                            </td>
                                            <td className="py-1.5 px-3">
                                              {editingId === r.id ? (
                                                <div className="flex gap-1">
                                                  <Button
                                                    variant="primary"
                                                    size="xs"
                                                    onClick={handleSave}
                                                  >
                                                    저장
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="xs"
                                                    onClick={() => setEditingId(null)}
                                                  >
                                                    취소
                                                  </Button>
                                                </div>
                                              ) : (
                                                <div className="flex gap-1">
                                                  <button
                                                    onClick={() => {
                                                      setEditingId(r.id);
                                                      setEditForm({
                                                        confirmed_clock_in:
                                                          r.confirmed_clock_in,
                                                        confirmed_clock_out:
                                                          r.confirmed_clock_out,
                                                        regular_hours: parseFloat(
                                                          r.regular_hours
                                                        ),
                                                        overtime_hours: parseFloat(
                                                          r.overtime_hours
                                                        ),
                                                        night_hours: parseFloat(
                                                          r.night_hours
                                                        ),
                                                        break_hours: parseFloat(
                                                          r.break_hours
                                                        ),
                                                      });
                                                    }}
                                                    className="p-1 text-[var(--brand-400)] hover:bg-[var(--brand-500)]/10 rounded"
                                                  >
                                                    <Edit3 className="w-3 h-3" />
                                                  </button>
                                                  <button
                                                    onClick={async () => {
                                                      if (!confirm("삭제하시겠습니까?"))
                                                        return;
                                                      try {
                                                        await deleteConfirmedRecord(r.id);
                                                        load();
                                                      } catch (e: any) {
                                                        toast.error(e.message || "삭제 실패");
                                                      }
                                                    }}
                                                    className="p-1 text-[var(--danger-fg)] hover:bg-[var(--danger-bg)] rounded"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          );
        })()
      )}
    </div>
  );
}
