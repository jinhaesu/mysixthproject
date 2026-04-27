"use client";

import { useState, useCallback, useEffect } from "react";
import { UploadCloud, FileSpreadsheet, AlertTriangle, AlertCircle, CheckCircle2, Info, Trash2 } from "lucide-react";
import { uploadFile, getUploads, deleteUpload } from "@/lib/api";
import type { UploadResponse } from "@/types/attendance";
import {
  PageHeader, Card, CardHeader, Badge, Button, EmptyState, Spinner, useToast,
  Table, THead, TBody, TR, TH, TD,
} from "@/components/ui";

export default function UploadRegularPage() {
  const toast = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<any[]>([]);

  const loadUploads = useCallback(async () => {
    try { const data = await getUploads(); setUploads(data || []); } catch {}
  }, []);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setResult(null);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      setError("지원하지 않는 파일 형식입니다. (.xlsx, .xls, .csv만 가능)");
      return;
    }

    setIsUploading(true);
    try {
      const res = await uploadFile(file, { only_category: '정규직' });
      setResult(res);
      loadUploads();
    } catch (err: any) {
      setError(err.message || "업로드 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const severityConfig = {
    high: { icon: AlertTriangle, tone: "danger" as const },
    medium: { icon: AlertCircle, tone: "warning" as const },
    low: { icon: Info, tone: "brand" as const },
  };

  const toneColors = {
    danger: "bg-[var(--danger-bg)] border-[var(--danger-border)] text-[var(--danger-fg)]",
    warning: "bg-[var(--warning-bg)] border-[var(--warning-border)] text-[var(--warning-fg)]",
    brand: "bg-[var(--brand-500)]/5 border-[var(--border-2)] text-[var(--brand-400)]",
  };

  return (
    <div className="max-w-4xl fade-in">
      <PageHeader
        eyebrow="업로드"
        title="정규직 엑셀 업로드"
        description="근태 엑셀 파일을 업로드하면 자동으로 데이터를 파싱하고 AI가 분석합니다."
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative overflow-hidden border-2 border-dashed rounded-[var(--r-lg)] p-12 text-center transition-colors bg-grid ${
          isDragging
            ? "border-[var(--brand-400)] bg-[var(--brand-500)]/10"
            : "border-[var(--border-2)] bg-[var(--bg-1)] hover:border-[var(--border-3)]"
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner size={40} />
            <p className="text-[var(--text-2)] font-medium">파일 처리 중...</p>
            <p className="text-[var(--fs-caption)] text-[var(--text-4)]">엑셀 파싱 및 AI 분석이 진행됩니다</p>
          </div>
        ) : (
          <label className="cursor-pointer flex flex-col items-center gap-3">
            <UploadCloud size={48} className="text-[var(--text-4)]" />
            <div>
              <p className="text-[var(--text-2)] font-medium mb-1">파일을 드래그하거나 클릭하여 업로드</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-4)]">.xlsx, .xls, .csv (최대 10MB)</p>
            </div>
            <Button variant="primary" size="sm" leadingIcon={<UploadCloud size={14} />} tabIndex={-1}>
              파일 선택
            </Button>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleInputChange} />
          </label>
        )}
      </div>

      {error && (
        <Card tone="ghost" className="mt-6 border-[var(--danger-border)] bg-[var(--danger-bg)] flex items-start gap-3">
          <AlertTriangle size={18} className="text-[var(--danger-fg)] mt-0.5 shrink-0" />
          <p className="text-[var(--danger-fg)] text-[var(--fs-body)]">{error}</p>
        </Card>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <Card tone="ghost" className="border-[var(--success-border)] bg-[var(--success-bg)] flex items-start gap-3">
            <CheckCircle2 size={18} className="text-[var(--success-fg)] mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-[var(--success-fg)]">업로드 완료</p>
              <p className="text-[var(--fs-caption)] text-[var(--success-fg)] mt-1">
                <FileSpreadsheet size={13} className="inline mr-1" />
                {result.filename} — <span className="tabular">{result.recordCount}</span>건의 근태 기록이 저장되었습니다.
              </p>
            </div>
          </Card>

          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-1)] bg-[var(--bg-0)]/60">
              <CardHeader title="AI 분석 결과" />
            </div>
            <div className="p-5 space-y-4">
              <Card tone="ghost" className="border-[var(--border-2)] bg-[var(--brand-500)]/5">
                <p className="text-[var(--fs-caption)] text-[var(--brand-400)] whitespace-pre-wrap">{result.analysis.summary}</p>
              </Card>

              {result.analysis.duplicates.length > 0 && (
                <div>
                  <h4 className="font-medium text-[var(--text-1)] mb-2 flex items-center gap-2 text-[var(--fs-body)]">
                    <AlertTriangle size={15} className="text-[var(--danger-fg)]" />
                    중복 기록{" "}
                    <Badge tone="danger" size="xs">{result.analysis.duplicates.length}건</Badge>
                  </h4>
                  <div className="space-y-2">
                    {result.analysis.duplicates.map((dup, i) => (
                      <div
                        key={i}
                        className="bg-[var(--danger-bg)] border border-[var(--danger-border)] rounded-[var(--r-md)] p-3 text-[var(--fs-caption)] text-[var(--danger-fg)]"
                      >
                        {dup.details}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.analysis.warnings.length > 0 && (
                <div>
                  <h4 className="font-medium text-[var(--text-1)] mb-2 flex items-center gap-2 text-[var(--fs-body)]">
                    <AlertCircle size={15} className="text-[var(--warning-fg)]" />
                    주의사항{" "}
                    <Badge tone="warning" size="xs">{result.analysis.warnings.length}건</Badge>
                  </h4>
                  <div className="space-y-2">
                    {result.analysis.warnings.map((warn, i) => {
                      const config = severityConfig[warn.severity];
                      const Icon = config.icon;
                      return (
                        <div
                          key={i}
                          className={`border rounded-[var(--r-md)] p-3 text-[var(--fs-caption)] flex items-start gap-2 ${toneColors[config.tone]}`}
                        >
                          <Icon size={15} className="mt-0.5 shrink-0" />
                          <span>{warn.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.analysis.duplicates.length === 0 && result.analysis.warnings.length === 0 && (
                <p className="text-[var(--text-3)] text-[var(--fs-caption)]">특별한 이상사항이 발견되지 않았습니다.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      <Card padding="none" className="mt-8 overflow-hidden hover-lift">
        <div className="px-5 py-3 border-b border-[var(--border-1)]">
          <CardHeader title="업로드 기록" />
        </div>
        {uploads.length === 0 ? (
          <EmptyState title="업로드된 파일이 없습니다." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>파일명</TH>
                  <TH numeric>레코드 수</TH>
                  <TH>업로드 일시</TH>
                  <TH align="center">관리</TH>
                </TR>
              </THead>
              <TBody>
                {uploads.map((u: any) => (
                  <TR key={u.id}>
                    <TD emphasis>{u.original_filename || u.filename}</TD>
                    <TD numeric>{u.record_count}건</TD>
                    <TD muted>{u.uploaded_at ? new Date(u.uploaded_at).toLocaleString('ko-KR') : '-'}</TD>
                    <TD align="center">
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={async () => {
                          if (!confirm('이 업로드를 삭제하시겠습니까? 관련 데이터도 함께 삭제됩니다.')) return;
                          try { await deleteUpload(u.id); loadUploads(); } catch (e: any) { toast.error(e.message); }
                        }}
                        leadingIcon={<Trash2 className="w-3.5 h-3.5" />}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
