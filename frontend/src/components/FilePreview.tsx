"use client";

import { ExternalLink, Download, FileText } from "lucide-react";
import { openFile, downloadFile, inferExtension, isImageData, isPdfData } from "@/lib/fileDownload";

interface Props {
  label: string;
  data?: string | null;       // Base64 data URL 또는 일반 URL
  /** 다운로드 시 사용할 파일 이름 (확장자 제외). 예: "통장사본_홍길동" */
  filenamePrefix?: string;
  /** 미리보기 이미지 최대 높이 (px). 기본 200 */
  maxHeight?: number;
  emptyText?: string;
}

export function FilePreview({ label, data, filenamePrefix, maxHeight = 200, emptyText = "첨부된 파일이 없습니다." }: Props) {
  if (!data) {
    return (
      <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border-2)] bg-[var(--bg-0)] px-3 py-4 text-center">
        <p className="text-[var(--fs-caption)] font-medium text-[var(--text-3)] mb-1">{label}</p>
        <p className="text-[var(--fs-caption)] text-[var(--text-4)]">{emptyText}</p>
      </div>
    );
  }

  const ext = data.startsWith('data:') ? inferExtension(data) : (data.split('.').pop() || 'bin');
  const filename = `${filenamePrefix || label}.${ext}`;

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--bg-0)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[var(--fs-caption)] font-medium text-[var(--text-2)]">{label}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openFile(data)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--brand-400)]"
            title="새 탭에서 열기"
          >
            <ExternalLink className="w-3 h-3" /> 열기
          </button>
          <button
            type="button"
            onClick={() => downloadFile(data, filename)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--brand-400)]"
            title="다운로드"
          >
            <Download className="w-3 h-3" /> 다운로드
          </button>
        </div>
      </div>
      {isImageData(data) || /\.(jpg|jpeg|png|gif|webp)$/i.test(data) ? (
        <button type="button" onClick={() => openFile(data)} className="block w-full">
          <img
            src={data}
            alt={label}
            style={{ maxHeight }}
            className="w-full object-contain rounded border border-[var(--border-1)] bg-white cursor-zoom-in"
          />
        </button>
      ) : isPdfData(data) || /\.pdf$/i.test(data) ? (
        <button
          type="button"
          onClick={() => openFile(data)}
          className="w-full flex items-center gap-2 px-3 py-3 rounded bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-2)]"
        >
          <FileText className="w-5 h-5 text-[var(--brand-400)]" />
          <span className="text-[var(--fs-caption)] font-medium">PDF 열기 ({filename})</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openFile(data)}
          className="w-full flex items-center gap-2 px-3 py-3 rounded bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-2)]"
        >
          <FileText className="w-5 h-5 text-[var(--brand-400)]" />
          <span className="text-[var(--fs-caption)] font-medium">파일 열기 ({filename})</span>
        </button>
      )}
    </div>
  );
}
