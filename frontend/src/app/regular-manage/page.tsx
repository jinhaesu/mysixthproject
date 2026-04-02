"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import HourlyChart from "@/components/HourlyChart";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  getSurveyWorkplaces,
  getRegularEmployees,
  createRegularEmployee,
  updateRegularEmployee,
  deleteRegularEmployee,
  sendRegularLink,
  sendRegularLinkBatch,
  getRegularNotices,
  createRegularNotice,
  updateRegularNotice,
  deleteRegularNotice,
  getRegularOrgSettings,
  createRegularOrgSetting,
  updateRegularOrgSetting,
  deleteRegularOrgSetting,
  getRegularDashboard,
  getRegularVacations,
  approveVacation,
  rejectVacation,
  getVacationBalances,
  setVacationBalance,
  initVacationBalances,
  autoCalcVacationBalances,
  getRegularShifts,
  createRegularShift,
  deleteRegularShift,
  getShiftAssignments,
  assignEmployeesToShift,
  removeShiftAssignment,
  getShiftPlan,
  resignRegularEmployee,
  getResignedEmployees,
} from "@/lib/api";
import {
  MessageSquare,
  Plus,
  Edit3,
  Trash2,
  Send,
  Users,
  Loader2,
  ClipboardList,
  Network,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const DEPARTMENTS = ["생산2층", "생산3층", "물류1층", "생산 야간", "물류 야간"];
const TEAMS = ["1조", "2조", "3조"];
const ROLES = ["일반", "조장", "반장"];
const LEADER_ROLES = ["조장", "반장"];

type Tab = "employees" | "notices" | "org" | "attendance" | "vacation" | "shifts";

interface Employee {
  id: number;
  name: string;
  phone: string;
  department: string;
  team: string;
  role: string;
  workplace_id: number | null;
  hire_date?: string;
  token_link?: string;
}

interface Notice {
  id: number;
  title: string;
  content: string;
  date: string;
}

interface OrgSetting {
  id: number;
  department: string;
  team: string;
  leader_name: string;
  leader_role: string;
}

interface Workplace {
  id: number;
  name: string;
}

const emptyEmployeeForm = {
  name: "",
  phone: "",
  department: DEPARTMENTS[0],
  team: TEAMS[0],
  role: ROLES[0],
  workplace_id: null as number | null,
  hire_date: "",
};

const emptyNoticeForm = { title: "", content: "", date_type: "specific", end_date: "", target_department: "" };

const emptyOrgForm = {
  department: DEPARTMENTS[0],
  team: "",
  leader_name: "",
  leader_role: LEADER_ROLES[0],
};

export default function RegularManagePage() {
  const [tab, setTab] = usePersistedState<Tab>("rm_tab", "employees");
  const [loading, setLoading] = useState(false);

  // ===== Employees Tab =====
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empForm, setEmpForm] = useState({ ...emptyEmployeeForm });
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [batchSending, setBatchSending] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [showResigned, setShowResigned] = useState(false);
  const [resignedEmployees, setResignedEmployees] = useState<any[]>([]);
  const [empSaving, setEmpSaving] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editEmpForm, setEditEmpForm] = useState({ ...emptyEmployeeForm });

  // ===== Notices Tab =====
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeDate, setNoticeDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [noticeForm, setNoticeForm] = useState({ ...emptyNoticeForm });
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<Notice | null>(null);

  // ===== Org Tab =====
  const [orgSettings, setOrgSettings] = useState<OrgSetting[]>([]);
  const [orgForm, setOrgForm] = useState({ ...emptyOrgForm });
  const [editingOrg, setEditingOrg] = useState<OrgSetting | null>(null);
  const [orgSaving, setOrgSaving] = useState(false);

  // Load workplaces
  useEffect(() => {
    getSurveyWorkplaces()
      .then((data) => setWorkplaces(data))
      .catch(console.error);
  }, []);

  // Load employees
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRegularEmployees({ limit: '500' });
      const list = data?.employees || data || [];
      setEmployees(list);
    } catch (err: any) {
      console.error('loadEmployees error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load notices
  const loadNotices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRegularNotices(noticeDate);
      setNotices(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [noticeDate]);

  // Load org settings
  const loadOrgSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRegularOrgSettings();
      setOrgSettings(data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "employees") loadEmployees();
    else if (tab === "notices") loadNotices();
    else if (tab === "org") loadOrgSettings();
  }, [tab, loadEmployees, loadNotices, loadOrgSettings]);

  // ===== Employee Handlers =====
  async function handleAddEmployee() {
    if (!empForm.name.trim() || !empForm.phone.trim()) {
      alert("이름과 전화번호는 필수입니다.");
      return;
    }
    setEmpSaving(true);
    try {
      const result = await createRegularEmployee(empForm);
      if (result) {
        setEmpForm({ ...emptyEmployeeForm });
        alert(`${empForm.name} 등록 완료`);
        await loadEmployees();
      }
    } catch (err: any) {
      alert(err.message || "등록 실패");
    } finally {
      setEmpSaving(false);
    }
  }

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

  async function handleBatchSend() {
    if (selectedIds.size === 0) {
      alert("발송할 직원을 선택해주세요.");
      return;
    }
    setBatchSending(true);
    try {
      const result = await sendRegularLinkBatch(Array.from(selectedIds));
      alert(`${result.sent || selectedIds.size}명에게 링크를 발송했습니다.`);
      setSelectedIds(new Set());
    } catch (err: any) {
      alert(err.message || "일괄 발송 실패");
    } finally {
      setBatchSending(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === employees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(employees.map((e) => e.id)));
    }
  }

  function startEditEmp(emp: Employee) {
    setEditingEmp(emp);
    setEditEmpForm({ name: emp.name, phone: emp.phone, department: emp.department, team: emp.team, role: emp.role, workplace_id: emp.workplace_id, hire_date: (emp as any).hire_date || "" });
  }

  async function handleSaveEmp() {
    if (!editingEmp) return;
    setEmpSaving(true);
    try {
      await updateRegularEmployee(editingEmp.id, editEmpForm);
      setEditingEmp(null);
      loadEmployees();
    } catch (err: any) {
      alert(err.message || "수정 실패");
    } finally {
      setEmpSaving(false);
    }
  }

  async function handleDeleteEmp(id: number, name: string) {
    if (!confirm(`${name} 직원을 삭제하시겠습니까?`)) return;
    try {
      await deleteRegularEmployee(id);
      loadEmployees();
    } catch (err: any) {
      alert(err.message || "삭제 실패");
    }
  }

  // ===== Notice Handlers =====
  async function handleSaveNotice() {
    if (!noticeForm.title.trim() || !noticeForm.content.trim()) {
      alert("제목과 내용을 입력해주세요.");
      return;
    }
    setNoticeSaving(true);
    try {
      if (editingNotice) {
        await updateRegularNotice(editingNotice.id, { ...noticeForm, date: noticeDate });
        setEditingNotice(null);
      } else {
        await createRegularNotice({ ...noticeForm, date: noticeDate });
      }
      setNoticeForm({ ...emptyNoticeForm });
      loadNotices();
    } catch (err: any) {
      alert(err.message || "저장 실패");
    } finally {
      setNoticeSaving(false);
    }
  }

  async function handleDeleteNotice(id: number) {
    try {
      await deleteRegularNotice(id);
      loadNotices();
    } catch (err: any) {
      alert(err.message || "삭제 실패");
    }
  }

  function startEditNotice(notice: Notice) {
    setEditingNotice(notice);
    setNoticeForm({ title: notice.title, content: notice.content, date_type: (notice as any).date_type || 'specific', end_date: (notice as any).end_date || '', target_department: (notice as any).target_department || '' });
  }

  // ===== Org Handlers =====
  async function handleSaveOrg() {
    if (!orgForm.team.trim() || !orgForm.leader_name.trim()) {
      alert("조/팀명과 리더 이름은 필수입니다.");
      return;
    }
    setOrgSaving(true);
    try {
      if (editingOrg) {
        await updateRegularOrgSetting(editingOrg.id, orgForm);
        setEditingOrg(null);
      } else {
        await createRegularOrgSetting(orgForm);
      }
      setOrgForm({ ...emptyOrgForm });
      loadOrgSettings();
    } catch (err: any) {
      alert(err.message || "저장 실패");
    } finally {
      setOrgSaving(false);
    }
  }

  async function handleDeleteOrg(id: number) {
    try {
      await deleteRegularOrgSetting(id);
      loadOrgSettings();
    } catch (err: any) {
      alert(err.message || "삭제 실패");
    }
  }

  function startEditOrg(org: OrgSetting) {
    setEditingOrg(org);
    setOrgForm({
      department: org.department,
      team: org.team,
      leader_name: org.leader_name,
      leader_role: org.leader_role,
    });
  }

  // Group org settings by department
  const orgByDept = orgSettings.reduce<Record<string, OrgSetting[]>>((acc, item) => {
    if (!acc[item.department]) acc[item.department] = [];
    acc[item.department].push(item);
    return acc;
  }, {});

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "employees", label: "직원 등록", icon: <Users size={16} /> },
    { key: "notices", label: "공지문 관리", icon: <ClipboardList size={16} /> },
    { key: "org", label: "조직도 설정", icon: <Network size={16} /> },
    { key: "attendance", label: "출결 조회", icon: <ClipboardList size={16} /> },
    { key: "vacation", label: "휴가 관리", icon: <Calendar size={16} /> },
    { key: "shifts", label: "계획 출퇴근 배치", icon: <Clock size={16} /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare size={28} className="text-blue-600" />
          정규직 관리
        </h1>
        <p className="text-gray-500 mt-1">현장 정규직 직원 등록, 공지문, 조직도를 관리합니다.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== Tab 1: 직원 등록 ===== */}
      {tab === "employees" && (
        <div className="space-y-6">
          {/* Register Form */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">직원 등록</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">이름 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  placeholder="홍길동"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">전화번호 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={empForm.phone}
                  onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">부서</label>
                <select
                  value={empForm.department}
                  onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">조</label>
                <select
                  value={empForm.team}
                  onChange={(e) => setEmpForm({ ...empForm, team: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {TEAMS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">직책</label>
                <select
                  value={empForm.role}
                  onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">근무지</label>
                <select
                  value={empForm.workplace_id ?? ""}
                  onChange={(e) =>
                    setEmpForm({ ...empForm, workplace_id: e.target.value ? Number(e.target.value) : null })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">선택</option>
                  {workplaces.map((wp) => (
                    <option key={wp.id} value={wp.id}>{wp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">입사일자</label>
                <input
                  type="date"
                  value={empForm.hire_date}
                  onChange={(e) => setEmpForm({ ...empForm, hire_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleAddEmployee}
                disabled={empSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {empSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                등록
              </button>
            </div>
          </div>

          {/* Search + Batch Actions */}
          {(employees.length > 0 || showResigned) && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="이름/연락처 검색..."
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button
                onClick={async () => {
                  const next = !showResigned;
                  setShowResigned(next);
                  if (next) {
                    try { const data = await getResignedEmployees(); setResignedEmployees(data || []); } catch {}
                  }
                }}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${showResigned ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {showResigned ? '재직자 보기' : '퇴사자 조회'}
              </button>
              <button
                onClick={handleBatchSend}
                disabled={batchSending || selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-50"
              >
                {batchSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                일괄 링크발송 ({selectedIds.size}명)
              </button>
              <button
                onClick={async () => {
                  if (selectedIds.size === 0) return;
                  if (!confirm(`선택한 ${selectedIds.size}명을 삭제하시겠습니까?`)) return;
                  try {
                    for (const id of Array.from(selectedIds)) {
                      await deleteRegularEmployee(id);
                    }
                    setSelectedIds(new Set());
                    loadEmployees();
                  } catch (err: any) {
                    alert(err.message || "삭제 실패");
                  }
                }}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium disabled:opacity-50"
              >
                <Trash2 size={14} />
                일괄 삭제 ({selectedIds.size}명)
              </button>
            </div>
          )}

          {/* Employee List */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={32} className="animate-spin text-blue-600" />
            </div>
          ) : employees.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              등록된 직원이 없습니다.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === employees.length && employees.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">이름</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">전화번호</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">부서</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">조</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">직책</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">입사일</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">은행</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">계좌번호</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">주민번호</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.filter((emp) => !empSearch || emp.name.includes(empSearch) || emp.phone.includes(empSearch)).map((emp) => (
                      <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(emp.id)}
                            onChange={() => toggleSelect(emp.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-4 py-3 text-gray-700">{emp.phone}</td>
                        <td className="px-4 py-3 text-gray-700">{emp.department}</td>
                        <td className="px-4 py-3 text-gray-700">{emp.team}</td>
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
                            {emp.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{(emp as any).hire_date || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{(emp as any).bank_name || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs font-mono">{(emp as any).bank_account || "-"}</td>
                        <td className="px-4 py-3 text-gray-700 text-xs">{(emp as any).id_number ? "●●●●●●-●●●●●●●" : "-"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSendLink(emp.id)}
                              disabled={sendingId === emp.id}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium disabled:opacity-50"
                            >
                              {sendingId === emp.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              발송
                            </button>
                            <button
                              onClick={() => startEditEmp(emp)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="수정"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={async () => {
                                const date = prompt(`${emp.name}님의 퇴사일자를 입력해주세요 (YYYY-MM-DD)`, new Date().toLocaleDateString('sv-SE'));
                                if (!date) return;
                                try { await resignRegularEmployee(emp.id, date); loadEmployees(); } catch (e: any) { alert(e.message); }
                              }}
                              className="px-1.5 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded font-medium"
                              title="퇴사처리"
                            >
                              퇴사
                            </button>
                            <button
                              onClick={() => handleDeleteEmp(emp.id, emp.name)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="삭제"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resigned Employees */}
          {showResigned && (
            <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-200">
                <h3 className="text-sm font-semibold text-orange-800">퇴사자 목록 ({resignedEmployees.filter(e => !empSearch || e.name?.includes(empSearch) || e.phone?.includes(empSearch)).length}명)</h3>
              </div>
              {resignedEmployees.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">퇴사자가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-orange-50/50 text-left">
                        <th className="px-4 py-2 font-medium text-gray-600">이름</th>
                        <th className="px-4 py-2 font-medium text-gray-600">연락처</th>
                        <th className="px-4 py-2 font-medium text-gray-600">부서</th>
                        <th className="px-4 py-2 font-medium text-gray-600">조</th>
                        <th className="px-4 py-2 font-medium text-gray-600">입사일</th>
                        <th className="px-4 py-2 font-medium text-gray-600">퇴사일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resignedEmployees.filter(e => !empSearch || e.name?.includes(empSearch) || e.phone?.includes(empSearch)).map((e: any) => (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{e.name}</td>
                          <td className="px-4 py-2.5 text-gray-600">{e.phone}</td>
                          <td className="px-4 py-2.5 text-gray-600">{e.department}</td>
                          <td className="px-4 py-2.5 text-gray-600">{e.team}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{e.hire_date || '-'}</td>
                          <td className="px-4 py-2.5 text-orange-600 font-medium text-xs">{e.resign_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Edit Employee Modal */}
          {editingEmp && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">직원 정보 수정</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">이름</label>
                    <input type="text" value={editEmpForm.name} onChange={(e) => setEditEmpForm({ ...editEmpForm, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">전화번호</label>
                    <input type="text" value={editEmpForm.phone} onChange={(e) => setEditEmpForm({ ...editEmpForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">부서</label>
                      <select value={editEmpForm.department} onChange={(e) => setEditEmpForm({ ...editEmpForm, department: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">조</label>
                      <select value={editEmpForm.team} onChange={(e) => setEditEmpForm({ ...editEmpForm, team: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">직책</label>
                      <select value={editEmpForm.role} onChange={(e) => setEditEmpForm({ ...editEmpForm, role: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">근무지</label>
                    <select value={editEmpForm.workplace_id ?? ""} onChange={(e) => setEditEmpForm({ ...editEmpForm, workplace_id: e.target.value ? Number(e.target.value) : null })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="">선택</option>
                      {workplaces.map((wp) => <option key={wp.id} value={wp.id}>{wp.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">입사일자</label>
                    <input type="date" value={(editEmpForm as any).hire_date || ""} onChange={(e) => setEditEmpForm({ ...editEmpForm, hire_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditingEmp(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">취소</button>
                  <button onClick={handleSaveEmp} disabled={empSaving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2">
                    {empSaving && <Loader2 size={14} className="animate-spin" />}
                    저장
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Tab 2: 공지문 관리 ===== */}
      {tab === "notices" && (
        <div className="space-y-6">
          {/* Date + Form */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4 mb-4">
              <h3 className="text-sm font-semibold text-gray-800">공지문 작성</h3>
              <input
                type="date"
                value={noticeDate}
                onChange={(e) => setNoticeDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">제목</label>
                <input
                  type="text"
                  value={noticeForm.title}
                  onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                  placeholder="공지문 제목"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">날짜 유형</label>
                  <select value={noticeForm.date_type} onChange={(e) => setNoticeForm({ ...noticeForm, date_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="specific">특정 날짜</option>
                    <option value="daily">매일 고정</option>
                    <option value="range">기간 설정</option>
                  </select>
                </div>
                {noticeForm.date_type === 'range' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">종료일</label>
                    <input type="date" value={noticeForm.end_date}
                      onChange={(e) => setNoticeForm({ ...noticeForm, end_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">대상 부서</label>
                  <select value={noticeForm.target_department} onChange={(e) => setNoticeForm({ ...noticeForm, target_department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">전체 (모든 부서)</option>
                    <option value="생산2층">생산2층</option>
                    <option value="생산3층">생산3층</option>
                    <option value="물류1층">물류1층</option>
                    <option value="생산 야간">생산 야간</option>
                    <option value="물류 야간">물류 야간</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">내용</label>
                <textarea
                  value={noticeForm.content}
                  onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                  placeholder="공지문 내용을 입력하세요..."
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                {editingNotice && (
                  <button
                    onClick={() => {
                      setEditingNotice(null);
                      setNoticeForm({ ...emptyNoticeForm });
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                  >
                    취소
                  </button>
                )}
                <button
                  onClick={handleSaveNotice}
                  disabled={noticeSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {noticeSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {editingNotice ? "수정" : "등록"}
                </button>
              </div>
            </div>
          </div>

          {/* Notices List + Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* List */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">
                {noticeDate} 공지문 목록
              </h3>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                </div>
              ) : notices.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                  해당 날짜에 공지문이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {notices.map((notice) => (
                    <div
                      key={notice.id}
                      onClick={() => setPreviewNotice(notice)}
                      className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
                        previewNotice?.id === notice.id
                          ? "border-blue-400 bg-blue-50/30"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-900">{notice.title}</h4>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditNotice(notice);
                            }}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNotice(notice.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notice.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-3">미리보기</h3>
              {previewNotice ? (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h4 className="text-lg font-bold text-gray-900 mb-3">{previewNotice.title}</h4>
                  <p className="text-xs text-gray-400 mb-4">{previewNotice.date}</p>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {previewNotice.content}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                  공지문을 선택하면 미리보기가 표시됩니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Tab 3: 조직도 설정 ===== */}
      {tab === "org" && (
        <div className="space-y-6">
          {/* Add/Edit Form */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">
              {editingOrg ? "조직 수정" : "조직 추가"}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">부서</label>
                <select
                  value={orgForm.department}
                  onChange={(e) => setOrgForm({ ...orgForm, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">조/팀</label>
                <input
                  type="text"
                  value={orgForm.team}
                  onChange={(e) => setOrgForm({ ...orgForm, team: e.target.value })}
                  placeholder="1조"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">리더 이름</label>
                <input
                  type="text"
                  value={orgForm.leader_name}
                  onChange={(e) => setOrgForm({ ...orgForm, leader_name: e.target.value })}
                  placeholder="홍길동"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">직책</label>
                <select
                  value={orgForm.leader_role}
                  onChange={(e) => setOrgForm({ ...orgForm, leader_role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {LEADER_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {editingOrg && (
                <button
                  onClick={() => {
                    setEditingOrg(null);
                    setOrgForm({ ...emptyOrgForm });
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  취소
                </button>
              )}
              <button
                onClick={handleSaveOrg}
                disabled={orgSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {orgSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {editingOrg ? "수정" : "추가"}
              </button>
            </div>
          </div>

          {/* Org List Grouped by Department */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={32} className="animate-spin text-blue-600" />
            </div>
          ) : Object.keys(orgByDept).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              등록된 조직 설정이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(orgByDept).map(([dept, items]) => (
                <div key={dept} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <Network size={16} className="text-blue-600" />
                      {dept}
                      <span className="text-xs text-gray-400 font-normal">({items.length}개 조)</span>
                    </h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-5 py-2.5 text-left font-medium text-gray-600">조/팀</th>
                        <th className="px-4 py-2.5 text-left font-medium text-gray-600">리더</th>
                        <th className="px-4 py-2.5 text-left font-medium text-gray-600">직책</th>
                        <th className="px-4 py-2.5 text-right font-medium text-gray-600">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((org) => (
                        <tr key={org.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-5 py-2.5 font-medium text-gray-900">{org.team}</td>
                          <td className="px-4 py-2.5 text-gray-700">{org.leader_name}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                                org.leader_role === "반장"
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {org.leader_role}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditOrg(org)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteOrg(org.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* ===== Tab 4: 출결 조회 ===== */}
      {tab === "attendance" && <AttendanceTab />}
      {/* ===== Tab 5: 휴가 관리 ===== */}
      {tab === "vacation" && <VacationTab />}
      {/* ===== Tab 6: 계획 출퇴근 배치 ===== */}
      {tab === "shifts" && <ShiftsTab />}
    </div>
  );
}

function AttendanceTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [searchName, setSearchName] = useState("");
  const [shiftPlans, setShiftPlans] = useState<Record<number, any>>({});
  const [chartDept, setChartDept] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRegularDashboard(date);
      setRecords(data.workers || []);
      try {
        const planData = await getShiftPlan(date);
        const planMap: Record<number, any> = {};
        for (const p of (planData.plans || [])) {
          planMap[p.employee_id] = p;
        }
        setShiftPlans(planMap);
      } catch {}
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const filtered = searchName
    ? records.filter((r: any) => r.name?.includes(searchName) || r.phone?.includes(searchName))
    : records;

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    try { return new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); } catch { return t; }
  };

  const getStatus = (r: any) => {
    if (r.clock_out_time) return { label: "퇴근완료", cls: "bg-green-50 text-green-700 border border-green-200" };
    if (r.clock_in_time) return { label: "출근중", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
    return { label: "미출근", cls: "bg-red-50 text-red-700 border border-red-200" };
  };

  const clockInChartData = useMemo(() => {
    return records.filter((r: any) => r.clock_in_time).map((r: any) => ({
      hour: new Date(r.clock_in_time).getHours(), count: 1, department: r.department || '기타',
    }));
  }, [records]);
  const clockOutChartData = useMemo(() => {
    return records.filter((r: any) => r.clock_out_time).map((r: any) => ({
      hour: new Date(r.clock_out_time).getHours(), count: 1, department: r.department || '기타',
    }));
  }, [records]);

  return (
    <div className="space-y-4">
      <HourlyChart clockInData={clockInChartData} clockOutData={clockOutChartData} title={`${date} 시간대별 출퇴근 인원`}
        departments={DEPARTMENTS} selectedDept={chartDept} onDeptChange={setChartDept} />
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">이름/연락처 검색</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="검색..."
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={load} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            조회
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && records.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{records.length}</p>
            <p className="text-xs text-gray-500 mt-1">전체</p>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{records.filter((r: any) => r.clock_in_time && !r.clock_out_time).length}</p>
            <p className="text-xs text-amber-600 mt-1">출근중</p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{records.filter((r: any) => r.clock_out_time).length}</p>
            <p className="text-xs text-green-600 mt-1">퇴근완료</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{records.filter((r: any) => !r.clock_in_time).length}</p>
            <p className="text-xs text-red-600 mt-1">미출근</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2 px-4 font-medium text-gray-600">이름</th>
                  <th className="py-2 px-4 font-medium text-gray-600">연락처</th>
                  <th className="py-2 px-4 font-medium text-gray-600">부서</th>
                  <th className="py-2 px-4 font-medium text-gray-600">조</th>
                  <th className="py-2 px-4 font-medium text-gray-600">직책</th>
                  <th className="py-2 px-4 font-medium text-gray-600">계획출근</th>
                  <th className="py-2 px-4 font-medium text-gray-600">계획퇴근</th>
                  <th className="py-2 px-4 font-medium text-gray-600">출근시간</th>
                  <th className="py-2 px-4 font-medium text-gray-600">퇴근시간</th>
                  <th className="py-2 px-4 font-medium text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r: any) => {
                  const st = getStatus(r);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{r.name}</td>
                      <td className="py-2.5 px-4 text-gray-600">
                        <a href={`tel:${r.phone}`} className="text-blue-600 hover:underline">{r.phone}</a>
                      </td>
                      <td className="py-2.5 px-4 text-gray-600">{r.department}</td>
                      <td className="py-2.5 px-4 text-gray-600">{r.team}</td>
                      <td className="py-2.5 px-4 text-gray-600">{r.role}</td>
                      <td className="py-2.5 px-4 text-gray-500 text-xs">{shiftPlans[r.id]?.planned_clock_in || '-'}</td>
                      <td className="py-2.5 px-4 text-gray-500 text-xs">{shiftPlans[r.id]?.planned_clock_out || '-'}</td>
                      <td className="py-2.5 px-4 text-gray-700">{formatTime(r.clock_in_time)}</td>
                      <td className="py-2.5 px-4 text-gray-700">{formatTime(r.clock_out_time)}</td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function VacationTab() {
  const [subTab, setSubTab] = useState<'requests' | 'balances' | 'calendar'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [initDays, setInitDays] = useState("15");
  const [editingBalance, setEditingBalance] = useState<number | null>(null);
  const [editDays, setEditDays] = useState("");
  const [editUsedDays, setEditUsedDays] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set());
  const [batchDays, setBatchDays] = useState("15");
  const [vacLogs, setVacLogs] = useState<any[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [balanceSearch, setBalanceSearch] = useState("");
  // Calendar sub-tab state
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [calDept, setCalDept] = useState("");
  const [calVacations, setCalVacations] = useState<any[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const data = await getRegularVacations(params);
      setRequests(data || []);
    } catch {} finally { setLoading(false); }
  }, [statusFilter]);

  const loadBalances = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVacationBalances(String(year));
      setBalances(data || []);
    } catch {} finally { setLoading(false); }
  }, [year]);

  const loadVacLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/vacation-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setVacLogs(data || []);
    } catch {}
  }, []);

  const loadCalVacations = useCallback(async () => {
    setCalLoading(true);
    try {
      const data = await getRegularVacations({ status: 'approved' });
      setCalVacations(data || []);
    } catch {} finally { setCalLoading(false); }
  }, []);

  useEffect(() => {
    if (subTab === 'requests') { loadRequests(); loadVacLogs(); }
    else if (subTab === 'balances') loadBalances();
    else loadCalVacations();
  }, [subTab, loadRequests, loadBalances, loadCalVacations]);

  const handleApprove = async (id: number) => {
    const memo = prompt("승인 메모 (선택):");
    try { await approveVacation(id, memo || ""); loadRequests(); } catch (e: any) { alert(e.message); }
  };
  const handleReject = async (id: number) => {
    const memo = prompt("반려 사유:");
    if (!memo) return;
    try { await rejectVacation(id, memo); loadRequests(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="space-y-4">
      {/* 연차 규칙 안내 */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-indigo-900 mb-2">연차휴가 기준 (근로기준법 제60조)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-indigo-800">
          <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
            <p className="font-semibold text-indigo-700">1년 미만</p>
            <p>1개월 개근 시 <b>1일</b> 발생 (최대 11일)</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
            <p className="font-semibold text-indigo-700">1년 이상 ~ 3년 미만</p>
            <p>연 <b>15일</b></p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
            <p className="font-semibold text-indigo-700">3년 이상</p>
            <p>15일 + 2년마다 <b>1일 추가</b> (최대 25일)</p>
          </div>
        </div>
        <p className="text-xs text-indigo-600 mt-2.5 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
          입사일자 등록 및 초기 사용일수 세팅 이후, 매일 서버에서 자동으로 입사일 기준 보유 연차가 갱신됩니다.
        </p>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2">
        <button onClick={() => setSubTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'requests' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          휴가 신청 목록
        </button>
        <button onClick={() => setSubTab('balances')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${subTab === 'balances' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          보유 휴가 설정
        </button>
        <button onClick={() => setSubTab('calendar')}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${subTab === 'calendar' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Calendar size={14} /> 휴가 캘린더
        </button>
      </div>

      {subTab === 'requests' && (
        <>
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                <option value="">전체</option>
                <option value="pending">대기중</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
              </select>
            </div>
            <button onClick={loadRequests} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">조회</button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></div>
            ) : requests.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">휴가 신청이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="py-2 px-4 font-medium text-gray-600">이름</th>
                      <th className="py-2 px-4 font-medium text-gray-600">부서</th>
                      <th className="py-2 px-4 font-medium text-gray-600">연락처</th>
                      <th className="py-2 px-4 font-medium text-gray-600">종류</th>
                      <th className="py-2 px-4 font-medium text-gray-600">기간</th>
                      <th className="py-2 px-4 font-medium text-gray-600">일수</th>
                      <th className="py-2 px-4 font-medium text-gray-600">사유</th>
                      <th className="py-2 px-4 font-medium text-gray-600">상태</th>
                      <th className="py-2 px-4 font-medium text-gray-600">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requests.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="py-2.5 px-4 font-medium text-gray-900">{r.employee_name}</td>
                        <td className="py-2.5 px-4 text-gray-600">{r.department} {r.team}</td>
                        <td className="py-2.5 px-4 text-gray-600">{r.phone}</td>
                        <td className="py-2.5 px-4">
                          <select value={r.type || '연차'} onChange={async (e) => {
                            const newType = e.target.value;
                            try {
                              const token = localStorage.getItem('token');
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/vacations/${r.id}/update-type`, {
                                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ type: newType, days: newType.includes('반차') ? 0.5 : r.days }),
                              });
                              loadRequests();
                            } catch (err: any) { alert(err.message); }
                          }} className="px-1.5 py-1 border border-gray-200 rounded text-xs bg-white">
                            <option value="연차">연차</option>
                            <option value="오전반차">오전반차 (09~14시)</option>
                            <option value="오후반차">오후반차 (14~18시)</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-4 text-gray-700">{r.start_date}{r.start_date !== r.end_date ? ` ~ ${r.end_date}` : ''}</td>
                        <td className="py-2.5 px-4 text-gray-700">{r.days}일</td>
                        <td className="py-2.5 px-4 text-gray-600 max-w-[150px] truncate">{r.reason || "-"}</td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === 'approved' ? 'bg-green-50 text-green-700' :
                            r.status === 'rejected' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {r.status === 'approved' ? '승인' : r.status === 'rejected' ? '반려' : '대기중'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleApprove(r.id)}
                                className="px-2.5 py-1 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100">승인</button>
                              <button onClick={() => handleReject(r.id)}
                                className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100">반려</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Vacation Update Logs */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setLogsOpen(!logsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
              <span className="text-sm font-semibold text-gray-800">휴가 변동 이력</span>
              <span className="text-xs text-gray-400">{logsOpen ? '접기' : '펼치기'} ({vacLogs.length}건)</span>
            </button>
            {logsOpen && (
              <div className="border-t border-gray-100 max-h-64 overflow-y-auto">
                {vacLogs.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">변동 이력이 없습니다.</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="py-1.5 px-3 text-left font-medium text-gray-600">일시</th>
                        <th className="py-1.5 px-3 text-left font-medium text-gray-600">이름</th>
                        <th className="py-1.5 px-3 text-left font-medium text-gray-600">구분</th>
                        <th className="py-1.5 px-3 text-right font-medium text-gray-600">이전</th>
                        <th className="py-1.5 px-3 text-right font-medium text-gray-600">변경</th>
                        <th className="py-1.5 px-3 text-left font-medium text-gray-600">사유</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {vacLogs.map((log: any) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="py-1.5 px-3 text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                          <td className="py-1.5 px-3 font-medium text-gray-900">{log.employee_name}</td>
                          <td className="py-1.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${log.action === '자동갱신' ? 'bg-blue-50 text-blue-700' : log.action === '신규생성' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right text-gray-600">{parseFloat(log.prev_days || 0).toFixed(1)}일</td>
                          <td className="py-1.5 px-3 text-right font-medium text-blue-700">{parseFloat(log.new_days || 0).toFixed(1)}일</td>
                          <td className="py-1.5 px-3 text-gray-500">{log.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {subTab === 'calendar' && (() => {
        const daysInMonth = new Date(calYear, calMonth, 0).getDate();
        const firstDow = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
        // Monday-first: shift so Mon=0 ... Sun=6
        const startOffset = (firstDow + 6) % 7;
        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
          const d = i - startOffset + 1;
          return d >= 1 && d <= daysInMonth ? d : null;
        });

        const monthStr = `${calYear}-${String(calMonth).padStart(2, '0')}`;

        const filteredVacations = calDept
          ? calVacations.filter((v: any) => (v.employee_department || '').includes(calDept))
          : calVacations;

        // For each date in month, collect vacations covering that date
        const vacsByDate = new Map<number, any[]>();
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${monthStr}-${String(d).padStart(2, '0')}`;
          const covering = filteredVacations.filter((v: any) => {
            return v.start_date <= dateStr && dateStr <= v.end_date;
          });
          if (covering.length > 0) vacsByDate.set(d, covering);
        }

        const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

        return (
          <div className="space-y-3">
            {/* Controls */}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">연도</label>
                <input type="number" value={calYear} onChange={e => setCalYear(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-24" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">월</label>
                <select value={calMonth} onChange={e => setCalMonth(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">부서</label>
                <select value={calDept} onChange={e => setCalDept(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">전체</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={loadCalVacations}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">새로고침</button>
              <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-500"></span> 연차</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500"></span> 반차</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-purple-500"></span> 기타</span>
              </div>
            </div>

            {/* Calendar grid */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">{calYear}년 {calMonth}월 휴가 현황</h3>
              </div>
              {calLoading ? (
                <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></div>
              ) : (
                <div className="p-3">
                  {/* Header row */}
                  <div className="grid grid-cols-7 gap-px mb-px">
                    {DOW_LABELS.map((label, i) => (
                      <div key={label} className={`text-center text-xs font-semibold py-1.5 rounded ${i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-500' : 'text-gray-600'}`}>
                        {label}
                      </div>
                    ))}
                  </div>
                  {/* Date cells */}
                  <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                    {cells.map((day, idx) => {
                      const colIdx = idx % 7; // 0=Mon, 5=Sat, 6=Sun
                      const isSat = colIdx === 5;
                      const isSun = colIdx === 6;
                      const vacsOnDay = day ? (vacsByDate.get(day) || []) : [];
                      return (
                        <div key={idx} className={`bg-white min-h-[72px] p-1.5 ${!day ? 'bg-gray-50' : ''}`}>
                          {day && (
                            <>
                              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                                ${isSun ? 'text-red-500' : isSat ? 'text-blue-600' : 'text-gray-700'}`}>
                                {day}
                              </div>
                              <div className="space-y-0.5">
                                {vacsOnDay.slice(0, 4).map((v: any, vi: number) => {
                                  const typeColor = (v.type || '').includes('반차')
                                    ? 'bg-green-100 text-green-800'
                                    : (v.type || '') === '연차' || (v.type || '').includes('연차')
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-purple-100 text-purple-800';
                                  return (
                                    <div key={vi} className={`text-[10px] px-1 py-0.5 rounded truncate font-medium ${typeColor}`}
                                      title={`${v.employee_name} (${v.type || '휴가'})`}>
                                      {v.employee_name}
                                    </div>
                                  );
                                })}
                                {vacsOnDay.length > 4 && (
                                  <div className="text-[10px] text-gray-400 px-1">+{vacsOnDay.length - 4}명</div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {subTab === 'balances' && (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">연도</label>
              <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-24" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">이름 검색</label>
              <input type="text" value={balanceSearch} onChange={(e) => setBalanceSearch(e.target.value)}
                placeholder="이름으로 검색..."
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-36" />
            </div>
            <button onClick={loadBalances} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">조회</button>
            <div className="flex items-end gap-2 ml-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">일괄 설정 일수</label>
                <input type="number" step="0.5" value={initDays} onChange={(e) => setInitDays(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-20" />
              </div>
              <button onClick={async () => {
                if (!confirm(`${year}년 전체 직원에게 ${initDays}일을 일괄 설정하시겠습니까?`)) return;
                try { await initVacationBalances({ year, total_days: parseFloat(initDays) }); loadBalances(); } catch (e: any) { alert(e.message); }
              }} className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium">일괄 초기화</button>
              <button onClick={async () => {
                if (!confirm(`${year}년 연차를 입사일자 기준 근로기준법으로 자동 계산하시겠습니까?`)) return;
                try {
                  const result = await autoCalcVacationBalances(year);
                  alert(`${result.updated}명의 연차가 자동 계산되었습니다.`);
                  loadBalances();
                } catch (e: any) { alert(e.message); }
              }} className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">자동 계산 (근로기준법)</button>
            </div>
          </div>

          {/* Batch update for selected employees */}
          {selectedEmpIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <span className="text-sm font-medium text-blue-700">{selectedEmpIds.size}명 선택</span>
              <input type="number" step="0.5" value={batchDays} onChange={(e) => setBatchDays(e.target.value)}
                className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm w-20" />
              <span className="text-sm text-blue-600">일</span>
              <button onClick={async () => {
                if (!confirm(`선택한 ${selectedEmpIds.size}명의 보유 휴가를 ${batchDays}일로 변경하시겠습니까?`)) return;
                try {
                  for (const empId of Array.from(selectedEmpIds)) {
                    await setVacationBalance(empId, { year, total_days: parseFloat(batchDays) });
                  }
                  setSelectedEmpIds(new Set());
                  loadBalances();
                } catch (e: any) { alert(e.message); }
              }} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">일괄 변경</button>
              <button onClick={() => setSelectedEmpIds(new Set())} className="px-3 py-1.5 text-gray-600 bg-gray-100 rounded-lg text-sm">선택 해제</button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></div>
            ) : balances.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">등록된 직원이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="py-2 px-3 w-10">
                        <input type="checkbox"
                          checked={selectedEmpIds.size === balances.length && balances.length > 0}
                          onChange={(e) => setSelectedEmpIds(e.target.checked ? new Set(balances.map((b: any) => b.employee_id)) : new Set())}
                          className="rounded border-gray-300" />
                      </th>
                      <th className="py-2 px-4 font-medium text-gray-600">이름</th>
                      <th className="py-2 px-4 font-medium text-gray-600">부서</th>
                      <th className="py-2 px-4 font-medium text-gray-600">연락처</th>
                      <th className="py-2 px-4 font-medium text-gray-600">보유(일)</th>
                      <th className="py-2 px-4 font-medium text-gray-600">사용(일)</th>
                      <th className="py-2 px-4 font-medium text-gray-600">잔여(일)</th>
                      <th className="py-2 px-4 font-medium text-gray-600">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {balances.filter((b: any) => !balanceSearch || b.employee_name?.includes(balanceSearch) || b.phone?.includes(balanceSearch)).map((b: any) => (
                      <tr key={b.employee_id} className={`hover:bg-gray-50 ${selectedEmpIds.has(b.employee_id) ? 'bg-blue-50/50' : ''}`}>
                        <td className="py-2.5 px-3">
                          <input type="checkbox"
                            checked={selectedEmpIds.has(b.employee_id)}
                            onChange={(e) => {
                              const next = new Set(selectedEmpIds);
                              if (e.target.checked) next.add(b.employee_id); else next.delete(b.employee_id);
                              setSelectedEmpIds(next);
                            }}
                            className="rounded border-gray-300" />
                        </td>
                        <td className="py-2.5 px-4 font-medium text-gray-900">{b.employee_name}</td>
                        <td className="py-2.5 px-4 text-gray-600">{b.department} {b.team}</td>
                        <td className="py-2.5 px-4 text-gray-600">{b.phone}</td>
                        <td className="py-2.5 px-4">
                          {editingBalance === b.employee_id ? (
                            <input type="number" step="0.5" value={editDays} onChange={(e) => setEditDays(e.target.value)}
                              className="w-16 px-2 py-1 border border-blue-300 rounded text-sm" />
                          ) : (
                            <span className="font-medium text-blue-700">{parseFloat(b.total_days)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {editingBalance === b.employee_id ? (
                            <input type="number" step="0.5" min="0" value={editUsedDays} onChange={(e) => setEditUsedDays(e.target.value)}
                              className="w-16 px-2 py-1 border border-amber-300 rounded text-sm" />
                          ) : (
                            <span className="text-amber-600">{parseFloat(b.used_days)}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-green-700">{(parseFloat(b.total_days) - parseFloat(b.used_days)).toFixed(1)}</td>
                        <td className="py-2.5 px-4">
                          {editingBalance === b.employee_id ? (
                            <div className="flex gap-1">
                              <button onClick={async () => {
                                try { await setVacationBalance(b.employee_id, { year, total_days: parseFloat(editDays), used_days: parseFloat(editUsedDays) } as any); setEditingBalance(null); loadBalances(); } catch (e: any) { alert(e.message); }
                              }} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">저장</button>
                              <button onClick={() => setEditingBalance(null)} className="px-2 py-1 text-xs bg-gray-100 rounded">취소</button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingBalance(b.employee_id); setEditDays(String(parseFloat(b.total_days))); setEditUsedDays(String(parseFloat(b.used_days))); }}
                              className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100">수정</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ShiftsTab() {
  const [shiftSubTab, setShiftSubTab] = useState<'list' | 'calendar'>('list');
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", month: new Date().getMonth() + 1, week_number: 1, days_of_week: [] as number[], planned_clock_in: "08:00", planned_clock_out: "17:00" });
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [assignIds, setAssignIds] = useState<Set<number>>(new Set());
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDeptFilter, setAssignDeptFilter] = useState("all");
  const [editingShift, setEditingShift] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", month: 1, week_number: 1, days_of_week: [] as number[], planned_clock_in: "08:00", planned_clock_out: "17:00" });
  // Calendar sub-tab state
  const [shiftCalYear, setShiftCalYear] = useState(new Date().getFullYear());
  const [shiftCalMonth, setShiftCalMonth] = useState(new Date().getMonth() + 1);
  const [shiftCalDept, setShiftCalDept] = useState("");
  const [shiftCalAssignments, setShiftCalAssignments] = useState<Map<number, any[]>>(new Map());
  const [shiftCalLoading, setShiftCalLoading] = useState(false);
  // Calendar popup state
  const [calPopupShift, setCalPopupShift] = useState<any>(null);
  const [calPopupAssignments, setCalPopupAssignments] = useState<any[]>([]);
  const [calAddDate, setCalAddDate] = useState<{ day: number; dow: number; weekNum: number } | null>(null);
  const [calAddForm, setCalAddForm] = useState({ name: "", planned_clock_in: "08:00", planned_clock_out: "17:00" });
  const [calExpandedDay, setCalExpandedDay] = useState<number | null>(null);
  // Unassigned check
  const [unassignedDate, setUnassignedDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [unassignedDept, setUnassignedDept] = useState("");
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  const [allEmpsLoaded, setAllEmpsLoaded] = useState(false);
  // Vacation data for shifts
  const [shiftVacations, setShiftVacations] = useState<any[]>([]);
  const [chartDept, setChartDept] = useState("");

  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const MONTHS = Array.from({length: 12}, (_, i) => i + 1);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try { const data = await getRegularShifts(); setShifts(data || []); } catch {} finally { setLoading(false); }
  }, []);

  const loadShiftCalAssignments = useCallback(async (shiftsData: any[]) => {
    setShiftCalLoading(true);
    try {
      const map = new Map<number, any[]>();
      await Promise.all(shiftsData.map(async (s: any) => {
        try {
          const assigned = await getShiftAssignments(s.id);
          map.set(s.id, assigned || []);
        } catch { map.set(s.id, []); }
      }));
      setShiftCalAssignments(new Map(map));
    } catch {} finally { setShiftCalLoading(false); }
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  // Load all employees + vacations once
  useEffect(() => {
    if (!allEmpsLoaded) {
      getRegularEmployees({ limit: '500' }).then((data: any) => {
        setAllEmployees((data as any).employees || data || []);
        setAllEmpsLoaded(true);
      }).catch(() => {});
    }
    getRegularVacations({ status: 'approved' }).then((data: any) => setShiftVacations(data || [])).catch(() => {});
  }, [allEmpsLoaded]);

  // Load assignments when shifts are loaded (needed for both calendar and unassigned panel)
  useEffect(() => {
    if (shifts.length > 0) {
      loadShiftCalAssignments(shifts);
    }
  }, [shifts, loadShiftCalAssignments]);

  const toggleDay = (day: number, target: 'form' | 'edit') => {
    if (target === 'form') {
      setForm(f => ({ ...f, days_of_week: f.days_of_week.includes(day) ? f.days_of_week.filter(d => d !== day) : [...f.days_of_week, day].sort() }));
    } else {
      setEditForm(f => ({ ...f, days_of_week: f.days_of_week.includes(day) ? f.days_of_week.filter(d => d !== day) : [...f.days_of_week, day].sort() }));
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.planned_clock_in || !form.planned_clock_out || form.days_of_week.length === 0) {
      alert("배치명, 요일, 출퇴근 시간을 입력해주세요."); return;
    }
    try {
      await createRegularShift({ ...form, days_of_week: form.days_of_week.join(','), day_of_week: form.days_of_week[0] } as any);
      setForm({ ...form, name: "" }); loadShifts();
    } catch (e: any) { alert(e.message); }
  };

  const handleCopy = async (shift: any) => {
    const nextWeek = (shift.week_number || 1) + 1;
    const newName = shift.name.replace(/\d+주차/, `${nextWeek}주차`) || `${shift.name} (복사)`;
    try {
      const created = await createRegularShift({ name: newName, month: shift.month || form.month, week_number: nextWeek, day_of_week: shift.day_of_week, planned_clock_in: shift.planned_clock_in, planned_clock_out: shift.planned_clock_out, days_of_week: shift.days_of_week || '' } as any);
      // Copy assignments too
      const assigned = await getShiftAssignments(shift.id);
      if (assigned && assigned.length > 0) {
        await assignEmployeesToShift(created.id, assigned.map((a: any) => a.employee_id));
      }
      loadShifts(); alert(`${nextWeek}주차로 복사 완료 (배정인원 포함)`);
    } catch (e: any) { alert(e.message); }
  };

  const handleEdit = async () => {
    if (!editingShift) return;
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/regular/shifts/${editingShift.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...editForm, days_of_week: editForm.days_of_week.join(','), day_of_week: editForm.days_of_week[0] || 0 })
      });
      setEditingShift(null); loadShifts();
    } catch (e: any) { alert(e.message); }
  };

  const openAssign = async (shift: any) => {
    setSelectedShift(shift); setAssignSearch("");
    try {
      const [assigned, emps] = await Promise.all([getShiftAssignments(shift.id), getRegularEmployees({ limit: '500' })]);
      setAssignments(assigned || []); setAllEmployees((emps as any).employees || emps || []); setAssignIds(new Set());
    } catch (e: any) { alert(e.message); }
  };

  const handleAssign = async () => {
    if (assignIds.size === 0 || !selectedShift) return;
    try {
      await assignEmployeesToShift(selectedShift.id, Array.from(assignIds));
      setAssignIds(new Set());
      setAssignments(await getShiftAssignments(selectedShift.id)); loadShifts();
    } catch (e: any) { alert(e.message); }
  };

  const handleRemove = async (empId: number) => {
    if (!selectedShift) return;
    try { await removeShiftAssignment(selectedShift.id, empId); setAssignments(assignments.filter(a => a.employee_id !== empId)); loadShifts(); } catch (e: any) { alert(e.message); }
  };

  const parseDays = (s: string) => s ? s.split(',').map(Number).filter(n => !isNaN(n)) : [];

  // Check if employee is on vacation for a date
  const getVacOnDate = (empName: string, dateStr: string) => {
    for (const v of shiftVacations) {
      if (v.employee_name !== empName) continue;
      if (dateStr >= v.start_date && dateStr <= v.end_date) return v;
    }
    return null;
  };
  const getVacEmployeesOnDate = (dateStr: string) => {
    const result: any[] = [];
    for (const v of shiftVacations) {
      if (dateStr >= v.start_date && dateStr <= v.end_date) {
        result.push(v);
      }
    }
    return result;
  };
  const vacEmployeeIdsOnDate = (dateStr: string) => {
    const ids = new Set<number>();
    for (const v of shiftVacations) {
      if (dateStr >= v.start_date && dateStr <= v.end_date) ids.add(v.employee_id);
    }
    return ids;
  };

  const openCalShiftPopup = async (shift: any) => {
    setCalPopupShift(shift);
    try {
      const [assigned, emps] = await Promise.all([getShiftAssignments(shift.id), getRegularEmployees({ limit: '500' })]);
      setCalPopupAssignments(assigned || []);
      setAllEmployees((emps as any).employees || emps || []);
      setAssignIds(new Set());
      setAssignSearch("");
      setAssignDeptFilter("all");
    } catch (e: any) { alert(e.message); }
  };

  const handleCalPopupAssign = async () => {
    if (assignIds.size === 0 || !calPopupShift) return;
    try {
      await assignEmployeesToShift(calPopupShift.id, Array.from(assignIds));
      setAssignIds(new Set());
      const updated = await getShiftAssignments(calPopupShift.id);
      setCalPopupAssignments(updated || []);
      loadShiftCalAssignments(shifts);
    } catch (e: any) { alert(e.message); }
  };

  const handleCalPopupRemove = async (empId: number) => {
    if (!calPopupShift) return;
    try {
      await removeShiftAssignment(calPopupShift.id, empId);
      setCalPopupAssignments(calPopupAssignments.filter(a => a.employee_id !== empId));
      loadShiftCalAssignments(shifts);
    } catch (e: any) { alert(e.message); }
  };

  const handleCalAddShift = async () => {
    if (!calAddDate || !calAddForm.name.trim()) { alert("배치명을 입력해주세요."); return; }
    try {
      await createRegularShift({
        name: calAddForm.name,
        month: shiftCalMonth,
        week_number: calAddDate.weekNum,
        day_of_week: calAddDate.dow,
        days_of_week: String(calAddDate.dow),
        planned_clock_in: calAddForm.planned_clock_in,
        planned_clock_out: calAddForm.planned_clock_out,
      } as any);
      setCalAddDate(null);
      setCalAddForm({ name: "", planned_clock_in: "08:00", planned_clock_out: "17:00" });
      loadShifts();
    } catch (e: any) { alert(e.message); }
  };

  const [chartStartDate, setChartStartDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; });
  const [chartEndDate, setChartEndDate] = useState(() => { const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth()+1, 0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`; });

  const { clockInChart, clockOutChart } = useMemo(() => {
    const inR: { hour: number; count: number; department: string }[] = [];
    const outR: { hour: number; count: number; department: string }[] = [];
    const startD = new Date(chartStartDate + 'T00:00:00+09:00');
    const endD = new Date(chartEndDate + 'T00:00:00+09:00');
    for (const s of shifts) {
      const assgn = shiftCalAssignments.get(s.id) || [];
      if (assgn.length === 0) continue;
      const inH = parseInt(s.planned_clock_in?.split(':')[0] || '0');
      const outH = parseInt(s.planned_clock_out?.split(':')[0] || '0');
      const daysArr = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week];
      for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
        if (d.getMonth() + 1 !== s.month) continue;
        const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
        const so = (firstDow + 6) % 7;
        const wn = Math.ceil((d.getDate() + so) / 7);
        if (wn !== s.week_number) continue;
        if (!daysArr.includes(d.getDay())) continue;
        for (const a of assgn) {
          inR.push({ hour: inH, count: 1, department: a.department || '기타' });
          outR.push({ hour: outH, count: 1, department: a.department || '기타' });
        }
      }
    }
    return { clockInChart: inR, clockOutChart: outR };
  }, [shifts, chartStartDate, chartEndDate, shiftCalAssignments]);

  return (
    <div className="space-y-4">
      <HourlyChart clockInData={clockInChart} clockOutData={clockOutChart} title="계획 시간대별 출퇴근 인원"
        departments={DEPARTMENTS} selectedDept={chartDept} onDeptChange={setChartDept}
        extraControls={
          <div className="flex items-center gap-1">
            <input type="date" value={chartStartDate} onChange={e => setChartStartDate(e.target.value)}
              className="px-1.5 py-1 border border-gray-300 rounded text-xs" />
            <span className="text-gray-400 text-xs">~</span>
            <input type="date" value={chartEndDate} onChange={e => setChartEndDate(e.target.value)}
              className="px-1.5 py-1 border border-gray-300 rounded text-xs" />
          </div>
        }
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">월/주차별 계획 출퇴근 시간을 설정하고 직원을 배정합니다.</p>
        <div className="flex gap-2">
          <button onClick={() => setShiftSubTab('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${shiftSubTab === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            배치 목록
          </button>
          <button onClick={() => setShiftSubTab('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${shiftSubTab === 'calendar' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Calendar size={14} /> 배치 캘린더
          </button>
        </div>
      </div>

      {/* ── Unassigned Employees Panel ── */}
      {(() => {
        const d = new Date(unassignedDate + 'T00:00:00+09:00');
        const dow = d.getDay();
        const dayOfMonth = d.getDate();
        const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
        const so = (firstDow + 6) % 7;
        const weekNum = Math.ceil((dayOfMonth + so) / 7);
        const checkMonth = d.getMonth() + 1;

        // Find all employees assigned on this date
        const assignedIds = new Set<number>();
        for (const s of shifts) {
          if (s.month !== checkMonth) continue;
          if (s.week_number !== weekNum) continue;
          const daysArr = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week];
          if (!daysArr.includes(dow)) continue;
          const assgn = shiftCalAssignments.get(s.id) || [];
          assgn.forEach((a: any) => assignedIds.add(a.employee_id));
        }

        // Vacation employees on this date
        const vacIds = vacEmployeeIdsOnDate(unassignedDate);
        const vacOnDate = getVacEmployeesOnDate(unassignedDate);

        const unassigned = allEmployees
          .filter((e: any) => e.is_active !== 0 && !assignedIds.has(e.id) && !vacIds.has(e.id))
          .filter((e: any) => !unassignedDept || (e.department || '').includes(unassignedDept));

        const dayNames = ['일','월','화','수','목','금','토'];
        const isWeekend = dow === 0 || dow === 6;

        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button onClick={() => setUnassignedOpen(!unassignedOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Users className="w-4 h-4 text-orange-600" />
                </div>
                <div className="text-left">
                  <span className="text-sm font-semibold text-gray-900">미배치 인력 확인</span>
                  <span className="ml-2 text-xs text-gray-500">{unassignedDate} ({dayNames[dow]})</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${unassigned.length > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                  {unassigned.length > 0 ? `${unassigned.length}명 미배치` : '전원 배치 완료'}
                </span>
              </div>
              {unassignedOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {unassignedOpen && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">날짜</label>
                    <input type="date" value={unassignedDate} onChange={e => setUnassignedDate(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-0.5">부서</label>
                    <select value={unassignedDept} onChange={e => setUnassignedDept(e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                      <option value="">전체</option>
                      {DEPARTMENTS.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                  </div>
                  <div className="text-xs text-gray-500 py-1.5">
                    총 {allEmployees.filter((e: any) => e.is_active !== 0 && (!unassignedDept || (e.department || '').includes(unassignedDept))).length}명 중{' '}
                    <span className="font-semibold text-blue-700">{assignedIds.size}명 배치</span>,{' '}
                    <span className={`font-semibold ${unassigned.length > 0 ? 'text-orange-700' : 'text-green-700'}`}>{unassigned.length}명 미배치</span>
                  </div>
                </div>

                {isWeekend && (
                  <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    {dayNames[dow]}요일 (주말)입니다. 주말 근무 배치가 없는 것이 정상일 수 있습니다.
                  </div>
                )}

                {unassigned.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                    {unassigned.map((e: any) => (
                      <div key={e.id} className="flex items-center gap-2 bg-orange-50 rounded-lg px-2.5 py-2 border border-orange-100">
                        <div className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center text-[10px] font-bold text-orange-800">
                          {(e.name || '?')[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{e.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">{e.department} {e.team}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-sm text-green-600 font-medium">
                    해당 날짜에 모든 인원이 배치되었습니다.
                  </div>
                )}

                {/* Vacation list for the date */}
                {vacOnDate.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h5 className="text-xs font-semibold text-violet-700 mb-2">휴가자 ({vacOnDate.length}명)</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                      {vacOnDate.map((v: any) => (
                        <div key={v.id} className="flex items-center gap-2 bg-violet-50 rounded-lg px-2.5 py-2 border border-violet-100">
                          <div className="w-6 h-6 rounded-full bg-violet-200 flex items-center justify-center text-[10px] font-bold text-violet-800">
                            {(v.employee_name || '?')[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{v.employee_name}</p>
                            <p className="text-[10px] text-violet-600 truncate">
                              {v.type === '오전반차' ? '오전반차 09~14시' : v.type === '오후반차' ? '오후반차 14~18시' : '연차'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {shiftSubTab === 'calendar' && (() => {
        const daysInMonth = new Date(shiftCalYear, shiftCalMonth, 0).getDate();
        const firstDow = new Date(shiftCalYear, shiftCalMonth - 1, 1).getDay();
        const startOffset = (firstDow + 6) % 7; // Mon=0
        const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
        const cells: (number | null)[] = Array.from({ length: totalCells }, (_, i) => {
          const d = i - startOffset + 1;
          return d >= 1 && d <= daysInMonth ? d : null;
        });

        // Filter shifts for selected month
        const monthShifts = shifts.filter((s: any) => s.month === shiftCalMonth);
        const filteredShifts = shiftCalDept
          ? monthShifts.filter((s: any) => {
              const assgn = shiftCalAssignments.get(s.id) || [];
              return assgn.some((a: any) => (a.department || '').includes(shiftCalDept));
            })
          : monthShifts;

        // For each date, find which shifts apply
        const shiftsByDate = new Map<number, any[]>();
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(shiftCalYear, shiftCalMonth - 1, d);
          const dow = date.getDay(); // 0=Sun, 1=Mon, ...
          // Determine week-of-month (1-indexed, starting from first Monday)
          const weekNum = Math.ceil((d + startOffset) / 7);
          const applicableShifts = filteredShifts.filter((s: any) => {
            if (s.week_number !== weekNum) return false;
            const daysArr = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week];
            return daysArr.includes(dow);
          });
          if (applicableShifts.length > 0) shiftsByDate.set(d, applicableShifts);
        }

        const DOW_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
        const SHIFT_COLORS = ['bg-blue-100 text-blue-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-purple-100 text-purple-800', 'bg-rose-100 text-rose-800'];

        return (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">연도</label>
                <input type="number" value={shiftCalYear} onChange={e => setShiftCalYear(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-24" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">월</label>
                <select value={shiftCalMonth} onChange={e => setShiftCalMonth(parseInt(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">부서 필터</label>
                <select value={shiftCalDept} onChange={e => setShiftCalDept(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">전체</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={() => loadShiftCalAssignments(shifts)}
                className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium">새로고침</button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">{shiftCalYear}년 {shiftCalMonth}월 배치 캘린더</h3>
              </div>
              {shiftCalLoading ? (
                <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></div>
              ) : (
                <div className="p-3">
                  <div className="grid grid-cols-7 gap-px mb-px">
                    {DOW_LABELS.map((label, i) => (
                      <div key={label} className={`text-center text-xs font-semibold py-1.5 rounded ${i === 5 ? 'text-blue-600' : i === 6 ? 'text-red-500' : 'text-gray-600'}`}>
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
                    {cells.map((day, idx) => {
                      const colIdx = idx % 7;
                      const isSat = colIdx === 5;
                      const isSun = colIdx === 6;
                      const shiftsOnDay = day ? (shiftsByDate.get(day) || []) : [];
                      const cellDate = day ? new Date(shiftCalYear, shiftCalMonth - 1, day) : null;
                      const cellDow = cellDate ? cellDate.getDay() : 0;
                      const cellWeekNum = day ? Math.ceil((day + startOffset) / 7) : 0;
                      return (
                        <div key={idx} className={`bg-white min-h-[120px] p-1.5 relative group ${!day ? 'bg-gray-50' : ''}`}>
                          {day && (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                                  ${isSun ? 'text-red-500' : isSat ? 'text-blue-600' : 'text-gray-700'}`}>
                                  {day}
                                </div>
                                <button
                                  onClick={() => { setCalAddDate({ day, dow: cellDow, weekNum: cellWeekNum }); setCalAddForm({ name: "", planned_clock_in: "08:00", planned_clock_out: "17:00" }); }}
                                  className="w-5 h-5 flex items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold"
                                  title="배치 추가">+</button>
                              </div>
                              <div className="space-y-0.5">
                                {(calExpandedDay === day ? shiftsOnDay : shiftsOnDay.slice(0, 5)).map((s: any, si: number) => {
                                  const assgn = shiftCalAssignments.get(s.id) || [];
                                  const colorClass = SHIFT_COLORS[si % SHIFT_COLORS.length];
                                  return (
                                    <button key={s.id} onClick={() => openCalShiftPopup(s)}
                                      className={`text-[10px] px-1 py-0.5 rounded truncate font-medium w-full text-left hover:ring-1 hover:ring-blue-400 ${colorClass}`}
                                      title={`${s.name} (${assgn.length}명) — 클릭하여 상세보기`}>
                                      {s.name} <span className="opacity-70">{assgn.length}명</span>
                                    </button>
                                  );
                                })}
                                {calExpandedDay !== day && shiftsOnDay.length > 5 && (
                                  <button onClick={() => setCalExpandedDay(day)}
                                    className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1 hover:underline">
                                    +{shiftsOnDay.length - 5}개 더보기
                                  </button>
                                )}
                                {calExpandedDay === day && shiftsOnDay.length > 5 && (
                                  <button onClick={() => setCalExpandedDay(null)}
                                    className="text-[10px] text-gray-500 hover:text-gray-700 font-medium px-1 hover:underline">
                                    접기
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Calendar Shift Detail Popup */}
      {calPopupShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold text-gray-900">{calPopupShift.name}</h3>
              <button onClick={() => setCalPopupShift(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {calPopupShift.planned_clock_in}~{calPopupShift.planned_clock_out} · {shiftCalMonth}월 {calPopupShift.week_number}주차 · {parseDays(calPopupShift.days_of_week || String(calPopupShift.day_of_week)).map((d: number) => DAY_NAMES[d]).join('/')}요일
            </p>

            {/* Assigned employees */}
            {calPopupAssignments.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-gray-600 mb-2">배정된 직원 ({calPopupAssignments.length}명)</h4>
                <div className="space-y-1">
                  {calPopupAssignments.map((a: any) => (
                    <div key={a.employee_id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium text-green-900">{a.name} <span className="text-xs text-green-600">{a.department} {a.team}</span></span>
                      <button onClick={() => handleCalPopupRemove(a.employee_id)} className="text-xs text-red-600 hover:text-red-800">해제</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add employees */}
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">직원 추가</h4>
              <div className="flex gap-2 mb-2">
                <select value={assignDeptFilter} onChange={e => setAssignDeptFilter(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="all">전체 부서</option>
                  {Array.from(new Set([...DEPARTMENTS, ...allEmployees.map((e: any) => e.department).filter(Boolean)])).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input type="text" value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="이름 검색..." className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {allEmployees
                  .filter((e: any) => !calPopupAssignments.find((a: any) => a.employee_id === e.id))
                  .filter((e: any) => assignDeptFilter === 'all' || (e.department || '').includes(assignDeptFilter))
                  .filter((e: any) => !assignSearch || (e.name || '').includes(assignSearch) || (e.phone || '').includes(assignSearch))
                  .map((e: any) => (
                    <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                      <input type="checkbox" checked={assignIds.has(e.id)} onChange={ev => { const n = new Set(assignIds); if (ev.target.checked) n.add(e.id); else n.delete(e.id); setAssignIds(n); }} className="rounded border-gray-300" />
                      <span className="text-sm">{e.name}</span><span className="text-xs text-gray-500">{e.department} {e.team}</span>
                    </label>
                  ))}
              </div>
              {assignIds.size > 0 && <button onClick={handleCalPopupAssign} className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{assignIds.size}명 배정하기</button>}
            </div>

            <button onClick={() => setCalPopupShift(null)} className="mt-4 w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">닫기</button>
          </div>
        </div>
      )}

      {/* Calendar Add Shift Popup */}
      {calAddDate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">배치 추가</h3>
              <button onClick={() => setCalAddDate(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {shiftCalYear}년 {shiftCalMonth}월 {calAddDate.day}일 ({DAY_NAMES[calAddDate.dow]}요일) · {calAddDate.weekNum}주차
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">배치명 <span className="text-red-500">*</span></label>
                <input type="text" value={calAddForm.name} onChange={e => setCalAddForm({ ...calAddForm, name: e.target.value })}
                  placeholder="예: A조 오전" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">출근</label>
                  <input type="time" value={calAddForm.planned_clock_in} onChange={e => setCalAddForm({ ...calAddForm, planned_clock_in: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">퇴근</label>
                  <input type="time" value={calAddForm.planned_clock_out} onChange={e => setCalAddForm({ ...calAddForm, planned_clock_out: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <button onClick={handleCalAddShift}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                배치 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {shiftSubTab === 'list' && (<>

      {/* Create Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">배치 추가</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">배치명 <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="예: A조 오전 3월1주차" className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-44" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">월</label>
            <select value={form.month} onChange={e => setForm({...form, month: parseInt(e.target.value)})} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
              {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">주차</label>
            <select value={form.week_number} onChange={e => setForm({...form, week_number: parseInt(e.target.value)})} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
              {[1,2,3,4,5].map(w => <option key={w} value={w}>{w}주차</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">출근 <span className="text-red-500">*</span></label>
            <input type="time" value={form.planned_clock_in} onChange={e => setForm({...form, planned_clock_in: e.target.value})} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">퇴근 <span className="text-red-500">*</span></label>
            <input type="time" value={form.planned_clock_out} onChange={e => setForm({...form, planned_clock_out: e.target.value})} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">요일 선택 <span className="text-red-500">*</span></label>
          <div className="flex gap-1">
            {DAY_NAMES.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDay(i, 'form')}
                className={`w-9 h-9 rounded-lg text-xs font-medium ${form.days_of_week.includes(i) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={handleCreate} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"><Plus size={14} /> 추가</button>
        </div>
      </div>

      {/* Shifts List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" /></div>
        ) : shifts.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">등록된 배치가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="py-2 px-4 font-medium text-gray-600">배치명</th>
              <th className="py-2 px-4 font-medium text-gray-600">월/주차</th>
              <th className="py-2 px-4 font-medium text-gray-600">요일</th>
              <th className="py-2 px-4 font-medium text-gray-600">출근</th>
              <th className="py-2 px-4 font-medium text-gray-600">퇴근</th>
              <th className="py-2 px-4 font-medium text-gray-600">배정</th>
              <th className="py-2 px-4 font-medium text-gray-600">관리</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {shifts.map((s: any) => {
                const days = parseDays(s.days_of_week || String(s.day_of_week));
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-4 font-medium text-gray-900">{s.name}</td>
                    <td className="py-2.5 px-4 text-gray-600">{s.month || '-'}월 {s.week_number}주차</td>
                    <td className="py-2.5 px-4"><div className="flex gap-0.5">{days.map(d => <span key={d} className="inline-flex w-6 h-6 items-center justify-center rounded text-[10px] font-medium bg-blue-50 text-blue-700">{DAY_NAMES[d]}</span>)}</div></td>
                    <td className="py-2.5 px-4 text-gray-700">{s.planned_clock_in}</td>
                    <td className="py-2.5 px-4 text-gray-700">{s.planned_clock_out}</td>
                    <td className="py-2.5 px-4 text-gray-700">{s.assigned_count || 0}명</td>
                    <td className="py-2.5 px-4">
                      <div className="flex gap-1 flex-wrap">
                        <button onClick={() => openAssign(s)} className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100">배정</button>
                        <button onClick={() => { setEditingShift(s); setEditForm({ name: s.name, month: s.month || 1, week_number: s.week_number, days_of_week: parseDays(s.days_of_week || String(s.day_of_week)), planned_clock_in: s.planned_clock_in, planned_clock_out: s.planned_clock_out }); }}
                          className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100">수정</button>
                        <button onClick={() => handleCopy(s)} className="px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded hover:bg-purple-100">복사</button>
                        <button onClick={async () => { await deleteRegularShift(s.id); loadShifts(); }} className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100">삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      {editingShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">배치 수정</h3>
            <div className="space-y-3">
              <div><label className="block text-xs text-gray-500 mb-1">배치명</label><input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">월</label><select value={editForm.month} onChange={e => setEditForm({...editForm, month: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}</select></div>
                <div><label className="block text-xs text-gray-500 mb-1">주차</label><select value={editForm.week_number} onChange={e => setEditForm({...editForm, week_number: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{[1,2,3,4,5].map(w => <option key={w} value={w}>{w}주차</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs text-gray-500 mb-1">출근</label><input type="time" value={editForm.planned_clock_in} onChange={e => setEditForm({...editForm, planned_clock_in: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
                <div><label className="block text-xs text-gray-500 mb-1">퇴근</label><input type="time" value={editForm.planned_clock_out} onChange={e => setEditForm({...editForm, planned_clock_out: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-xs text-gray-500 mb-1">요일</label><div className="flex gap-1">{DAY_NAMES.map((d, i) => (<button key={i} type="button" onClick={() => toggleDay(i, 'edit')} className={`w-9 h-9 rounded-lg text-xs font-medium ${editForm.days_of_week.includes(i) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{d}</button>))}</div></div>
            </div>
            <div className="flex gap-3"><button onClick={() => setEditingShift(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">취소</button><button onClick={handleEdit} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">저장</button></div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {selectedShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">직원 배정</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedShift.name} · {parseDays(selectedShift.days_of_week || String(selectedShift.day_of_week)).map((d: number) => DAY_NAMES[d]).join('/')}요일 · {selectedShift.planned_clock_in}~{selectedShift.planned_clock_out}</p>
            {assignments.length > 0 && (
              <div className="mb-4"><h4 className="text-xs font-semibold text-gray-600 mb-2">배정된 직원 ({assignments.length}명)</h4><div className="space-y-1">{assignments.map((a: any) => (
                <div key={a.employee_id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2"><span className="text-sm font-medium text-green-900">{a.name} <span className="text-xs text-green-600">{a.department} {a.team}</span></span><button onClick={() => handleRemove(a.employee_id)} className="text-xs text-red-600 hover:text-red-800">해제</button></div>
              ))}</div></div>
            )}
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2">직원 추가</h4>
              <div className="flex gap-2 mb-2">
                <select value={assignDeptFilter} onChange={e => setAssignDeptFilter(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="all">전체 부서</option>
                  {Array.from(new Set([...DEPARTMENTS, ...allEmployees.map((e: any) => e.department).filter(Boolean)])).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <input type="text" value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="이름 검색..." className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                {allEmployees.filter((e: any) => !assignments.find((a: any) => a.employee_id === e.id)).filter((e: any) => assignDeptFilter === 'all' || (e.department || '').includes(assignDeptFilter)).filter((e: any) => !assignSearch || (e.name || '').includes(assignSearch) || (e.phone || '').includes(assignSearch)).map((e: any) => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                    <input type="checkbox" checked={assignIds.has(e.id)} onChange={ev => { const n = new Set(assignIds); if (ev.target.checked) n.add(e.id); else n.delete(e.id); setAssignIds(n); }} className="rounded border-gray-300" />
                    <span className="text-sm">{e.name}</span><span className="text-xs text-gray-500">{e.department} {e.team}</span>
                  </label>
                ))}
              </div>
              {assignIds.size > 0 && <button onClick={handleAssign} className="mt-2 w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{assignIds.size}명 배정하기</button>}
            </div>
            <button onClick={() => setSelectedShift(null)} className="mt-4 w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">닫기</button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
