"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, MapPin, ClipboardList } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  listHealthInspections,
  createHealthInspection,
  type HealthInspection,
} from "@/lib/api";

const STATUS_OPTIONS = ["", "양호", "주의", "이상"];

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function statusBadge(v: string) {
  if (v === "양호") return <Badge tone="success">양호</Badge>;
  if (v === "주의") return <Badge tone="warning">주의</Badge>;
  if (v === "이상") return <Badge tone="danger">이상</Badge>;
  return <span className="text-[var(--text-4)]">-</span>;
}

export default function HealthInspectionsPage() {
  const toast = useToast();
  const [items, setItems] = useState<HealthInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Form
  const [date, setDate] = useState<string>(todayKST());
  const [noise, setNoise] = useState("");
  const [dust, setDust] = useState("");
  const [temp, setTemp] = useState("");
  const [rest, setRest] = useState("");
  const [wash, setWash] = useState("");
  const [firstAid, setFirstAid] = useState("");
  const [aed, setAed] = useState("");
  const [chem, setChem] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listHealthInspections(from || undefined, to || undefined);
      setItems(res.inspections);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setNoise(""); setDust(""); setTemp(""); setRest(""); setWash("");
    setFirstAid(""); setAed(""); setChem(""); setNotes("");
    setDate(todayKST());
  };

  const save = async () => {
    setSaving(true);
    try {
      await createHealthInspection({
        inspection_date: date,
        noise_status: noise,
        dust_status: dust,
        temp_status: temp,
        rest_area_status: rest,
        wash_area_status: wash,
        first_aid_status: firstAid,
        aed_status: aed,
        chemical_storage_status: chem,
        overall_notes: notes,
      });
      toast.success("주간 순회점검이 저장되었습니다.");
      resetForm();
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const anyAbnormal = useMemo(
    () => [noise, dust, temp, rest, wash, firstAid, aed, chem].some((v) => v === "이상"),
    [noise, dust, temp, rest, wash, firstAid, aed, chem]
  );

  const fields: Array<[string, string, string, (v: string) => void]> = [
    ["소음", "직·간접 노출 소음원 상태", noise, setNoise],
    ["분진·환기", "국소배기·전체환기 성능", dust, setDust],
    ["온·습도", "고온·저온 노출부 온도 관리", temp, setTemp],
    ["휴게 공간", "휴게실 청결·냉난방·비품", rest, setRest],
    ["세면·화장실", "세면대 온수·비누·수건", wash, setWash],
    ["구급함", "구급함 재고·유효기간", firstAid, setFirstAid],
    ["AED", "AED 배터리·패치 상태", aed, setAed],
    ["화학물질 보관", "MSDS 게시·용기 표시·잠금", chem, setChem],
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="보건관리자 점검"
        title="주간 보건 순회점검"
        description="산업안전보건법 시행규칙 제224조 — 매주 작업장 순회 및 근로자 건강장해 요인 점검."
      />

      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Field label="조회 시작">
            <Input type="date" value={from} onChange={(e) => setFrom((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="조회 종료">
            <Input type="date" value={to} onChange={(e) => setTo((e.target as HTMLInputElement).value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={load} variant="secondary" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "조회"}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-5 h-5 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">새 순회점검 입력</h3>
          </div>

          <Field label="점검일">
            <Input type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map(([label, hint, val, setter]) => (
              <Field key={label} label={`${label}`} hint={hint}>
                <Select value={val} onChange={(e) => setter((e.target as HTMLSelectElement).value)}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o || "선택"}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <Field label="종합 소견">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes((e.target as HTMLTextAreaElement).value)} placeholder="특이사항, 개선요청, 조치사항" />
          </Field>

          {anyAbnormal && (
            <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-[var(--r-md)] p-3 text-[var(--warning-fg)] text-[var(--fs-caption)]">
              이상 항목이 감지되었습니다. 종합 소견에 조치 계획을 남겨주세요.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForm} disabled={saving}>초기화</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중</> : <><Save className="w-4 h-4" /> 저장</>}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-[var(--brand-400)]" />
            <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">이력</h3>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[var(--text-3)]">등록된 순회점검이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">점검일</th>
                    <th className="text-left py-2 pr-3">점검자</th>
                    <th className="text-left py-2 pr-3">소음</th>
                    <th className="text-left py-2 pr-3">분진</th>
                    <th className="text-left py-2 pr-3">온·습도</th>
                    <th className="text-left py-2 pr-3">휴게</th>
                    <th className="text-left py-2 pr-3">세면</th>
                    <th className="text-left py-2 pr-3">구급함</th>
                    <th className="text-left py-2 pr-3">AED</th>
                    <th className="text-left py-2 pr-3">화학물질</th>
                    <th className="text-left py-2 pr-3">소견</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-1)]">
                      <td className="py-2 pr-3 tabular">{r.inspection_date}</td>
                      <td className="py-2 pr-3">{r.inspector_name || "-"}</td>
                      <td className="py-2 pr-3">{statusBadge(r.noise_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.dust_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.temp_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.rest_area_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.wash_area_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.first_aid_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.aed_status)}</td>
                      <td className="py-2 pr-3">{statusBadge(r.chemical_storage_status)}</td>
                      <td className="py-2 pr-3 text-[var(--fs-caption)] text-[var(--text-3)] truncate max-w-xs">{r.overall_notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
