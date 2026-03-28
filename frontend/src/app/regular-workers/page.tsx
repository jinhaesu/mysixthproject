"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getRegularEmployees,
  createRegularEmployee,
  updateRegularEmployee,
  deleteRegularEmployee,
  sendRegularLink,
  sendRegularContract,
  getRegularContracts,
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
} from "lucide-react";

const DEPARTMENTS = ["생산2층", "생산3층", "물류1층"];
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
};

export default function RegularWorkersPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [page, setPage] = useState(1);

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
  });

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

  function openEditModal(emp: Employee) {
    setEditingEmployee(emp);
    setForm({
      name: emp.name,
      phone: emp.phone,
      department: emp.department,
      team: emp.team,
      role: emp.role,
      workplace_id: emp.workplace_id,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      alert("이름과 전화번호는 필수입니다.");
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
      alert(err.message || "저장 중 오류가 발생했습니다.");
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
      alert(err.message || "상태 변경 실패");
    } finally {
      setTogglingId(null);
    }
  }

  const handleSendContract = async () => {
    if (!contractModal) return;
    if (!contractForm.base_pay.trim()) return alert("기본급(월)을 입력해주세요.");
    if (!contractForm.meal_allowance.trim()) return alert("식대를 입력해주세요.");
    setSendingContractId(contractModal.id);
    try {
      await sendRegularContract(contractModal.id, contractForm);
      alert('근로계약서가 발송되었습니다.');
      setContractModal(null);
      loadContracts();
    } catch (e: any) { alert(e.message); }
    finally { setSendingContractId(null); }
  };

  async function handleSendLink(id: number) {
    setSendingId(id);
    try {
      await sendRegularLink(id);
      alert("링크가 발송되었습니다.");
    } catch (err: any) {
      alert(err.message || "발송 실패");
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
      alert("비밀번호가 일치하지 않습니다.");
      return false;
    } catch { return false; }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Contact size={28} className="text-blue-600" />
            정규직 DB
          </h2>
          <p className="text-gray-500 mt-1">
            현장 정규직 직원을 관리합니다.
            {pagination.total > 0 && (
              <span className="ml-2 text-blue-600 font-medium">
                총 {pagination.total}명
              </span>
            )}
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} />
          직원 추가
        </button>
      </div>

      {/* Search & Filters */}
      <form onSubmit={handleSearch} className="flex items-center gap-3 mb-6 mt-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filterDept}
          onChange={(e) => {
            setFilterDept(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">전체 부서</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={filterTeam}
          onChange={(e) => {
            setFilterTeam(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">전체 조</option>
          {TEAMS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={(e) => {
            setFilterRole(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          <option value="">전체 직책</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium"
        >
          검색
        </button>
      </form>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          {search ? `"${search}" 검색 결과가 없습니다.` : '등록된 정규직 직원이 없습니다.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">이름</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">전화번호</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">부서</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">조</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">직책</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">은행</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">계좌번호</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">주민번호</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">상태</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">계약서</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEditModal(emp)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.phone}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.department || "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.team || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          emp.role === "반장"
                            ? "bg-purple-50 text-purple-700"
                            : emp.role === "조장"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-50 text-gray-600"
                        }`}
                      >
                        {emp.role || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{emp.bank_name || "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.bank_account || "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.id_number ? "●●●●●●-●●●●●●●" : "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          emp.status === "active"
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {emp.status === "active" ? "활성" : "비활성"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {contractMap[emp.id]?.status === "signed" ? (
                        <button onClick={async (e) => { e.stopPropagation(); if (!(await verifyContractPassword())) return; window.open(`/regular-contract?token=${contractMap[emp.id].token}`, '_blank'); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer transition-colors"
                          title="클릭하여 계약서 열람">
                          <FileCheck size={11} /> 체결 (열람)
                        </button>
                      ) : contractMap[emp.id]?.status === "pending" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
                          <FileText size={11} /> 발송됨
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          미체결
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(emp)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                          title="수정"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(emp)}
                          disabled={togglingId === emp.id}
                          className={`px-2 py-1 rounded-lg text-xs font-medium ${
                            emp.status === "active"
                              ? "hover:bg-gray-100 text-gray-600"
                              : "hover:bg-green-50 text-green-600"
                          } disabled:opacity-50`}
                          title={emp.status === "active" ? "비활성화" : "활성화"}
                        >
                          {togglingId === emp.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : emp.status === "active" ? (
                            "비활성화"
                          ) : (
                            "활성화"
                          )}
                        </button>
                        <button
                          onClick={() => handleSendLink(emp.id)}
                          disabled={sendingId === emp.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-green-50 text-green-600 text-xs font-medium disabled:opacity-50"
                          title="링크 발송"
                        >
                          {sendingId === emp.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Send size={12} />
                          )}
                          링크
                        </button>
                        <button
                          onClick={async () => { if (!(await verifyContractPassword())) return; setContractModal(emp); setContractForm({...contractForm, department: emp.department || ''}); }}
                          disabled={sendingContractId === emp.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-purple-50 text-purple-600 text-xs font-medium disabled:opacity-50"
                          title="계약서 발송"
                        >
                          {sendingContractId === emp.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <FileText size={12} />
                          )}
                          계약서
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                {pagination.total}명 중{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}명
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm text-gray-700 min-w-[80px] text-center">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contract Send Modal */}
      {contractModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">근로계약서 발송</h3>
            <p className="text-sm text-gray-500">{contractModal.name} ({contractModal.phone})에게 근로계약서를 발송합니다.</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">근로 개시일</label>
              <input type="date" value={contractForm.work_start_date} onChange={e => setContractForm({...contractForm, work_start_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">근무부서</label>
                <input type="text" value={contractForm.department} onChange={e => setContractForm({...contractForm, department: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">직책</label>
                <input type="text" value={contractForm.position_title} onChange={e => setContractForm({...contractForm, position_title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">기본급 (월) <span className="text-red-500">*</span></label>
                <input type="text" value={contractForm.base_pay} onChange={e => {
                  const bp = e.target.value;
                  const meal = contractForm.meal_allowance;
                  const bpNum = parseInt(bp.replace(/[^0-9]/g, '')) || 0;
                  const mealNum = parseInt(meal.replace(/[^0-9]/g, '')) || 0;
                  setContractForm({...contractForm, base_pay: bp, annual_salary: ((bpNum + mealNum) * 12).toLocaleString()});
                }} placeholder="예: 2,000,000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">식대 (월)</label>
                <input type="text" value={contractForm.meal_allowance} onChange={e => {
                  const meal = e.target.value;
                  const bp = contractForm.base_pay;
                  const bpNum = parseInt(bp.replace(/[^0-9]/g, '')) || 0;
                  const mealNum = parseInt(meal.replace(/[^0-9]/g, '')) || 0;
                  setContractForm({...contractForm, meal_allowance: meal, annual_salary: ((bpNum + mealNum) * 12).toLocaleString()});
                }} placeholder="예: 200,000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연봉총액 (자동계산)</label>
              <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">
                {contractForm.annual_salary ? `${contractForm.annual_salary}원` : '기본급+식대 입력 시 자동 계산'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">급여일</label>
                <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">매월 10일</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">근무시간</label>
                <input type="text" value={contractForm.work_hours} onChange={e => setContractForm({...contractForm, work_hours: e.target.value})}
                  placeholder="09:00~18:00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setContractModal(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">취소</button>
              <button onClick={handleSendContract} disabled={sendingContractId !== null}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:bg-gray-300">
                {sendingContractId ? '발송 중...' : '계약서 발송'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingEmployee ? "직원 수정" : "직원 추가"}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이름 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    전화번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
                  <select
                    value={form.department}
                    onChange={(e) => updateForm("department", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">조</label>
                  <select
                    value={form.team}
                    onChange={(e) => updateForm("team", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    {TEAMS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">직책</label>
                <select
                  value={form.role}
                  onChange={(e) => updateForm("role", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingEmployee ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
