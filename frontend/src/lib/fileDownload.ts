/**
 * Base64 data URL → Blob 변환 → 새 탭 열기 / 다운로드.
 * 큰 data URL 은 브라우저가 차단할 수 있어 Blob URL 로 처리.
 */

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  if (!b64) {
    return new Blob([dataUrl], { type: 'text/plain' });
  }
  const mimeMatch = meta.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function openFile(dataUrlOrHttp: string): void {
  if (!dataUrlOrHttp) return;
  // 일반 URL (http/https) — 그대로 새 탭
  if (!dataUrlOrHttp.startsWith('data:')) {
    window.open(dataUrlOrHttp, '_blank', 'noopener,noreferrer');
    return;
  }
  // data URL — Blob URL 로 변환 후 새 탭
  try {
    const blob = dataUrlToBlob(dataUrlOrHttp);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // 새 탭 로딩 후 revoke (즉시 revoke 시 빈 화면)
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    // fallback — 직접 링크 클릭 (작은 파일)
    window.open(dataUrlOrHttp, '_blank', 'noopener,noreferrer');
  }
}

export function downloadFile(dataUrlOrHttp: string, filename: string): void {
  if (!dataUrlOrHttp) return;
  let url = dataUrlOrHttp;
  let needRevoke = false;
  if (dataUrlOrHttp.startsWith('data:')) {
    try {
      const blob = dataUrlToBlob(dataUrlOrHttp);
      url = URL.createObjectURL(blob);
      needRevoke = true;
    } catch {}
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (needRevoke) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function inferExtension(dataUrlOrMime: string): string {
  const m = dataUrlOrMime.match(/data:([^;]+)/);
  const mime = m ? m[1] : dataUrlOrMime;
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('heic')) return 'heic';
  return 'bin';
}

export function isImageData(dataUrl: string): boolean {
  return /^data:image\//.test(dataUrl);
}

export function isPdfData(dataUrl: string): boolean {
  return /^data:application\/pdf/.test(dataUrl);
}
