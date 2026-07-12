"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, Plus, Building2, ExternalLink, PenLine, Save,
  Ticket, AlertTriangle,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast, StatTile,
} from "@/components/ui";
import {
  listContractors, createContractor, patchContractor, getContractorActiveSummary,
  type Contractor, type ContractorActiveSummary,
} from "@/lib/api";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지" },
  { value: "terminated", label: "종료" },
];

function statusBadge(status: string) {
  if (status === "active") return <Badge tone="success">활성</Badge>;
  if (status === "suspended") return <Badge tone="warning">정지</Badge>;
  if (status === "terminated") return <Badge tone="neutral">종료</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

const EMPTY_FORM: Partial<Contractor> = {
  business_name: "",
  business_reg_no: "",
  representative_name: "",
  contact_phone: "",
  contact_email: "",
  work_scope: "",
  contract_start: "",
  contract_end: "",
  safety_docs_url: "",
  insurance_status: "",
  status: "active",
  notes: "",
};

export default function ContractorsPage() {
  const toast = useToast();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [summary, setSummary] = useState<ContractorActiveSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Contractor>>({ ...EMPTY_FORM });
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [editForm, setEditForm] = useState<Partial<Contractor>>({ ...EMPTY_FORM });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        listContractors({
          status: statusFilter || undefined,
          search: debouncedSearch || undefined,
        }),
        getContractorActiveSummary(),
      ]);
      setContractors(listRes.contractors);
      setSummary(sumRes);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally { setLoading(false); }
  }, [statusFilter, debouncedSearch, toast]);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    try {
      if (!addForm.business_name?.trim()) { toast.error("업체명을 입력하세요."); return; }
      if (!addForm.work_scope?.trim()) { toast.error("작업 범위를 입력하세요."); return; }
      await createContractor({
        business_name: addForm.business_name.trim(),
        work_scope: addForm.work_scope.trim(),
        business_reg_no: addForm.business_reg_no || undefined,
        representative_name: addForm.representative_name || undefined,
        contact_phone: addForm.contact_phone || undefined,
        contact_email: addForm.contact_email || undefined,
        contract_start: addForm.contract_start || null,
        contract_end: addForm.contract_end || null,
        safety_docs_url: addForm.safety_docs_url || undefined,
        insurance_status: addForm.insurance_status || undefined,
        status: addForm.status || "active",
        notes: addForm.notes || undefined,
      });
      toast.success("업체 등록 완료");
      setAddOpen(false);
      setAddForm({ ...EMPTY_FORM });
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const openEdit = (c: Contractor) => {
    setEditing(c);
    setEditForm({
      business_name: c.business_name,
      business_reg_no: c.business_reg_no,
      representative_name: c.representative_name,
      contact_phone: c.contact_phone,
      contact_email: c.contact_email,
      work_scope: c.work_scope,
      contract_start: c.contract_start || "",
      contract_end: c.contract_end || "",
      safety_docs_url: c.safety_docs_url,
      insurance_status: c.insurance_status,
      status: c.status,
      notes: c.notes,
    });
  };

  const doEdit = async () => {
    if (!editing) return;
    try {
      await patchContractor(editing.id, {
        business_name: editForm.business_name || undefined,
        business_reg_no: editForm.business_reg_no,
        representative_name: editForm.representative_name,
        contact_phone: editForm.contact_phone,
        contact_email: editForm.contact_email,
        work_scope: editForm.work_scope || undefined,
        contract_start: editForm.contract_start || null,
        contract_end: editForm.contract_end || null,
        safety_docs_url: editForm.safety_docs_url,
        insurance_status: editForm.insurance_status,
        status: editForm.status,
        notes: editForm.notes,
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
        title="수급인·용역업체 마스터"
        description="중처법 시행령 §4-9 이행. 도급·용역업체 정보·안전보건 서류·산재보험 상태를 관리하고, 발행된 작업허가·합동점검을 연결한다."
        actions={
          <div className="flex gap-2">
            <Link href="/safety-manager/contractors/permits">
              <Button variant="secondary">
                <Ticket className="w-4 h-4" /> 작업허가
              </Button>
            </Link>
            <Link href="/safety-manager/contractors/inspections">
              <Button variant="secondary">
                <AlertTriangle className="w-4 h-4" /> 합동점검
              </Button>
            </Link>
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> 업체 등록
            </Button>
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatTile
            label="활성 업체"
            value={`${summary.active_contractor_count}`}
            unit="곳"
            hint={`기준일 ${summary.as_of}`}
            icon={<Building2 size={14} />}
            iconTone="brand"
          />
          <StatTile
            label="유효 작업허가"
            value={`${summary.open_permit_count}`}
            unit="건"
            hint="pending/approved/in_progress"
            icon={<Ticket size={14} />}
            iconTone="success"
          />
          <StatTile
            label="만료 도래 허가"
            value={`${summary.overdue_permit_count}`}
            unit="건"
            hint="expiry_date 경과 미종료"
            icon={<AlertTriangle size={14} />}
            iconTone={summary.overdue_permit_count > 0 ? "danger" : "success"}
          />
          <StatTile
            label="합동점검 (30d)"
            value={`${summary.inspection_count_30d}`}
            unit="건"
            hint="최근 30일 실시"
            icon={<AlertTriangle size={14} />}
            iconTone="brand"
          />
        </div>
      )}

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="상태">
            <Select value={statusFilter} onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="검색 (업체명·사업자번호·작업범위)">
            <Input value={search} onChange={(e) => setSearch((e.target as HTMLInputElement).value)} placeholder="예: 냉동설비" />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          {loading && contractors.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
            </div>
          ) : contractors.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">등록된 업체가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">업체명</th>
                    <th className="text-left py-2 pr-3">사업자번호</th>
                    <th className="text-left py-2 pr-3">대표</th>
                    <th className="text-left py-2 pr-3">연락처</th>
                    <th className="text-left py-2 pr-3">작업범위</th>
                    <th className="text-left py-2 pr-3">계약기간</th>
                    <th className="text-left py-2 pr-3">보험</th>
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {contractors.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-[var(--text-1)]">{c.business_name}</div>
                        {c.safety_docs_url && (
                          <a href={c.safety_docs_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[var(--brand-400)] hover:underline">
                            <ExternalLink size={10} /> 안전서류
                          </a>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] tabular text-[var(--text-3)]">{c.business_reg_no || "-"}</td>
                      <td className="py-2 pr-3">{c.representative_name || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)]">
                        <div>{c.contact_phone || "-"}</div>
                        <div className="text-[var(--text-3)]">{c.contact_email || ""}</div>
                      </td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] line-clamp-2 max-w-[280px]">{c.work_scope || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] tabular text-[var(--text-3)]">
                        {c.contract_start || "-"} ~ {c.contract_end || "-"}
                      </td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)]">{c.insurance_status || "-"}</td>
                      <td className="py-2 pr-3">{statusBadge(c.status)}</td>
                      <td className="py-2 pr-3">
                        <Button variant="secondary" size="xs" onClick={() => openEdit(c)}>
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

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="수급인·용역업체 등록" size="lg">
        <ContractorForm form={addForm} setForm={setAddForm} onSubmit={doAdd} onCancel={() => setAddOpen(false)} submitLabel="등록" />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.business_name} 편집` : ""} size="lg">
        {editing && (
          <ContractorForm form={editForm} setForm={setEditForm} onSubmit={doEdit} onCancel={() => setEditing(null)} submitLabel="저장" />
        )}
      </Modal>
    </div>
  );
}

function ContractorForm({
  form, setForm, onSubmit, onCancel, submitLabel,
}: {
  form: Partial<Contractor>;
  setForm: (f: Partial<Contractor>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="업체명 *">
          <Input value={form.business_name || ""} onChange={(e) => setForm({ ...form, business_name: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field label="사업자등록번호">
          <Input value={form.business_reg_no || ""} onChange={(e) => setForm({ ...form, business_reg_no: (e.target as HTMLInputElement).value })} placeholder="503-87-01038" />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="대표자명">
          <Input value={form.representative_name || ""} onChange={(e) => setForm({ ...form, representative_name: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field label="연락처">
          <Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: (e.target as HTMLInputElement).value })} placeholder="010-1234-5678" />
        </Field>
        <Field label="이메일">
          <Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: (e.target as HTMLInputElement).value })} />
        </Field>
      </div>
      <Field label="작업 범위 *">
        <Textarea rows={2} value={form.work_scope || ""} onChange={(e) => setForm({ ...form, work_scope: (e.target as HTMLTextAreaElement).value })} placeholder="예: 냉동설비 정기 정비 · 배관 교체" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="계약 시작">
          <Input type="date" value={form.contract_start || ""} onChange={(e) => setForm({ ...form, contract_start: (e.target as HTMLInputElement).value })} />
        </Field>
        <Field label="계약 종료">
          <Input type="date" value={form.contract_end || ""} onChange={(e) => setForm({ ...form, contract_end: (e.target as HTMLInputElement).value })} />
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="안전보건 서류 URL">
          <Input value={form.safety_docs_url || ""} onChange={(e) => setForm({ ...form, safety_docs_url: (e.target as HTMLInputElement).value })} placeholder="https://..." />
        </Field>
        <Field label="산재보험 상태">
          <Input value={form.insurance_status || ""} onChange={(e) => setForm({ ...form, insurance_status: (e.target as HTMLInputElement).value })} placeholder="예: 가입중 (2026-12-31 갱신)" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="상태">
          <Select value={form.status || "active"} onChange={(e) => setForm({ ...form, status: (e.target as HTMLSelectElement).value })}>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
            <option value="terminated">종료</option>
          </Select>
        </Field>
      </div>
      <Field label="비고">
        <Textarea rows={2} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: (e.target as HTMLTextAreaElement).value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>취소</Button>
        <Button onClick={onSubmit}><Save className="w-4 h-4" /> {submitLabel}</Button>
      </div>
    </div>
  );
}
