"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";

const DEPARTMENTS = ["생산2층", "생산3층", "물류1층"];
const TEAMS = ["1조", "2조", "3조"];
const ROLES = ["일반", "조장", "반장"];
const LEADER_ROLES = ["조장", "반장"];

type Tab = "employees" | "notices" | "org" | "attendance" | "vacation";

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
  const [tab, setTab] = useState<Tab>("employees");
  const [loading, setLoading] = useState(false);

  // ===== Employees Tab =====
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empForm, setEmpForm] = useState({ ...emptyEmployeeForm });
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [batchSending, setBatchSending] = useState(false);
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
      const data = await getRegularEmployees();
      setEmployees(data.employees || data || []);
    } catch {
      // silent
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
      await createRegularEmployee(empForm);
      setEmpForm({ ...emptyEmployeeForm });
      loadEmployees();
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

          {/* Batch Actions */}
          {employees.length > 0 && (
            <div className="flex items-center gap-3">
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
                      <th className="px-4 py-3 text-left font-medium text-gray-600">토큰 링크</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
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
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                          {emp.token_link || "-"}
                        </td>
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
    </div>
  );
}

function AttendanceTab() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [searchName, setSearchName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRegularDashboard(date);
      setRecords(data.workers || []);
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

  return (
    <div className="space-y-4">
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
  const [subTab, setSubTab] = useState<'requests' | 'balances'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [initDays, setInitDays] = useState("15");
  const [editingBalance, setEditingBalance] = useState<number | null>(null);
  const [editDays, setEditDays] = useState("");
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<number>>(new Set());
  const [batchDays, setBatchDays] = useState("15");
  const [balanceSearch, setBalanceSearch] = useState("");

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

  useEffect(() => {
    if (subTab === 'requests') loadRequests();
    else loadBalances();
  }, [subTab, loadRequests, loadBalances]);

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
                        <td className="py-2.5 px-4 text-gray-700">{r.start_date} ~ {r.end_date}</td>
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
        </>
      )}

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
                        <td className="py-2.5 px-4 text-amber-600">{parseFloat(b.used_days)}</td>
                        <td className="py-2.5 px-4 font-medium text-green-700">{(parseFloat(b.total_days) - parseFloat(b.used_days)).toFixed(1)}</td>
                        <td className="py-2.5 px-4">
                          {editingBalance === b.employee_id ? (
                            <div className="flex gap-1">
                              <button onClick={async () => {
                                try { await setVacationBalance(b.employee_id, { year, total_days: parseFloat(editDays) }); setEditingBalance(null); loadBalances(); } catch (e: any) { alert(e.message); }
                              }} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">저장</button>
                              <button onClick={() => setEditingBalance(null)} className="px-2 py-1 text-xs bg-gray-100 rounded">취소</button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingBalance(b.employee_id); setEditDays(String(parseFloat(b.total_days))); }}
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
