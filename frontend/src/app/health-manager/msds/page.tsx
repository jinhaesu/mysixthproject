"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Plus, ClipboardList, Camera } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Textarea,
  Modal,
  useToast,
} from "@/components/ui";
import {
  listMsds,
  createMsds,
  patchMsds,
  type MsdsEntry,
} from "@/lib/api";

const STATUS_OPTIONS: Array<[string, string, "success" | "warning" | "danger" | "brand"]> = [
  ["pending", "게시·라벨링 필요", "warning"],
  ["training_needed", "교육 미실시", "warning"],
  ["compliant", "완비", "success"],
  ["review", "재점검 필요", "danger"],
];
function statusBadge(s: string) {
  const entry = STATUS_OPTIONS.find(([code]) => code === s);
  if (!entry) return <Badge tone="neutral">{s || "-"}</Badge>;
  return <Badge tone={entry[2]}>{entry[1]}</Badge>;
}

export default function MsdsPage() {
  const toast = useToast();
  const [items, setItems] = useState<MsdsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MsdsEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMsds(status || undefined);
      setItems(res.msds);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="보건관리자 점검"
        title="MSDS 관리대장"
        description="물질안전보건자료(MSDS) 게시·라벨·교육·PPE 매트릭스 대장. 화학물질관리법·산업안전보건법 제110~114조."
      />

      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="상태 필터">
            <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
              <option value="">전체</option>
              {STATUS_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4" /> 새 물질 등록
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">등록된 물질 ({items.length})</h3>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-3)]">등록된 MSDS가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">물질명</th>
                    <th className="text-left py-2 pr-3">용도</th>
                    <th className="text-left py-2 pr-3">취급 부서</th>
                    <th className="text-left py-2 pr-3">보관 위치</th>
                    <th className="text-left py-2 pr-3">필수 PPE</th>
                    <th className="text-left py-2 pr-3">교육 완료</th>
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-1)]">
                      <td className="py-2 pr-3 font-medium">{r.material_name}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)] truncate max-w-xs">{r.usage_description || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.handling_dept || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.handling_location || "-"}</td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{r.required_ppe || "-"}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-3)]">
                        {r.training_completed_at ? new Date(r.training_completed_at).toLocaleDateString("ko-KR") : "-"}
                      </td>
                      <td className="py-2 pr-3">{statusBadge(r.status)}</td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => setEditing(r)}
                          className="text-[var(--brand-500)] hover:text-[var(--brand-400)] text-[var(--fs-caption)] underline"
                        >
                          편집
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {creating && (
        <MsdsFormModal
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {editing && (
        <MsdsFormModal
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function MsdsFormModal({ entry, onClose, onSaved }: { entry?: MsdsEntry; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(entry?.material_name || "");
  const [usage, setUsage] = useState(entry?.usage_description || "");
  const [dept, setDept] = useState(entry?.handling_dept || "");
  const [loc, setLoc] = useState(entry?.handling_location || "");
  const [ppe, setPpe] = useState(entry?.required_ppe || "");
  const [posted, setPosted] = useState(entry?.posted_photo_url || "");
  const [label, setLabel] = useState(entry?.container_label_photo_url || "");
  const [trainedAt, setTrainedAt] = useState(entry?.training_completed_at ? entry.training_completed_at.slice(0, 10) : "");
  const [status, setStatus] = useState(entry?.status || "pending");
  const [saving, setSaving] = useState(false);

  const handleImg = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("사진은 5MB 이하만 첨부 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("물질명 필수"); return; }
    setSaving(true);
    try {
      const body = {
        material_name: name,
        usage_description: usage,
        handling_dept: dept,
        handling_location: loc,
        required_ppe: ppe,
        posted_photo_url: posted,
        container_label_photo_url: label,
        status,
        training_completed_at: trainedAt || null,
      };
      if (entry) await patchMsds(entry.id, body);
      else await createMsds(body);
      toast.success(entry ? "수정 완료" : "새 MSDS 등록 완료");
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
        <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] pb-4 border-b border-[var(--border-1)] mb-4">
          {entry ? `MSDS #${entry.id} 편집` : "새 MSDS 등록"}
        </h3>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="물질명 *">
            <Input value={name} onChange={(e) => setName((e.target as HTMLInputElement).value)} placeholder="예: 락스, 알칼리 세정제" />
          </Field>
          <Field label="용도">
            <Textarea rows={2} value={usage} onChange={(e) => setUsage((e.target as HTMLTextAreaElement).value)} placeholder="예: 라인 세척, 기구 살균" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="취급 부서">
              <Input value={dept} onChange={(e) => setDept((e.target as HTMLInputElement).value)} placeholder="예: 세척실" />
            </Field>
            <Field label="보관 위치">
              <Input value={loc} onChange={(e) => setLoc((e.target as HTMLInputElement).value)} placeholder="예: 세척실 화학물 캐비닛" />
            </Field>
          </div>
          <Field label="필수 PPE">
            <Input value={ppe} onChange={(e) => setPpe((e.target as HTMLInputElement).value)} placeholder="예: 내산장갑, 보호안경, 방독마스크" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="현장 게시 사진 (MSDS 원본)">
              <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer w-fit">
                <Camera className="w-4 h-4 text-[var(--text-3)]" />
                <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{posted ? "교체" : "업로드"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(e, setPosted)} />
              </label>
              {posted && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={posted} alt="게시" className="mt-2 max-h-24 rounded border" />
              )}
            </Field>
            <Field label="용기 라벨 사진">
              <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer w-fit">
                <Camera className="w-4 h-4 text-[var(--text-3)]" />
                <span className="text-[var(--fs-caption)] text-[var(--text-3)]">{label ? "교체" : "업로드"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImg(e, setLabel)} />
              </label>
              {label && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={label} alt="라벨" className="mt-2 max-h-24 rounded border" />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="교육 완료일">
              <Input type="date" value={trainedAt} onChange={(e) => setTrainedAt((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="상태">
              <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}>
                {STATUS_OPTIONS.map(([code, l]) => (
                  <option key={code} value={code}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <div className="pt-4 border-t border-[var(--border-1)] mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
