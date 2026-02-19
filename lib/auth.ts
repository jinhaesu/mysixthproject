import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { VercelRequest } from '@vercel/node';

const JWT_SECRET = process.env.JWT_SECRET || 'attendance-mgmt-secret-2024';

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createChallengeToken(email: string, codeHash: string): string {
  return jwt.sign({ email, codeHash, type: 'challenge' }, JWT_SECRET, { expiresIn: '10m' });
}

export function verifyChallengeToken(token: string): { email: string; codeHash: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== 'challenge') return null;
    return { email: decoded.email, codeHash: decoded.codeHash };
  } catch {
    return null;
  }
}

export function createAuthToken(email: string): string {
  return jwt.sign({ email, type: 'auth' }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): { email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type !== 'auth') return null;
    return { email: decoded.email };
  } catch {
    return null;
  }
}

export function getAuthUser(req: VercelRequest): { email: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  return verifyAuthToken(token);
}

export function isEmailAllowed(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAILS;
  if (!allowed) return true; // 설정 안 되면 모든 이메일 허용
  const list = allowed.split(',').map(e => e.trim().toLowerCase());
  return list.includes(email.toLowerCase());
}
