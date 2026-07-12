"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, Plus, AlertTriangle, ArrowLeft, Save,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast,
} from "@/components/ui";
import {
  listContractorInspections, createContractorInspection,
  listContractors, listContractorPermits,
  type ContractorJointInspection, type Contractor, type ContractorWorkPermit,
} from "@/lib/api";

function nowIso(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

export default function ContractorInspectionsPage() {
  const toast = useToast();
  const [inspections, setInspections] = useState<ContractorJointInspection[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [permits, setPermits] = useState<ContractorWorkPermit[]>([]);
  const [loading, setLoading] = useState(true);

  const [contractorFilter, setContractorFilter] = useState<number>(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    contractor_id: 0 as number,
    permit_id: 0 as number,
    inspected_at: nowIso(),
    findings: "",
    actions: "",
    photos: "",
    inspector_name: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, cRes, pRes] = await Promise.all([
        listContractorInspections({
          contractor_id: contractorFilter || undefined,
        }),
        listContractors({ status: "active" }),
        listContractorPermits({}),
      ]);
      setInspections(iRes.inspections);
      setContractors(cRes.contractors);
      setPermits(pRes.permits);
    } catch (e: any) { toast.error(e.message || "로드 실패"); }
    finally { setLoading(false); }
  }, [contractorFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    try {
      if (!addForm.contractor_id && !addForm.permit_id) {
        toast.error("업체 또는 작업허가 중 하나는 선택해야 합니다.");
        return;
      }
      if (!addForm.inspected_at) { toast.error("점검 일시를 입력하세요."); return; }
      const res = await createContractorInspection({
        contractor_id: addForm.contractor_id || null,
        permit_id: addForm.permit_id || null,
        inspected_at: new Date(addForm.inspected_at).toISOString(),
        findings: addForm.findings || undefined,
        actions: addForm.actions || undefined,
        photos: addForm.photos || undefined,
        inspector_name: addForm.inspector_name || undefined,
      });
      if (res.ticket_id) {
        toast.success(`점검 등록 · 조치티켓 #${res.ticket_id} 생성`);
      } else {
        toast.success("점검 등록 완료");
      }
      setAddOpen(false);
      setAddForm({
        contractor_id: 0,
        permit_id: 0,
        inspected_at: nowIso(),
        findings: "",
        actions: "",
        photos: "",
        inspector_name: "",
      });
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        eyebrow="도급업체"
        title="원·수급 합동 안전점검"
        description="§4-9 이행. 위험작업 현장에서 원청과 수급인이 함께 실시한 안전점검 기록. 지적 사항은 조치티켓으로 자동 등록된다."
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
              <Plus className="w-4 h-4" /> 점검 기록
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
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
            <AlertTriangle size={14} className="text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">합동점검 기록</h3>
            <Badge tone="neutral">{inspections.length}건</Badge>
          </div>
          {loading && inspections.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
            </div>
          ) : inspections.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">등록된 점검 기록이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">일시</th>
                    <th className="text-left py-2 pr-3">업체</th>
                    <th className="text-left py-2 pr-3">허가</th>
                    <th className="text-left py-2 pr-3">점검자</th>
                    <th className="text-left py-2 pr-3">지적사항</th>
                    <th className="text-left py-2 pr-3">조치</th>
                    <th className="text-left py-2 pr-3">티켓</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map(i => (
                    <tr key={i.id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">
                        {i.inspected_at?.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="py-2 pr-3">{i.contractor_name || (i.contractor_id ? `id=${i.contractor_id}` : "-")}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] line-clamp-2 max-w-[220px]">{i.permit_description || (i.permit_id ? `#${i.permit_id}` : "-")}</td>
                      <td className="py-2 pr-3">{i.inspector_name || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] line-clamp-2 max-w-[240px]">{i.findings || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] line-clamp-2 max-w-[240px]">{i.actions || "-"}</td>
                      <td className="py-2 pr-3">{i.ticket_id ? <Badge tone="warning">#{i.ticket_id}</Badge> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="합동점검 기록" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="업체">
              <Select value={String(addForm.contractor_id || "")} onChange={(e) => setAddForm({ ...addForm, contractor_id: Number((e.target as HTMLSelectElement).value) || 0 })}>
                <option value="">(미지정)</option>
                {contractors.map(c => <option key={c.id} value={String(c.id)}>{c.business_name}</option>)}
              </Select>
            </Field>
            <Field label="작업허가 (선택 시 업체 자동 매칭)">
              <Select value={String(addForm.permit_id || "")} onChange={(e) => {
                const pid = Number((e.target as HTMLSelectElement).value) || 0;
                const p = permits.find(x => x.id === pid);
                setAddForm({
                  ...addForm,
                  permit_id: pid,
                  contractor_id: p ? p.contractor_id : addForm.contractor_id,
                });
              }}>
                <option value="">(미지정)</option>
                {permits.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    #{p.id} · {p.contractor_name || `id=${p.contractor_id}`} · {p.work_description.slice(0, 30)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="점검 일시">
              <Input type="datetime-local" value={addForm.inspected_at} onChange={(e) => setAddForm({ ...addForm, inspected_at: (e.target as HTMLInputElement).value })} />
            </Field>
            <Field label="점검자">
              <Input value={addForm.inspector_name} onChange={(e) => setAddForm({ ...addForm, inspector_name: (e.target as HTMLInputElement).value })} placeholder="예: 김안전 (원청) · 이수급 (수급)" />
            </Field>
          </div>
          <Field label="지적사항 (입력 시 조치티켓 자동 생성)">
            <Textarea rows={3} value={addForm.findings} onChange={(e) => setAddForm({ ...addForm, findings: (e.target as HTMLTextAreaElement).value })} placeholder="예: 안전대 미착용 1건, 화기 근처 인화물 방치" />
          </Field>
          <Field label="조치 계획">
            <Textarea rows={3} value={addForm.actions} onChange={(e) => setAddForm({ ...addForm, actions: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="사진 URL (쉼표 구분)">
            <Input value={addForm.photos} onChange={(e) => setAddForm({ ...addForm, photos: (e.target as HTMLInputElement).value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={doAdd}><Save className="w-4 h-4" /> 저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
