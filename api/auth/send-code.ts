import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { generateCode, hashCode, createChallengeToken, isEmailAllowed } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: '이메일을 입력해주세요.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isEmailAllowed(normalizedEmail)) {
      return res.status(403).json({ error: '허용되지 않은 이메일입니다.' });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ error: 'RESEND_API_KEY가 설정되지 않았습니다.' });
    }

    const code = generateCode();
    const codeH = hashCode(code);
    const challengeToken = createChallengeToken(normalizedEmail, codeH);

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

    return res.status(200).json({ challengeToken });
  } catch (error: any) {
    console.error('Send code error:', error);
    return res.status(500).json({ error: '인증 코드 발송에 실패했습니다.' });
  }
}
