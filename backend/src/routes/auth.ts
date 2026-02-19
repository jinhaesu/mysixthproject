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

function isEmailAllowed(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAILS;
  if (!allowed) return true;
  const list = allowed.split(',').map(e => e.trim().toLowerCase());
  return list.includes(email.toLowerCase());
}

// POST /api/auth/send-code
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: '이메일을 입력해주세요.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isEmailAllowed(normalizedEmail)) {
      res.status(403).json({ error: '허용되지 않은 이메일입니다.' });
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

    await resend.emails.send({
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

    if (!challengeToken || !code) {
      res.status(400).json({ error: '인증 코드를 입력해주세요.' });
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

    const inputHash = hashCode(String(code).trim());
    if (inputHash !== decoded.codeHash) {
      res.status(401).json({ error: '인증 코드가 올바르지 않습니다.' });
      return;
    }

    const token = jwt.sign(
      { email: decoded.email, type: 'auth' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

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

export default router;
