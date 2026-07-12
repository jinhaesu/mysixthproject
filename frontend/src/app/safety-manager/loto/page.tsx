"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Zap, Filter, Save, Camera, Lock, CheckCircle } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  listLoto,
  createLoto,
  patchLoto,
  listSafetyAreas,
  type LotoAuthorization,
  type SafetyArea,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  requested: "1. 신청",
  energy_off: "2. 전원 차단",
  locked: "3. 잠금·표찰",
  verified: "4. 무에너지 확인",
  working: "5. 작업 중",
  released: "6. 해제 완료",
};

function statusBadge(s: string) {
  if (s === "released") return <Badge tone="success">6. 해제 완료</Badge>;
  if (s === "working") return <Badge tone="brand">5. 작업 중</Badge>;
  if (s === "verified") return <Badge tone="brand">4. 무에너지 확인</Badge>;
  if (s === "locked") return <Badge tone="warning">3. 잠금·표찰</Badge>;
  if (s === "energy_off") return <Badge tone="warning">2. 전원 차단</Badge>;
  return <Badge tone="neutral">1. 신청</Badge>;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function LotoPage() {
  const toast = useToast();
  const [items, setItems] = useState<LotoAuthorization[]>([]);
  const [areas, setAreas] = useState<SafetyArea[]>([]);
  const [summary, setSummary] = useState<{ total: number; requested: number; in_progress: number; released: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusF, setStatusF] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<LotoAuthorization | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await listSafetyAreas();
        setAreas(res.areas);
      } catch (e: any) {
        toast.error(e.message);
      }
    })();
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLoto(statusF || undefined);
      setItems(res.items);
      setSummary(res.summary);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusF, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="LOTO 작업허가"
        description="설비 정비·청소 시 잠금·표찰 6단계 절차 — ① 신청 → ② 전원 차단(사진) → ③ 잠금·표찰(사진) → ④ 무에너지 확인 → ⑤ 작업 → ⑥ 해제·시운전(사진). 산안법 시행규칙 42조·컨베이어 협착 사고 예방."
      />

      {/* Filter */}
      <Card>
        <div className="p-5 flex flex-wrap items-end gap-3">
          <Field label="상태">
            <Select value={statusF} onChange={(e) => setStatusF((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
            </Select>
          </Field>
          <Button onClick={load} variant="secondary" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            새로고침
          </Button>
          <div className="ml-auto">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> 새 LOTO 신청
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="전체" value={summary.total} tone="neutral" />
          <SummaryTile label="신청" value={summary.requested} tone="warning" />
          <SummaryTile label="진행 중" value={summary.in_progress} tone="brand" />
          <SummaryTile label="해제 완료" value={summary.released} tone="success" />
        </div>
      )}

      {/* List */}
      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">등록된 LOTO 신청이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {items.map((l) => (
                <div key={l.id} className="border border-[var(--border-1)] rounded-[var(--r-lg)] p-4 hover:bg-[var(--bg-2)]/30">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 shrink-0 mt-0.5 text-[var(--warning-fg)]" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">
                          {l.equipment_name}
                        </h4>
                        {statusBadge(l.status)}
                        {l.area_name && <Badge tone="neutral">{l.area_name}</Badge>}
                      </div>
                      <p className="text-[var(--fs-body)] text-[var(--text-2)] mt-1">{l.work_description}</p>
                      <div className="text-[var(--fs-caption)] text-[var(--text-3)] mt-2 flex flex-wrap items-center gap-3">
                        <span>작업자: {l.worker_names || "-"}</span>
                        <span>예상: {l.expected_hours}h</span>
                        <span>신청: {new Date(l.created_at).toLocaleString("ko-KR")}</span>
                        {l.released_at && <span>해제: {new Date(l.released_at).toLocaleString("ko-KR")}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setSelected(l)}>
                      진행 관리
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {createOpen && (
        <CreateModal
          areas={areas}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); }}
        />
      )}
      {selected && (
        <ProgressModal
          loto={selected}
          areas={areas}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" | "brand" }) {
  const toneClass = {
    neutral: "bg-[var(--bg-1)] border-[var(--border-1)] text-[var(--text-1)]",
    success: "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
    brand: "bg-[#5E6AD220] border-[#5E6AD244] text-[var(--brand-400)]",
  }[tone];
  return (
    <div className={`rounded-[var(--r-lg)] border p-4 ${toneClass}`}>
      <div className="text-[var(--fs-caption)] font-medium opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular mt-1">{value}</div>
    </div>
  );
}

function CreateModal({ areas, onClose, onSaved }: { areas: SafetyArea[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [equipment, setEquipment] = useState("");
  const [areaId, setAreaId] = useState("");
  const [description, setDescription] = useState("");
  const [workerNames, setWorkerNames] = useState("");
  const [expectedHours, setExpectedHours] = useState("1");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!equipment || !description) { toast.error("설비명·작업내용 필수"); return; }
    setSaving(true);
    try {
      await createLoto({
        equipment_name: equipment,
        area_id: areaId ? Number(areaId) : undefined,
        work_description: description,
        worker_names: workerNames,
        expected_hours: Number(expectedHours) || 1,
      });
      toast.success("LOTO 신청 등록");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md">
      <div>
        <div className="pb-4 border-b border-[var(--border-1)] mb-4">
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">새 LOTO 작업허가 신청</h3>
        </div>
        <div className="space-y-3">
          <Field label="설비명 *">
            <Input value={equipment} onChange={(e) => setEquipment((e.target as HTMLInputElement).value)} placeholder="예: 성형기 3호기" />
          </Field>
          <Field label="구역">
            <Select value={areaId} onChange={(e) => setAreaId((e.target as HTMLSelectElement).value)}>
              <option value="">-</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="작업 내용 *">
            <Textarea value={description} onChange={(e) => setDescription((e.target as HTMLTextAreaElement).value)} rows={3} placeholder="예: 금형 교체 · 컨베이어 롤러 청소" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="작업자 (콤마 구분)">
              <Input value={workerNames} onChange={(e) => setWorkerNames((e.target as HTMLInputElement).value)} placeholder="홍길동, 김OO" />
            </Field>
            <Field label="예상 시간 (h)">
              <Input type="number" step="0.5" value={expectedHours} onChange={(e) => setExpectedHours((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 신청</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ProgressModal({ loto, areas, onClose, onSaved }: { loto: LotoAuthorization; areas: SafetyArea[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [energyOffPhoto, setEnergyOffPhoto] = useState(loto.energy_off_photo_url);
  const [lockPhoto, setLockPhoto] = useState(loto.lock_photo_url);
  const [verifyNoEnergy, setVerifyNoEnergy] = useState<boolean>(!!loto.verify_no_energy);
  const [releasePhoto, setReleasePhoto] = useState(loto.release_photo_url);
  const [trialRunOk, setTrialRunOk] = useState<boolean>(!!loto.trial_run_ok);

  const handlePhoto = async (setter: (v: string) => void, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("사진은 5MB 이하"); return; }
    const url = await fileToDataUrl(file);
    setter(url);
  };

  const saveStep = async (body: any, label: string) => {
    setSaving(true);
    try {
      await patchLoto(loto.id, body);
      toast.success(`${label} 저장`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg">
      <div>
        <div className="pb-4 border-b border-[var(--border-1)] mb-4">
          <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--warning-fg)]" />
            LOTO #{loto.id} · {loto.equipment_name}
          </h3>
          <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">
            현재 상태: {statusBadge(loto.status)}
          </p>
        </div>
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Step 2: 전원 차단 */}
          <StepCard step={2} label="전원 차단" done={!!energyOffPhoto}>
            <PhotoField
              label="전원 차단 사진 (차단기·밸브 등)"
              value={energyOffPhoto}
              onChange={(e) => handlePhoto(setEnergyOffPhoto, e)}
            />
            {energyOffPhoto !== loto.energy_off_photo_url && (
              <Button size="sm" onClick={() => saveStep({ energy_off_photo_url: energyOffPhoto }, "전원 차단")} disabled={saving}>
                <Save className="w-3.5 h-3.5" /> Step 2 저장
              </Button>
            )}
          </StepCard>

          {/* Step 3: 잠금·표찰 */}
          <StepCard step={3} label="잠금·표찰(Lock & Tag)" done={!!lockPhoto}>
            <PhotoField
              label="잠금장치·표찰 사진"
              value={lockPhoto}
              onChange={(e) => handlePhoto(setLockPhoto, e)}
            />
            {lockPhoto !== loto.lock_photo_url && (
              <Button size="sm" onClick={() => saveStep({ lock_photo_url: lockPhoto }, "잠금·표찰")} disabled={saving}>
                <Save className="w-3.5 h-3.5" /> Step 3 저장
              </Button>
            )}
          </StepCard>

          {/* Step 4: 무에너지 확인 */}
          <StepCard step={4} label="무에너지 확인 (시운전 시도)" done={verifyNoEnergy}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={verifyNoEnergy}
                onChange={(e) => setVerifyNoEnergy(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-[var(--fs-body)] text-[var(--text-2)]">
                시운전(전원 ON 시도) 결과 무에너지 상태 확인 완료
              </span>
            </label>
            {verifyNoEnergy !== !!loto.verify_no_energy && (
              <Button size="sm" onClick={() => saveStep({ verify_no_energy: verifyNoEnergy }, "무에너지 확인")} disabled={saving}>
                <Save className="w-3.5 h-3.5" /> Step 4 저장 (→ 작업 개시)
              </Button>
            )}
          </StepCard>

          {/* Step 6: 해제 + 시운전 */}
          <StepCard step={6} label="해제·시운전 (Release)" done={!!releasePhoto && trialRunOk}>
            <PhotoField
              label="해제·시운전 사진"
              value={releasePhoto}
              onChange={(e) => handlePhoto(setReleasePhoto, e)}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={trialRunOk}
                onChange={(e) => setTrialRunOk(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-[var(--fs-body)] text-[var(--text-2)]">
                시운전 정상 (이상 신호 없음)
              </span>
            </label>
            {(releasePhoto !== loto.release_photo_url || trialRunOk !== !!loto.trial_run_ok) && (
              <Button
                size="sm"
                onClick={() => saveStep({ release_photo_url: releasePhoto, trial_run_ok: trialRunOk }, "해제")}
                disabled={saving}
              >
                <Save className="w-3.5 h-3.5" /> Step 6 저장 (해제 완료)
              </Button>
            )}
          </StepCard>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary" disabled={saving}>닫기</Button>
        </div>
      </div>
    </Modal>
  );
}

function StepCard({ step, label, done, children }: { step: number; label: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-[var(--r-md)] border p-4 space-y-3 ${done ? "border-[var(--success-border)] bg-[var(--success-bg)]/30" : "border-[var(--border-1)]"}`}>
      <div className="flex items-center gap-2">
        {done ? <CheckCircle className="w-4 h-4 text-[var(--success-fg)]" /> : <Lock className="w-4 h-4 text-[var(--text-3)]" />}
        <p className="font-medium text-[var(--text-1)]">Step {step} · {label}</p>
      </div>
      {children}
    </div>
  );
}

function PhotoField({ label, value, onChange }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer hover:bg-[var(--bg-2)] w-fit">
        <Camera className="w-4 h-4 text-[var(--text-3)]" />
        <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{value ? `${label} 교체` : `${label} 업로드`}</span>
        <input type="file" accept="image/*" className="hidden" onChange={onChange} />
      </label>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} className="mt-2 max-h-40 rounded-[var(--r-md)] border border-[var(--border-1)]" />
      )}
    </div>
  );
}
