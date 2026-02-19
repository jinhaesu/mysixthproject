import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  return res.status(200).json({ user });
}
