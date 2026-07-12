"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, Plus, FileText, CheckCircle2, PenLine, Send, Archive,
  Users, TrendingUp, Award,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, useToast,
} from "@/components/ui";
import {
  listPolicyDocuments, createPolicy, publishPolicy, archivePolicy,
  getPolicyCompliance,
  type PolicyDocument,
} from "@/lib/api";

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "policy", label: "경영방침" },
  { value: "goal", label: "연간 목표" },
  { value: "regulation", label: "안전보건관리규정" },
  { value: "manual", label: "매뉴얼" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "published", label: "발행중" },
  { value: "archived", label: "보관" },
];

const TARGET_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "전 임직원" },
  { value: "production", label: "생산·물류" },
  { value: "cafe", label: "카페" },
  { value: "office", label: "사무직" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
);

const TARGET_ROLE_LABEL: Record<string, string> = Object.fromEntries(
  TARGET_ROLE_OPTIONS.map(o => [o.value, o.label])
);

function statusBadge(status: string) {
  if (status === "published") return <Badge tone="success">발행중</Badge>;
  if (status === "archived") return <Badge tone="neutral">보관</Badge>;
  return <Badge tone="warning">초안</Badge>;
}

export default function PolicyManagementPage() {
  const toast = useToast();
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    kind: "policy",
    title: "",
    version: "1.0",
    target_role: "all",
  });

  // 확인율 매핑 (published 문서만)
  const [complianceMap, setComplianceMap] = useState<Record<number, { rate: number; done: number; total: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPolicyDocuments({
        kind: kindFilter || undefined,
        status: statusFilter || undefined,
      });
      setDocuments(res.documents);
      // published 문서에 한해 확인율 fetch
      const published = res.documents.filter((d) => d.status === "published");
      const results = await Promise.all(published.map(async (d) => {
        try {
          const c = await getPolicyCompliance(d.id);
          return { id: d.id, rate: c.summary.rate_pct, done: c.summary.acknowledged_count, total: c.summary.target_total };
        } catch { return null; }
      }));
      const map: Record<number, { rate: number; done: number; total: number }> = {};
      for (const r of results) if (r) map[r.id] = { rate: r.rate, done: r.done, total: r.total };
      setComplianceMap(map);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [kindFilter, statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const groupedByKind = useMemo(() => {
    const g: Record<string, PolicyDocument[]> = {};
    for (const d of documents) {
      (g[d.kind] || (g[d.kind] = [])).push(d);
    }
    return g;
  }, [documents]);

  const doAdd = async () => {
    try {
      if (!addForm.title.trim()) { toast.error("제목을 입력하세요."); return; }
      const res = await createPolicy({
        kind: addForm.kind,
        title: addForm.title.trim(),
        version: addForm.version || "1.0",
        target_role: addForm.target_role,
      });
      toast.success("문서 초안 생성 완료");
      setAddOpen(false);
      setAddForm({ kind: "policy", title: "", version: "1.0", target_role: "all" });
      window.location.href = `/admin/policy-management/edit?id=${res.id}`;
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doPublish = async (d: PolicyDocument) => {
    if (!confirm(`"${d.title}" 문서를 발행하시겠습니까?\n같은 분류의 기존 발행 문서는 자동으로 보관 처리됩니다.`)) return;
    try {
      await publishPolicy(d.id, {});
      toast.success("발행 완료");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doArchive = async (d: PolicyDocument) => {
    if (!confirm(`"${d.title}" 문서를 보관 처리하시겠습니까?`)) return;
    try {
      await archivePolicy(d.id);
      toast.success("보관 완료");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전보건 방침·규정 문서"
        title="경영방침·목표·규정·매뉴얼 관리"
        description="중처법 시행령 §4-1 이행 증빙. 대표이사가 승인·발행하고 근로자가 온라인으로 확인 서명한다."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> 신규 문서
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="분류">
            <Select value={kindFilter} onChange={(e) => setKindFilter((e.target as HTMLSelectElement).value)}>
              {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="상태">
            <Select value={statusFilter} onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value)}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          {loading && documents.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">등록된 문서가 없습니다.</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByKind).map(([kind, list]) => (
                <div key={kind}>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-[var(--brand-400)]" />
                    <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
                      {KIND_LABEL[kind] || kind}
                    </h3>
                    <Badge tone="neutral">{list.length}건</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map((d) => {
                      const comp = complianceMap[d.id];
                      return (
                        <Card key={d.id}>
                          <div className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="font-semibold text-[var(--text-1)] truncate">{d.title}</div>
                                  {statusBadge(d.status)}
                                </div>
                                <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>v{d.version}</span>
                                  <span>대상: {TARGET_ROLE_LABEL[d.target_role] || d.target_role}</span>
                                  {d.effective_from && <span>발효 {d.effective_from}</span>}
                                  {d.ceo_signature_name && <span>서명 {d.ceo_signature_name}</span>}
                                </div>
                              </div>
                            </div>
                            {d.status === "published" && (
                              <div className="flex items-center gap-2 text-[var(--fs-caption)]">
                                <TrendingUp size={12} className="text-[var(--brand-400)]" />
                                <span className="text-[var(--text-2)]">
                                  확인율 {comp ? `${comp.rate}% (${comp.done}/${comp.total})` : "…"}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-end gap-2 pt-1">
                              <Link href={`/admin/policy-management/edit?id=${d.id}`}>
                                <Button variant="secondary" size="xs">
                                  <PenLine className="w-3.5 h-3.5" /> 편집
                                </Button>
                              </Link>
                              {d.status === "draft" && (
                                <Button size="xs" onClick={() => doPublish(d)}>
                                  <Send className="w-3.5 h-3.5" /> 발행
                                </Button>
                              )}
                              {d.status === "published" && (
                                <>
                                  <Badge tone="success">
                                    <Award size={11} className="inline mr-0.5" /> 발행중
                                  </Badge>
                                  <Button variant="secondary" size="xs" onClick={() => doArchive(d)}>
                                    <Archive className="w-3.5 h-3.5" /> 보관
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="신규 문서 초안" size="md">
        <div className="space-y-3">
          <Field label="분류">
            <Select value={addForm.kind} onChange={(e) => setAddForm({ ...addForm, kind: (e.target as HTMLSelectElement).value })}>
              {KIND_OPTIONS.filter(o => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="제목">
            <Input value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: (e.target as HTMLInputElement).value })} placeholder="예: 안전보건 경영방침 (2026)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="버전">
              <Input value={addForm.version} onChange={(e) => setAddForm({ ...addForm, version: (e.target as HTMLInputElement).value })} placeholder="1.0" />
            </Field>
            <Field label="대상">
              <Select value={addForm.target_role} onChange={(e) => setAddForm({ ...addForm, target_role: (e.target as HTMLSelectElement).value })}>
                {TARGET_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={doAdd}><Plus className="w-4 h-4" /> 생성</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
