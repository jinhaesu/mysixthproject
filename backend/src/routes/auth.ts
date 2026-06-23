import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'attendance-management-secret-key';

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ============================================================================
// 화이트리스트 — 도메인(@xxx) + 정확 이메일(user@xxx) 둘 다 지원
// ALLOWED_EMAILS_STRICT 가 비어있지 않으면: 그 이메일만 정확히 일치해야 통과
//                                          (도메인 화이트리스트 우회 차단)
// ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAIN: 기존 도메인 화이트리스트 (호환 유지)
// ============================================================================
function getAllowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL_DOMAIN || '';
  if (!raw) return [];
  return raw.split(',').map(e => {
    const trimmed = e.trim().toLowerCase();
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  });
}

function getAllowedExactEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS_STRICT || '';
  if (!raw) return [];
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

function isEmailAllowed(email: string): boolean {
  const normalized = email.toLowerCase();
  const strict = getAllowedExactEmails();
  if (strict.length > 0) {
    return strict.includes(normalized);
  }
  const domains = getAllowedDomains();
  if (domains.length === 0) return false;
  return domains.some(domain => normalized.endsWith(domain));
}

// ============================================================================
// Rate limit (메모리) — 단일 인스턴스 기준. Railway 가 1 instance 로 운영되므로 OK.
// IP 기준: 1분 윈도우, 3회 초과 시 5분 차단.
// 이메일 기준: 1분 윈도우, 1회 초과 시 즉시 차단.
// ============================================================================
type Bucket = { count: number; firstAt: number; blockUntil?: number };
const ipBuckets = new Map<string, Bucket>();
const emailBuckets = new Map<string, Bucket>();

const IP_WINDOW_MS = 60_000;
const IP_LIMIT = 3;
const IP_BLOCK_MS = 5 * 60_000;
const EMAIL_WINDOW_MS = 60_000;
const EMAIL_LIMIT = 1;
const EMAIL_BLOCK_MS = 60_000;

function clientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] || '') as string;
  return (xff.split(',')[0] || req.socket.remoteAddress || 'unknown').trim();
}

function checkRate(map: Map<string, Bucket>, key: string, windowMs: number, limit: number, blockMs: number): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const b = map.get(key);
  if (b?.blockUntil && b.blockUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((b.blockUntil - now) / 1000) };
  }
  if (!b || now - b.firstAt > windowMs) {
    map.set(key, { count: 1, firstAt: now });
    return { ok: true };
  }
  b.count += 1;
  if (b.count > limit) {
    b.blockUntil = now + blockMs;
    return { ok: false, retryAfterSec: Math.ceil(blockMs / 1000) };
  }
  return { ok: true };
}

// 주기적 GC (1시간 이상 지난 엔트리 제거)
setInterval(() => {
  const now = Date.now();
  for (const m of [ipBuckets, emailBuckets]) {
    for (const [k, v] of m.entries()) {
      if ((v.blockUntil ?? 0) < now && now - v.firstAt > 3_600_000) m.delete(k);
    }
  }
}, 600_000).unref?.();

// 인증 실패 횟수 제한 (challengeToken 별, 메모리)
const challengeFailures = new Map<string, number>();
const CHALLENGE_FAIL_LIMIT = 5;
setInterval(() => {
  // challengeToken JWT 자체가 10분 만료라 캐시는 1시간이면 충분
  if (challengeFailures.size > 10_000) challengeFailures.clear();
}, 600_000).unref?.();

// POST /api/auth/send-code
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const ip = clientIp(req);

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: '이메일을 입력해주세요.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1) IP rate limit — 브루트포스/이메일 추측 방어
    const ipCheck = checkRate(ipBuckets, ip, IP_WINDOW_MS, IP_LIMIT, IP_BLOCK_MS);
    if (!ipCheck.ok) {
      console.warn(`[auth.send-code] IP RL blocked ip=${ip} email=${normalizedEmail} retry=${ipCheck.retryAfterSec}s`);
      res.status(429).json({ error: `요청이 너무 잦습니다. ${ipCheck.retryAfterSec}초 후 다시 시도해주세요.` });
      return;
    }

    // 2) Email rate limit — 동일 이메일 1분 1회
    const emailCheck = checkRate(emailBuckets, normalizedEmail, EMAIL_WINDOW_MS, EMAIL_LIMIT, EMAIL_BLOCK_MS);
    if (!emailCheck.ok) {
      console.warn(`[auth.send-code] email RL blocked ip=${ip} email=${normalizedEmail} retry=${emailCheck.retryAfterSec}s`);
      res.status(429).json({ error: `같은 이메일로 너무 자주 요청했습니다. ${emailCheck.retryAfterSec}초 후 다시 시도해주세요.` });
      return;
    }

    // 3) 화이트리스트 — strict 모드 우선, 없으면 도메인 화이트리스트, 둘 다 없으면 DENY
    if (!isEmailAllowed(normalizedEmail)) {
      console.warn(`[auth.send-code] DENY ip=${ip} email=${normalizedEmail} (whitelist miss)`);
      const strict = getAllowedExactEmails();
      const domains = getAllowedDomains();
      const hint =
        strict.length > 0 ? '등록된 관리자 이메일만 로그인할 수 있습니다.' :
        domains.length > 0 ? `${domains.join(', ')} 이메일만 사용할 수 있습니다.` :
        '관리자 이메일이 설정되지 않았습니다. 시스템 관리자에게 문의하세요.';
      res.status(403).json({ error: hint });
      return;
    }

    if (!process.env.RESEND_API_KEY) {
      res.status(500).json({ error: 'RESEND_API_KEY가 설정되지 않았습니다.' });
      return;
    }

    const code = generateCode();
    const codeH = hashCode(code);
    const challengeToken = jwt.sign(
      { email: normalizedEmail, codeHash: codeH, type: 'challenge' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    console.log(`Sending code to ${normalizedEmail} from ${fromEmail}`);

    const { data, error: sendError } = await resend.emails.send({
      from: `근태관리시스템 <${fromEmail}>`,
      to: normalizedEmail,
      subject: '근태 관리 시스템 - 로그인 인증 코드',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e40af; margin-bottom: 16px;">근태 관리 시스템</h2>
          <p style="color: #374151; margin-bottom: 24px;">로그인 인증 코드입니다.</p>
          <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">이 코드는 10분간 유효합니다.</p>
        </div>
      `,
    });

    if (sendError) {
      console.error('Resend API error:', sendError);
      res.status(500).json({ error: `이메일 발송 실패: ${sendError.message}` });
      return;
    }

    console.log('Email sent successfully:', data?.id);
    res.json({ challengeToken });
  } catch (error: any) {
    console.error('Send code error:', error);
    res.status(500).json({ error: '인증 코드 발송에 실패했습니다.' });
  }
});

// POST /api/auth/verify
router.post('/verify', (req: Request, res: Response) => {
  try {
    const { challengeToken, code } = req.body;
    const ip = clientIp(req);

    if (!challengeToken || !code) {
      res.status(400).json({ error: '인증 코드를 입력해주세요.' });
      return;
    }

    // IP rate limit (verify 도 동일 정책 — 브루트포스 OTP 코드 방어)
    const ipCheck = checkRate(ipBuckets, ip, IP_WINDOW_MS, IP_LIMIT * 2, IP_BLOCK_MS);
    if (!ipCheck.ok) {
      console.warn(`[auth.verify] IP RL blocked ip=${ip} retry=${ipCheck.retryAfterSec}s`);
      res.status(429).json({ error: `요청이 너무 잦습니다. ${ipCheck.retryAfterSec}초 후 다시 시도해주세요.` });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(challengeToken, JWT_SECRET);
    } catch {
      res.status(401).json({ error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' });
      return;
    }

    if (decoded.type !== 'challenge') {
      res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
      return;
    }

    // challengeToken 별 실패 횟수 제한 (5회 초과 시 즉시 무효화)
    const tokenKey = hashCode(challengeToken).slice(0, 32);
    const failed = challengeFailures.get(tokenKey) || 0;
    if (failed >= CHALLENGE_FAIL_LIMIT) {
      console.warn(`[auth.verify] challenge locked tokenKey=${tokenKey} ip=${ip} email=${decoded.email}`);
      res.status(401).json({ error: '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.' });
      return;
    }

    const inputHash = hashCode(String(code).trim());
    if (inputHash !== decoded.codeHash) {
      challengeFailures.set(tokenKey, failed + 1);
      console.warn(`[auth.verify] bad OTP ip=${ip} email=${decoded.email} fail=${failed + 1}/${CHALLENGE_FAIL_LIMIT}`);
      res.status(401).json({ error: '인증 코드가 올바르지 않습니다.' });
      return;
    }

    // 성공 시 해당 challenge 의 실패 카운트 정리
    challengeFailures.delete(tokenKey);

    const token = jwt.sign(
      { email: decoded.email, type: 'auth' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[auth.verify] OK ip=${ip} email=${decoded.email}`);
    res.json({
      token,
      user: { email: decoded.email },
    });
  } catch (error: any) {
    console.error('Verify error:', error);
    res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
  }
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '인증이 필요합니다.' });
    return;
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== 'auth') {
      res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
      return;
    }
    res.json({ user: { email: decoded.email } });
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

// POST /api/auth/mcp-token - Generate long-lived token for MCP integration
router.post('/mcp-token', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '인증이 필요합니다.' });
    return;
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as any;
    if (decoded.type !== 'auth') {
      res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
      return;
    }
    // Generate 1-year token for MCP
    const mcpToken = jwt.sign(
      { email: decoded.email, type: 'auth', mcp: true },
      JWT_SECRET,
      { expiresIn: '365d' }
    );
    res.json({ token: mcpToken, expires: '365 days' });
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
});

export default router;
