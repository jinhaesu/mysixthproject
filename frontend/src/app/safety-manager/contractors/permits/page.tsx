"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, Plus, Ticket, ArrowLeft, PenLine, Save,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast,
} from "@/components/ui";
import {
  listContractorPermits, createContractorPermit, patchContractorPermit,
  listContractors,
  type ContractorWorkPermit, type Contractor,
} from "@/lib/api";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "approved", label: "승인" },
  { value: "in_progress", label: "작업중" },
  { value: "closed", label: "종료" },
];

function statusBadge(status: string, overdue?: boolean) {
  if (overdue) return <Badge tone="danger">기간초과</Badge>;
  if (status === "closed") return <Badge tone="neutral">종료</Badge>;
  if (status === "in_progress") return <Badge tone="warning">작업중</Badge>;
  if (status === "approved") return <Badge tone="success">승인</Badge>;
  if (status === "pending") return <Badge tone="brand">대기</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function todayStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function plusDays(base: string, d: number): string {
  const dt = new Date(base);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

interface AddForm {
  contractor_id: number;
  work_description: string;
  hazard_types: string;
  permit_no: string;
  permit_date: string;
  expiry_date: string;
  ppe_required: string;
  safety_measures: string;
  approver_name: string;
  status: string;
}

const emptyAdd: AddForm = {
  contractor_id: 0,
  work_description: "",
  hazard_types: "",
  permit_no: "",
  permit_date: todayStr(),
  expiry_date: plusDays(todayStr(), 1),
  ppe_required: "",
  safety_measures: "",
  approver_name: "",
  status: "pending",
};

export default function ContractorPermitsPage() {
  const toast = useToast();
  const [permits, setPermits] = useState<ContractorWorkPermit[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [contractorFilter, setContractorFilter] = useState<number>(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>({ ...emptyAdd });

  const [editing, setEditing] = useState<ContractorWorkPermit | null>(null);
  const [editForm, setEditForm] = useState<Partial<AddForm>>({ ...emptyAdd });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        listContractorPermits({
          status: statusFilter || undefined,
          contractor_id: contractorFilter || undefined,
        }),
        listContractors({ status: "active" }),
      ]);
      setPermits(pRes.permits);
      setContractors(cRes.contractors);
    } catch (e: any) { toast.error(e.message || "로드 실패"); }
    finally { setLoading(false); }
  }, [statusFilter, contractorFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    try {
      if (!addForm.contractor_id) { toast.error("업체를 선택하세요."); return; }
      if (!addForm.work_description.trim()) { toast.error("작업 내용을 입력하세요."); return; }
      await createContractorPermit({
        contractor_id: addForm.contractor_id,
        work_description: addForm.work_description.trim(),
        permit_date: addForm.permit_date,
        expiry_date: addForm.expiry_date,
        permit_no: addForm.permit_no || undefined,
        hazard_types: addForm.hazard_types || undefined,
        ppe_required: addForm.ppe_required || undefined,
        safety_measures: addForm.safety_measures || undefined,
        approver_name: addForm.approver_name || undefined,
        status: addForm.status || "pending",
      });
      toast.success("작업허가 발행 완료");
      setAddOpen(false);
      setAddForm({ ...emptyAdd });
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (p: ContractorWorkPermit) => {
    setEditing(p);
    setEditForm({
      contractor_id: p.contractor_id,
      work_description: p.work_description,
      permit_date: p.permit_date,
      expiry_date: p.expiry_date,
      permit_no: p.permit_no,
      hazard_types: p.hazard_types,
      ppe_required: p.ppe_required,
      safety_measures: p.safety_measures,
      approver_name: p.approver_name,
      status: p.status,
    });
  };

  const doEdit = async () => {
    if (!editing) return;
    try {
      await patchContractorPermit(editing.id, {
        work_description: editForm.work_description,
        permit_date: editForm.permit_date,
        expiry_date: editForm.expiry_date,
        permit_no: editForm.permit_no,
        hazard_types: editForm.hazard_types,
        ppe_required: editForm.ppe_required,
        safety_measures: editForm.safety_measures,
        approver_name: editForm.approver_name,
        status: editForm.status,
      });
      toast.success("저장 완료");
      setEditing(null);
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        eyebrow="도급업체"
        title="도급업체 작업허가"
        description="수급인 위험작업(고소·화기·밀폐공간·전기 등) 발행·관리. §4-9 이행 증빙."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/contractors">
              <Button variant="secondary">
                <ArrowLeft className="w-4 h-4" /> 업체
              </Button>
            </Link>
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> 작업허가 발행
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="상태">
            <Select value={statusFilter} onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="업체">
            <Select value={String(contractorFilter || "")} onChange={(e) => setContractorFilter(Number((e.target as HTMLSelectElement).value) || 0)}>
              <option value="">전체</option>
              {contractors.map(c => <option key={c.id} value={String(c.id)}>{c.business_name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ticket size={14} className="text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">작업허가</h3>
            <Badge tone="neutral">{permits.length}건</Badge>
          </div>
          {loading && permits.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
            </div>
          ) : permits.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">등록된 작업허가가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">번호</th>
                    <th className="text-left py-2 pr-3">업체</th>
                    <th className="text-left py-2 pr-3">작업 내용</th>
                    <th className="text-left py-2 pr-3">위험유형</th>
                    <th className="text-left py-2 pr-3">기간</th>
                    <th className="text-left py-2 pr-3">승인자</th>
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map(p => (
                    <tr key={p.id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 tabular text-[var(--text-3)]">
                        {p.permit_no || `#${p.id}`}
                      </td>
                      <td className="py-2 pr-3">{p.contractor_name || `id=${p.contractor_id}`}</td>
                      <td className="py-2 pr-3 line-clamp-2 max-w-[240px]">{p.work_description}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)]">{p.hazard_types || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] tabular text-[var(--text-3)]">
                        {p.permit_date} ~ {p.expiry_date}
                      </td>
                      <td className="py-2 pr-3">{p.approver_name || "-"}</td>
                      <td className="py-2 pr-3">{statusBadge(p.status, p.is_overdue)}</td>
                      <td className="py-2 pr-3">
                        <Button variant="secondary" size="xs" onClick={() => openEdit(p)}>
                          <PenLine className="w-3.5 h-3.5" /> 편집
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="작업허가 발행" size="lg">
        <PermitForm
          contractors={contractors}
          form={addForm}
          setForm={(f) => setAddForm({ ...(addForm), ...f } as AddForm)}
          isCreate
          onSubmit={doAdd}
          onCancel={() => setAddOpen(false)}
          submitLabel="발행"
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `작업허가 #${editing.id} 편집` : ""} size="lg">
        {editing && (
          <PermitForm
            contractors={contractors}
            form={editForm as AddForm}
            setForm={(f) => setEditForm({ ...editForm, ...f })}
            isCreate={false}
            onSubmit={doEdit}
            onCancel={() => setEditing(null)}
            submitLabel="저장"
          />
        )}
      </Modal>
    </div>
  );
}

function PermitForm({
  contractors, form, setForm, isCreate, onSubmit, onCancel, submitLabel,
}: {
  contractors: Contractor[];
  form: Partial<AddForm>;
  setForm: (partial: Partial<AddForm>) => void;
  isCreate: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="space-y-3">
      {isCreate && (
        <Field label="업체 *">
          <Select
            value={String(form.contractor_id || "")}
            onChange={(e) => setForm({ contractor_id: Number((e.target as HTMLSelectElement).value) || 0 })}
          >
            <option value="">선택</option>
            {contractors.map(c => <option key={c.id} value={String(c.id)}>{c.business_name}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="허가번호 (선택)">
          <Input value={form.permit_no || ""} onChange={(e) => setForm({ permit_no: (e.target as HTMLInputElement).value })} placeholder="예: WP-2026-001" />
        </Field>
        <Field label="상태">
          <Select value={form.status || "pending"} onChange={(e) => setForm({ status: (e.target as HTMLSelectElement).value })}>
            <option value="pending">대기</option>
            <option value="approved">승인</option>
            <option value="in_progress">작업중</option>
            <option value="closed">종료</option>
          </Select>
        </Field>
      </div>
      <Field label="작업 내용 *">
        <Textarea rows={2} value={form.work_description || ""} onChange={(e) => setForm({ work_description: (e.target as HTMLTextAreaElement).value })} placeholder="예: 3층 냉동창고 컴프레서 오일 교체" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="위험 유형 (쉼표 구분)">
          <Input value={form.hazard_types || ""} onChange={(e) => setForm({ hazard_types: (e.target as HTMLInputElement).value })} placeholder="예: 고소작업,화기,밀폐공간" />
        </Field>
        <Field label="승인자">
          <Input value={form.approver_name || ""} onChange={(e) => setForm({ approver_name: (e.target as HTMLInputElement).value })} placeholder="예: 김안전" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="허가일 *">
          <Input type="date" value={form.permit_date || ""} onChange={(e) => setForm({ permit_date: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field label="만료일 *">
          <Input type="date" value={form.expiry_date || ""} onChange={(e) => setForm({ expiry_date: (e.target as HTMLInputElement).value })} />
        </Field>
      </div>
      <Field label="필수 보호구">
        <Input value={form.ppe_required || ""} onChange={(e) => setForm({ ppe_required: (e.target as HTMLInputElement).value })} placeholder="예: 안전모·안전화·안전대·방독마스크" />
      </Field>
      <Field label="안전조치">
        <Textarea rows={3} value={form.safety_measures || ""} onChange={(e) => setForm({ safety_measures: (e.target as HTMLTextAreaElement).value })} placeholder="예: LOTO 절차 준수, 감시자 배치, 소화기 인접 배치" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>취소</Button>
        <Button onClick={onSubmit}><Save className="w-4 h-4" /> {submitLabel}</Button>
      </div>
    </div>
  );
}
