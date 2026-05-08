"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Wallet, Plus, Trash2, Edit2, Search, CircleDollarSign } from "lucide-react";
import {
  listEmployeeLoans, searchLoanEmployees, createEmployeeLoan, updateEmployeeLoan, deleteEmployeeLoan,
} from "@/lib/api";
import {
  PageHeader, Card, Button, Field, Input, Select, Badge, EmptyState, useToast, Stat, SkeletonCard, Modal,
} from "@/components/ui";

const fmt = new Intl.NumberFormat("ko-KR");

interface Employee { id: number; name: string; department: string; team: string; phone: string; }
interface Loan {
  id: number;
  employee_id: number;
  employee_name: string;
  department: string;
  team: string;
  amount: number;
  executed_date: string;
  repayment_method: "monthly" | "lump_sum";
  monthly_amount: number;
  start_month: string;
  lump_sum_date: string;
  status: "active" | "completed" | "cancelled";
  memo: string;
}

interface FormData {
  employee_id: number | null;
  employee_name: string;
  amount: string;
  executed_date: string;
  repayment_method: "monthly" | "lump_sum";
  monthly_amount: string;
  start_month: string;
  lump_sum_date: string;
  memo: string;
  status: "active" | "completed" | "cancelled";
}

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

const emptyForm = (): FormData => ({
  employee_id: null,
  employee_name: "",
  amount: "",
  executed_date: today(),
  repayment_method: "monthly",
  monthly_amount: "",
  start_month: thisMonth(),
  lump_sum_date: today(),
  memo: "",
  status: "active",
});

// 누적 상환액 계산 — 현재 시점 기준
function computePaid(loan: Loan): number {
  if (loan.status !== "active") return loan.status === "completed" ? loan.amount : 0;
  if (loan.repayment_method === "monthly") {
    const start = (loan.start_month || "").slice(0, 7);
    const monthly = loan.monthly_amount || 0;
    if (!start || monthly <= 0) return 0;
    const cur = thisMonth();
    if (cur < start) return 0;
    const [sy, sm] = start.split("-").map(Number);
    const [cy, cm] = cur.split("-").map(Number);
    const months = (cy - sy) * 12 + (cm - sm) + 1;
    return Math.min(months * monthly, loan.amount);
  }
  if (loan.repayment_method === "lump_sum") {
    const target = (loan.lump_sum_date || "").slice(0, 7);
    return target && target <= thisMonth() ? loan.amount : 0;
  }
  return 0;
}

export default function LoanManagementPage() {
  const toast = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Employee search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchTimer = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLoans(await listEmployeeLoans()); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 직원 검색 (debounced)
  useEffect(() => {
    if (!showForm) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try { setSearchResults(await searchLoanEmployees(searchQuery)); }
      catch {}
    }, 200);
  }, [searchQuery, showForm]);

  const openCreate = () => {
    setForm(emptyForm());
    setSearchQuery("");
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (loan: Loan) => {
    setForm({
      employee_id: loan.employee_id,
      employee_name: loan.employee_name,
      amount: String(loan.amount || ""),
      executed_date: loan.executed_date || today(),
      repayment_method: loan.repayment_method,
      monthly_amount: String(loan.monthly_amount || ""),
      start_month: loan.start_month || thisMonth(),
      lump_sum_date: loan.lump_sum_date || today(),
      memo: loan.memo || "",
      status: loan.status,
    });
    setSearchQuery("");
    setEditingId(loan.id);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const handleSelectEmployee = (emp: Employee) => {
    setForm(f => ({ ...f, employee_id: emp.id, employee_name: `${emp.name} (${emp.department}${emp.team ? ' ' + emp.team : ''})` }));
    setShowSearchDropdown(false);
    setSearchQuery("");
  };

  const handleSubmit = async () => {
    if (!form.employee_id) { toast.error("직원을 선택해주세요"); return; }
    const amount = parseInt(form.amount) || 0;
    if (amount <= 0) { toast.error("대출 금액을 입력해주세요"); return; }
    if (form.repayment_method === "monthly") {
      const monthly = parseInt(form.monthly_amount) || 0;
      if (monthly <= 0) { toast.error("월별 상환 금액을 입력해주세요"); return; }
      if (!form.start_month) { toast.error("상환 시작월을 선택해주세요"); return; }
    } else {
      if (!form.lump_sum_date) { toast.error("일괄 상환 지정일을 선택해주세요"); return; }
    }

    setSaving(true);
    try {
      const payload = {
        employee_id: form.employee_id,
        amount,
        executed_date: form.executed_date,
        repayment_method: form.repayment_method,
        monthly_amount: parseInt(form.monthly_amount) || 0,
        start_month: form.start_month,
        lump_sum_date: form.lump_sum_date,
        memo: form.memo,
        status: form.status,
      };
      if (editingId != null) {
        await updateEmployeeLoan(editingId, payload);
        toast.success("대출 정보가 수정되었습니다");
      } else {
        await createEmployeeLoan(payload);
        toast.success("대출이 등록되었습니다");
      }
      closeForm();
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (loan: Loan) => {
    if (!confirm(`${loan.employee_name} 의 대출(${fmt.format(loan.amount)}원)을 삭제하시겠습니까?`)) return;
    try {
      await deleteEmployeeLoan(loan.id);
      toast.success("대출이 삭제되었습니다");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const activeLoans = loans.filter(l => l.status === "active");
  const totalActive = activeLoans.reduce((s, l) => s + Number(l.amount || 0), 0);
  const totalPaid = activeLoans.reduce((s, l) => s + computePaid(l), 0);
  const totalRemaining = totalActive - totalPaid;

  const monthlyDeductionThisMonth = activeLoans.reduce((s, l) => {
    if (l.repayment_method === "monthly") {
      const cur = thisMonth();
      const start = (l.start_month || "").slice(0, 7);
      if (!start || cur < start) return s;
      const monthly = Number(l.monthly_amount) || 0;
      const [sy, sm] = start.split("-").map(Number);
      const [cy, cm] = cur.split("-").map(Number);
      const months = (cy - sy) * 12 + (cm - sm) + 1;
      const cumBefore = (months - 1) * monthly;
      if (cumBefore >= l.amount) return s;
      return s + Math.min(monthly, l.amount - cumBefore);
    }
    if (l.repayment_method === "lump_sum" && (l.lump_sum_date || "").slice(0, 7) === thisMonth()) {
      return s + Number(l.amount || 0);
    }
    return s;
  }, 0);

  return (
    <div className="min-w-0 fade-in space-y-4">
      <PageHeader
        eyebrow="조직"
        title="직원 대출 관리"
        description="직원별 대출 등록·월별 상환 자동 차감·일괄 상환 일정 관리"
        actions={
          <Button variant="primary" size="sm" leadingIcon={<Plus size={14} />} onClick={openCreate}>
            대출 등록
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="활성 대출" value={activeLoans.length} unit="건" tone="brand" icon={<Wallet size={14} />} />
        <Stat label="총 대출 잔액" value={fmt.format(totalRemaining)} unit="원" tone="warning" />
        <Stat label="누적 상환" value={fmt.format(totalPaid)} unit="원" tone="success" />
        <Stat label="이번달 차감 예정" value={fmt.format(monthlyDeductionThisMonth)} unit="원" tone="danger" icon={<CircleDollarSign size={14} />} />
      </div>

      {loading ? (
        <SkeletonCard className="h-64" />
      ) : loans.length === 0 ? (
        <EmptyState
          icon={<Wallet className="w-7 h-7" />}
          title="등록된 대출이 없습니다"
          description="우측 상단 '대출 등록' 버튼을 눌러 시작하세요."
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[var(--bg-canvas)] text-left whitespace-nowrap border-b border-[var(--border-1)]">
                  <th className="py-2 px-2 text-eyebrow">직원</th>
                  <th className="py-2 px-2 text-eyebrow">부서</th>
                  <th className="py-2 px-2 text-right text-eyebrow">대출 금액</th>
                  <th className="py-2 px-2 text-eyebrow">실행일</th>
                  <th className="py-2 px-2 text-eyebrow">상환 방식</th>
                  <th className="py-2 px-2 text-right text-eyebrow">월/일괄</th>
                  <th className="py-2 px-2 text-right text-eyebrow">진행</th>
                  <th className="py-2 px-2 text-eyebrow">상태</th>
                  <th className="py-2 px-2 text-eyebrow">메모</th>
                  <th className="py-2 px-2 text-right text-eyebrow">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {loans.map(l => {
                  const paid = computePaid(l);
                  const remaining = Math.max(Number(l.amount) - paid, 0);
                  const pct = l.amount > 0 ? Math.min((paid / Number(l.amount)) * 100, 100) : 0;
                  return (
                    <tr key={l.id} className="hover:bg-[var(--bg-2)]/40 transition-colors">
                      <td className="py-1.5 px-2 font-medium">{l.employee_name}</td>
                      <td className="py-1.5 px-2 text-[var(--text-3)]">{l.department} {l.team}</td>
                      <td className="py-1.5 px-2 text-right tabular font-medium">{fmt.format(l.amount)}원</td>
                      <td className="py-1.5 px-2 text-[var(--text-3)] text-[10px]">{l.executed_date}</td>
                      <td className="py-1.5 px-2">
                        <Badge tone={l.repayment_method === "monthly" ? "brand" : "warning"} size="sm">
                          {l.repayment_method === "monthly" ? "월별 상환" : "일괄 상환"}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular text-[10px]">
                        {l.repayment_method === "monthly"
                          ? <>월 {fmt.format(l.monthly_amount)}원<br/><span className="text-[9px] text-[var(--text-4)]">{l.start_month}~</span></>
                          : <>{l.lump_sum_date}</>
                        }
                      </td>
                      <td className="py-1.5 px-2 text-right tabular text-[10px]">
                        <div>{fmt.format(paid)}/{fmt.format(l.amount)}</div>
                        <div className="text-[9px] text-[var(--text-4)]">잔액 {fmt.format(remaining)}</div>
                        <div className="w-16 h-1 bg-[var(--bg-2)] rounded-full mt-0.5 ml-auto">
                          <div className="h-full bg-[var(--success-fg)] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <Badge tone={l.status === "active" ? "success" : l.status === "completed" ? "neutral" : "danger"} size="sm" dot>
                          {l.status === "active" ? "진행중" : l.status === "completed" ? "완료" : "취소"}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-[var(--text-3)] text-[10px] max-w-[160px] truncate">{l.memo || "-"}</td>
                      <td className="py-1.5 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="xs" variant="ghost" onClick={() => openEdit(l)} title="수정">
                            <Edit2 size={12} />
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => handleDelete(l)} title="삭제">
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={showForm} onClose={closeForm} title={editingId != null ? "대출 정보 수정" : "대출 등록"} size="md">
        <div className="space-y-3">
          {/* 직원 검색/선택 */}
          {editingId == null ? (
            <Field label="직원 검색">
              <div className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
                  <Input
                    placeholder="이름 또는 전화번호"
                    value={form.employee_name || searchQuery}
                    onChange={e => {
                      setForm(f => ({ ...f, employee_id: null, employee_name: "" }));
                      setSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                    className="pl-8"
                  />
                </div>
                {showSearchDropdown && searchResults.length > 0 && !form.employee_id && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[var(--bg-1)] border border-[var(--border-2)] rounded-[var(--r-md)] shadow-lg z-10">
                    {searchResults.map(emp => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => handleSelectEmployee(emp)}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--bg-2)] text-[12px] border-b border-[var(--border-1)] last:border-b-0"
                      >
                        <span className="font-medium">{emp.name}</span>
                        <span className="ml-2 text-[var(--text-3)]">{emp.department} {emp.team}</span>
                        <span className="ml-2 text-[var(--text-4)] text-[10px]">{emp.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          ) : (
            <Field label="직원">
              <Input value={form.employee_name} disabled />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="대출 금액 (원)" required>
              <Input
                type="number"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="1000000"
              />
            </Field>
            <Field label="대출 실행일" required>
              <Input
                type="date"
                value={form.executed_date}
                onChange={e => setForm(f => ({ ...f, executed_date: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="상환 방식" required>
            <Select
              value={form.repayment_method}
              onChange={e => setForm(f => ({ ...f, repayment_method: e.target.value as any }))}
            >
              <option value="monthly">월별 상환 — 매월 급여에서 자동 차감</option>
              <option value="lump_sum">지정일 일괄 상환 — 해당 월 급여에서 전액 차감</option>
            </Select>
          </Field>

          {form.repayment_method === "monthly" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="월별 상환 금액 (원)" required>
                <Input
                  type="number"
                  value={form.monthly_amount}
                  onChange={e => setForm(f => ({ ...f, monthly_amount: e.target.value }))}
                  placeholder="200000"
                />
              </Field>
              <Field label="상환 시작월" required>
                <Input
                  type="month"
                  value={form.start_month}
                  onChange={e => setForm(f => ({ ...f, start_month: e.target.value }))}
                />
              </Field>
              {form.amount && form.monthly_amount && (
                <div className="col-span-2 text-[11px] text-[var(--text-3)] bg-[var(--bg-2)]/50 rounded p-2">
                  대략 {Math.ceil((parseInt(form.amount) || 0) / (parseInt(form.monthly_amount) || 1))}개월 분할
                  (마지막 달은 잔액만큼만 차감)
                </div>
              )}
            </div>
          ) : (
            <Field label="일괄 상환 지정일" required>
              <Input
                type="date"
                value={form.lump_sum_date}
                onChange={e => setForm(f => ({ ...f, lump_sum_date: e.target.value }))}
              />
            </Field>
          )}

          {editingId != null && (
            <Field label="상태">
              <Select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
              >
                <option value="active">진행중</option>
                <option value="completed">완료</option>
                <option value="cancelled">취소</option>
              </Select>
            </Field>
          )}

          <Field label="메모">
            <Input
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="대출 사유, 특이사항 등"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-1)]">
            <Button variant="ghost" onClick={closeForm}>취소</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? "저장중..." : editingId != null ? "수정" : "등록"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
