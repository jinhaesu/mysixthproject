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

    const { startDate, endDate } = req.query;
    let dateFilter = '';
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) { dateFilter += ` AND date >= $${paramIdx}`; params.push(startDate); paramIdx++; }
    if (endDate) { dateFilter += ` AND date <= $${paramIdx}`; params.push(endDate); paramIdx++; }

    const [byWorker, byCategory, byDepartment, byWorkplace, dailyTrend, monthlyTrend] = await Promise.all([
      sql(`SELECT name, COUNT(*) as days, SUM(total_hours) as total_hours, SUM(regular_hours) as regular_hours, SUM(overtime_hours) as overtime_hours, AVG(total_hours) as avg_hours FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY name ORDER BY total_hours DESC`, params),
      sql(`SELECT category, COUNT(*) as count, SUM(total_hours) as total_hours, SUM(regular_hours) as regular_hours, SUM(overtime_hours) as overtime_hours FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY category`, params),
      sql(`SELECT department, COUNT(*) as count, SUM(total_hours) as total_hours, SUM(regular_hours) as regular_hours, SUM(overtime_hours) as overtime_hours FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY department`, params),
      sql(`SELECT workplace, COUNT(*) as count, SUM(total_hours) as total_hours, SUM(regular_hours) as regular_hours, SUM(overtime_hours) as overtime_hours FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY workplace`, params),
      sql(`SELECT date, COUNT(*) as count, SUM(total_hours) as total_hours, SUM(overtime_hours) as overtime_hours FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY date ORDER BY date ASC`, params),
      sql(`SELECT substring(date, 1, 7) as month, COUNT(*) as count, SUM(total_hours) as total_hours, SUM(overtime_hours) as overtime_hours FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY substring(date, 1, 7) ORDER BY month ASC`, params),
    ]);

    return res.status(200).json({ byWorker, byCategory, byDepartment, byWorkplace, dailyTrend, monthlyTrend });
  } catch (error: any) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: error.message });
  }
}
