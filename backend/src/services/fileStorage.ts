/**
 * Supabase Storage 추상화.
 *
 * 정책:
 *  - bucket: STORAGE_BUCKET (private). 외부 접근은 항상 signed URL.
 *  - upload: base64 data URL 또는 binary buffer 입력 → object path 반환.
 *  - signed URL TTL: SIGNED_URL_TTL_SECONDS (기본 3600s = 1h).
 *  - 작은 파일 (< STORAGE_THRESHOLD_BYTES) 은 DB 에 두는 게 비용/지연 면에서 유리.
 *    base64 길이 검사로 임계치 판단.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.STORAGE_BUCKET || 'employee-docs';
const SIGNED_URL_TTL_SECONDS = parseInt(process.env.SIGNED_URL_TTL_SECONDS || '3600', 10);

/** base64 길이가 이 이상이면 Storage 로. 대략 50KB (= 67_000 chars base64). */
export const STORAGE_THRESHOLD_BYTES = 50_000;

let _client: SupabaseClient | null = null;

export function getStorageClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export function isStorageEnabled(): boolean {
  return !!(SUPABASE_URL && SERVICE_KEY);
}

export interface UploadResult {
  path: string;          // bucket 내 object path. DB 에 저장.
  size: number;          // 바이트
  contentType: string;
}

function inferContentType(base64: string): string {
  const m = base64.match(/^data:([^;]+);base64,/);
  return m ? m[1] : 'application/octet-stream';
}

function inferExtension(contentType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('heic')) return 'heic';
  return 'bin';
}

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; contentType: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    // raw base64 (legacy data may lack data: prefix)
    return { buf: Buffer.from(dataUrl, 'base64'), contentType: 'application/octet-stream' };
  }
  return { buf: Buffer.from(m[2], 'base64'), contentType: m[1] };
}

/**
 * base64 data URL 을 받아 Storage 에 업로드.
 * @param pathPrefix e.g. "employees/123/bank_slip" — 확장자는 자동 추가
 * @param base64 data:image/jpeg;base64,/9j/... 형식 (또는 raw base64)
 */
export async function uploadBase64(pathPrefix: string, base64: string): Promise<UploadResult> {
  const client = getStorageClient();
  if (!client) throw new Error('Storage not configured (SUPABASE_URL/SERVICE_ROLE_KEY missing)');
  const { buf, contentType } = dataUrlToBuffer(base64);
  const ext = inferExtension(contentType);
  const path = `${pathPrefix}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buf, {
    contentType,
    upsert: true,  // 같은 path 덮어쓰기 허용 (재업로드)
    cacheControl: '3600',
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { path, size: buf.length, contentType };
}

/**
 * Storage 경로에 대한 signed URL 발급.
 * 만료시간 내에 직원이 다운로드 가능. 만료 후 갱신 필요.
 */
export async function getSignedUrl(path: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
  const client = getStorageClient();
  if (!client) throw new Error('Storage not configured');
  if (!path) return '';
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error) throw new Error(`Storage signed URL failed: ${error.message}`);
  return data?.signedUrl || '';
}

/**
 * 여러 path 를 한 번에 signed URL 로 변환. path 가 빈/null 인 항목은 빈 문자열.
 */
export async function getSignedUrls(paths: (string | null | undefined)[], ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string[]> {
  return Promise.all(paths.map(async p => {
    if (!p) return '';
    try { return await getSignedUrl(p, ttlSeconds); }
    catch (e: any) {
      console.error(`[Storage] signed URL failed for ${p}:`, e.message);
      return '';
    }
  }));
}

export async function deleteFromStorage(path: string): Promise<void> {
  const client = getStorageClient();
  if (!client) throw new Error('Storage not configured');
  if (!path) return;
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) console.error(`[Storage] delete failed for ${path}:`, error.message);
}

/**
 * Storage object 가 실제로 존재하는지 검증 (migration verification 용).
 * 200 OK 면 true.
 */
export async function verifyExists(path: string): Promise<boolean> {
  const client = getStorageClient();
  if (!client || !path) return false;
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error || !data) return false;
  return data.size > 0;
}

/**
 * 큰 첨부파일이면 Storage 로, 작으면 DB 에 base64 로 두기 판단.
 */
export function shouldUseStorage(base64: string | null | undefined): boolean {
  if (!base64) return false;
  return base64.length >= STORAGE_THRESHOLD_BYTES;
}

export { BUCKET, SIGNED_URL_TTL_SECONDS };
