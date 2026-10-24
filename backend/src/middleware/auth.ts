import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret, verifyLinkSig } from '../lib/secrets';

// ============================================================================
// 인증 + 역할(권한) 검사 — 2026-10-24 보안 정비
//
// 역할은 로그인(SSO) 시 허브(auth.nuldam.com) 권한에서 정해져 토큰 role 클레임에 들어간다.
//   admin   = 허브 슈퍼관리자 또는 aisystem '전체 접근' 레벨 admin
//   manager = aisystem '전체 접근' 레벨 edit
//   viewer  = aisystem '전체 접근' 레벨 view (조회 전용, 급여·개인정보 차단)
//   service = 시크릿을 가진 서버 간 호출자(회계·SCM·MES·경영리포트 등)
//
// role 클레임이 없는 토큰:
//   - ROLE_CLAIM_CUTOFF 이후 발급 → 새 /sso 는 항상 role 을 넣으므로, 시크릿 보유 서버가
//     직접 만든 토큰뿐이다 → service.
//   - 그 전에 발급된 일반 로그인 세션(유효기간 7일 이하) → 만료될 때까지 manager 로 유예.
//   - 그 전에 발급된 장기 토큰(MCP 1년 토큰 등) → 거부. 다시 발급받아야 한다.
// ============================================================================

export type Role = 'admin' | 'manager' | 'viewer' | 'service';
export type Tier = 'basic' | 'sensitive' | 'admin';

const ROLE_CLAIM_CUTOFF_SEC = Math.floor(Date.parse('2026-10-24T14:00:00Z') / 1000);
const LEGACY_SESSION_MAX_LIFETIME_SEC = 7 * 24 * 3600 + 300;
const KNOWN_ROLES = new Set<Role>(['admin', 'manager', 'viewer', 'service']);

export interface AuthRequest extends Request {
  user?: {
    email: string;
    role: Role;
  };
}

/** 토큰 문자열 → {email, role} 또는 null(무효). */
export function resolveAuthToken(token: string): { email: string; role: Role } | null {
  let decoded: any;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
  if (!decoded || decoded.type !== 'auth') return null;
  const email = typeof decoded.email === 'string' ? decoded.email : '';

  if (typeof decoded.role === 'string' && decoded.role) {
    const r = decoded.role as Role;
    return { email, role: KNOWN_ROLES.has(r) ? r : 'viewer' };
  }

  const iat = typeof decoded.iat === 'number' ? decoded.iat : 0;
  const exp = typeof decoded.exp === 'number' ? decoded.exp : Number.MAX_SAFE_INTEGER;
  if (iat >= ROLE_CLAIM_CUTOFF_SEC) return { email, role: 'service' };
  if (!decoded.mcp && iat > 0 && exp - iat <= LEGACY_SESSION_MAX_LIFETIME_SEC) {
    return { email, role: 'manager' };
  }
  return null;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '인증이 필요합니다.' });
    return;
  }

  const resolved = resolveAuthToken(authHeader.split(' ')[1]);
  if (!resolved) {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    return;
  }
  req.user = resolved;
  next();
}

export function roleAllows(role: Role, tier: Tier, method: string): boolean {
  if (role === 'admin' || role === 'service') return true;
  if (tier === 'admin') return false;
  if (role === 'manager') return true;
  // viewer: 일반 화면 조회만
  return tier === 'basic' && (method === 'GET' || method === 'HEAD');
}

const TIER_MESSAGES: Record<Tier, string> = {
  basic: '조회 권한만 있습니다. 변경하려면 관리자에게 권한을 요청하세요.',
  sensitive: '급여·개인정보 메뉴 권한이 없습니다. 관리자에게 문의하세요.',
  admin: '시스템 관리자만 사용할 수 있는 기능입니다.',
};

/**
 * 라우터 마운트 단위 역할 검사. classify 는 마운트 기준 상대 경로(req.path)와 메서드로 등급을 정한다.
 * requireAuth 뒤에 둔다.
 */
export function requireTier(classify: Tier | ((method: string, path: string) => Tier)) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) {
      res.status(401).json({ error: '인증이 필요합니다.' });
      return;
    }
    const tier = typeof classify === 'function' ? classify(req.method, req.path) : classify;
    if (!roleAllows(role, tier, req.method)) {
      console.warn(`[authz] DENY ${req.method} ${req.baseUrl}${req.path} email=${req.user?.email} role=${role} tier=${tier}`);
      res.status(403).json({ error: TIER_MESSAGES[tier] });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// 혼합 라우터 분류 규칙 (/api/regular, /api/survey)
// ---------------------------------------------------------------------------
const startsWithAny = (p: string, prefixes: string[]) =>
  prefixes.some((x) => p === x || p.startsWith(x + '/'));

// /api/regular — 직원 원장(주민번호·계좌·주소), 계약서, 급여·대출·고용기간은 민감.
const REGULAR_SENSITIVE = [
  '/employees', '/contracts', '/salary-settings', '/payroll-calc', '/payroll-closing',
  '/payroll-adjustment', '/payroll-payment', '/loans', '/employment-periods', '/rehire',
  '/diagnose-employee',
];
// 대량 데이터 정정·병합 같은 유지보수 기능은 관리자 전용.
const REGULAR_ADMIN = [
  '/backfill-confirmed-dept', '/recalc-confirmed', '/merge', '/duplicate-candidates',
  '/apply-substitute-workday',
];
export function classifyRegular(_method: string, path: string): Tier {
  if (startsWithAny(path, REGULAR_ADMIN)) return 'admin';
  if (startsWithAny(path, REGULAR_SENSITIVE)) return 'sensitive';
  return 'basic';
}

// /api/survey — 정산·계약서·응답 내보내기는 민감, 스케줄러·일괄 보정은 관리자 전용.
const SURVEY_SENSITIVE = ['/settlement', '/contracts', '/responses/export'];
const SURVEY_ADMIN = [
  '/run-scheduler', '/force-send-scheduled', '/fix-timestamps', '/fix-out-before-in',
  '/fix-clockout-only', '/fix-long-shifts',
];
export function classifySurvey(_method: string, path: string): Tier {
  if (startsWithAny(path, SURVEY_ADMIN)) return 'admin';
  if (startsWithAny(path, SURVEY_SENSITIVE)) return 'sensitive';
  return 'basic';
}

/**
 * 무로그인 공유 링크용 검사 — 링크 서명(sig)이 맞거나, 로그인 토큰이 해당 등급을 통과하면 true.
 * (관리자가 앱 안에서 같은 페이지를 열 때는 Bearer 토큰으로 통과)
 */
export function linkOrRoleAllowed(req: Request, purpose: string, tier: Tier): boolean {
  if (verifyLinkSig(purpose, req.query.sig)) return true;
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return false;
  const r = resolveAuthToken(h.split(' ')[1]);
  return !!r && roleAllows(r.role, tier, 'GET');
}
