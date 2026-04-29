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
  createOffboarding,
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
  UserMinus,
} from "lucide-react";
import { Card, PageHeader, Badge, Button, SkeletonCard, EmptyState, Input, Select, Textarea, Field, useToast, Modal } from "@/components/ui";

const REASON_CODES_OB = [
  { code: "11", label: "11 - 개인사정으로 인한 자진퇴사", hint: "실업급여 X" },
  { code: "22", label: "22 - 근로계약기간만료/공사종료", hint: "실업급여 O" },
  { code: "23", label: "23 - 경영상필요/회사사정 (권고사직 등)", hint: "실업급여 O" },
  { code: "26", label: "26 - 정년퇴직", hint: "실업급여 O" },
  { code: "31", label: "31 - 기타 사용자 사정", hint: "실업급여 O (사례별)" },
  { code: "41", label: "41 - 사망", hint: "유족급여 처리" },
];

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
  const toast = useToast();
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

  const [offboardingTarget, setOffboardingTarget] = useState<Worker | null>(null);
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
        employee_type: "dispatch",
        employee_ref_id: offboardingTarget.id,
        resign_date: offboardingForm.resign_date,
        reason_code: offboardingForm.reason_code,
        reason_detail: offboardingForm.reason_detail,
        send_email: offboardingForm.send_email,
      });
      toast.success(`${offboardingTarget.name_ko || offboardingTarget.phone} 퇴사 등록 완료. 퇴사관리 페이지에서 진행 현황을 확인하세요.`);
      setOffboardingTarget(null);
      setOffboardingForm({ resign_date: "", reason_code: "", reason_detail: "", send_email: true });
    } catch (e: any) {
      toast.error(e.message || "퇴사 등록 실패");
    } finally {
      setSubmittingOffboarding(false);
    }
  };

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
        toast.info("비밀번호가 일치하지 않습니다.");
      }
    } catch { toast.error("확인 중 오류가 발생했습니다."); }
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
    if (!addForm.date) { toast.info("날짜를 입력해주세요."); return; }
    if (!addForm.clock_in_time) { toast.info("출근 시간을 입력해주세요. (퇴근 시간은 선택)"); return; }
    if (!addForm.password) { toast.info("비밀번호를 입력해주세요."); return; }
    setAddSaving(true);
    try {
      await addManualAttendance({
        password: addForm.password,
        phone: editingWorker.phone,
        date: addForm.date,
        clock_in_time: addForm.clock_in_time || undefined,
        clock_out_time: addForm.clock_out_time || undefined,
      });
      toast.success("출퇴근 이력이 추가되었습니다.");
      setShowAddAttendance(false);
      resetAddForm();
      // 추가된 날짜가 속한 월로 이동 후 reload
      const ym = addForm.date.slice(0, 7);
      setHistoryMonth(ym);
      loadAttendanceHistory(editingWorker.phone, ym);
    } catch (err: any) {
      toast.error(err.message || "추가 중 오류가 발생했습니다.");
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
      toast.info("전화번호는 필수입니다.");
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
      toast.error(err.message || "저장 중 오류가 발생했습니다.");
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
      toast.error("삭제 중 오류가 발생했습니다.");
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
      toast.error(err.message || "가져오기 실패");
    } finally {
      setImporting(false);
    }
  }

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div>
      <PageHeader
        eyebrow={<><Contact className="w-3.5 h-3.5" /> 인사 관리</>}
        title={<>근무자 DB {pagination.total > 0 && <span className="text-[var(--brand-400)] font-medium tabular text-[var(--fs-h4)]">{pagination.total}명</span>}</>}
        description="근무자 프로필을 관리합니다."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={importing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              onClick={handleImport}
              disabled={importing}
            >
              데이터 가져오기
            </Button>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus size={14} />}
              onClick={openAddModal}
            >
              근무자 추가
            </Button>
          </div>
        }
      />

      {importResult && (
        <div className="mb-4 px-4 py-3 rounded-[var(--r-md)] bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success-fg)] text-[var(--fs-body)]">
          {importResult}
        </div>
      )}

      {/* Search & Filter */}
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-3 mb-6 mt-4"
      >
        <div className="flex-1 max-w-md">
          <Input
            type="text"
            placeholder="이름 또는 전화번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputSize="md"
            iconLeft={<Search size={14} />}
          />
        </div>
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          inputSize="md"
          className="w-36"
        >
          <option value="">전체 구분</option>
          <option value="파견">파견</option>
          <option value="정규직">정규직</option>
          <option value="계약직">계약직</option>
          <option value="일용직">일용직</option>
          <option value="아르바이트">아르바이트</option>
        </Select>
        <Button type="submit" variant="secondary" size="md">
          검색
        </Button>
      </form>

      {/* Table */}
      {loading ? (
        <SkeletonCard />
      ) : workers.length === 0 ? (
        <EmptyState icon={<Contact className="w-8 h-8" />} title="등록된 근무자가 없습니다" description="근무자를 추가해주세요." />
      ) : (
        <Card padding="none" className="overflow-hidden fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-[var(--fs-body)]">
              <thead>
                <tr className="bg-[var(--bg-canvas)] border-b border-[var(--border-1)]">
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">이름</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">전화번호</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">구분</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">부서</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">은행</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">계좌</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">주민번호</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">마지막 출근</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">비상연락처</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">근로계약</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-[var(--text-3)]">관리</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr
                    key={worker.id}
                    className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)] cursor-pointer transition-colors"
                    onClick={() => openEditModal(worker)}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                      {worker.name_ko || "-"}
                      {worker.name_en && (
                        <span className="ml-1 text-[var(--fs-caption)] text-[var(--text-4)]">
                          ({worker.name_en})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)] tabular">{worker.phone}</td>
                    <td className="px-4 py-3">
                      {worker.category ? (
                        <Badge tone={worker.category === '파견' ? 'warning' : worker.category === '아르바이트' ? 'success' : 'brand'}>
                          {worker.category}
                        </Badge>
                      ) : (
                        <span className="text-[var(--text-4)]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      {worker.department || "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]">
                      {worker.bank_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)] tabular">
                      {worker.bank_account || "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)]" onClick={(e) => e.stopPropagation()}>
                      {worker.id_number ? (
                        revealedIds.has(worker.id) ? (
                          <span className="text-[var(--fs-caption)] font-mono tabular">{worker.id_number}</span>
                        ) : (
                          <button onClick={() => handleRevealId(worker.id)} className="text-[var(--fs-caption)] text-[var(--text-4)] hover:text-[var(--brand-400)] hover:underline cursor-pointer">
                            ●●●●●●-●●●●●●●
                          </button>
                        )
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-3)] text-[var(--fs-caption)] tabular">
                      {(worker as any).last_clock_in_date || "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-2)] tabular">
                      {worker.emergency_contact || "-"}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {(worker as any).contract_id ? (
                        <a href={`/contract?id=${(worker as any).contract_id}`} target="_blank" rel="noopener noreferrer"
                          className="block hover:opacity-80 transition-opacity" title="클릭하여 계약서 보기">
                          <Badge tone="success">체결</Badge>
                          <p className="text-[10px] text-[var(--info-fg)] mt-0.5 underline tabular">{(worker as any).contract_start}~{(worker as any).contract_end}</p>
                        </a>
                      ) : (
                        <span className="text-[var(--fs-caption)] text-[var(--text-4)]">미체결</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => openEditModal(worker)}
                          className="p-1.5 rounded-[var(--r-md)] hover:bg-[var(--info-bg)] text-[var(--brand-400)] transition-colors"
                          title="수정"
                        >
                          <Edit3 size={15} />
                        </button>
                        <Button
                          variant="ghost"
                          size="xs"
                          leadingIcon={<UserMinus size={14} />}
                          onClick={() => {
                            setOffboardingTarget(worker);
                            setOffboardingForm({ resign_date: "", reason_code: "", reason_detail: "", send_email: true });
                          }}
                          title="퇴사 등록"
                        >
                          퇴사
                        </Button>
                        <button
                          onClick={() => handleDelete(worker.id)}
                          disabled={deleting === worker.id}
                          className="p-1.5 rounded-[var(--r-md)] hover:bg-[var(--danger-bg)] text-[var(--danger-fg)] disabled:opacity-50 transition-colors"
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
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-1)]">
              <p className="text-[var(--fs-body)] text-[var(--text-3)] tabular">
                {pagination.total}명 중{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}
                명
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-[var(--fs-body)] text-[var(--text-2)] min-w-[80px] text-center tabular">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-1)] rounded-[var(--r-xl)] shadow-[var(--elev-3)] border border-[var(--border-1)] w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-[var(--border-1)]">
              <h3 className="text-[var(--fs-h4)] font-semibold text-[var(--text-1)]">
                {editingWorker ? "근무자 수정" : "근무자 추가"}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="전화번호" required>
                  <Input
                    type="text"
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    placeholder="010-0000-0000"
                    inputSize="md"
                  />
                </Field>
                <Field label="한글 이름">
                  <Input
                    type="text"
                    value={form.name_ko}
                    onChange={(e) => updateForm("name_ko", e.target.value)}
                    placeholder="홍길동"
                    inputSize="md"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="영문 이름">
                  <Input
                    type="text"
                    value={form.name_en}
                    onChange={(e) => updateForm("name_en", e.target.value)}
                    placeholder="Hong Gildong"
                    inputSize="md"
                  />
                </Field>
                <Field label="구분">
                  <Select
                    value={form.category}
                    onChange={(e) => updateForm("category", e.target.value)}
                    inputSize="md"
                  >
                    <option value="">선택</option>
                    <option value="파견">파견</option>
                    <option value="정규직">정규직</option>
                    <option value="계약직">계약직</option>
                    <option value="일용직">일용직</option>
                    <option value="아르바이트">아르바이트</option>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="부서">
                  <Input
                    type="text"
                    value={form.department}
                    onChange={(e) => updateForm("department", e.target.value)}
                    placeholder="부서명"
                    inputSize="md"
                  />
                </Field>
                <Field label="근무지">
                  <Input
                    type="text"
                    value={form.workplace}
                    onChange={(e) => updateForm("workplace", e.target.value)}
                    placeholder="근무지"
                    inputSize="md"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="은행명">
                  <Input
                    type="text"
                    value={form.bank_name}
                    onChange={(e) => updateForm("bank_name", e.target.value)}
                    placeholder="국민은행"
                    inputSize="md"
                  />
                </Field>
                <Field label="계좌번호">
                  <Input
                    type="text"
                    value={form.bank_account}
                    onChange={(e) => updateForm("bank_account", e.target.value)}
                    placeholder="000-000-000000"
                    inputSize="md"
                  />
                </Field>
              </div>
              <Field label="비상연락처">
                <Input
                  type="text"
                  value={form.emergency_contact}
                  onChange={(e) => updateForm("emergency_contact", e.target.value)}
                  placeholder="010-0000-0000"
                  inputSize="md"
                />
              </Field>
              <Field label="메모">
                <Textarea
                  value={form.memo}
                  onChange={(e) => updateForm("memo", e.target.value)}
                  placeholder="메모 입력..."
                  rows={2}
                />
              </Field>
            </div>
            {/* Attendance History */}
            {editingWorker && (
              <div className="px-6 py-4 border-t border-[var(--border-1)]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[var(--fs-body)] font-semibold text-[var(--text-1)]">출퇴근 이력</h4>
                  <div className="flex items-center gap-2">
                    <Input type="month" value={historyMonth} onChange={e => {
                      setHistoryMonth(e.target.value);
                      if (editingWorker) loadAttendanceHistory(editingWorker.phone, e.target.value);
                    }} inputSize="sm" />
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      leadingIcon={<Plus size={12} />}
                      onClick={() => {
                        if (!showAddAttendance) resetAddForm();
                        setShowAddAttendance(v => !v);
                      }}
                    >
                      추가하기
                    </Button>
                  </div>
                </div>

                {showAddAttendance && (
                  <div className="mb-3 p-3 rounded-[var(--r-md)] border border-[var(--brand-500)]/40 bg-[var(--brand-500)]/10 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="날짜">
                        <Input type="date" value={addForm.date}
                          onChange={e => setAddForm({ ...addForm, date: e.target.value })}
                          inputSize="sm" />
                      </Field>
                      <Field label="비밀번호">
                        <Input type="password" value={addForm.password}
                          onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                          placeholder="비밀번호"
                          inputSize="sm" />
                      </Field>
                      <Field label="출근 시간">
                        <Input type="time" value={addForm.clock_in_time}
                          onChange={e => setAddForm({ ...addForm, clock_in_time: e.target.value })}
                          inputSize="sm" />
                      </Field>
                      <Field label="퇴근 시간">
                        <Input type="time" value={addForm.clock_out_time}
                          onChange={e => setAddForm({ ...addForm, clock_out_time: e.target.value })}
                          inputSize="sm" />
                      </Field>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button type="button" variant="secondary" size="xs" onClick={() => { setShowAddAttendance(false); resetAddForm(); }}>
                        취소
                      </Button>
                      <Button type="button" variant="primary" size="xs" onClick={handleAddAttendance} disabled={addSaving}
                        leadingIcon={addSaving ? <Loader2 size={12} className="animate-spin" /> : undefined}>
                        저장
                      </Button>
                    </div>
                  </div>
                )}
                {historyLoading ? (
                  <div className="py-4 text-center text-[var(--fs-caption)] text-[var(--text-4)]">로딩중...</div>
                ) : attendanceHistory.length === 0 ? (
                  <div className="py-4 text-center text-[var(--fs-caption)] text-[var(--text-4)]">해당 월 출퇴근 이력이 없습니다.</div>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-[var(--border-1)] rounded-[var(--r-md)]">
                    <table className="w-full text-[var(--fs-caption)]">
                      <thead className="bg-[var(--bg-canvas)] sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">날짜</th>
                          <th className="py-1.5 px-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">출근</th>
                          <th className="py-1.5 px-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-3)]">퇴근</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-1)]">
                        {attendanceHistory.map((r: any, i: number) => (
                          <tr key={i} className="hover:bg-[var(--bg-2)]">
                            <td className="py-1.5 px-2 text-[var(--text-2)] tabular">{r.date?.slice(5)}</td>
                            <td className="py-1.5 px-2 text-[var(--text-2)] tabular">{r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                            <td className="py-1.5 px-2 text-[var(--text-2)] tabular">{r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="px-6 py-4 border-t border-[var(--border-1)] flex justify-end gap-3">
              <Button variant="secondary" size="md" onClick={() => setShowModal(false)}>
                취소
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={saving}
                leadingIcon={saving ? <Loader2 size={14} className="animate-spin" /> : undefined}
              >
                {editingWorker ? "수정" : "추가"}
              </Button>
            </div>
          </div>
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
                <p className="text-sm font-medium text-[var(--text-1)]">{offboardingTarget.name_ko || "-"}</p>
                <p className="text-xs text-[var(--text-3)]">{offboardingTarget.department} · {offboardingTarget.category}</p>
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
