import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../lib/auth';
import { getDb, ensureSchema } from '../../lib/db';

const ALLOWED_FIELDS = ['name', 'category', 'department', 'workplace', 'date', 'annual_leave'];
const ALLOWED_VALUES = ['total_hours', 'regular_hours', 'overtime_hours', 'break_time'];
const ALLOWED_AGG = ['sum', 'avg', 'count', 'min', 'max'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ error: '인증이 필요합니다.' });

  try {
    await ensureSchema();
    const sql = getDb();

    const {
      rowField = 'name',
      colField = 'department',
      valueField = 'total_hours',
      aggFunc = 'sum',
      startDate,
      endDate,
    } = req.query;

    if (!ALLOWED_FIELDS.includes(rowField as string) || !ALLOWED_FIELDS.includes(colField as string)) {
      return res.status(400).json({ error: '유효하지 않은 필드입니다.' });
    }
    if (!ALLOWED_VALUES.includes(valueField as string)) {
      return res.status(400).json({ error: '유효하지 않은 값 필드입니다.' });
    }
    if (!ALLOWED_AGG.includes(aggFunc as string)) {
      return res.status(400).json({ error: '유효하지 않은 집계 함수입니다.' });
    }

    let dateFilter = '';
    const params: any[] = [];
    let paramIdx = 1;

    if (startDate) { dateFilter += ` AND date >= $${paramIdx}`; params.push(startDate); paramIdx++; }
    if (endDate) { dateFilter += ` AND date <= $${paramIdx}`; params.push(endDate); paramIdx++; }

    const aggExpr = aggFunc === 'count' ? 'COUNT(*)' : `${(aggFunc as string).toUpperCase()}(${valueField})`;

    const colValues = await sql(
      `SELECT DISTINCT ${colField} as val FROM attendance_records WHERE 1=1 ${dateFilter} ORDER BY val`,
      params
    );

    const rows = await sql(
      `SELECT ${rowField} as row_key, ${colField} as col_key, ${aggExpr} as value FROM attendance_records WHERE 1=1 ${dateFilter} GROUP BY ${rowField}, ${colField} ORDER BY ${rowField}`,
      params
    ) as { row_key: string; col_key: string; value: number }[];

    const pivotMap = new Map<string, Record<string, number>>();
    for (const row of rows) {
      if (!pivotMap.has(row.row_key)) pivotMap.set(row.row_key, {});
      pivotMap.get(row.row_key)![row.col_key] = Math.round(Number(row.value) * 100) / 100;
    }

    const pivotData = Array.from(pivotMap.entries()).map(([key, values]) => ({
      rowKey: key,
      ...values,
    }));

    return res.status(200).json({
      columns: colValues.map((c: any) => c.val),
      data: pivotData,
      rowField, colField, valueField, aggFunc,
    });
  } catch (error: any) {
    console.error('Pivot error:', error);
    return res.status(500).json({ error: error.message });
  }
}
