import crypto from 'crypto';

// ============================================================================
// 서명 시크릿 단일 출처 (2026-10-24 보안 정비)
// - 예전에는 각 파일이 `process.env.JWT_SECRET || '<공개 상수>'` 로 폴백했다.
//   폴백 상수는 소스에 공개돼 있어, env 가 빠지면 누구나 관리자 토큰을 위조할 수 있었다.
// - 이제 env 가 없거나 약하면 프로세스가 기동하지 않는다(fail-closed).
//   Cloud Run 은 새 리비전이 뜨지 못하면 트래픽을 기존 리비전에 그대로 둔다.
// ============================================================================

const KNOWN_WEAK = new Set([
  'attendance-management-secret-key',
  'changeme',
  'secret',
]);

let cached: string | null = null;

export function getJwtSecret(): string {
  if (cached) return cached;
  const v = (process.env.JWT_SECRET || '').trim();
  if (!v) {
    throw new Error('[secrets] JWT_SECRET 환경변수가 없습니다. 기동을 중단합니다.');
  }
  if (v.length < 32 || KNOWN_WEAK.has(v)) {
    throw new Error('[secrets] JWT_SECRET 이 너무 짧거나 공개된 기본값입니다. 기동을 중단합니다.');
  }
  cached = v;
  return v;
}

// MCP 접속 키 — 미설정이면 키 방식 접속 자체를 끈다(토큰 방식만 허용).
export function getMcpApiKey(): string | null {
  const v = (process.env.MCP_API_KEY || '').trim();
  if (!v || v.length < 24 || v === 'joinandjoin-mcp-2026') return null;
  return v;
}

// ----------------------------------------------------------------------------
// 무로그인 공유 링크 서명 (문자로 나가는 계약서 확인·출결 리포트 링크)
// 링크에 sig=HMAC(purpose) 를 붙이고, 공개 API 는 sig 가 맞을 때만 응답한다.
// 순번 id·날짜만으로 남의 계약서/명단을 열람하던 구멍을 막는다.
// ----------------------------------------------------------------------------
export function linkSig(purpose: string): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`link:${purpose}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyLinkSig(purpose: string, sig: unknown): boolean {
  if (typeof sig !== 'string' || sig.length !== 32) return false;
  const expected = linkSig(purpose);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export const contractLinkPurpose = (id: string | number) => `contract:${id}`;
export const reportLinkPurpose = (kind: 'survey' | 'regular', date: string) => `report:${kind}:${date}`;
