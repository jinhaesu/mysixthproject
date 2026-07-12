"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, BookOpen, Plus, Pencil, Trash2, CheckCircle, Video, ListChecks, X } from "lucide-react";
import {
  listTrainingCourses, createTrainingCourse, patchTrainingCourse, deleteTrainingCourse,
  listTrainingQuiz, createTrainingQuiz, patchTrainingQuiz, deleteTrainingQuiz,
  type TrainingCourse,
} from "@/lib/api";
import {
  PageHeader, Card, Badge, Button, Input, Select, Field, Modal, useToast,
} from "@/components/ui";

export default function TrainingMasterPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [editing, setEditing] = useState<TrainingCourse | null>(null);
  const [creating, setCreating] = useState(false);
  const [quizFor, setQuizFor] = useState<TrainingCourse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrainingCourses();
      setCourses(res.courses);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    if (!confirm("정말 비활성화하시겠습니까? (soft delete)")) return;
    try {
      await deleteTrainingCourse(id);
      toast.success("비활성화 완료");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        eyebrow="교육 콘텐츠 마스터"
        title="반기 정기 안전보건교육 콘텐츠"
        description="유튜브 링크·시청 시간·퀴즈를 관리합니다. 근로자는 반기별로 필수 이수해야 합니다."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" />
            신규 코스
          </Button>
        }
      />

      <Card>
        <div className="p-4 bg-[var(--info-bg)] border-l-4 border-[var(--info-fg)]">
          <p className="text-[var(--fs-body)] font-semibold text-[var(--info-fg)]">
            KOSHA 공식 안전보건교육 영상을 등록해주세요
          </p>
          <p className="text-[var(--fs-caption)] text-[var(--info-fg)] mt-1 opacity-90">
            • 초기 seed 코스 3건은 <b>영상 URL이 비어있는 상태</b>로 등록되어 있습니다. 각 코스를 편집해 실제 유튜브 embed URL을 입력해야 근로자가 이수 가능합니다.<br />
            • 추천 소스: <b>안전보건공단(KOSHA) 공식 유튜브 채널</b> — <code>youtube.com/@safetykoshatv</code><br />
            • 유튜브 URL 형식: <code>https://www.youtube.com/embed/&lt;VIDEO_ID&gt;</code> (일반 watch?v= URL이 아닌 <b>embed</b> URL 사용)<br />
            • 반기별 필수 이수 시간: 생산직 12h · 사무직 6h (산업안전보건법)
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-[var(--text-3)]">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : courses.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-3)]">등록된 교육 코스가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[var(--fs-body)]">
                <thead>
                  <tr className="border-b border-[var(--border-1)] text-[var(--text-3)] text-[var(--fs-caption)] uppercase tracking-wider">
                    <th className="text-left py-2 pr-3">순번</th>
                    <th className="text-left py-2 pr-3">제목</th>
                    <th className="text-left py-2 pr-3">카테고리</th>
                    <th className="text-left py-2 pr-3">대상</th>
                    <th className="text-left py-2 pr-3">시간</th>
                    <th className="text-left py-2 pr-3">인정 h</th>
                    <th className="text-left py-2 pr-3">퀴즈</th>
                    <th className="text-left py-2 pr-3">상태</th>
                    <th className="text-left py-2 pr-3">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c.id} className="border-b border-[var(--border-1)] hover:bg-[var(--bg-2)]/40">
                      <td className="py-2 pr-3 tabular text-[var(--text-3)]">{c.sort_order}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-[var(--text-1)]">{c.title}</p>
                        {c.description && <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-0.5 line-clamp-1">{c.description}</p>}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={c.category === "safety" ? "brand" : "warning"}>{c.category}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-[var(--text-2)]">{c.target_role}</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{c.duration_min}분</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{c.half_year_credit_hours}h</td>
                      <td className="py-2 pr-3 tabular text-[var(--text-2)]">{c.quiz_count ?? 0}</td>
                      <td className="py-2 pr-3">
                        {c.active ? <Badge tone="success">활성</Badge> : <Badge tone="neutral">비활성</Badge>}
                      </td>
                      <td className="py-2 pr-3 space-x-2">
                        <button onClick={() => setEditing(c)} className="text-[var(--brand-500)] hover:underline text-[var(--fs-caption)]">
                          편집
                        </button>
                        <button onClick={() => setQuizFor(c)} className="text-[var(--warning-fg)] hover:underline text-[var(--fs-caption)]">
                          퀴즈
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-[var(--danger-fg)] hover:underline text-[var(--fs-caption)]">
                          비활성화
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

      {(creating || editing) && (
        <CourseEditor
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}

      {quizFor && (
        <QuizEditor course={quizFor} onClose={() => { setQuizFor(null); load(); }} />
      )}
    </div>
  );
}

/**
 * 유튜브 URL 정규화 — watch·youtu.be·shorts → embed 형태 변환.
 * iframe 임베드는 반드시 /embed/<VIDEO_ID> 형식이어야 재생됨.
 */
export function normalizeYouTubeEmbedUrl(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    let vid = "";
    if (host === "youtu.be") {
      vid = u.pathname.replace(/^\//, "").split("/")[0];
    } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      if (u.pathname === "/watch") vid = u.searchParams.get("v") || "";
      else if (u.pathname.startsWith("/embed/")) vid = u.pathname.replace("/embed/", "").split("/")[0];
      else if (u.pathname.startsWith("/shorts/")) vid = u.pathname.replace("/shorts/", "").split("/")[0];
      else if (u.pathname.startsWith("/v/")) vid = u.pathname.replace("/v/", "").split("/")[0];
    }
    if (/^[a-zA-Z0-9_-]{6,}$/.test(vid)) return `https://www.youtube.com/embed/${vid}`;
    return raw;
  } catch { return raw; }
}

function CourseEditor({ initial, onClose, onSaved }: { initial: TrainingCourse | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [videoUrl, setVideoUrl] = useState(initial?.video_url || "");
  const [duration, setDuration] = useState(String(initial?.duration_min ?? 20));
  const [credit, setCredit] = useState(String(initial?.half_year_credit_hours ?? 1));
  const [targetRole, setTargetRole] = useState(initial?.target_role || "production");
  const [category, setCategory] = useState(initial?.category || "safety");
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [active, setActive] = useState<number>(initial?.active ?? 1);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error("제목 필수"); return; }
    const normalizedUrl = normalizeYouTubeEmbedUrl(videoUrl);
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description,
        video_source_type: "youtube",
        video_url: normalizedUrl,
        duration_min: Number(duration) || 0,
        half_year_credit_hours: Number(credit) || 0,
        target_role: targetRole,
        category,
        sort_order: Number(sortOrder) || 0,
        active,
      };
      if (initial) await patchTrainingCourse(initial.id, body);
      else await createTrainingCourse(body);
      if (normalizedUrl && normalizedUrl !== videoUrl.trim()) {
        toast.success(`저장 완료 (URL 자동 변환됨: embed 형식)`);
      } else {
        toast.success("저장 완료");
      }
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="pb-4 border-b border-[var(--border-1)] mb-4">
        <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)]">
          {initial ? "코스 편집" : "새 코스 등록"}
        </h3>
      </div>
      <div className="space-y-4">
        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="설명">
          <Input value={description} onChange={(e) => setDescription((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="유튜브 URL (watch·youtu.be·embed 어떤 형식이든 자동 변환)">
          <Input value={videoUrl} onChange={(e) => setVideoUrl((e.target as HTMLInputElement).value)} placeholder="https://www.youtube.com/watch?v=XXXX 또는 https://youtu.be/XXXX" />
          {videoUrl.trim() && (() => {
            const norm = normalizeYouTubeEmbedUrl(videoUrl);
            const isValidEmbed = /^https:\/\/www\.youtube\.com\/embed\/[a-zA-Z0-9_-]{6,}$/.test(norm);
            if (isValidEmbed) {
              return (
                <p className="text-[var(--fs-caption)] text-[var(--success-fg)] mt-1">
                  ✓ 저장 시 embed 형식으로 변환: <code className="text-[10px]">{norm}</code>
                </p>
              );
            }
            return (
              <p className="text-[var(--fs-caption)] text-[var(--danger-fg)] mt-1">
                ⚠ 유효한 유튜브 URL 아님. iframe 재생 실패 가능.
              </p>
            );
          })()}
        </Field>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="시청 시간(분)">
            <Input type="number" value={duration} onChange={(e) => setDuration((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="반기 인정 시간(h)">
            <Input type="number" step="0.25" value={credit} onChange={(e) => setCredit((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="정렬 순번">
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="상태">
            <Select value={String(active)} onChange={(e) => setActive(Number((e.target as HTMLSelectElement).value))}>
              <option value="1">활성</option>
              <option value="0">비활성</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="대상 role">
            <Select value={targetRole} onChange={(e) => setTargetRole((e.target as HTMLSelectElement).value)}>
              <option value="production">생산직(현장)</option>
              <option value="cafe">카페</option>
              <option value="office">사무직</option>
              <option value="all">전체</option>
            </Select>
          </Field>
          <Field label="카테고리">
            <Select value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}>
              <option value="safety">안전</option>
              <option value="health">보건</option>
              <option value="mixed">복합</option>
            </Select>
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[var(--border-1)]">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          저장
        </Button>
      </div>
    </Modal>
  );
}

interface QuizItemRow { id: number; question_no: number; question: string; choices: string[]; correct_index: number }

function QuizEditor({ course, onClose }: { course: TrainingCourse; onClose: () => void }) {
  const toast = useToast();
  const [items, setItems] = useState<QuizItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQ, setNewQ] = useState("");
  const [newChoices, setNewChoices] = useState<string[]>(["", "", "", ""]);
  const [newCorrect, setNewCorrect] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrainingQuiz(course.id);
      setItems(res.items as any);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [course.id, toast]);

  useEffect(() => { load(); }, [load]);

  const addQuiz = async () => {
    if (!newQ.trim()) { toast.error("질문 필수"); return; }
    const cleaned = newChoices.map((c) => c.trim()).filter(Boolean);
    if (cleaned.length < 2) { toast.error("보기 2개 이상 필요"); return; }
    setAdding(true);
    try {
      await createTrainingQuiz(course.id, { question: newQ.trim(), choices: cleaned, correct_index: Math.min(newCorrect, cleaned.length - 1) });
      setNewQ(""); setNewChoices(["", "", "", ""]); setNewCorrect(0);
      toast.success("추가 완료");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setAdding(false); }
  };

  const removeQuiz = async (qid: number) => {
    if (!confirm("이 문항을 삭제하시겠습니까?")) return;
    try { await deleteTrainingQuiz(course.id, qid); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="pb-4 border-b border-[var(--border-1)] mb-4">
        <h3 className="text-[var(--fs-lg)] font-semibold text-[var(--text-1)] flex items-center gap-2">
          <ListChecks className="w-5 h-5" /> {course.title} — 퀴즈
        </h3>
        <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">70% 이상 정답이면 이수 처리됩니다.</p>
      </div>
      {loading ? (
        <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-3 max-h-[40vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="text-[var(--text-3)] text-center py-4">문항 없음. 아래에서 추가해주세요.</p>
          )}
          {items.map((it) => (
            <div key={it.id} className="border border-[var(--border-1)] rounded-[var(--r-md)] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)]">
                    Q{it.question_no}. {it.question}
                  </p>
                  <div className="mt-2 space-y-1">
                    {(it.choices as string[]).map((c, i) => (
                      <div key={i} className={`text-[var(--fs-caption)] ${i === it.correct_index ? "font-semibold text-[var(--success-fg)]" : "text-[var(--text-2)]"}`}>
                        {i === it.correct_index ? <CheckCircle className="w-3.5 h-3.5 inline-block mr-1" /> : <span className="inline-block w-3.5 mr-1" />} {c}
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => removeQuiz(it.id)} className="text-[var(--danger-fg)] hover:opacity-80">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-[var(--border-1)] mt-4 pt-4 space-y-3">
        <p className="text-[var(--fs-body)] font-semibold text-[var(--text-1)]">새 문항 추가</p>
        <Field label="질문">
          <Input value={newQ} onChange={(e) => setNewQ((e.target as HTMLInputElement).value)} />
        </Field>
        <div className="space-y-2">
          {newChoices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={newCorrect === i} onChange={() => setNewCorrect(i)} className="accent-[var(--brand-500)]" />
              <Input value={c} placeholder={`보기 ${i + 1}`} onChange={(e) => {
                const next = [...newChoices]; next[i] = (e.target as HTMLInputElement).value; setNewChoices(next);
              }} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>닫기</Button>
          <Button onClick={addQuiz} disabled={adding}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            문항 추가
          </Button>
        </div>
      </div>
    </Modal>
  );
}
