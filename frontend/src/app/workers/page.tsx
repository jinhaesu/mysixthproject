"use client";

import { useEffect, useState, useCallback } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  importWorkers,
  addManualAttendance,
} from "@/lib/api";
import {
  Contact,
  Plus,
  Search,
  Edit3,
  Trash2,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface Worker {
  id: number;
  phone: string;
  name_ko: string;
  name_en: string;
  bank_name: string;
  bank_account: string;
  id_number: string;
  emergency_contact: string;
  category: string;
  department: string;
  workplace: string;
  memo: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const emptyForm: Omit<Worker, "id"> = {
  phone: "",
  name_ko: "",
  name_en: "",
  bank_name: "",
  bank_account: "",
  id_number: "",
  emergency_contact: "",
  category: "",
  department: "",
  workplace: "",
  memo: "",
};

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedState("w_search", "");
  const [category, setCategory] = usePersistedState("w_category", "");
  const [page, setPage] = usePersistedState("w_page", 1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());

  const handleRevealId = async (workerId: number) => {
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
        setRevealedIds(prev => new Set([...prev, workerId]));
      } else {
        alert("비밀번호가 일치하지 않습니다.");
      }
    } catch { alert("확인 중 오류가 발생했습니다."); }
  };

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: "50",
      };
      if (search) params.search = search;
      if (category) params.category = category;

      const data = await getWorkers(params);
      setWorkers(data.workers);
      setPagination(data.pagination);
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }, [page, search, category]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadWorkers();
  }

  function openAddModal() {
    setEditingWorker(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [historyMonth, setHistoryMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [historyLoading, setHistoryLoading] = useState(false);

  // 수동 출퇴근 추가 폼 상태
  const [showAddAttendance, setShowAddAttendance] = useState(false);
  const [addForm, setAddForm] = useState({ date: "", clock_in_time: "", clock_out_time: "", password: "" });
  const [addSaving, setAddSaving] = useState(false);

  const resetAddForm = () => {
    const today = new Date();
    const d = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    setAddForm({ date: d, clock_in_time: "", clock_out_time: "", password: "" });
  };

  const handleAddAttendance = async () => {
    if (!editingWorker) return;
    if (!addForm.date) return alert("날짜를 입력해주세요.");
    if (!addForm.clock_in_time) return alert("출근 시간을 입력해주세요. (퇴근 시간은 선택)");
    if (!addForm.password) return alert("비밀번호를 입력해주세요.");
    setAddSaving(true);
    try {
      await addManualAttendance({
        password: addForm.password,
        phone: editingWorker.phone,
        date: addForm.date,
        clock_in_time: addForm.clock_in_time || undefined,
        clock_out_time: addForm.clock_out_time || undefined,
      });
      alert("출퇴근 이력이 추가되었습니다.");
      setShowAddAttendance(false);
      resetAddForm();
      // 추가된 날짜가 속한 월로 이동 후 reload
      const ym = addForm.date.slice(0, 7);
      setHistoryMonth(ym);
      loadAttendanceHistory(editingWorker.phone, ym);
    } catch (err: any) {
      alert(err.message || "추가 중 오류가 발생했습니다.");
    } finally {
      setAddSaving(false);
    }
  };

  const loadAttendanceHistory = async (phone: string, ym: string) => {
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [y, m] = ym.split('-');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/survey/attendance-summary?year=${y}&month=${parseInt(m)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const emp = (data.employees || []).find((e: any) => e.phone === phone);
      setAttendanceHistory(emp?.actuals || []);
    } catch { setAttendanceHistory([]); }
    finally { setHistoryLoading(false); }
  };

  function openEditModal(worker: Worker) {
    setEditingWorker(worker);
    setForm({
      phone: worker.phone,
      name_ko: worker.name_ko,
      name_en: worker.name_en,
      bank_name: worker.bank_name,
      bank_account: worker.bank_account,
      id_number: worker.id_number,
      emergency_contact: worker.emergency_contact,
      category: worker.category,
      department: worker.department,
      workplace: worker.workplace,
      memo: worker.memo,
    });
    setShowModal(true);
    setShowAddAttendance(false);
    loadAttendanceHistory(worker.phone, historyMonth);
  }

  async function handleSave() {
    if (!form.phone.trim()) {
      alert("전화번호는 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      if (editingWorker) {
        await updateWorker(editingWorker.id, form);
      } else {
        await createWorker(form);
      }
      setShowModal(false);
      loadWorkers();
    } catch (err: any) {
      alert(err.message || "저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 근무자를 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      await deleteWorker(id);
      loadWorkers();
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(null);
    }
  }

  async function handleImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importWorkers();
      setImportResult(
        `총 ${result.total_found}명 발견, ${result.imported}명 신규 등록`
      );
      loadWorkers();
    } catch (err: any) {
      alert(err.message || "가져오기 실패");
    } finally {
      setImporting(false);
    }
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
            <Contact size={28} className="text-[#7070FF]" />
            근무자 DB
          </h2>
          <p className="text-[#8A8F98] mt-1">
            근무자 프로필을 관리합니다.
            {pagination.total > 0 && (
              <span className="ml-2 text-[#7070FF] font-medium">
                총 {pagination.total}명
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#23252A] bg-[#0F1011] text-[#D0D6E0] hover:bg-[#141516]/5 text-sm font-medium disabled:opacity-50"
          >
            {importing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            데이터 가져오기
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5E6AD2] text-white hover:bg-[#828FFF] text-sm font-medium"
          >
            <Plus size={16} />
            근무자 추가
          </button>
        </div>
      </div>

      {importResult && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-[#27A644]/10 border border-[#27A644]/30 text-[#27A644] text-sm">
          {importResult}
        </div>
      )}

      {/* Search & Filter */}
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-3 mb-6 mt-4"
      >
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#62666D]"
          />
          <input
            type="text"
            placeholder="이름 또는 전화번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-[#23252A] text-sm bg-[#0F1011] focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
        >
          <option value="">전체 구분</option>
          <option value="파견">파견</option>
          <option value="정규직">정규직</option>
          <option value="계약직">계약직</option>
          <option value="일용직">일용직</option>
          <option value="아르바이트">아르바이트</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-[#141516] text-[#D0D6E0] hover:bg-[#141516]/7 text-sm font-medium"
        >
          검색
        </button>
      </form>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={32} className="animate-spin text-[#7070FF]" />
        </div>
      ) : workers.length === 0 ? (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-12 text-center text-[#62666D]">
          등록된 근무자가 없습니다.
        </div>
      ) : (
        <div className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#08090A] border-b border-[#23252A]">
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    이름
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    전화번호
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    구분
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    부서
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    은행
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    계좌
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    주민번호
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    마지막 출근
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    비상연락처
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[#8A8F98]">
                    근로계약
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-[#8A8F98]">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr
                    key={worker.id}
                    className="border-b border-[#23252A] hover:bg-[#141516]/5 cursor-pointer"
                    onClick={() => openEditModal(worker)}
                  >
                    <td className="px-4 py-3 font-medium text-[#F7F8F8]">
                      {worker.name_ko || "-"}
                      {worker.name_en && (
                        <span className="ml-1 text-xs text-[#62666D]">
                          ({worker.name_en})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#D0D6E0]">{worker.phone}</td>
                    <td className="px-4 py-3">
                      {worker.category ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-[#4EA7FC]/10 text-[#828FFF]">
                          {worker.category}
                        </span>
                      ) : (
                        <span className="text-[#62666D]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#D0D6E0]">
                      {worker.department || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#D0D6E0]">
                      {worker.bank_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#D0D6E0]">
                      {worker.bank_account || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#D0D6E0]" onClick={(e) => e.stopPropagation()}>
                      {worker.id_number ? (
                        revealedIds.has(worker.id) ? (
                          <span className="text-xs font-mono">{worker.id_number}</span>
                        ) : (
                          <button onClick={() => handleRevealId(worker.id)} className="text-xs text-[#62666D] hover:text-[#7070FF] hover:underline cursor-pointer">
                            ●●●●●●-●●●●●●●
                          </button>
                        )
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-[#8A8F98] text-xs">
                      {(worker as any).last_clock_in_date || "-"}
                    </td>
                    <td className="px-4 py-3 text-[#D0D6E0]">
                      {worker.emergency_contact || "-"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {(worker as any).contract_id ? (
                        <a href={`/contract?id=${(worker as any).contract_id}`} target="_blank" rel="noopener noreferrer"
                          className="block hover:opacity-80 transition-opacity" title="클릭하여 계약서 보기">
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-[#27A644]/10 text-[#27A644] border border-[#27A644]/30 cursor-pointer">📋 체결</span>
                          <p className="text-[10px] text-blue-500 mt-0.5 underline">{(worker as any).contract_start}~{(worker as any).contract_end}</p>
                        </a>
                      ) : (
                        <span className="text-xs text-[#62666D]">미체결</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(worker)}
                          className="p-1.5 rounded-lg hover:bg-[#4EA7FC]/10 text-[#7070FF]"
                          title="수정"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(worker.id)}
                          disabled={deleting === worker.id}
                          className="p-1.5 rounded-lg hover:bg-[#EB5757]/10 text-[#EB5757] disabled:opacity-50"
                          title="삭제"
                        >
                          <Trash2 size={15} />
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#23252A]">
              <p className="text-sm text-[#8A8F98]">
                {pagination.total}명 중{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}
                명
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg hover:bg-[#141516]/5 text-[#8A8F98] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm text-[#D0D6E0] min-w-[80px] text-center">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page >= pagination.totalPages}
                  className="p-1.5 rounded-lg hover:bg-[#141516]/5 text-[#8A8F98] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0F1011] rounded-xl shadow-[0px_7px_32px_rgba(0,0,0,0.35)] w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[#23252A]">
              <h3 className="text-lg font-bold text-[#F7F8F8]">
                {editingWorker ? "근무자 수정" : "근무자 추가"}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    전화번호 <span className="text-[#EB5757]">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    placeholder="010-0000-0000"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    한글 이름
                  </label>
                  <input
                    type="text"
                    value={form.name_ko}
                    onChange={(e) => updateForm("name_ko", e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    영문 이름
                  </label>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => updateForm("name_en", e.target.value)}
                    placeholder="Hong Gildong"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    구분
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => updateForm("category", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm bg-[#0F1011] focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  >
                    <option value="">선택</option>
                    <option value="파견">파견</option>
                    <option value="정규직">정규직</option>
                    <option value="계약직">계약직</option>
                    <option value="일용직">일용직</option>
                    <option value="아르바이트">아르바이트</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    부서
                  </label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => updateForm("department", e.target.value)}
                    placeholder="부서명"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    근무지
                  </label>
                  <input
                    type="text"
                    value={form.workplace}
                    onChange={(e) => updateForm("workplace", e.target.value)}
                    placeholder="근무지"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    은행명
                  </label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={(e) => updateForm("bank_name", e.target.value)}
                    placeholder="국민은행"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                    계좌번호
                  </label>
                  <input
                    type="text"
                    value={form.bank_account}
                    onChange={(e) => updateForm("bank_account", e.target.value)}
                    placeholder="000-000-000000"
                    className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                  비상연락처
                </label>
                <input
                  type="text"
                  value={form.emergency_contact}
                  onChange={(e) =>
                    updateForm("emergency_contact", e.target.value)
                  }
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#D0D6E0] mb-1">
                  메모
                </label>
                <textarea
                  value={form.memo}
                  onChange={(e) => updateForm("memo", e.target.value)}
                  placeholder="메모 입력..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[#23252A] text-sm focus:ring-2 focus:ring-blue-500 focus:border-[#5E6AD2] outline-none resize-none"
                />
              </div>
            </div>
            {/* Attendance History */}
            {editingWorker && (
              <div className="px-6 py-4 border-t border-[#23252A]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-[#F7F8F8]">출퇴근 이력</h4>
                  <div className="flex items-center gap-2">
                    <input type="month" value={historyMonth} onChange={e => {
                      setHistoryMonth(e.target.value);
                      if (editingWorker) loadAttendanceHistory(editingWorker.phone, e.target.value);
                    }} className="px-2 py-1 border border-[#23252A] rounded-lg text-xs" />
                    <button
                      type="button"
                      onClick={() => {
                        if (!showAddAttendance) resetAddForm();
                        setShowAddAttendance(v => !v);
                      }}
                      className="px-2 py-1 rounded-lg bg-[#5E6AD2] text-white hover:bg-[#828FFF] text-xs font-medium flex items-center gap-1"
                    >
                      <Plus size={12} /> 추가하기
                    </button>
                  </div>
                </div>

                {showAddAttendance && (
                  <div className="mb-3 p-3 rounded-lg border border-[#5E6AD2]/40 bg-[#5E6AD2]/10 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-[#8A8F98] mb-1">날짜</label>
                        <input type="date" value={addForm.date}
                          onChange={e => setAddForm({ ...addForm, date: e.target.value })}
                          className="w-full px-2 py-1 border border-[#23252A] rounded text-xs bg-[#0F1011]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#8A8F98] mb-1">비밀번호</label>
                        <input type="password" value={addForm.password}
                          onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                          placeholder="비밀번호"
                          className="w-full px-2 py-1 border border-[#23252A] rounded text-xs bg-[#0F1011]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#8A8F98] mb-1">출근 시간</label>
                        <input type="time" value={addForm.clock_in_time}
                          onChange={e => setAddForm({ ...addForm, clock_in_time: e.target.value })}
                          className="w-full px-2 py-1 border border-[#23252A] rounded text-xs bg-[#0F1011]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[#8A8F98] mb-1">퇴근 시간</label>
                        <input type="time" value={addForm.clock_out_time}
                          onChange={e => setAddForm({ ...addForm, clock_out_time: e.target.value })}
                          className="w-full px-2 py-1 border border-[#23252A] rounded text-xs bg-[#0F1011]" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => { setShowAddAttendance(false); resetAddForm(); }}
                        className="px-3 py-1 rounded border border-[#23252A] text-[#D0D6E0] hover:bg-[#141516]/5 text-xs">
                        취소
                      </button>
                      <button type="button" onClick={handleAddAttendance} disabled={addSaving}
                        className="px-3 py-1 rounded bg-[#27A644] text-white hover:bg-[#27A644]/90 text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                        {addSaving && <Loader2 size={12} className="animate-spin" />} 저장
                      </button>
                    </div>
                  </div>
                )}
                {historyLoading ? (
                  <div className="py-4 text-center text-xs text-[#62666D]">로딩중...</div>
                ) : attendanceHistory.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[#62666D]">해당 월 출퇴근 이력이 없습니다.</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-[#23252A] rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-[#08090A] sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2 text-left font-medium text-[#8A8F98]">날짜</th>
                          <th className="py-1.5 px-2 text-left font-medium text-[#8A8F98]">출근</th>
                          <th className="py-1.5 px-2 text-left font-medium text-[#8A8F98]">퇴근</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#23252A]">
                        {attendanceHistory.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-[#141516]/5">
                            <td className="py-1.5 px-2 text-[#D0D6E0]">{r.date?.slice(5)}</td>
                            <td className="py-1.5 px-2 text-[#D0D6E0]">{r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                            <td className="py-1.5 px-2 text-[#D0D6E0]">{r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="px-6 py-4 border-t border-[#23252A] flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-[#23252A] text-[#D0D6E0] hover:bg-[#141516]/5 text-sm font-medium"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#5E6AD2] text-white hover:bg-[#828FFF] text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingWorker ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
