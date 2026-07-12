"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Plus, Save, PiggyBank, Wallet, AlertTriangle,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast, StatTile,
} from "@/components/ui";
import {
  listSafetyBudgetPlans, patchSafetyBudgetPlan, createSafetyBudgetPlan,
  type SafetyBudgetPlan,
} from "@/lib/api";
import Link from "next/link";

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ppe", label: "보호구" },
  { value: "training", label: "교육" },
  { value: "facility", label: "설비개선" },
  { value: "checkup", label: "검진" },
  { value: "consulting", label: "전문가 자문" },
  { value: "other", label: "기타" },
];

function fmtKRW(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toLocaleString("ko-KR");
}

export default function SafetyBudgetPlansPage() {
  const toast = useToast();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [plans, setPlans] = useState<SafetyBudgetPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<number, { planned_amount: number; notes: string }>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    category: "consulting",
    category_label: "전문가 자문",
    planned_amount: 0,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSafetyBudgetPlans(year);
      setPlans(res.plans);
      // draft 초기화
      const nextDraft: Record<number, { planned_amount: number; notes: string }> = {};
      for (const p of res.plans) {
        nextDraft[p.id] = { planned_amount: Number(p.planned_amount) || 0, notes: p.notes || "" };
      }
      setDraft(nextDraft);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [year, toast]);

  useEffect(() => { load(); }, [load]);

  const doSave = async (p: SafetyBudgetPlan) => {
    const d = draft[p.id];
    if (!d) return;
    setSaving((s) => ({ ...s, [p.id]: true }));
    try {
      await patchSafetyBudgetPlan(p.id, {
        planned_amount: Math.max(0, Math.round(Number(d.planned_amount) || 0)),
        notes: d.notes,
      });
      toast.success(`${p.category_label} 편성 저장`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving((s) => ({ ...s, [p.id]: false }));
    }
  };

  const doAdd = async () => {
    try {
      if (!addForm.category) { toast.error("카테고리 선택"); return; }
      await createSafetyBudgetPlan({
        year,
        category: addForm.category,
        category_label: addForm.category_label || undefined,
        planned_amount: addForm.planned_amount,
        notes: addForm.notes || undefined,
      });
      toast.success("편성 추가 완료");
      setAddOpen(false);
      setAddForm({ category: "consulting", category_label: "전문가 자문", planned_amount: 0, notes: "" });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const totalPlanned = plans.reduce((s, p) => s + (Number(p.planned_amount) || 0), 0);
  const missingCategories = CATEGORY_OPTIONS
    .filter((c) => c.value !== "consulting")
    .filter((c) => !plans.some((p) => p.category === c.value));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전보건 예산 (§4-4)"
        title="연간 예산 편성"
        description="중처법 시행령 §4-4 안전보건 예산 편성·집행. 연도·카테고리별 계획 금액을 등록하면 집행률 대시보드에서 자동 결산된다."
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
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> 카테고리 추가
            </Button>
            <Link href="/admin/safety-budget/dashboard">
              <Button variant="secondary"><PiggyBank className="w-4 h-4" /> 대시보드</Button>
            </Link>
            <Link href="/admin/safety-budget/execution">
              <Button variant="secondary"><Wallet className="w-4 h-4" /> 집행 등록</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatTile
          label={`${year} 총 편성액`}
          value={fmtKRW(totalPlanned)}
          unit="원"
          hint={`${plans.length}개 카테고리 편성`}
          icon={<PiggyBank size={14} />}
          iconTone="brand"
        />
        <StatTile
          label="필수 카테고리 등록"
          value={`${5 - missingCategories.length} / 5`}
          unit=""
          hint={
            missingCategories.length > 0
              ? `누락: ${missingCategories.map((c) => c.label).join(", ")}`
              : "보호구·교육·설비·검진·기타 모두 등록됨"
          }
          icon={<AlertTriangle size={14} />}
          iconTone={missingCategories.length > 0 ? "warning" : "success"}
        />
        <StatTile
          label="편집 안내"
          value={"금액 · 비고"}
          unit=""
          hint="테이블 내 인라인 편집 후 저장 버튼으로 반영"
          icon={<Save size={14} />}
          iconTone="neutral"
        />
      </div>

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <PiggyBank className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
              {year} 카테고리별 편성
            </h3>
          </div>

          {loading && plans.length === 0 && (
            <div className="text-center text-[var(--text-3)] py-6">
              <Loader2 className="w-5 h-5 animate-spin inline" /> 불러오는 중…
            </div>
          )}

          {!loading && plans.length === 0 && (
            <div className="text-center text-[var(--text-3)] py-6">
              해당 연도의 편성 계획이 없습니다. "카테고리 추가" 로 등록하세요.
            </div>
          )}

          {plans.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[var(--fs-body)]">
                <thead className="text-[var(--fs-caption)] text-[var(--text-3)] border-b border-[var(--border-1)]">
                  <tr>
                    <th className="text-left px-3 py-2 w-32">카테고리</th>
                    <th className="text-left px-3 py-2 w-40">표시명</th>
                    <th className="text-right px-3 py-2 w-52">편성 금액 (원)</th>
                    <th className="text-left px-3 py-2">비고</th>
                    <th className="text-center px-3 py-2 w-24">저장</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => {
                    const d = draft[p.id] || { planned_amount: 0, notes: "" };
                    const changed =
                      d.planned_amount !== Number(p.planned_amount) ||
                      d.notes !== (p.notes || "");
                    return (
                      <tr key={p.id} className="border-t border-[var(--border-1)]">
                        <td className="px-3 py-2">
                          <Badge tone="brand">{p.category}</Badge>
                        </td>
                        <td className="px-3 py-2 font-medium text-[var(--text-1)]">
                          {p.category_label}
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          <Input
                            type="number"
                            min={0}
                            step={10000}
                            value={d.planned_amount}
                            onChange={(e) =>
                              setDraft((s) => ({
                                ...s,
                                [p.id]: { ...d, planned_amount: Number((e.target as HTMLInputElement).value) || 0 },
                              }))
                            }
                            className="text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={d.notes}
                            onChange={(e) =>
                              setDraft((s) => ({
                                ...s,
                                [p.id]: { ...d, notes: (e.target as HTMLInputElement).value },
                              }))
                            }
                            placeholder="비고"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            size="xs"
                            onClick={() => doSave(p)}
                            disabled={!changed || saving[p.id]}
                          >
                            {saving[p.id]
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Save className="w-3.5 h-3.5" />}
                            {" "}저장
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[var(--border-2)] font-semibold">
                    <td className="px-3 py-2" colSpan={2}>합계</td>
                    <td className="px-3 py-2 text-right tabular">
                      {fmtKRW(
                        Object.values(draft).reduce((s, d) => s + (Number(d.planned_amount) || 0), 0)
                      )}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* 카테고리 추가 모달 */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="예산 카테고리 추가" size="md">
        <div className="space-y-3">
          <Field label="카테고리">
            <Select
              value={addForm.category}
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                const opt = CATEGORY_OPTIONS.find((o) => o.value === v);
                setAddForm({
                  ...addForm,
                  category: v,
                  category_label: opt?.label || addForm.category_label,
                });
              }}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({o.value})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="표시명">
            <Input
              value={addForm.category_label}
              onChange={(e) =>
                setAddForm({ ...addForm, category_label: (e.target as HTMLInputElement).value })
              }
              placeholder="예: 보호구"
            />
          </Field>
          <Field label="편성 금액 (원)">
            <Input
              type="number"
              min={0}
              step={10000}
              value={addForm.planned_amount}
              onChange={(e) =>
                setAddForm({
                  ...addForm,
                  planned_amount: Number((e.target as HTMLInputElement).value) || 0,
                })
              }
            />
          </Field>
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
            <Button onClick={doAdd}><Plus className="w-4 h-4" /> 추가</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
