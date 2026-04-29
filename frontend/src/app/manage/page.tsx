"use client";

import { useEffect, useState } from "react";
import { getUploads, deleteUpload } from "@/lib/api";
import type { Upload, AnalysisResult } from "@/types/attendance";
import { Trash2, FileSpreadsheet, AlertTriangle, ChevronDown, ChevronUp, Database, RefreshCw, Tags } from "lucide-react";
import PasswordGate from "@/components/PasswordGate";
import {
  PageHeader, Card, CardHeader, Section, Button, Badge, CenterSpinner,
  EmptyState, useToast,
} from "@/components/ui";

export default function ManagePage() {
  const toast = useToast();
  const [authorized, setAuthorized] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const verifyPassword = async (pw: string) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/verify-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: pw }),
    });
    const body = await res.json();
    return !!body.verified;
  };

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

  if (!authorized) return <PasswordGate onVerified={() => setAuthorized(true)} verifyPassword={verifyPassword} />;

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
