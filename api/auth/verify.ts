import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashCode, verifyChallengeToken, createAuthToken } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { challengeToken, code } = req.body;

    if (!challengeToken || !code) {
      return res.status(400).json({ error: '인증 코드를 입력해주세요.' });
    }

    const challenge = verifyChallengeToken(challengeToken);
    if (!challenge) {
      return res.status(401).json({ error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' });
    }

    const inputHash = hashCode(String(code).trim());
    if (inputHash !== challenge.codeHash) {
      return res.status(401).json({ error: '인증 코드가 올바르지 않습니다.' });
    }

    const token = createAuthToken(challenge.email);

    return res.status(200).json({
      token,
      user: { email: challenge.email },
    });
  } catch (error: any) {
    console.error('Verify error:', error);
    return res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
  }
}
