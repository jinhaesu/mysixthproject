"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { CheckCircle, AlertTriangle, Loader2, Camera, Clipboard, MapPin, Save, RotateCcw } from "lucide-react";
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
  listSafetyAreas,
  getInspectionTemplates,
  createInspection,
  saveFindings,
  getInspections,
  type SafetyArea,
  type InspectionTemplate,
} from "@/lib/api";

type Judgement = "O" | "△" | "X";

interface Row {
  masterId: number | null;
  title: string;
  detail: string;
  requiresPhoto: boolean;
  judgement: Judgement | null;
  photo: string;
  notes: string;
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export default function DailyInspectionPage() {
  const toast = useToast();
  const [date, setDate] = useState<string>(todayKST());
  const [areas, setAreas] = useState<SafetyArea[]>([]);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [template, setTemplate] = useState<InspectionTemplate | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [weather, setWeather] = useState("");
  const [overallNotes, setOverallNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSummary, setLastSummary] = useState<{ findings: number; tickets: number } | null>(null);
  const [pastInspections, setPastInspections] = useState<any[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

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

  const loadTemplatesForArea = useCallback(async (aid: number) => {
    setLoadingTemplate(true);
    try {
      const res = await getInspectionTemplates(aid);
      setTemplates(res.templates);
      if (res.templates.length > 0) {
        const tpl = res.templates[0];
        setTemplate(tpl);
        setRows(tpl.items.map((it) => ({
          masterId: it.id,
          title: it.item_title,
          detail: it.item_detail,
          requiresPhoto: !!it.requires_photo_on_x,
          judgement: null,
          photo: "",
          notes: "",
        })));
      } else {
        setTemplate(null);
        setRows([]);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingTemplate(false);
    }
  }, [toast]);

  const loadPast = useCallback(async (aid: number | null) => {
    try {
      const res = await getInspections({ date, area_id: aid || undefined });
      setPastInspections(res.inspections);
    } catch (e: any) {
      // silent
      void e;
    }
  }, [date]);

  useEffect(() => {
    if (areaId) {
      loadTemplatesForArea(areaId);
      loadPast(areaId);
    } else {
      setTemplate(null);
      setRows([]);
      loadPast(null);
    }
  }, [areaId, loadTemplatesForArea, loadPast]);

  const setJudgement = (idx: number, j: Judgement) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, judgement: j } : r));
  };

  const setPhoto = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("사진은 5MB 이하만 첨부 가능합니다."); return; }
    const reader = new FileReader();
    reader.onload = () => setRows((prev) => prev.map((r, i) => i === idx ? { ...r, photo: String(reader.result || "") } : r));
    reader.readAsDataURL(file);
  };

  const answered = useMemo(() => rows.filter((r) => r.judgement !== null).length, [rows]);
  const xCount = useMemo(() => rows.filter((r) => r.judgement === "X").length, [rows]);
  const progress = rows.length > 0 ? Math.round((answered / rows.length) * 100) : 0;

  const canSave = useMemo(() => {
    if (!template || rows.length === 0) return false;
    if (answered !== rows.length) return false;
    // X 항목은 사진·사유 필수
    for (const r of rows) {
      if (r.judgement === "X") {
        if (r.requiresPhoto && !r.photo) return false;
        if (!r.notes.trim()) return false;
      }
    }
    return true;
  }, [template, rows, answered]);

  const handleSave = async () => {
    if (!areaId || !template) return;
    setSaving(true);
    try {
      const created = await createInspection({
        area_id: areaId,
        inspection_date: date,
        weather,
        overall_notes: overallNotes,
      });
      const findings = rows.map((r) => ({
        item_master_id: r.masterId,
        item_title: r.title,
        judgement: r.judgement as Judgement,
        photo_url: r.photo,
        notes: r.notes,
      }));
      const res = await saveFindings(created.id, findings);
      setLastSummary({ findings: res.findings_saved, tickets: res.tickets_created });
      toast.success(`저장 완료: 지적 ${res.findings_saved}건, 티켓 ${res.tickets_created}건`);
      loadPast(areaId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setLastSummary(null);
    setOverallNotes("");
    setWeather("");
    if (template) {
      setRows(template.items.map((it) => ({
        masterId: it.id,
        title: it.item_title,
        detail: it.item_detail,
        requiresPhoto: !!it.requires_photo_on_x,
        judgement: null,
        photo: "",
        notes: "",
      })));
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="안전관리자 점검"
        title="일일 순회점검"
        description="구역별 마스터 체크리스트를 점검하고 이상 항목은 자동으로 조치 티켓으로 발행합니다."
      />

      {/* Filters */}
      <Card>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="점검일">
            <Input type="date" value={date} onChange={(e) => setDate((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="구역 선택">
            <Select value={areaId || ""} onChange={(e) => setAreaId(Number((e.target as HTMLSelectElement).value) || null)}>
              <option value="">구역 선택</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="날씨">
            <Input placeholder="예: 맑음 26℃" value={weather} onChange={(e) => setWeather((e.target as HTMLInputElement).value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={resetForm} variant="secondary" disabled={!template || saving}>
              <RotateCcw className="w-4 h-4" /> 초기화
            </Button>
          </div>
        </div>
      </Card>

      {/* 요약 카드 (저장 후) */}
      {lastSummary && (
        <Card>
          <div className="p-5 flex items-center gap-4 flex-wrap">
            <CheckCircle className="w-8 h-8 text-[var(--success-fg)]" />
            <div className="flex-1">
              <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">순회점검 저장 완료</h3>
              <p className="text-[var(--fs-body)] text-[var(--text-3)] mt-1">
                지적 <b className="text-[var(--danger-fg)]">{lastSummary.findings}</b>건, 자동 티켓 <b className="text-[var(--warning-fg)]">{lastSummary.tickets}</b>건 발행.
              </p>
            </div>
            <a href="/safety-manager/tickets" className="text-[var(--brand-500)] underline text-[var(--fs-caption)]">
              티켓 관리로 이동
            </a>
          </div>
        </Card>
      )}

      {/* 진행률 */}
      {template && rows.length > 0 && (
        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[var(--brand-400)]" />
                  {template.name}
                </h3>
                <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5">항목 {rows.length}개 · 응답 {answered}개 · 이상 {xCount}건</p>
              </div>
              <Badge tone={progress === 100 ? "success" : "brand"}>{progress}%</Badge>
            </div>
            <div className="h-2 bg-[var(--bg-2)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--brand-400)] to-[var(--brand-600)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {loadingTemplate && (
        <Card>
          <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--brand-400)]" /></div>
        </Card>
      )}

      {/* Items */}
      {template && rows.map((r, idx) => (
        <Card key={idx}>
          <div className="p-5">
            <div className="flex items-start gap-3 mb-3">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brand-100)] text-[var(--brand-700)] text-[var(--fs-caption)] font-bold shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1">
                <h4 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">{r.title}</h4>
                {r.detail && <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">{r.detail}</p>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pl-10">
              {(["O", "△", "X"] as Judgement[]).map((j) => {
                const active = r.judgement === j;
                const cls = j === "O"
                  ? active ? "bg-[var(--success-fg)] text-white border-[var(--success-fg)]" : "border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                  : j === "△"
                    ? active ? "bg-[var(--warning-fg)] text-white border-[var(--warning-fg)]" : "border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--bg-2)]"
                    : active ? "bg-[var(--danger-fg)] text-white border-[var(--danger-fg)]" : "border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--bg-2)]";
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => setJudgement(idx, j)}
                    className={`py-2.5 rounded-[var(--r-md)] font-semibold text-[var(--fs-body)] border transition-colors ${cls}`}
                  >
                    {j === "O" ? "양호 (O)" : j === "△" ? "주의 (△)" : "이상 (X)"}
                  </button>
                );
              })}
            </div>
            {r.judgement === "X" && (
              <div className="mt-3 pl-10 space-y-2">
                <label className="block text-[var(--fs-caption)] font-medium text-[var(--danger-fg)]">
                  사유 상세 (필수) — 자동 조치 티켓의 설명으로 반영됩니다
                </label>
                <textarea
                  value={r.notes}
                  onChange={(e) => setRows((prev) => prev.map((row, i) => i === idx ? { ...row, notes: e.target.value } : row))}
                  rows={2}
                  placeholder="예: 오븐 도어 인터록 접점 마모 → 3일 내 교체 필요"
                  className="w-full px-3 py-2 border border-[var(--border-2)] rounded-[var(--r-md)] bg-[var(--bg-2)] text-[var(--text-1)] focus:outline-none focus:border-[var(--danger-fg)]"
                />
                {r.requiresPhoto && (
                  <div>
                    <label className="flex items-center gap-2 py-2 px-3 rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] cursor-pointer hover:bg-[var(--bg-2)] w-fit">
                      <Camera className="w-4 h-4 text-[var(--text-3)]" />
                      <span className="text-[var(--fs-caption)] text-[var(--text-3)]">
                        {r.photo ? "사진 교체" : "사진 첨부 (필수)"}
                      </span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(idx, e)} />
                    </label>
                    {r.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo} alt="증거 사진" className="mt-2 max-h-32 rounded-[var(--r-md)] border border-[var(--border-1)]" />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      ))}

      {template && (
        <Card>
          <div className="p-5 space-y-3">
            <Field label="종합 소견 (선택)">
              <Textarea
                value={overallNotes}
                onChange={(e) => setOverallNotes((e.target as HTMLTextAreaElement).value)}
                rows={3}
                placeholder="전반적인 라인 상태·특이사항"
              />
            </Field>
            <Button
              onClick={handleSave}
              disabled={!canSave || saving}
              variant="primary"
              className="w-full justify-center"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 저장 중...</> : <><Save className="w-4 h-4" /> 순회점검 저장 (X → 티켓 자동 발행)</>}
            </Button>
            {!canSave && rows.length > 0 && (
              <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] text-center">
                모든 항목 응답 + X 항목의 사유·사진(필수)이 있어야 저장 가능합니다.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Past inspections */}
      {pastInspections.length > 0 && (
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clipboard className="w-4 h-4 text-[var(--brand-400)]" />
              <h3 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)]">
                오늘 이 구역의 이전 점검 ({pastInspections.length}건)
              </h3>
            </div>
            <div className="space-y-2">
              {pastInspections.map((p) => (
                <div key={p.id} className="flex items-center justify-between border border-[var(--border-1)] rounded-[var(--r-md)] p-3">
                  <div>
                    <p className="text-[var(--fs-body)] text-[var(--text-1)] font-medium">{p.inspector_name || "관리자"}</p>
                    <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
                      {new Date(p.inspected_at).toLocaleString("ko-KR")} · 지적 {p.finding_count}건 (X {p.x_count})
                    </p>
                  </div>
                  <Badge tone={p.status === "done" ? "success" : "warning"}>{p.status === "done" ? "완료" : "진행중"}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {!template && !loadingTemplate && areaId && (
        <Card>
          <div className="p-8 text-center text-[var(--text-3)]">
            <AlertTriangle className="w-8 h-8 mx-auto text-[var(--warning-fg)] mb-2" />
            선택한 구역의 점검 템플릿이 없습니다.
          </div>
        </Card>
      )}
      {!areaId && !loadingTemplate && (
        <Card>
          <div className="p-8 text-center text-[var(--text-3)]">
            먼저 위에서 점검할 구역을 선택하세요.
          </div>
        </Card>
      )}
    </div>
  );
}
