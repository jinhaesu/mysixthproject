"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, RefreshCw, Plus, Siren, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, Textarea, useToast, StatTile,
} from "@/components/ui";
import {
  listEmergencyDrills, createEmergencyDrill, getEmergencyDrillCoverage,
  listEmergencyManuals,
  type EmergencyDrill, type EmergencyDrillCoverage, type EmergencyManual,
} from "@/lib/api";

const KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "fire", label: "화재" },
  { value: "gas_leak", label: "냉매·가스누출" },
  { value: "blackout", label: "정전" },
  { value: "critical_incident", label: "중대재해" },
  { value: "chemical", label: "화학사고" },
  { value: "other", label: "기타" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map(o => [o.value, o.label]));

function currentHalfLabel(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const half = kst.getUTCMonth() < 6 ? 1 : 2;
  return `${y}H${half}`;
}

function todayStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function EmergencyDrillsPage() {
  const toast = useToast();
  const [drills, setDrills] = useState<EmergencyDrill[]>([]);
  const [manuals, setManuals] = useState<EmergencyManual[]>([]);
  const [coverage, setCoverage] = useState<EmergencyDrillCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [halfSel, setHalfSel] = useState(currentHalfLabel());

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    scenario_kind: "fire",
    drill_date: todayStr(),
    manual_id: 0 as number,
    location: "",
    participant_count: 0,
    participant_names: "",
    findings: "",
    improvements: "",
    photo_urls: "",
    led_by_name: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [drillsRes, manualsRes, coverageRes] = await Promise.all([
        listEmergencyDrills({}),
        listEmergencyManuals({ status: "active" }),
        getEmergencyDrillCoverage(halfSel),
      ]);
      setDrills(drillsRes.drills);
      setManuals(manualsRes.manuals);
      setCoverage(coverageRes);
    } catch (e: any) {
      toast.error(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [toast, halfSel]);

  useEffect(() => { load(); }, [load]);

  const doAdd = async () => {
    try {
      if (!addForm.drill_date) { toast.error("훈련 일자를 선택하세요."); return; }
      const res = await createEmergencyDrill({
        scenario_kind: addForm.scenario_kind,
        drill_date: addForm.drill_date,
        manual_id: addForm.manual_id || null,
        location: addForm.location || undefined,
        participant_count: Number(addForm.participant_count) || 0,
        participant_names: addForm.participant_names || undefined,
        findings: addForm.findings || undefined,
        improvements: addForm.improvements || undefined,
        photo_urls: addForm.photo_urls || undefined,
        led_by_name: addForm.led_by_name || undefined,
      });
      if (res.ticket_id) {
        toast.success(`훈련 등록 완료 · 조치티켓 #${res.ticket_id} 생성`);
      } else {
        toast.success("훈련 등록 완료");
      }
      setAddOpen(false);
      setAddForm({
        scenario_kind: "fire",
        drill_date: todayStr(),
        manual_id: 0,
        location: "",
        participant_count: 0,
        participant_names: "",
        findings: "",
        improvements: "",
        photo_urls: "",
        led_by_name: "",
      });
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        eyebrow="비상 대응 훈련"
        title="반기 훈련 실시 관리"
        description="중처법 시행령 §4-8 반기 훈련 요건. 화재·가스누출·정전·중대재해 4개 시나리오에 대해 반기 1회 이상 훈련 실시가 필요하다."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> 훈련 기록
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 flex flex-wrap items-end gap-3">
          <Field label="반기">
            <Input
              value={halfSel}
              onChange={(e) => setHalfSel((e.target as HTMLInputElement).value)}
              placeholder="예: 2026H2"
            />
          </Field>
        </div>
      </Card>

      {coverage && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatTile
            label={`반기 훈련 이행 (${coverage.period.label})`}
            value={`${coverage.completed_count} / ${coverage.required_count}`}
            unit="종"
            hint={coverage.compliant ? "필수 4개 시나리오 모두 실시 완료" : "미실시 시나리오 존재"}
            icon={coverage.compliant ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            iconTone={coverage.compliant ? "success" : "danger"}
          />
          {coverage.items.map((it) => (
            <Card key={it.scenario_kind}>
              <div className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Siren size={14} className="text-[var(--brand-400)]" />
                  <div className="font-semibold text-[var(--text-1)]">{KIND_LABEL[it.scenario_kind] || it.scenario_kind}</div>
                </div>
                <div className="text-[var(--fs-caption)] text-[var(--text-3)]">
                  {it.completed ? (
                    <span>
                      <Badge tone="success">완료</Badge>{" "}
                      {it.drill_count}회 · 최근 {it.last_drill_date || "-"}
                    </span>
                  ) : (
                    <Badge tone="danger">미실시</Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Siren size={14} className="text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">훈련 기록</h3>
            <Badge tone="neutral">{drills.length}건</Badge>
          </div>
          {loading && drills.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin inline" /> 불러오는 중…
            </div>
          ) : drills.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-3)]">등록된 훈련 기록이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">일자</th>
                    <th className="text-left py-2 pr-3">시나리오</th>
                    <th className="text-left py-2 pr-3">장소</th>
                    <th className="text-right py-2 pr-3">참여</th>
                    <th className="text-left py-2 pr-3">인솔자</th>
                    <th className="text-left py-2 pr-3">개선사항</th>
                    <th className="text-left py-2 pr-3">티켓</th>
                  </tr>
                </thead>
                <tbody>
                  {drills.map((d) => (
                    <tr key={d.id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{d.drill_date}</td>
                      <td className="py-2 pr-3">{KIND_LABEL[d.scenario_kind] || d.scenario_kind}</td>
                      <td className="py-2 pr-3 text-[var(--text-3)]">{d.location || "-"}</td>
                      <td className="py-2 pr-3 text-right tabular">{d.participant_count || 0}</td>
                      <td className="py-2 pr-3">{d.led_by_name || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] text-[var(--text-3)] line-clamp-2">{d.improvements || "-"}</td>
                      <td className="py-2 pr-3">{d.ticket_id ? <Badge tone="warning">#{d.ticket_id}</Badge> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="비상훈련 기록" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="시나리오">
              <Select value={addForm.scenario_kind} onChange={(e) => setAddForm({ ...addForm, scenario_kind: (e.target as HTMLSelectElement).value })}>
                {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="훈련 일자">
              <Input type="date" value={addForm.drill_date} onChange={(e) => setAddForm({ ...addForm, drill_date: (e.target as HTMLInputElement).value })} />
            </Field>
            <Field label="참여 매뉴얼">
              <Select
                value={String(addForm.manual_id || "")}
                onChange={(e) => setAddForm({ ...addForm, manual_id: Number((e.target as HTMLSelectElement).value) || 0 })}
              >
                <option value="">(미지정)</option>
                {manuals
                  .filter(m => m.scenario_kind === addForm.scenario_kind || !addForm.scenario_kind)
                  .map((m) => (
                    <option key={m.id} value={String(m.id)}>{m.title} v{m.version}</option>
                  ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="장소">
              <Input value={addForm.location} onChange={(e) => setAddForm({ ...addForm, location: (e.target as HTMLInputElement).value })} placeholder="예: 3층 배합실" />
            </Field>
            <Field label="참여인원">
              <Input
                type="number"
                value={addForm.participant_count}
                onChange={(e) => setAddForm({ ...addForm, participant_count: Number((e.target as HTMLInputElement).value) || 0 })}
              />
            </Field>
            <Field label="인솔자">
              <Input value={addForm.led_by_name} onChange={(e) => setAddForm({ ...addForm, led_by_name: (e.target as HTMLInputElement).value })} placeholder="예: 김안전" />
            </Field>
          </div>
          <Field label="참여자 명단 (쉼표 구분)">
            <Input value={addForm.participant_names} onChange={(e) => setAddForm({ ...addForm, participant_names: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field label="발견 사항">
            <Textarea rows={3} value={addForm.findings} onChange={(e) => setAddForm({ ...addForm, findings: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="개선 조치 (기재 시 조치티켓 자동 생성)">
            <Textarea rows={3} value={addForm.improvements} onChange={(e) => setAddForm({ ...addForm, improvements: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="사진 URL (쉼표 구분)">
            <Input value={addForm.photo_urls} onChange={(e) => setAddForm({ ...addForm, photo_urls: (e.target as HTMLInputElement).value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={doAdd}><Plus className="w-4 h-4" /> 저장</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
