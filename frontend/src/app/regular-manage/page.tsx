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
} from "lucide-react";

const DEPARTMENTS = ["생산2층", "생산3층", "물류1층"];
const TEAMS = ["1조", "2조", "3조"];
const ROLES = ["일반", "조장", "반장"];
const LEADER_ROLES = ["조장", "반장"];

type Tab = "employees" | "notices" | "org";

interface Employee {
  id: number;
  name: string;
  phone: string;
  department: string;
  team: string;
  role: string;
  workplace_id: number | null;
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
};

const emptyNoticeForm = { title: "", content: "" };

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

  // ===== Notices Tab =====
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticeDate, setNoticeDate] = useState(new Date().toISOString().slice(0, 10));
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
    setNoticeForm({ title: notice.title, content: notice.content });
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
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                          {emp.token_link || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleSendLink(emp.id)}
                            disabled={sendingId === emp.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium disabled:opacity-50"
                          >
                            {sendingId === emp.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Send size={12} />
                            )}
                            링크발송
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    </div>
  );
}
