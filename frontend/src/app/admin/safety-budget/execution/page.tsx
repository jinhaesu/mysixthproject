"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2, RefreshCw, Plus, Save, Wallet, PiggyBank, Trash2, FileText, ExternalLink,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast, StatTile,
} from "@/components/ui";
import {
  listSafetyBudgetPlans, listSafetyBudgetExecutions,
  createSafetyBudgetExecution, patchSafetyBudgetExecution, deleteSafetyBudgetExecution,
  type SafetyBudgetPlan, type SafetyBudgetExecution,
} from "@/lib/api";

function fmtKRW(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR");
}

function todayStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function SafetyBudgetExecutionPage() {
  const toast = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [category, setCategory] = useState<string>("");
  const [plans, setPlans] = useState<SafetyBudgetPlan[]>([]);
  const [executions, setExecutions] = useState<SafetyBudgetExecution[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    budget_plan_id: 0,
    executed_at: todayStr(),
    amount: 0,
    description: "",
    receipt_url: "",
    vendor: "",
    executor_name: "",
    approved_by_name: "",
    linked_to_ticket_id: "" as string | number,
    notes: "",
  });

  const [editing, setEditing] = useState<SafetyBudgetExecution | null>(null);
  const [editForm, setEditForm] = useState({
    executed_at: "",
    amount: 0,
    description: "",
    receipt_url: "",
    vendor: "",
    executor_name: "",
    approved_by_name: "",
    linked_to_ticket_id: "" as string | number,
    notes: "",
  });

  const loadPlans = useCallback(async () => {
    try {
      const res = await listSafetyBudgetPlans(year);
      setPlans(res.plans);
    } catch (e: any) {
      toast.error(e.message || "편성 로드 실패");
    }
  }, [year, toast]);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSafetyBudgetExecutions({
        year,
        category: category || undefined,
      });
      setExecutions(res.executions);
    } catch (e: any) {
      toast.error(e.message || "집행 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [year, category, toast]);

  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { loadExecutions(); }, [loadExecutions]);

  const openAdd = () => {
    setAddForm({
      budget_plan_id: plans[0]?.id || 0,
      executed_at: todayStr(),
      amount: 0,
      description: "",
      receipt_url: "",
      vendor: "",
      executor_name: "",
      approved_by_name: "",
      linked_to_ticket_id: "",
      notes: "",
    });
    setAddOpen(true);
  };

  const doAdd = async () => {
    try {
      if (!addForm.budget_plan_id) { toast.error("편성 카테고리 선택"); return; }
      if (!addForm.executed_at) { toast.error("집행일 필요"); return; }
      if (!addForm.amount || addForm.amount <= 0) { toast.error("금액은 0 초과"); return; }
      if (!addForm.description) { toast.error("내역 필요"); return; }
      await createSafetyBudgetExecution({
        budget_plan_id: Number(addForm.budget_plan_id),
        executed_at: addForm.executed_at,
        amount: Math.round(Number(addForm.amount) || 0),
        description: addForm.description,
        receipt_url: addForm.receipt_url || undefined,
        vendor: addForm.vendor || undefined,
        executor_name: addForm.executor_name || undefined,
        approved_by_name: addForm.approved_by_name || undefined,
        linked_to_ticket_id: addForm.linked_to_ticket_id === ""
          ? null
          : Number(addForm.linked_to_ticket_id) || null,
        notes: addForm.notes || undefined,
      });
      toast.success("집행 등록 완료");
      setAddOpen(false);
      await loadExecutions();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const openEdit = (e: SafetyBudgetExecution) => {
    setEditing(e);
    setEditForm({
      executed_at: e.executed_at || "",
      amount: Number(e.amount) || 0,
      description: e.description || "",
      receipt_url: e.receipt_url || "",
      vendor: e.vendor || "",
      executor_name: e.executor_name || "",
      approved_by_name: e.approved_by_name || "",
      linked_to_ticket_id: e.linked_to_ticket_id ?? "",
      notes: e.notes || "",
    });
  };

  const doSaveEdit = async () => {
    if (!editing) return;
    try {
      await patchSafetyBudgetExecution(editing.id, {
        executed_at: editForm.executed_at,
        amount: Math.round(Number(editForm.amount) || 0),
        description: editForm.description,
        receipt_url: editForm.receipt_url,
        vendor: editForm.vendor,
        executor_name: editForm.executor_name,
        approved_by_name: editForm.approved_by_name,
        linked_to_ticket_id: editForm.linked_to_ticket_id === ""
          ? null
          : Number(editForm.linked_to_ticket_id) || null,
        notes: editForm.notes,
      });
      toast.success("저장 완료");
      setEditing(null);
      await loadExecutions();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doDelete = async (id: number) => {
    if (!confirm("이 집행 기록을 삭제할까요?")) return;
    try {
      await deleteSafetyBudgetExecution(id);
      toast.success("삭제 완료");
      await loadExecutions();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const totalExecuted = useMemo(
    () => executions.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [executions]
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전보건 예산 (§4-4)"
        title="예산 집행 등록·목록"
        description="편성된 카테고리별 예산에 실제 지출을 등록. 영수증 URL·벤더·집행자·승인자와 조치 티켓 연결 지원."
        actions={
          <div className="flex gap-2">
            <Select
              value={String(year)}
              onChange={(e) => setYear(Number((e.target as HTMLSelectElement).value))}
              className="w-28"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </Select>
            <Select
              value={category}
              onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}
              className="w-40"
            >
              <option value="">전체 카테고리</option>
              {plans.map((p) => (
                <option key={p.id} value={p.category}>{p.category_label}</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={loadExecutions} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={openAdd}><Plus className="w-4 h-4" /> 집행 등록</Button>
            <Link href="/admin/safety-budget">
              <Button variant="secondary"><PiggyBank className="w-4 h-4" /> 편성</Button>
            </Link>
            <Link href="/admin/safety-budget/dashboard">
              <Button variant="secondary"><Wallet className="w-4 h-4" /> 대시보드</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile
          label={`${year} 필터 집행합계`}
          value={fmtKRW(totalExecuted)}
          unit="원"
          hint={`${executions.length}건 (카테고리 ${category ? plans.find(p=>p.category===category)?.category_label || category : "전체"})`}
          icon={<Wallet size={14} />}
          iconTone="brand"
        />
        <StatTile
          label="영수증 첨부율"
          value={
            executions.length > 0
              ? `${Math.round((executions.filter(e => (e.receipt_url || "").trim() !== "").length / executions.length) * 100)}%`
              : "-"
          }
          unit=""
          hint="URL 또는 파일 링크 등록 기준"
          icon={<FileText size={14} />}
          iconTone="neutral"
        />
        <StatTile
          label="조치 티켓 연결"
          value={`${executions.filter(e => !!e.linked_to_ticket_id).length}건`}
          unit=""
          hint="위험요인·순회지적 처리 지출 링크"
          icon={<ExternalLink size={14} />}
          iconTone="brand"
        />
      </div>

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">집행 목록</h3>
          </div>

          {loading && executions.length === 0 && (
            <div className="text-center text-[var(--text-3)] py-6">
              <Loader2 className="w-5 h-5 animate-spin inline" /> 불러오는 중…
            </div>
          )}
          {!loading && executions.length === 0 && (
            <div className="text-center text-[var(--text-3)] py-6">집행 내역이 없습니다.</div>
          )}

          {executions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="text-[var(--fs-caption)] text-[var(--text-3)] border-b border-[var(--border-1)]">
                  <tr>
                    <th className="text-left px-3 py-2 w-24">집행일</th>
                    <th className="text-left px-3 py-2 w-32">카테고리</th>
                    <th className="text-left px-3 py-2">내역</th>
                    <th className="text-right px-3 py-2 w-28">금액(원)</th>
                    <th className="text-left px-3 py-2 w-28">벤더</th>
                    <th className="text-left px-3 py-2 w-24">영수증</th>
                    <th className="text-left px-3 py-2 w-20">티켓</th>
                    <th className="text-center px-3 py-2 w-32">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--border-1)]">
                      <td className="px-3 py-2 tabular whitespace-nowrap">{e.executed_at}</td>
                      <td className="px-3 py-2">
                        <Badge tone="brand">{e.category_label || e.category}</Badge>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-1)]">{e.description}</td>
                      <td className="px-3 py-2 text-right tabular">{fmtKRW(e.amount)}</td>
                      <td className="px-3 py-2 text-[var(--text-3)]">{e.vendor || "-"}</td>
                      <td className="px-3 py-2">
                        {(e.receipt_url || "").trim() ? (
                          <a
                            href={e.receipt_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[var(--brand-400)] hover:underline"
                          >
                            <ExternalLink size={12} /> 열기
                          </a>
                        ) : (
                          <span className="text-[var(--text-3)]">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-3)] tabular">
                        {e.linked_to_ticket_id ? `#${e.linked_to_ticket_id}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex gap-1">
                          <Button size="xs" variant="secondary" onClick={() => openEdit(e)}>
                            편집
                          </Button>
                          <Button size="xs" variant="danger" onClick={() => doDelete(e.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--border-2)] font-semibold">
                    <td colSpan={3} className="px-3 py-2">합계</td>
                    <td className="px-3 py-2 text-right tabular">{fmtKRW(totalExecuted)}</td>
                    <td colSpan={4} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* 추가 모달 */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="예산 집행 등록" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="편성 카테고리">
              <Select
                value={String(addForm.budget_plan_id)}
                onChange={(e) =>
                  setAddForm({ ...addForm, budget_plan_id: Number((e.target as HTMLSelectElement).value) })
                }
              >
                <option value="0">(선택)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.category_label} ({fmtKRW(p.planned_amount)}원 편성)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="집행일 (YYYY-MM-DD)">
              <Input
                type="date"
                value={addForm.executed_at}
                onChange={(e) =>
                  setAddForm({ ...addForm, executed_at: (e.target as HTMLInputElement).value })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="금액 (원)">
              <Input
                type="number"
                min={0}
                step={1000}
                value={addForm.amount}
                onChange={(e) =>
                  setAddForm({ ...addForm, amount: Number((e.target as HTMLInputElement).value) || 0 })
                }
              />
            </Field>
            <Field label="벤더/거래처">
              <Input
                value={addForm.vendor}
                onChange={(e) =>
                  setAddForm({ ...addForm, vendor: (e.target as HTMLInputElement).value })
                }
                placeholder="예: 세이프코리아"
              />
            </Field>
          </div>
          <Field label="내역 (필수)">
            <Input
              value={addForm.description}
              onChange={(e) =>
                setAddForm({ ...addForm, description: (e.target as HTMLInputElement).value })
              }
              placeholder="예: 안전화 20족, 방진마스크 100매 구매"
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="집행자">
              <Input
                value={addForm.executor_name}
                onChange={(e) =>
                  setAddForm({ ...addForm, executor_name: (e.target as HTMLInputElement).value })
                }
                placeholder="이름 또는 이메일"
              />
            </Field>
            <Field label="승인자">
              <Input
                value={addForm.approved_by_name}
                onChange={(e) =>
                  setAddForm({ ...addForm, approved_by_name: (e.target as HTMLInputElement).value })
                }
                placeholder="이름 또는 이메일"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="영수증 URL">
              <Input
                value={addForm.receipt_url}
                onChange={(e) =>
                  setAddForm({ ...addForm, receipt_url: (e.target as HTMLInputElement).value })
                }
                placeholder="https://... (구글드라이브·SNS 링크 등)"
              />
            </Field>
            <Field label="연결 조치 티켓 ID (선택)">
              <Input
                type="number"
                value={addForm.linked_to_ticket_id}
                onChange={(e) =>
                  setAddForm({
                    ...addForm,
                    linked_to_ticket_id: (e.target as HTMLInputElement).value,
                  })
                }
                placeholder="예: 123"
              />
            </Field>
          </div>
          <Field label="비고">
            <Textarea
              rows={3}
              value={addForm.notes}
              onChange={(e) =>
                setAddForm({ ...addForm, notes: (e.target as HTMLTextAreaElement).value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={doAdd}><Plus className="w-4 h-4" /> 등록</Button>
          </div>
        </div>
      </Modal>

      {/* 편집 모달 */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.category_label || editing.category} 집행 편집` : ""}
        size="lg"
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="집행일">
                <Input
                  type="date"
                  value={editForm.executed_at}
                  onChange={(e) =>
                    setEditForm({ ...editForm, executed_at: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field label="금액 (원)">
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm({ ...editForm, amount: Number((e.target as HTMLInputElement).value) || 0 })
                  }
                />
              </Field>
            </div>
            <Field label="내역">
              <Input
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: (e.target as HTMLInputElement).value })
                }
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="벤더">
                <Input
                  value={editForm.vendor}
                  onChange={(e) =>
                    setEditForm({ ...editForm, vendor: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field label="영수증 URL">
                <Input
                  value={editForm.receipt_url}
                  onChange={(e) =>
                    setEditForm({ ...editForm, receipt_url: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="집행자">
                <Input
                  value={editForm.executor_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, executor_name: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field label="승인자">
                <Input
                  value={editForm.approved_by_name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, approved_by_name: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
              <Field label="연결 티켓 ID">
                <Input
                  type="number"
                  value={editForm.linked_to_ticket_id}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      linked_to_ticket_id: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </Field>
            </div>
            <Field label="비고">
              <Textarea
                rows={3}
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm({ ...editForm, notes: (e.target as HTMLTextAreaElement).value })
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>취소</Button>
              <Button onClick={doSaveEdit}><Save className="w-4 h-4" /> 저장</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
