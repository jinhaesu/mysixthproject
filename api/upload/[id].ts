import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../lib/auth';
import { getDb, ensureSchema } from '../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: '인증이 필요합니다.' });

  try {
    await ensureSchema();
    const sql = getDb();

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: '유효하지 않은 ID입니다.' });
    }

    await sql`DELETE FROM attendance_records WHERE upload_id = ${id}`;
    await sql`DELETE FROM uploads WHERE id = ${id}`;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Delete error:', error);
    return res.status(500).json({ error: error.message });
  }
}
