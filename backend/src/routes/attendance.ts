import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// Get all records with optional filters
router.get('/', (req: Request, res: Response) => {
  try {
    const {
      startDate, endDate, name, category,
      department, workplace, uploadId,
      page = '1', limit = '100',
    } = req.query;

    let query = 'SELECT * FROM attendance_records WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    if (name) {
      query += ' AND name = ?';
      params.push(name);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (department) {
      query += ' AND department = ?';
      params.push(department);
    }
    if (workplace) {
      query += ' AND workplace = ?';
      params.push(workplace);
    }
    if (uploadId) {
      query += ' AND upload_id = ?';
      params.push(uploadId);
    }

    // Count total
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = (db.prepare(countQuery).get(...params) as any).total;

    // Paginate
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    query += ' ORDER BY date DESC, name ASC LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const records = db.prepare(query).all(...params);

    res.json({
      records,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get summary statistics
router.get('/stats', (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    if (startDate) {
      dateFilter += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND date <= ?';
      params.push(endDate);
    }

    // By worker
    const byWorker = db.prepare(`
      SELECT name,
        COUNT(*) as days,
        SUM(total_hours) as total_hours,
        SUM(regular_hours) as regular_hours,
        SUM(overtime_hours) as overtime_hours,
        AVG(total_hours) as avg_hours
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY name ORDER BY total_hours DESC
    `).all(...params);

    // By category
    const byCategory = db.prepare(`
      SELECT category,
        COUNT(*) as count,
        SUM(total_hours) as total_hours,
        SUM(regular_hours) as regular_hours,
        SUM(overtime_hours) as overtime_hours
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY category
    `).all(...params);

    // By department
    const byDepartment = db.prepare(`
      SELECT department,
        COUNT(*) as count,
        SUM(total_hours) as total_hours,
        SUM(regular_hours) as regular_hours,
        SUM(overtime_hours) as overtime_hours
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY department
    `).all(...params);

    // By workplace
    const byWorkplace = db.prepare(`
      SELECT workplace,
        COUNT(*) as count,
        SUM(total_hours) as total_hours,
        SUM(regular_hours) as regular_hours,
        SUM(overtime_hours) as overtime_hours
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY workplace
    `).all(...params);

    // Daily trend
    const dailyTrend = db.prepare(`
      SELECT date,
        COUNT(*) as count,
        SUM(total_hours) as total_hours,
        SUM(overtime_hours) as overtime_hours
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY date ORDER BY date ASC
    `).all(...params);

    // Monthly trend
    const monthlyTrend = db.prepare(`
      SELECT substr(date, 1, 7) as month,
        COUNT(*) as count,
        SUM(total_hours) as total_hours,
        SUM(overtime_hours) as overtime_hours
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY substr(date, 1, 7) ORDER BY month ASC
    `).all(...params);

    res.json({
      byWorker,
      byCategory,
      byDepartment,
      byWorkplace,
      dailyTrend,
      monthlyTrend,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pivot table data
router.get('/pivot', (req: Request, res: Response) => {
  try {
    const {
      rowField = 'name',
      colField = 'department',
      valueField = 'total_hours',
      aggFunc = 'sum',
      startDate,
      endDate,
    } = req.query;

    const allowedFields = ['name', 'category', 'department', 'workplace', 'date', 'annual_leave'];
    const allowedValues = ['total_hours', 'regular_hours', 'overtime_hours', 'break_time'];
    const allowedAgg = ['sum', 'avg', 'count', 'min', 'max'];

    if (!allowedFields.includes(rowField as string) || !allowedFields.includes(colField as string)) {
      res.status(400).json({ error: '유효하지 않은 필드입니다.' });
      return;
    }
    if (!allowedValues.includes(valueField as string)) {
      res.status(400).json({ error: '유효하지 않은 값 필드입니다.' });
      return;
    }
    if (!allowedAgg.includes(aggFunc as string)) {
      res.status(400).json({ error: '유효하지 않은 집계 함수입니다.' });
      return;
    }

    let dateFilter = '';
    const params: any[] = [];
    if (startDate) {
      dateFilter += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND date <= ?';
      params.push(endDate);
    }

    // Get distinct column values
    const colValues = db.prepare(
      `SELECT DISTINCT ${colField} as val FROM attendance_records WHERE 1=1 ${dateFilter} ORDER BY val`
    ).all(...params) as { val: string }[];

    // Get pivot data
    const rows = db.prepare(`
      SELECT ${rowField} as row_key, ${colField} as col_key,
        ${aggFunc === 'count' ? 'COUNT(*)' : `${aggFunc.toString().toUpperCase()}(${valueField})`} as value
      FROM attendance_records WHERE 1=1 ${dateFilter}
      GROUP BY ${rowField}, ${colField}
      ORDER BY ${rowField}
    `).all(...params) as { row_key: string; col_key: string; value: number }[];

    // Build pivot table structure
    const pivotMap = new Map<string, Record<string, number>>();
    for (const row of rows) {
      if (!pivotMap.has(row.row_key)) {
        pivotMap.set(row.row_key, {});
      }
      pivotMap.get(row.row_key)![row.col_key] = Math.round(row.value * 100) / 100;
    }

    const pivotData = Array.from(pivotMap.entries()).map(([key, values]) => ({
      rowKey: key,
      ...values,
    }));

    res.json({
      columns: colValues.map((c) => c.val),
      data: pivotData,
      rowField,
      colField,
      valueField,
      aggFunc,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get filter options (distinct values)
router.get('/filters', (_req: Request, res: Response) => {
  try {
    const names = db.prepare('SELECT DISTINCT name FROM attendance_records ORDER BY name').all() as { name: string }[];
    const categories = db.prepare('SELECT DISTINCT category FROM attendance_records WHERE category != "" ORDER BY category').all() as { category: string }[];
    const departments = db.prepare('SELECT DISTINCT department FROM attendance_records WHERE department != "" ORDER BY department').all() as { department: string }[];
    const workplaces = db.prepare('SELECT DISTINCT workplace FROM attendance_records WHERE workplace != "" ORDER BY workplace').all() as { workplace: string }[];
    const dateRange = db.prepare('SELECT MIN(date) as minDate, MAX(date) as maxDate FROM attendance_records').get() as { minDate: string; maxDate: string };

    res.json({
      names: names.map((n) => n.name),
      categories: categories.map((c) => c.category),
      departments: departments.map((d) => d.department),
      workplaces: workplaces.map((w) => w.workplace),
      dateRange,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: last day of month
function getLastDayOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

// Monthly summary report (for dashboard)
router.get('/report/summary', (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }

    const y = Number(year);
    const m = Number(month);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = getLastDayOfMonth(y, m);

    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevStartDate = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
    const prevEndDate = getLastDayOfMonth(prevY, prevM);

    const summaryQuery = `
      SELECT
        COALESCE(department, '') as department,
        COALESCE(workplace, '') as workplace,
        COALESCE(category, '') as category,
        CASE
          WHEN clock_in IS NOT NULL AND clock_in != '' AND CAST(SUBSTR(clock_in, 1, 2) AS INTEGER) >= 14
          THEN '야간' ELSE '주간'
        END as shift,
        COUNT(*) as attendance_count,
        COUNT(DISTINCT name) as unique_workers,
        ROUND(SUM(total_hours), 1) as total_hours,
        ROUND(SUM(regular_hours), 1) as regular_hours,
        ROUND(SUM(overtime_hours), 1) as overtime_hours,
        SUM(CASE WHEN annual_leave IS NOT NULL AND annual_leave != '' AND annual_leave != '0' AND annual_leave != '미사용' THEN 1 ELSE 0 END) as annual_leave_days
      FROM attendance_records
      WHERE date >= ? AND date <= ?
      GROUP BY department, workplace, category, shift
      ORDER BY department, workplace, category, shift
    `;

    const current = db.prepare(summaryQuery).all(startDate, endDate);
    const previous = db.prepare(summaryQuery).all(prevStartDate, prevEndDate);

    res.json({ current, previous, year: y, month: m, prevYear: prevY, prevMonth: prevM });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Daily attendance report (for dashboard)
router.get('/report/daily', (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }

    const y = Number(year);
    const m = Number(month);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = getLastDayOfMonth(y, m);

    const dailyQuery = `
      SELECT
        date,
        COALESCE(department, '') as department,
        COALESCE(workplace, '') as workplace,
        COALESCE(category, '') as category,
        COUNT(*) as count,
        ROUND(SUM(total_hours), 1) as total_hours
      FROM attendance_records
      WHERE date >= ? AND date <= ?
      GROUP BY date, department, workplace, category
      ORDER BY date, department, workplace, category
    `;

    const data = db.prepare(dailyQuery).all(startDate, endDate);

    const groups = db.prepare(`
      SELECT DISTINCT COALESCE(department, '') as department, COALESCE(workplace, '') as workplace
      FROM attendance_records
      WHERE date >= ? AND date <= ?
      ORDER BY department, workplace
    `).all(startDate, endDate) as { department: string; workplace: string }[];

    const categories = db.prepare(`
      SELECT DISTINCT COALESCE(category, '') as category
      FROM attendance_records
      WHERE date >= ? AND date <= ? AND category IS NOT NULL AND category != ''
      ORDER BY category
    `).all(startDate, endDate) as { category: string }[];

    res.json({
      data,
      groups,
      categories: categories.map(c => c.category),
      year: y,
      month: m,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
