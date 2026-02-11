"use client";

import { useState, useCallback } from "react";
import { UploadCloud, FileSpreadsheet, AlertTriangle, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { uploadFile } from "@/lib/api";
import type { UploadResponse } from "@/types/attendance";

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const res = await uploadFile(file);
      setResult(res);
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
    high: { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
    medium: { icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
    low: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">엑셀 업로드</h2>
      <p className="text-gray-500 mb-8">
        근태 엑셀 파일을 업로드하면 자동으로 데이터를 파싱하고 AI가 분석합니다.
      </p>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
            <p className="text-gray-600 font-medium">파일 처리 중...</p>
            <p className="text-sm text-gray-400 mt-1">엑셀 파싱 및 AI 분석이 진행됩니다</p>
          </div>
        ) : (
          <label className="cursor-pointer flex flex-col items-center">
            <UploadCloud size={48} className="text-gray-400 mb-4" />
            <p className="text-gray-600 font-medium mb-1">
              파일을 드래그하거나 클릭하여 업로드
            </p>
            <p className="text-sm text-gray-400">.xlsx, .xls, .csv (최대 10MB)</p>
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
        <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Summary */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-green-800">업로드 완료</p>
              <p className="text-sm text-green-600 mt-1">
                <FileSpreadsheet size={14} className="inline mr-1" />
                {result.filename} - {result.recordCount}건의 근태 기록이 저장되었습니다.
              </p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900">AI 분석 결과</h3>
            </div>
            <div className="p-5 space-y-4">
              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{result.analysis.summary}</p>
              </div>

              {/* Duplicates */}
              {result.analysis.duplicates.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} className="text-red-500" />
                    중복 기록 ({result.analysis.duplicates.length}건)
                  </h4>
                  <div className="space-y-2">
                    {result.analysis.duplicates.map((dup, i) => (
                      <div
                        key={i}
                        className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"
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
                  <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
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
                  <p className="text-gray-500 text-sm">특별한 이상사항이 발견되지 않았습니다.</p>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
