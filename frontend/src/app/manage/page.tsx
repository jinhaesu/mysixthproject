"use client";

import { useEffect, useState } from "react";
import { getUploads, deleteUpload } from "@/lib/api";
import type { Upload, AnalysisResult } from "@/types/attendance";
import { Trash2, FileSpreadsheet, AlertTriangle, ChevronDown, ChevronUp, Database, RefreshCw, Tags, CalendarSync } from "lucide-react";
import SessionPasswordGate from "@/components/SessionPasswordGate";
import {
  PageHeader, Card, CardHeader, Section, Button, Badge, CenterSpinner,
  EmptyState, useToast, Input, Select, Field,
} from "@/components/ui";

export default function ManagePage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);


  useEffect(() => {
    if (!authorized) return;
    loadUploads();
  }, []);

  async function loadUploads() {
    setLoading(true);
    try {
      const data = await getUploads();
      setUploads(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 업로드와 관련된 모든 기록이 삭제됩니다. 계속하시겠습니까?")) return;
    setDeleting(id);
    try {
      await deleteUpload(id);
      setUploads((prev) => prev.filter((u) => u.id !== id));
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(null);
    }
  }

  function parseAnalysis(raw: string): AnalysisResult | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const [recalcing, setRecalcing] = useState(false);
  const handleRecalc = async () => {
    if (!confirm("모든 확정 데이터의 근무시간을 재계산합니다 (출근 올림/퇴근 내림 적용). 계속하시겠습니까?")) return;
    setRecalcing(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/recalc-confirmed`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      toast.success(`${body.updated}건 재계산 완료`);
    } catch (e: any) { toast.error(e.message); }
    finally { setRecalcing(false); }
  };

  if (!authorized) return <SessionPasswordGate title="데이터 관리 접근" onVerified={() => setAuthorized(true)} />;

  return (
    <>
      <PageHeader
        eyebrow="시스템"
        title="데이터 관리"
        description="업로드된 파일과 기록을 관리합니다."
      />

      <div className="space-y-3 mb-6">
        <Card tone="ghost" className="border-[var(--warning-border)] bg-[var(--warning-bg)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <RefreshCw size={18} className="text-[var(--warning-fg)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[var(--fs-body)] font-semibold text-[var(--warning-fg)]">확정 데이터 근무시간 재계산</p>
                <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] mt-0.5 opacity-80">
                  출근 30분 올림 / 퇴근 30분 내림 기준을 모든 기존 확정 데이터에 일괄 적용합니다.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRecalc}
              loading={recalcing}
            >
              재계산 실행
            </Button>
          </div>
        </Card>

        <Card tone="ghost" className="border-[var(--info-border)] bg-[var(--info-bg)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Tags size={18} className="text-[var(--info-fg)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[var(--fs-body)] font-semibold text-[var(--info-fg)]">근무자 DB 구분(파견/알바) 일괄 채우기</p>
                <p className="text-[var(--fs-caption)] text-[var(--info-fg)] mt-0.5 opacity-80">
                  구분이 비어있는 근무자에 대해 출퇴근 기록에서 파견/알바 유형을 찾아 자동 채웁니다.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/workers/backfill-category`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({}),
                  });
                  const body = await res.json();
                  let msg = `빈 구분 ${body.total_empty}명 중 ${body.updated}명 채움 완료`;
                  if (body.not_found?.length > 0) msg += ` | 유형 데이터 없어 빈칸 유지: ${body.not_found.join(', ')}`;
                  toast.success(msg);
                } catch (e: any) { toast.error(e.message); }
              }}
            >
              구분 채우기
            </Button>
          </div>
        </Card>

        <Card tone="ghost" className="border-[var(--info-border)] bg-[var(--info-bg)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Tags size={18} className="text-[var(--info-fg)] shrink-0 mt-0.5" />
              <div>
                <p className="text-[var(--fs-body)] font-semibold text-[var(--info-fg)]">확정근태 부서 일괄 채우기 (대시보드 소계 '-' 해결)</p>
                <p className="text-[var(--fs-caption)] text-[var(--info-fg)] mt-0.5 opacity-80">
                  파견·알바 확정근태 중 부서가 비어있는 행을 근무자DB(phone/이름) 기준으로 자동 채웁니다. 매칭 실패자는 결과 알림에 나옵니다.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/backfill-confirmed-dept`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({}),
                  });
                  const body = await res.json();
                  let msg = `대상 ${body.total_scanned}건 중 ${body.updated}건 부서 채움`;
                  if (body.unresolved_workers > 0) {
                    const names = (body.unresolved || []).map((u: any) => u.name || u.phone).slice(0, 10).join(', ');
                    msg += ` | 미매칭 ${body.unresolved_workers}명: ${names}${body.unresolved_workers > 10 ? ' 외' : ''}`;
                  }
                  toast.success(msg);
                } catch (e: any) { toast.error(e.message); }
              }}
            >
              부서 채우기
            </Button>
          </div>
        </Card>

        <SubstituteWorkdayCard />

        <DuplicateEmployeeCard />
      </div>

      <Section title="업로드 기록">
        {loading ? (
          <CenterSpinner />
        ) : uploads.length === 0 ? (
          <EmptyState
            icon={<Database size={40} />}
            title="업로드된 데이터가 없습니다."
          />
        ) : (
          <div className="space-y-3">
            {uploads.map((upload) => {
              const isExpanded = expandedId === upload.id;
              const analysis = parseAnalysis(upload.ai_analysis);

              return (
                <Card key={upload.id} padding="none" className="overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet size={20} className="text-[var(--success-fg)]" />
                      <div>
                        <p className="font-medium text-[var(--text-1)]">{upload.original_filename}</p>
                        <p className="text-[var(--fs-caption)] text-[var(--text-3)]">
                          <span className="tabular">{upload.record_count}</span>건 | {new Date(upload.uploaded_at).toLocaleString("ko-KR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setExpandedId(isExpanded ? null : upload.id)}
                        leadingIcon={isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      >
                        {isExpanded ? "접기" : "분석 보기"}
                      </Button>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={() => handleDelete(upload.id)}
                        loading={deleting === upload.id}
                        leadingIcon={<Trash2 size={14} />}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>

                  {isExpanded && analysis && (
                    <div className="px-5 pb-5 border-t border-[var(--border-1)] pt-4 space-y-3">
                      <Card tone="ghost" className="border-[var(--info-border)] bg-[var(--info-bg)]">
                        <p className="text-[var(--fs-caption)] text-[var(--brand-400)] whitespace-pre-wrap">{analysis.summary}</p>
                      </Card>

                      {analysis.duplicates.length > 0 && (
                        <div>
                          <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)] mb-2 flex items-center gap-1.5">
                            <AlertTriangle size={14} className="text-[var(--danger-fg)]" />
                            중복{" "}
                            <Badge tone="danger" size="xs">{analysis.duplicates.length}건</Badge>
                          </p>
                          <div className="space-y-1.5">
                            {analysis.duplicates.map((d, i) => (
                              <p key={i} className="text-[var(--fs-caption)] text-[var(--danger-fg)] pl-5">{d.details}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {analysis.warnings.length > 0 && (
                        <div>
                          <p className="text-[var(--fs-body)] font-medium text-[var(--text-1)] mb-2 flex items-center gap-1.5">
                            주의사항{" "}
                            <Badge tone="warning" size="xs">{analysis.warnings.length}건</Badge>
                          </p>
                          <div className="space-y-1">
                            {analysis.warnings.slice(0, 10).map((w, i) => (
                              <p key={i} className="text-[var(--fs-caption)] text-[var(--warning-fg)] pl-5">{w.message}</p>
                            ))}
                            {analysis.warnings.length > 10 && (
                              <p className="text-[var(--fs-caption)] text-[var(--text-3)] pl-5">...외 {analysis.warnings.length - 10}건</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

function SubstituteWorkdayCard() {
  const toast = useToast();
  const [department, setDepartment] = useState("물류");
  const [workedDate, setWorkedDate] = useState("2026-07-19");
  const [originalDate, setOriginalDate] = useState("2026-07-16");
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    if (!workedDate || !originalDate) { toast.error("근무일·원 소정일을 입력해주세요."); return; }
    if (!confirm(`${department || '(전체 부서)'} · ${workedDate} 근무를 ${originalDate} 대체근무로 처리합니다.\n\n- 해당 부서·근무일 확정근태 records 를 평일 기준으로 재계산 (휴일 프리미엄 제거)\n- 원 소정일 (${originalDate}) 에 대체휴무 dummy record 삽입 (결근 계산 제외 목적)\n\n계속 진행할까요?`)) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/apply-substitute-workday`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          department: department || undefined,
          worked_date: workedDate,
          original_date: originalDate,
          year_month: workedDate.slice(0, 7),
          employee_type: '정규직',
        }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || '실패'); return; }
      const names = (body.affected || []).map((a: any) => a.name).slice(0, 10).join(', ');
      toast.success(`재계산 ${body.recalced}건, 대체휴무 ${body.dummy_inserted}건 삽입 | ${body.affected?.length || 0}명: ${names}${(body.affected?.length || 0) > 10 ? ' 외' : ''}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Card tone="ghost" className="border-[var(--warning-border)] bg-[var(--warning-bg)]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <CalendarSync size={18} className="text-[var(--warning-fg)] shrink-0 mt-0.5" />
          <div>
            <p className="text-[var(--fs-body)] font-semibold text-[var(--warning-fg)]">대체근무 처리 (부서·근무일 → 원 소정일 shift)</p>
            <p className="text-[var(--fs-caption)] text-[var(--warning-fg)] mt-0.5 opacity-80">
              특정 부서가 휴일에 근무한 것을 원래 평일 소정근로일 대체로 재분류합니다. (예: 물류 7/19 근무 → 7/16 대체)<br/>
              · 근무일 records 평일 재계산 (휴일 프리미엄 제거) · 원 소정일에 대체휴무 dummy record 삽입 (결근 계산 제외 목적)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="부서">
            <Select value={department} onChange={e => setDepartment(e.target.value)} inputSize="sm" className="w-32">
              <option value="">(전체)</option>
              <option value="물류">물류</option>
              <option value="생산2층">생산2층</option>
              <option value="생산3층">생산3층</option>
              <option value="생산 야간(2층)">생산 야간(2층)</option>
              <option value="생산 야간(3층)">생산 야간(3층)</option>
              <option value="물류 야간">물류 야간</option>
            </Select>
          </Field>
          <Field label="근무일 (휴일)">
            <Input type="date" value={workedDate} onChange={e => setWorkedDate(e.target.value)} inputSize="sm" className="w-36" />
          </Field>
          <Field label="원 소정일 (평일)">
            <Input type="date" value={originalDate} onChange={e => setOriginalDate(e.target.value)} inputSize="sm" className="w-36" />
          </Field>
          <Button variant="primary" size="sm" onClick={handleApply} loading={loading}>대체근무 적용</Button>
        </div>
      </div>
    </Card>
  );
}

function DuplicateEmployeeCard() {
  const toast = useToast();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/duplicate-candidates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || '스캔 실패'); return; }
      setCandidates(body.pairs || []);
      setScanned(true);
      toast.success(`${body.total}쌍 발견`);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const doMerge = async (pair: any) => {
    // 어느 쪽이 canonical? 활성인 쪽을 into 로. 둘 다 활성/퇴사면 오래된(id 작은) 것을 into.
    const [a, b] = [pair.a, pair.b];
    const intoIsA = (a.is_active === 1 && b.is_active === 0) || (a.is_active === b.is_active && a.id < b.id);
    const into = intoIsA ? a : b;
    const from = intoIsA ? b : a;
    const rehire = prompt(
      `병합: from #${from.id} "${from.name}" → into #${into.id} "${into.name}"\n\n` +
      `재입사일 (YYYY-MM-DD, 비우면 재입사 처리 X):`,
      new Date().toISOString().slice(0, 10)
    );
    if (rehire === null) return;
    if (rehire && !/^\d{4}-\d{2}-\d{2}$/.test(rehire)) { toast.error("YYYY-MM-DD 형식 필요"); return; }
    const reason = rehire ? (prompt("이전 퇴사 사유:", "자진퇴사") || "") : "";
    if (!confirm(`이 병합을 진행합니다:\n\n#${from.id} 삭제, #${into.id} 로 통합${rehire ? `\n재입사일: ${rehire}` : ''}\n\n계속?`)) return;
    setMerging(`${from.id}_${into.id}`);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ from_id: from.id, into_id: into.id, rehire_date: rehire || undefined, prev_resign_reason: reason }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error || '병합 실패'); return; }
      toast.success(`병합 완료: ${body.log?.join(' | ') || 'ok'}`);
      await scan();
    } catch (e: any) { toast.error(e.message); }
    finally { setMerging(null); }
  };

  return (
    <Card tone="ghost" className="border-[var(--info-border)] bg-[var(--info-bg)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="flex items-start gap-3">
          <Tags size={18} className="text-[var(--info-fg)] shrink-0 mt-0.5" />
          <div>
            <p className="text-[var(--fs-body)] font-semibold text-[var(--info-fg)]">정규직 이름 중복 스캔 (재입사·재등록 인원 통합)</p>
            <p className="text-[var(--fs-caption)] text-[var(--info-fg)] mt-0.5 opacity-80">
              이름이 유사한 (예: '정연화' vs '정연화(F-4)') 다른 phone 인 entries 를 찾아 병합 후보로 제시. phone 정규화 후 동일이면 confidence=high.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={scan} loading={loading}>스캔 실행</Button>
      </div>
      {scanned && candidates.length === 0 && (
        <div className="text-[var(--fs-caption)] text-[var(--success-fg)] pl-8">✓ 중복 후보 없음. 데이터 깔끔합니다.</div>
      )}
      {candidates.length > 0 && (
        <div className="space-y-2 pl-8">
          {candidates.map((pair, i) => (
            <div key={i} className="p-3 rounded bg-[var(--bg-1)] border border-[var(--border-2)] flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={pair.confidence === 'high' ? 'danger' : 'warning'} size="xs">{pair.confidence}</Badge>
                  <span className="text-[var(--text-3)]">{pair.reason}</span>
                </div>
                <div className="text-[var(--text-1)]">
                  <strong>#{pair.a.id}</strong> "{pair.a.name}" ({pair.a.phone}) {pair.a.department} · {pair.a.is_active === 1 ? '재직' : '퇴사'} hire={pair.a.hire_date || '-'} resign={pair.a.resign_date || '-'}
                </div>
                <div className="text-[var(--text-1)]">
                  <strong>#{pair.b.id}</strong> "{pair.b.name}" ({pair.b.phone}) {pair.b.department} · {pair.b.is_active === 1 ? '재직' : '퇴사'} hire={pair.b.hire_date || '-'} resign={pair.b.resign_date || '-'}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => doMerge(pair)}
                loading={merging === `${pair.a.id}_${pair.b.id}` || merging === `${pair.b.id}_${pair.a.id}`}
              >
                병합
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
