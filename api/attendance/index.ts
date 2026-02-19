import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../lib/auth';
import { getDb, ensureSchema } from '../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: '인증이 필요합니다.' });

  try {
    await ensureSchema();
    const sql = getDb();

    const { startDate, endDate, name, category, department, workplace, uploadId, page = '1', limit = '100' } = req.query;

    let query = 'SELECT * FROM attendance_records WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM attendance_records WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) { query += ` AND date >= $${paramIdx}`; countQuery += ` AND date >= $${paramIdx}`; params.push(startDate); paramIdx++; }
    if (endDate) { query += ` AND date <= $${paramIdx}`; countQuery += ` AND date <= $${paramIdx}`; params.push(endDate); paramIdx++; }
    if (name) { query += ` AND name = $${paramIdx}`; countQuery += ` AND name = $${paramIdx}`; params.push(name); paramIdx++; }
    if (category) { query += ` AND category = $${paramIdx}`; countQuery += ` AND category = $${paramIdx}`; params.push(category); paramIdx++; }
    if (department) { query += ` AND department = $${paramIdx}`; countQuery += ` AND department = $${paramIdx}`; params.push(department); paramIdx++; }
    if (workplace) { query += ` AND workplace = $${paramIdx}`; countQuery += ` AND workplace = $${paramIdx}`; params.push(workplace); paramIdx++; }
    if (uploadId) { query += ` AND upload_id = $${paramIdx}`; countQuery += ` AND upload_id = $${paramIdx}`; params.push(uploadId); paramIdx++; }

    const countResult = await sql(countQuery, params);
    const total = parseInt(countResult[0].total);

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    query += ` ORDER BY date DESC, name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    const fullParams = [...params, limitNum, offset];

    const records = await sql(query, fullParams);

    return res.status(200).json({
      records,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Attendance error:', error);
    return res.status(500).json({ error: error.message });
  }
}
