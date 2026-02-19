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

    const [names, categories, departments, workplaces, dateRangeResult] = await Promise.all([
      sql`SELECT DISTINCT name FROM attendance_records ORDER BY name`,
      sql`SELECT DISTINCT category FROM attendance_records WHERE category != '' ORDER BY category`,
      sql`SELECT DISTINCT department FROM attendance_records WHERE department != '' ORDER BY department`,
      sql`SELECT DISTINCT workplace FROM attendance_records WHERE workplace != '' ORDER BY workplace`,
      sql`SELECT MIN(date) as "minDate", MAX(date) as "maxDate" FROM attendance_records`,
    ]);

    return res.status(200).json({
      names: names.map((n: any) => n.name),
      categories: categories.map((c: any) => c.category),
      departments: departments.map((d: any) => d.department),
      workplaces: workplaces.map((w: any) => w.workplace),
      dateRange: dateRangeResult[0] || { minDate: null, maxDate: null },
    });
  } catch (error: any) {
    console.error('Filters error:', error);
    return res.status(500).json({ error: error.message });
  }
}
