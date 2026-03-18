import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, dbTransaction } from '../db';

const router = Router();

// ─── Legacy: total hours per day (kept for backward compat) ───

router.get('/', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }
    const plans = await dbAll(
      'SELECT * FROM workforce_plans WHERE year = ? AND month = ? ORDER BY day ASC, worker_type ASC',
      Number(year), Number(month)
    );
    const mapped = (plans as any[]).map(p => ({
      ...p,
      planned_hours: p.planned_hours || p.planned_count || 0,
    }));
    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { year, month, plans } = req.body;
    if (!year || !month || !Array.isArray(plans)) {
      res.status(400).json({ error: 'year, month, plans 파라미터가 필요합니다.' });
      return;
    }
    await dbTransaction(async (tx) => {
      for (const item of plans) {
        const hours = item.planned_hours || 0;
        await tx.run(
          `INSERT INTO workforce_plans (year, month, day, worker_type, planned_hours, planned_count, memo, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(year, month, day, worker_type)
          DO UPDATE SET planned_hours = excluded.planned_hours, planned_count = excluded.planned_count, memo = excluded.memo, updated_at = CURRENT_TIMESTAMP`,
          Number(year), Number(month), item.day, item.worker_type, hours, Math.ceil(hours), item.memo || ''
        );
      }
    });
    const updated = await dbAll(
      'SELECT * FROM workforce_plans WHERE year = ? AND month = ? ORDER BY day ASC, worker_type ASC',
      Number(year), Number(month)
    );
    const mapped = (updated as any[]).map(p => ({
      ...p,
      planned_hours: p.planned_hours || p.planned_count || 0,
    }));
    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /workforce-plan/comparison - Compare planned vs actual
router.get('/comparison', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }

    const y = Number(year);
    const m = Number(month);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get planned data grouped by day
    const planned = await dbAll(
      'SELECT day, SUM(planned_hours) as planned_hours FROM workforce_plans WHERE year = ? AND month = ? GROUP BY day ORDER BY day',
      y, m
    );

    // Get actual attendance data grouped by day
    const actual = await dbAll(`
      SELECT
        CAST(SUBSTR(date, 9, 2) AS INTEGER) as day,
        COUNT(DISTINCT name) as worker_count,
        ROUND(CAST(SUM(total_hours) AS NUMERIC), 1) as actual_hours
      FROM attendance_records
      WHERE date >= ? AND date <= ?
      GROUP BY SUBSTR(date, 9, 2)
      ORDER BY day
    `, startDate, endDate);

    // Build comparison array for all days
    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const p = planned.find((r: any) => r.day === d);
      const a = actual.find((r: any) => r.day === d);
      days.push({
        day: d,
        planned_hours: p ? Number(p.planned_hours) : 0,
        actual_hours: a ? Number(a.actual_hours) : 0,
        worker_count: a ? Number(a.worker_count) : 0,
      });
    }

    res.json({ year: y, month: m, days });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── New: time-slot based planning ───

// Get all slots for a month
router.get('/slots', async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }
    const slots = await dbAll(
      'SELECT * FROM workforce_plan_slots WHERE year = ? AND month = ? ORDER BY day ASC, start_hour ASC',
      Number(year), Number(month)
    );
    res.json(slots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a slot
router.post('/slots', async (req: Request, res: Response) => {
  try {
    const { year, month, day, worker_type, start_hour, duration, headcount, memo } = req.body;
    if (!year || !month || !day || !worker_type || start_hour === undefined || !duration) {
      res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
      return;
    }
    const result = await dbRun(
      `INSERT INTO workforce_plan_slots (year, month, day, worker_type, start_hour, duration, headcount, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      Number(year), Number(month), Number(day),
      worker_type, Number(start_hour), Number(duration),
      Number(headcount) || 1, memo || ''
    );
    const created = await dbGet('SELECT * FROM workforce_plan_slots WHERE id = ?', result.lastInsertRowid);
    res.json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a slot
router.put('/slots/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_type, start_hour, duration, headcount, memo } = req.body;
    await dbRun(
      `UPDATE workforce_plan_slots
      SET worker_type = ?, start_hour = ?, duration = ?, headcount = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      worker_type, Number(start_hour), Number(duration), Number(headcount) || 1, memo || '', Number(id)
    );
    const updated = await dbGet('SELECT * FROM workforce_plan_slots WHERE id = ?', Number(id));
    if (!updated) {
      res.status(404).json({ error: '슬롯을 찾을 수 없습니다.' });
      return;
    }
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a slot
router.delete('/slots/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM workforce_plan_slots WHERE id = ?', Number(id));
    if (!existing) {
      res.status(404).json({ error: '슬롯을 찾을 수 없습니다.' });
      return;
    }
    await dbRun('DELETE FROM workforce_plan_slots WHERE id = ?', Number(id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Batch save slots for a month (delete all + re-insert)
router.post('/slots/batch', async (req: Request, res: Response) => {
  try {
    const { year, month, slots } = req.body;
    if (!year || !month || !Array.isArray(slots)) {
      res.status(400).json({ error: 'year, month, slots 파라미터가 필요합니다.' });
      return;
    }

    await dbTransaction(async (tx) => {
      // Delete existing slots for this month
      await tx.run('DELETE FROM workforce_plan_slots WHERE year = ? AND month = ?', Number(year), Number(month));

      // Insert new slots
      for (const s of slots) {
        await tx.run(
          `INSERT INTO workforce_plan_slots (year, month, day, worker_type, start_hour, duration, headcount, memo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          Number(year), Number(month), Number(s.day),
          s.worker_type, Number(s.start_hour), Number(s.duration),
          Number(s.headcount) || 1, s.memo || ''
        );
      }
    });

    const result = await dbAll(
      'SELECT * FROM workforce_plan_slots WHERE year = ? AND month = ? ORDER BY day ASC, start_hour ASC',
      Number(year), Number(month)
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
