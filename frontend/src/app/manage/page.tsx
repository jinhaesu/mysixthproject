"use client";

import { useEffect, useState } from "react";
import { getUploads, deleteUpload } from "@/lib/api";
import type { Upload, AnalysisResult } from "@/types/attendance";
import { Trash2, FileSpreadsheet, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

export default function ManagePage() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadUploads();
  }, []);

  async function loadUploads() {
    setLoading(true);
    try {
      const data = await getUploads();
      setUploads(data);
    } catch {
      // handle error
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
      alert("삭제 중 오류가 발생했습니다.");
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

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">데이터 관리</h2>
      <p className="text-gray-500 mb-8">업로드된 파일과 기록을 관리합니다.</p>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : uploads.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          업로드된 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {uploads.map((upload) => {
            const isExpanded = expandedId === upload.id;
            const analysis = parseAnalysis(upload.ai_analysis);

            return (
              <div key={upload.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet size={20} className="text-green-600" />
                    <div>
                      <p className="font-medium text-gray-900">{upload.original_filename}</p>
                      <p className="text-sm text-gray-500">
                        {upload.record_count}건 | {new Date(upload.uploaded_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : upload.id)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      onClick={() => handleDelete(upload.id)}
                      disabled={deleting === upload.id}
                      className="p-2 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {isExpanded && analysis && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800 whitespace-pre-wrap">{analysis.summary}</p>
                    </div>

                    {analysis.duplicates.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1 flex items-center gap-1">
                          <AlertTriangle size={14} className="text-red-500" />
                          중복 {analysis.duplicates.length}건
                        </p>
                        {analysis.duplicates.map((d, i) => (
                          <p key={i} className="text-sm text-red-600 ml-5">{d.details}</p>
                        ))}
                      </div>
                    )}

                    {analysis.warnings.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          주의사항 {analysis.warnings.length}건
                        </p>
                        {analysis.warnings.slice(0, 10).map((w, i) => (
                          <p key={i} className="text-sm text-yellow-700 ml-5">{w.message}</p>
                        ))}
                        {analysis.warnings.length > 10 && (
                          <p className="text-sm text-gray-400 ml-5">...외 {analysis.warnings.length - 10}건</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
