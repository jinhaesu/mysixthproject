"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  importWorkers,
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

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
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Contact size={28} className="text-blue-600" />
            근무자 DB
          </h2>
          <p className="text-gray-500 mt-1">
            근무자 프로필을 관리합니다.
            {pagination.total > 0 && (
              <span className="ml-2 text-blue-600 font-medium">
                총 {pagination.total}명
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
          >
            <Plus size={16} />
            근무자 추가
          </button>
        </div>
      </div>

      {importResult && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
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
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
      ) : workers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          등록된 근무자가 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    이름
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    전화번호
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    구분
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    부서
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    은행
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    계좌
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    비상연락처
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    근로계약
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr
                    key={worker.id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => openEditModal(worker)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {worker.name_ko || "-"}
                      {worker.name_en && (
                        <span className="ml-1 text-xs text-gray-400">
                          ({worker.name_en})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{worker.phone}</td>
                    <td className="px-4 py-3">
                      {worker.category ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {worker.category}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {worker.department || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {worker.bank_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {worker.bank_account || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {worker.emergency_contact || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {(worker as any).contract_id ? (
                        <div>
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">체결</span>
                          <p className="text-[10px] text-gray-500 mt-0.5">{(worker as any).contract_start}~{(worker as any).contract_end}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">미체결</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(worker)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600"
                          title="수정"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(worker.id)}
                          disabled={deleting === worker.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-50"
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
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
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm text-gray-700 min-w-[80px] text-center">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                {editingWorker ? "근무자 수정" : "근무자 추가"}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    한글 이름
                  </label>
                  <input
                    type="text"
                    value={form.name_ko}
                    onChange={(e) => updateForm("name_ko", e.target.value)}
                    placeholder="홍길동"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    영문 이름
                  </label>
                  <input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => updateForm("name_en", e.target.value)}
                    placeholder="Hong Gildong"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    구분
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => updateForm("category", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    부서
                  </label>
                  <input
                    type="text"
                    value={form.department}
                    onChange={(e) => updateForm("department", e.target.value)}
                    placeholder="부서명"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    근무지
                  </label>
                  <input
                    type="text"
                    value={form.workplace}
                    onChange={(e) => updateForm("workplace", e.target.value)}
                    placeholder="근무지"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    은행명
                  </label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={(e) => updateForm("bank_name", e.target.value)}
                    placeholder="국민은행"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    계좌번호
                  </label>
                  <input
                    type="text"
                    value={form.bank_account}
                    onChange={(e) => updateForm("bank_account", e.target.value)}
                    placeholder="000-000-000000"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비상연락처
                </label>
                <input
                  type="text"
                  value={form.emergency_contact}
                  onChange={(e) =>
                    updateForm("emergency_contact", e.target.value)
                  }
                  placeholder="010-0000-0000"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메모
                </label>
                <textarea
                  value={form.memo}
                  onChange={(e) => updateForm("memo", e.target.value)}
                  placeholder="메모 입력..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
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
                {editingWorker ? "수정" : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
