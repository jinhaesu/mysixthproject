"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, Plus, BookMarked, CheckCircle2, PenLine, Send, ExternalLink,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, useToast,
} from "@/components/ui";
import {
  listEmergencyManuals, createEmergencyManual, publishEmergencyManual,
  type EmergencyManual,
} from "@/lib/api";

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "fire", label: "화재" },
  { value: "gas_leak", label: "냉매·가스누출" },
  { value: "blackout", label: "정전" },
  { value: "critical_incident", label: "중대재해" },
  { value: "chemical", label: "화학사고" },
  { value: "other", label: "기타" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "active", label: "발효중" },
  { value: "superseded", label: "폐지" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.filter(o => o.value).map(o => [o.value, o.label])
);

function statusBadge(status: string) {
  if (status === "active") return <Badge tone="success">발효중</Badge>;
  if (status === "superseded") return <Badge tone="neutral">폐지</Badge>;
  return <Badge tone="warning">초안</Badge>;
}

export default function EmergencyManualsPage() {
  const toast = useToast();
  const [manuals, setManuals] = useState<EmergencyManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    scenario_kind: "fire",
    title: "",
    version: "1.0",
    effective_from: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listEmergencyManuals({
        kind: kindFilter || undefined,
        status: statusFilter || undefined,
      });
      setManuals(res.manuals);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [kindFilter, statusFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const groupedByKind = useMemo(() => {
    const g: Record<string, EmergencyManual[]> = {};
    for (const m of manuals) {
      (g[m.scenario_kind] || (g[m.scenario_kind] = [])).push(m);
    }
    return g;
  }, [manuals]);

  const doAdd = async () => {
    try {
      if (!addForm.title.trim()) { toast.error("제목을 입력하세요."); return; }
      const res = await createEmergencyManual({
        scenario_kind: addForm.scenario_kind,
        title: addForm.title.trim(),
        version: addForm.version || "1.0",
        effective_from: addForm.effective_from || undefined,
      });
      toast.success("매뉴얼 초안 생성 완료");
      setAddOpen(false);
      setAddForm({ scenario_kind: "fire", title: "", version: "1.0", effective_from: "" });
      window.location.href = `/admin/emergency-manuals/edit?id=${res.id}`;
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doPublish = async (m: EmergencyManual) => {
    if (!confirm(`"${m.title}" 매뉴얼을 발효 상태로 게시하시겠습니까?\n같은 시나리오의 기존 발효 매뉴얼은 자동 폐지됩니다.`)) return;
    try {
      await publishEmergencyManual(m.id, {});
      toast.success("발효 완료");
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="비상 대응 매뉴얼"
        title="중대재해 대비 매뉴얼"
        description="중처법 시행령 §4-8 이행 증빙. 시나리오별(화재·가스누출·정전·중대재해·화학사고) 매뉴얼을 관리하고, 근로자·수급인 대상 반기 훈련의 기준 문서로 사용한다."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> 신규 매뉴얼
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="시나리오">
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
          {loading && manuals.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
            </div>
          ) : manuals.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">등록된 매뉴얼이 없습니다.</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedByKind).map(([kind, list]) => (
                <div key={kind}>
                  <div className="flex items-center gap-2 mb-2">
                    <BookMarked size={14} className="text-[var(--brand-400)]" />
                    <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
                      {KIND_LABEL[kind] || kind}
                    </h3>
                    <Badge tone="neutral">{list.length}건</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map((m) => (
                      <Card key={m.id}>
                        <div className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-semibold text-[var(--text-1)] truncate">{m.title}</div>
                                {statusBadge(m.status)}
                              </div>
                              <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5">
                                v{m.version}{m.effective_from ? ` · 발효 ${m.effective_from}` : ""}
                              </div>
                            </div>
                          </div>
                          {m.attachment_url && (
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--fs-caption)] text-[var(--brand-400)] hover:underline"
                            >
                              <ExternalLink size={11} /> 첨부
                            </a>
                          )}
                          <div className="flex justify-end gap-2 pt-1">
                            <Link href={`/admin/emergency-manuals/edit?id=${m.id}`}>
                              <Button variant="secondary" size="xs">
                                <PenLine className="w-3.5 h-3.5" /> 편집
                              </Button>
                            </Link>
                            {m.status === "draft" && (
                              <Button size="xs" onClick={() => doPublish(m)}>
                                <Send className="w-3.5 h-3.5" /> 발효
                              </Button>
                            )}
                            {m.status === "active" && (
                              <Badge tone="success"><CheckCircle2 size={11} className="inline mr-0.5" /> 발효중</Badge>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="신규 매뉴얼 초안" size="md">
        <div className="space-y-3">
          <Field label="시나리오">
            <Select value={addForm.scenario_kind} onChange={(e) => setAddForm({ ...addForm, scenario_kind: (e.target as HTMLSelectElement).value })}>
              {KIND_OPTIONS.filter(o => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="제목">
            <Input value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: (e.target as HTMLInputElement).value })} placeholder="예: 화재 대응 매뉴얼 (v2.0)" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="버전">
              <Input value={addForm.version} onChange={(e) => setAddForm({ ...addForm, version: (e.target as HTMLInputElement).value })} placeholder="1.0" />
            </Field>
            <Field label="발효일 (게시 시 자동 채움)">
              <Input type="date" value={addForm.effective_from} onChange={(e) => setAddForm({ ...addForm, effective_from: (e.target as HTMLInputElement).value })} />
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
