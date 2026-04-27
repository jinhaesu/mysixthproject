"use client";

import { useState, useCallback, useEffect } from "react";
import { UploadCloud, FileSpreadsheet, AlertTriangle, AlertCircle, CheckCircle2, Info, Trash2 } from "lucide-react";
import { uploadFile, getUploads, deleteUpload } from "@/lib/api";
import type { UploadResponse } from "@/types/attendance";

export default function UploadPage() {
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
      const res = await uploadFile(file, { exclude_category: '정규직' });
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
    high: { icon: AlertTriangle, color: "text-[#EB5757]", bg: "bg-[#EB5757]/10 border-[#EB5757]/30" },
    medium: { icon: AlertCircle, color: "text-[#F0BF00]", bg: "bg-[#F0BF00]/10 border-[#F0BF00]/30" },
    low: { icon: Info, color: "text-[#7070FF]", bg: "bg-[#4EA7FC]/10 border-[#5E6AD2]/30" },
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold text-[#F7F8F8] mb-2">엑셀 업로드</h2>
      <p className="text-[#8A8F98] mb-8">
        근태 엑셀 파일을 업로드하면 자동으로 데이터를 파싱하고 AI가 분석합니다.
      </p>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-[#4EA7FC]/10"
            : "border-[#23252A] bg-[#0F1011] hover:border-[#34343A]"
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-[#5E6AD2]/30 border-t-blue-600 rounded-full animate-spin mb-4" />
            <p className="text-[#8A8F98] font-medium">파일 처리 중...</p>
            <p className="text-sm text-[#62666D] mt-1">엑셀 파싱 및 AI 분석이 진행됩니다</p>
          </div>
        ) : (
          <label className="cursor-pointer flex flex-col items-center">
            <UploadCloud size={48} className="text-[#62666D] mb-4" />
            <p className="text-[#8A8F98] font-medium mb-1">
              파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-sm text-[#62666D]">.xlsx, .xls, .csv (최대 10MB)</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleInputChange}
            />
          </label>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-[#EB5757] mt-0.5 shrink-0" />
          <p className="text-[#EB5757]">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Summary */}
          <div className="bg-[#27A644]/10 border border-[#27A644]/30 rounded-xl p-5 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-[#27A644] mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-[#27A644]">업로드 완료</p>
              <p className="text-sm text-[#27A644] mt-1">
                <FileSpreadsheet size={14} className="inline mr-1" />
                {result.filename} - {result.recordCount}건의 근태 기록이 저장되었습니다.
              </p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-[#0F1011] border border-[#23252A] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#23252A] bg-[#08090A]">
              <h3 className="font-semibold text-[#F7F8F8]">AI 분석 결과</h3>
            </div>
            <div className="p-5 space-y-4">
              {/* Summary */}
              <div className="bg-[#4EA7FC]/10 border border-[#5E6AD2]/30 rounded-lg p-4">
                <p className="text-sm text-[#828FFF] whitespace-pre-wrap">{result.analysis.summary}</p>
              </div>

              {/* Duplicates */}
              {result.analysis.duplicates.length > 0 && (
                <div>
                  <h4 className="font-medium text-[#F7F8F8] mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-[#EB5757]" />
                    중복 기록 ({result.analysis.duplicates.length}건)
                  </h4>
                  <div className="space-y-2">
                    {result.analysis.duplicates.map((dup, i) => (
                      <div
                        key={i}
                        className="bg-[#EB5757]/10 border border-[#EB5757]/30 rounded-lg p-3 text-sm text-[#EB5757]"
                      >
                        {dup.details}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.analysis.warnings.length > 0 && (
                <div>
                  <h4 className="font-medium text-[#F7F8F8] mb-2 flex items-center gap-2">
                    <AlertCircle size={16} className="text-yellow-500" />
                    주의사항 ({result.analysis.warnings.length}건)
                  </h4>
                  <div className="space-y-2">
                    {result.analysis.warnings.map((warn, i) => {
                      const config = severityConfig[warn.severity];
                      const Icon = config.icon;
                      return (
                        <div
                          key={i}
                          className={`border rounded-lg p-3 text-sm flex items-start gap-2 ${config.bg}`}
                        >
                          <Icon size={16} className={`${config.color} mt-0.5 shrink-0`} />
                          <span>{warn.message}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {result.analysis.duplicates.length === 0 &&
                result.analysis.warnings.length === 0 && (
                  <p className="text-[#8A8F98] text-sm">특별한 이상사항이 발견되지 않았습니다.</p>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Upload History */}
      <div className="mt-8 bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#23252A]">
          <h3 className="text-lg font-semibold text-[#F7F8F8]">업로드 기록</h3>
        </div>
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-[#62666D] text-sm">업로드된 파일이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#08090A] text-left">
                  <th className="py-2 px-4 font-medium text-[#8A8F98]">파일명</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">레코드 수</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98]">업로드 일시</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#23252A]">
                {uploads.map((u: any) => (
                  <tr key={u.id} className="hover:bg-[#141516]/5">
                    <td className="py-2.5 px-4 font-medium text-[#F7F8F8]">{u.original_filename || u.filename}</td>
                    <td className="py-2.5 px-4 text-right text-[#D0D6E0]">{u.record_count}건</td>
                    <td className="py-2.5 px-4 text-[#8A8F98] text-xs">{u.uploaded_at ? new Date(u.uploaded_at).toLocaleString('ko-KR') : '-'}</td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={async () => {
                          if (!confirm('이 업로드를 삭제하시겠습니까? 관련 데이터도 함께 삭제됩니다.')) return;
                          try { await deleteUpload(u.id); loadUploads(); } catch (e: any) { alert(e.message); }
                        }}
                        className="p-1.5 text-[#EB5757] hover:bg-[#EB5757]/10 rounded" title="삭제">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
