"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  getRegularEmployees,
  createRegularEmployee,
  updateRegularEmployee,
  deleteRegularEmployee,
  sendRegularLink,
  sendRegularContract,
  getRegularContracts,
  getSurveyWorkplaces,
  createOffboarding,
} from "@/lib/api";
import {
  Contact,
  Plus,
  Edit3,
  Send,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  FileCheck,
  Trash2,
  UserMinus,
} from "lucide-react";
import { Card, Badge, Button, Input, Select, Field, EmptyState, PageHeader, SkeletonCard, useToast, Modal, Textarea } from "@/components/ui";

const REASON_CODES_OB = [
  { code: "11", label: "11 - 개인사정으로 인한 자진퇴사", hint: "실업급여 X" },
  { code: "22", label: "22 - 근로계약기간만료/공사종료", hint: "실업급여 O" },
  { code: "23", label: "23 - 경영상필요/회사사정 (권고사직 등)", hint: "실업급여 O" },
  { code: "26", label: "26 - 정년퇴직", hint: "실업급여 O" },
  { code: "31", label: "31 - 기타 사용자 사정", hint: "실업급여 O (사례별)" },
  { code: "41", label: "41 - 사망", hint: "유족급여 처리" },
];

const DEPARTMENTS = ["생산2층", "생산3층", "물류", "생산 야간", "물류 야간", "카페(해방촌)", "카페(행궁동)", "카페(경복궁)"];
const TEAMS = ["1조", "2조", "3조"];
const ROLES = ["일반", "조장", "반장"];

interface Employee {
  id: number;
  name: string;
  phone: string;
  department: string;
  team: string;
  role: string;
  status: string;
  workplace_id: number | null;
  bank_name?: string | null;
  bank_account?: string | null;
  id_number?: string | null;
  name_en?: string | null;
  hire_date?: string | null;
  resign_date?: string | null;
  resigned_at?: string | null;
  is_active?: number;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const emptyForm = {
  name: "",
  phone: "",
  department: DEPARTMENTS[0],
  team: TEAMS[0],
  role: ROLES[0],
  workplace_id: null as number | null,
  bank_name: "",
  bank_account: "",
};

// ── Helpers for resigned section ──────────────────────────────────
function formatDate(s?: string | null): string {
  if (!s) return "-";
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "-";
}
function calcTenure(hire?: string | null, resign?: string | null): string {
  const h = formatDate(hire), r = formatDate(resign);
  if (h === "-" || r === "-") return "-";
  const ms = new Date(r).getTime() - new Date(h).getTime();
  if (ms < 0) return "-";
  const days = Math.floor(ms / 86400000);
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) return `${years}년 ${months}개월`;
  if (months > 0) return `${months}개월 ${days % 30}일`;
  return `${days}일`;
}

export default function RegularWorkersPage() {
  const toast = useToast();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedState("rw_search", "");
  const [filterDept, setFilterDept] = usePersistedState("rw_filterDept", "");
  const [filterTeam, setFilterTeam] = usePersistedState("rw_filterTeam", "");
  const [filterRole, setFilterRole] = usePersistedState("rw_filterRole", "");
  const [page, setPage] = usePersistedState("rw_page", 1);

  const [showResigned, setShowResigned] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [sendingContractId, setSendingContractId] = useState<number | null>(null);
  const [contractMap, setContractMap] = useState<Record<number, { status: string; token: string }>>({});
  const [contractModal, setContractModal] = useState<any>(null);
  const [contractPassword, setContractPassword] = useState("");
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  const handleRevealId = async (empId: number) => {
    const pw = prompt("주민번호 열람 비밀번호를 입력해주세요:");
    if (!pw) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/verify-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: pw }),
      });
      const body = await res.json();
      if (body.verified) {
        setRevealedIds(prev => new Set([...prev, empId]));
      } else {
        toast.info("비밀번호가 일치하지 않습니다.");
      }
    } catch { toast.error("확인 중 오류가 발생했습니다."); }
  };
  const [contractForm, setContractForm] = useState({
    work_start_date: new Date().toLocaleDateString('sv-SE'),
    department: '',
    position_title: '사원',
    annual_salary: '',
    base_pay: '',
    meal_allowance: '',
    other_allowance: '',
    pay_day: '10',
    work_hours: '09:00~18:00',
    work_place: '',
  });
  const [workplaces, setWorkplaces] = useState<any[]>([]);

  const [offboardingTarget, setOffboardingTarget] = useState<Employee | null>(null);
  const [offboardingForm, setOffboardingForm] = useState({
    resign_date: "",
    reason_code: "",
    reason_detail: "",
    send_email: true,
  });
  const [submittingOffboarding, setSubmittingOffboarding] = useState(false);

  const handleOffboardingSubmit = async () => {
    if (!offboardingTarget) return;
    if (!offboardingForm.resign_date) { toast.info("퇴직일을 입력해주세요."); return; }
    if (!offboardingForm.reason_code) { toast.info("사유 코드를 선택해주세요."); return; }
    setSubmittingOffboarding(true);
    try {
      await createOffboarding({
        employee_type: "regular",
        employee_ref_id: offboardingTarget.id,
        resign_date: offboardingForm.resign_date,
        reason_code: offboardingForm.reason_code,
        reason_detail: offboardingForm.reason_detail,
        send_email: offboardingForm.send_email,
      });
      toast.success(`${offboardingTarget.name} 퇴사 등록 완료. 퇴사관리 페이지에서 진행 현황을 확인하세요.`);
      setOffboardingTarget(null);
      setOffboardingForm({ resign_date: "", reason_code: "", reason_detail: "", send_email: true });
      loadEmployees();
    } catch (e: any) {
      toast.error(e.message || "퇴사 등록 실패");
    } finally {
      setSubmittingOffboarding(false);
    }
  };

  useEffect(() => {
    getSurveyWorkplaces().then(setWorkplaces).catch(() => {});
  }, []);

  const loadContracts = useCallback(async () => {
    try {
      const contracts = await getRegularContracts();
      const map: Record<number, { status: string; token: string }> = {};
      (contracts || []).forEach((c: any) => { map[c.employee_id] = { status: c.status, token: c.token }; });
      setContractMap(map);
    } catch {
      // silent
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: "50",
        include_resigned: "1",
      };
      if (search) params.search = search;
      if (filterDept) params.department = filterDept;
      if (filterTeam) params.team = filterTeam;
      if (filterRole) params.role = filterRole;

      const data = await getRegularEmployees(params);
      setEmployees(data.employees || data || []);
      if (data.pagination) {
        setPagination(data.pagination);
      } else {
        const list = data.employees || data || [];
        setPagination({ total: list.length, page: 1, limit: 50, totalPages: 1 });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, search, filterDept, filterTeam, filterRole]);

  useEffect(() => {
    loadEmployees();
    loadContracts();
  }, [loadEmployees, loadContracts]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadEmployees();
  }

  function openAddModal() {
    setEditingEmployee(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadAttendanceHistory = async (empName: string, ym: string) => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/confirmed-list?year_month=${ym}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const emp = (data || []).find((e: any) => e.name === empName);
      setAttendanceHistory(emp?.records || []);
    } catch { setAttendanceHistory([]); }
    finally { setHistoryLoading(false); }
  };

  function openEditModal(emp: Employee) {
    setEditingEmployee(emp);
    setForm({
      name: emp.name,
      phone: emp.phone,
      department: emp.department,
      team: emp.team,
      role: emp.role,
      workplace_id: emp.workplace_id,
      bank_name: emp.bank_name || "",
      bank_account: emp.bank_account || "",
    });
    setShowModal(true);
    loadAttendanceHistory(emp.name, historyMonth);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.info("이름과 전화번호는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      if (editingEmployee) {
        await updateRegularEmployee(editingEmployee.id, form);
      } else {
        await createRegularEmployee(form);
      }
      setShowModal(false);
      loadEmployees();
    } catch (err: any) {
      toast.error(err.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(emp: Employee) {
    setTogglingId(emp.id);
    try {
      const newStatus = emp.status === "active" ? "inactive" : "active";
      await updateRegularEmployee(emp.id, { status: newStatus });
      loadEmployees();
    } catch (err: any) {
      toast.error(err.message || "상태 변경 실패");
    } finally {
      setTogglingId(null);
    }
  }

  const handleSendContract = async () => {
    if (!contractModal) return;
    if (!contractForm.base_pay.trim()) { toast.info("기본급(월)을 입력해주세요."); return; }
    if (!contractForm.meal_allowance.trim()) { toast.info("식대를 입력해주세요."); return; }
    setSendingContractId(contractModal.id);
    try {
      await sendRegularContract(contractModal.id, contractForm);
      toast.success('근로계약서가 발송되었습니다.');
      setContractModal(null);
      loadContracts();
    } catch (e: any) { toast.error(e.message || "오류가 발생했습니다."); }
    finally { setSendingContractId(null); }
  };

  async function handleSendLink(id: number) {
    setSendingId(id);
    try {
      await sendRegularLink(id);
      toast.success("링크가 발송되었습니다.");
    } catch (err: any) {
      toast.error(err.message || "발송 실패");
    } finally {
      setSendingId(null);
    }
  }

  function updateForm(field: string, value: string | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const verifyContractPassword = async (): Promise<boolean> => {
    const pw = prompt("계약서 접근 비밀번호를 입력해주세요:");
    if (!pw) return false;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${(process.env.NEXT_PUBLIC_API_URL || '')}/api/regular/verify-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: pw }),
      });
      const body = await res.json();
      if (body.verified) return true;
      toast.info("비밀번호가 일치하지 않습니다.");
      return false;
    } catch { return false; }
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Contact size={28} className="text-[var(--brand-400)]" />
            정규직 DB
          </span>
        }
        description={
          <>
            현장 정규직 직원을 관리합니다.
            {pagination.total > 0 && (
              <span className="ml-2 text-[var(--brand-400)] font-medium">총 {pagination.total}명</span>
            )}
          </>
        }
        actions={
          <Button variant="primary" size="sm" leadingIcon={<Plus size={16} />} onClick={openAddModal}>
            직원 추가
          </Button>
        }
      />

      {/* Search & Filters */}
      <form onSubmit={handleSearch} className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Input
            type="text"
            placeholder="이름 또는 전화번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search size={14} />}
          />
        </div>
        <Select value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1); }}>
          <option value="">전체 부서</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={filterTeam} onChange={(e) => { setFilterTeam(e.target.value); setPage(1); }}>
          <option value="">전체 조</option>
          {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}>
          <option value="">전체 직책</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Button type="submit" variant="secondary" size="sm">검색</Button>
      </form>

      {/* Table */}
      {(() => {
        const activeEmployees = employees.filter(
          (e) => e.is_active !== 0 && !e.resign_date && !e.resigned_at
        );
        const resignedEmployees = employees.filter(
          (e) => e.is_active === 0 || e.resign_date || e.resigned_at
        );

        if (loading) {
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          );
        }

        if (employees.length === 0) {
          return (
            <EmptyState
              title={search ? `"${search}" 검색 결과가 없습니다.` : '등록된 정규직 직원이 없습니다.'}
            />
          );
        }

        return (
          <>
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-0)] border-b border-[var(--border-1)]">
                  {["이름","입사일","전화번호","부서","조","직책","은행","계좌번호","주민번호","상태","계약서","관리"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className={`border-b border-[var(--border-1)] hover:bg-[var(--bg-2)] cursor-pointer transition-colors ${emp.is_active === 0 ? 'opacity-50 bg-[var(--bg-0)]' : ''}`}
                    onClick={() => openEditModal(emp)}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                      {emp.name}
                      {emp.is_active === 0 && <Badge tone="danger" size="xs" className="ml-1">퇴사자</Badge>}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-3)] text-xs tabular">{emp.hire_date || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text-2)] tabular">{emp.phone}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{emp.department || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{emp.team || "-"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={emp.role === "반장" || emp.role === "조장" ? "brand" : "neutral"}
                        size="xs"
                      >
                        {emp.role || "-"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">{emp.bank_name || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text-2)] tabular">{emp.bank_account || "-"}</td>
                    <td className="px-4 py-3 text-[var(--text-2)]" onClick={(e) => e.stopPropagation()}>
                      {emp.id_number ? (
                        revealedIds.has(emp.id) ? (
                          <span className="text-xs font-mono tabular">{emp.id_number}</span>
                        ) : (
                          <button onClick={() => handleRevealId(emp.id)} className="text-xs text-[var(--text-4)] hover:text-[var(--brand-400)] hover:underline cursor-pointer">
                            ●●●●●●-●●●●●●●
                          </button>
                        )
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={emp.is_active === 0 ? "neutral" : emp.status === "active" ? "success" : "neutral"}
                        size="xs"
                        dot
                      >
                        {emp.is_active === 0 ? "퇴사" : emp.status === "active" ? "활성" : "비활성"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {contractMap[emp.id]?.status === "signed" ? (
                        <button onClick={async (e) => { e.stopPropagation(); if (!(await verifyContractPassword())) return; window.open(`/regular-contract?token=${contractMap[emp.id].token}`, '_blank'); }}
                          title="클릭하여 계약서 열람">
                          <Badge tone="success" size="xs" className="cursor-pointer">
                            <FileCheck size={11} /> 체결 (열람)
                          </Badge>
                        </button>
                      ) : contractMap[emp.id]?.status === "pending" ? (
                        <Badge tone="warning" size="xs">
                          <FileText size={11} /> 발송됨
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="xs">미체결</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="xs" onClick={() => openEditModal(emp)} title="수정">
                          <Edit3 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggleStatus(emp)}
                          disabled={togglingId === emp.id}
                          title={emp.status === "active" ? "비활성화" : "활성화"}
                        >
                          {togglingId === emp.id ? <Loader2 size={13} className="animate-spin" /> : emp.status === "active" ? "비활성화" : "활성화"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleSendLink(emp.id)}
                          disabled={sendingId === emp.id}
                          leadingIcon={sendingId === emp.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          title="링크 발송"
                        >
                          링크
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={async () => { if (!(await verifyContractPassword())) return; setContractModal(emp); setContractForm({...contractForm, department: emp.department || ''}); }}
                          disabled={sendingContractId === emp.id}
                          leadingIcon={sendingContractId === emp.id ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                          title="계약서 발송"
                        >
                          계약서
                        </Button>
                        {emp.is_active !== 0 && (
                          <Button
                            variant="ghost"
                            size="xs"
                            leadingIcon={<UserMinus size={14} />}
                            onClick={() => {
                              setOffboardingTarget(emp);
                              setOffboardingForm({ resign_date: "", reason_code: "", reason_detail: "", send_email: true });
                            }}
                            title="퇴사 등록"
                          >
                            퇴사
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-[var(--danger-fg)] hover:bg-[var(--danger-bg)]"
                          onClick={async () => {
                            if (!confirm(`${emp.name}을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
                            try { await deleteRegularEmployee(emp.id); loadEmployees(); } catch (e: any) { toast.error(e.message || "오류가 발생했습니다."); }
                          }}
                          title="삭제"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-1)]">
              <p className="text-sm text-[var(--text-3)] tabular">
                {pagination.total}명 중{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}명
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft size={18} />
                </Button>
                <span className="text-sm text-[var(--text-2)] tabular min-w-[80px] text-center">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button variant="ghost" size="xs" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>
                  <ChevronRight size={18} />
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* 퇴사자 별도 섹션 */}
        {resignedEmployees.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[var(--fs-body)] font-semibold text-[var(--text-1)]">
                  퇴사자 ({resignedEmployees.length}명)
                </p>
                <p className="text-[var(--fs-caption)] text-[var(--text-3)]">퇴사 처리된 정규직 명단.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowResigned((s) => !s)}>
                {showResigned ? "접기" : "펼치기"}
              </Button>
            </div>
            {showResigned && (
              <Card padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--bg-0)] border-b border-[var(--border-1)]">
                        {["이름","연락처","부서/팀","입사일","퇴사일","근속기간","액션"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resignedEmployees.map((e) => (
                        <tr key={e.id} className="border-b border-[var(--border-1)] opacity-70 hover:opacity-100 transition-opacity">
                          <td className="px-4 py-3 font-medium text-[var(--text-1)]">{e.name}</td>
                          <td className="px-4 py-3 text-[var(--text-3)] tabular">{e.phone}</td>
                          <td className="px-4 py-3 text-[var(--text-3)]">{e.department}{e.team ? ` / ${e.team}` : ""}</td>
                          <td className="px-4 py-3 text-[var(--text-3)] tabular">{formatDate(e.hire_date)}</td>
                          <td className="px-4 py-3 text-[var(--text-3)] tabular">{formatDate(e.resign_date || e.resigned_at)}</td>
                          <td className="px-4 py-3 text-[var(--text-3)]">{calcTenure(e.hire_date, e.resign_date || e.resigned_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="xs" onClick={() => router.push("/offboarding")}>퇴사 처리 보기</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
          </>
        );
      })()}

      {/* Contract Send Modal */}
      {contractModal && (
        <div className="fixed inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-50 p-4">
          <Card padding="lg" className="max-w-md w-full max-h-[90vh] overflow-y-auto space-y-3 shadow-[var(--elev-3)]">
            <h3 className="text-[var(--fs-h4)] font-semibold text-[var(--text-1)]">근로계약서 발송</h3>
            <p className="text-sm text-[var(--text-3)]">{contractModal.name} ({contractModal.phone})에게 근로계약서를 발송합니다.</p>

            <Field label="근로 개시일">
              <Input type="date" value={contractForm.work_start_date} onChange={e => setContractForm({...contractForm, work_start_date: e.target.value})} />
            </Field>
            <Field label="근무장소">
              <Select value={contractForm.work_place} onChange={e => setContractForm({...contractForm, work_place: e.target.value})}>
                <option value="">본사 (전북특별자치도 전주시 덕진구 기린대로 458)</option>
                {workplaces.map((wp: any) => (
                  <option key={wp.id} value={wp.address || wp.name}>{wp.name}{wp.address ? ` (${wp.address})` : ''}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="근무부서">
                <Input type="text" value={contractForm.department} onChange={e => setContractForm({...contractForm, department: e.target.value})} />
              </Field>
              <Field label="직책">
                <Input type="text" value={contractForm.position_title} onChange={e => setContractForm({...contractForm, position_title: e.target.value})} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={<>기본급 (월) <span className="text-[var(--danger-fg)]">*</span></>}>
                <Input type="text" value={contractForm.base_pay} onChange={e => {
                  const bp = e.target.value;
                  const meal = contractForm.meal_allowance;
                  const bpNum = parseInt(bp.replace(/[^0-9]/g, '')) || 0;
                  const mealNum = parseInt(meal.replace(/[^0-9]/g, '')) || 0;
                  setContractForm({...contractForm, base_pay: bp, annual_salary: ((bpNum + mealNum) * 12).toLocaleString()});
                }} placeholder="예: 2,000,000" />
              </Field>
              <Field label="식대 (월)">
                <Input type="text" value={contractForm.meal_allowance} onChange={e => {
                  const meal = e.target.value;
                  const bp = contractForm.base_pay;
                  const bpNum = parseInt(bp.replace(/[^0-9]/g, '')) || 0;
                  const mealNum = parseInt(meal.replace(/[^0-9]/g, '')) || 0;
                  setContractForm({...contractForm, meal_allowance: meal, annual_salary: ((bpNum + mealNum) * 12).toLocaleString()});
                }} placeholder="예: 200,000" />
              </Field>
            </div>
            <Field label="연봉총액 (자동계산)">
              <div className="w-full px-3 py-2 bg-[var(--bg-0)] border border-[var(--border-2)] rounded-[var(--r-md)] text-sm text-[var(--text-2)] font-medium tabular">
                {contractForm.annual_salary ? `${contractForm.annual_salary}원` : '기본급+식대 입력 시 자동 계산'}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="급여일">
                <div className="w-full px-3 py-2 bg-[var(--bg-0)] border border-[var(--border-2)] rounded-[var(--r-md)] text-sm text-[var(--text-3)]">매월 10일</div>
              </Field>
              <Field label="근무시간">
                <Input type="text" value={contractForm.work_hours} onChange={e => setContractForm({...contractForm, work_hours: e.target.value})} placeholder="09:00~18:00" />
              </Field>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setContractModal(null)}>취소</Button>
              <Button variant="primary" className="flex-1" onClick={handleSendContract} disabled={sendingContractId !== null} loading={sendingContractId !== null}>
                계약서 발송
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-50">
          <Card padding="none" className="w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-[var(--elev-3)]">
            <div className="px-6 py-4 border-b border-[var(--border-1)]">
              <h3 className="text-[var(--fs-h4)] font-bold text-[var(--text-1)]">
                {editingEmployee ? "직원 수정" : "직원 추가"}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label={<>이름 <span className="text-[var(--danger-fg)]">*</span></>}>
                  <Input type="text" value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="홍길동" />
                </Field>
                <Field label={<>전화번호 <span className="text-[var(--danger-fg)]">*</span></>}>
                  <Input type="text" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="010-0000-0000" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="부서">
                  <Select value={form.department} onChange={(e) => updateForm("department", e.target.value)}>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="조">
                  <Select value={form.team} onChange={(e) => updateForm("team", e.target.value)}>
                    {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="직책">
                <Select value={form.role} onChange={(e) => updateForm("role", e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="은행">
                  <Input type="text" value={form.bank_name} onChange={(e) => updateForm("bank_name", e.target.value)} placeholder="국민은행" />
                </Field>
                <Field label="계좌번호">
                  <Input type="text" value={form.bank_account} onChange={(e) => updateForm("bank_account", e.target.value)} placeholder="000-00-000000" />
                </Field>
              </div>
            </div>

            {/* Attendance History */}
            {editingEmployee && (
              <div className="px-6 py-4 border-t border-[var(--border-1)]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-[var(--text-1)]">출퇴근 이력 (확정)</h4>
                  <Input type="month" inputSize="sm" value={historyMonth} onChange={e => {
                    setHistoryMonth(e.target.value);
                    if (editingEmployee) loadAttendanceHistory(editingEmployee.name, e.target.value);
                  }} className="w-36" />
                </div>
                {historyLoading ? (
                  <div className="py-4 text-center text-xs text-[var(--text-4)]">로딩중...</div>
                ) : attendanceHistory.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--text-4)]">해당 월 확정 이력이 없습니다.</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-[var(--border-1)] rounded-[var(--r-md)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--bg-0)] sticky top-0">
                        <tr>
                          {["날짜","출근","퇴근","기본","연장","야간"].map(h => (
                            <th key={h} className="py-1.5 px-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-1)]">
                        {attendanceHistory.map((r: any) => (
                          <tr key={r.id} className="hover:bg-[var(--bg-2)]">
                            <td className="py-1.5 px-2 text-[var(--text-2)] tabular">{r.date?.slice(5)}</td>
                            <td className="py-1.5 px-2 text-[var(--text-2)] tabular">{r.confirmed_clock_in || '-'}</td>
                            <td className="py-1.5 px-2 text-[var(--text-2)] tabular">{r.confirmed_clock_out || '-'}</td>
                            <td className="py-1.5 px-2 text-right text-[var(--brand-400)] tabular">{parseFloat(r.regular_hours || 0).toFixed(1)}</td>
                            <td className="py-1.5 px-2 text-right text-[var(--warning-fg)] tabular">{parseFloat(r.overtime_hours || 0).toFixed(1)}</td>
                            <td className="py-1.5 px-2 text-right text-[var(--brand-400)] tabular">{parseFloat(r.night_hours || 0).toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="px-6 py-4 border-t border-[var(--border-1)] flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving} loading={saving}>
                {editingEmployee ? "수정" : "추가"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={!!offboardingTarget}
        onClose={() => setOffboardingTarget(null)}
        title="퇴사 등록"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setOffboardingTarget(null)}>취소</Button>
            <Button variant="primary" onClick={handleOffboardingSubmit} loading={submittingOffboarding} disabled={submittingOffboarding}>
              퇴사 등록
            </Button>
          </>
        }
      >
        {offboardingTarget && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-[var(--r-md)] bg-[var(--bg-1)] border border-[var(--border-1)]">
              <div>
                <p className="text-sm font-medium text-[var(--text-1)]">{offboardingTarget.name}</p>
                <p className="text-xs text-[var(--text-3)]">{offboardingTarget.department} · {offboardingTarget.team}</p>
              </div>
            </div>
            <Field label="퇴직일 (마지막 근무일)" required>
              <Input
                type="date"
                value={offboardingForm.resign_date}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, resign_date: e.target.value }))}
              />
            </Field>
            <Field label="사유 코드" required>
              <Select
                value={offboardingForm.reason_code}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, reason_code: e.target.value }))}
              >
                <option value="">선택</option>
                {REASON_CODES_OB.map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </Select>
              {offboardingForm.reason_code && (
                <small className="text-[var(--text-3)] text-xs mt-0.5 block">
                  {REASON_CODES_OB.find((r) => r.code === offboardingForm.reason_code)?.hint}
                </small>
              )}
            </Field>
            <Field label="사유 상세">
              <Textarea
                value={offboardingForm.reason_detail}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, reason_detail: e.target.value }))}
                rows={2}
                placeholder="선택 사항"
              />
            </Field>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={offboardingForm.send_email}
                onChange={(e) => setOffboardingForm((f) => ({ ...f, send_email: e.target.checked }))}
                className="w-4 h-4 accent-[var(--brand-500)]"
              />
              지정된 이메일로 신고 안내 메일 발송
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
