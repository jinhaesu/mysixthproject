import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// ─── Legacy: total hours per day (kept for backward compat) ───

router.get('/', (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }
    const plans = db.prepare(
      'SELECT * FROM workforce_plans WHERE year = ? AND month = ? ORDER BY day ASC, worker_type ASC'
    ).all(Number(year), Number(month));
    const mapped = (plans as any[]).map(p => ({
      ...p,
      planned_hours: p.planned_hours || p.planned_count || 0,
    }));
    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/batch', (req: Request, res: Response) => {
  try {
    const { year, month, plans } = req.body;
    if (!year || !month || !Array.isArray(plans)) {
      res.status(400).json({ error: 'year, month, plans 파라미터가 필요합니다.' });
      return;
    }
    const upsert = db.prepare(`
      INSERT INTO workforce_plans (year, month, day, worker_type, planned_hours, planned_count, memo, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(year, month, day, worker_type)
      DO UPDATE SET planned_hours = excluded.planned_hours, planned_count = excluded.planned_count, memo = excluded.memo, updated_at = CURRENT_TIMESTAMP
    `);
    const batchUpsert = db.transaction((items: any[]) => {
      for (const item of items) {
        const hours = item.planned_hours || 0;
        upsert.run(Number(year), Number(month), item.day, item.worker_type, hours, Math.ceil(hours), item.memo || '');
      }
    });
    batchUpsert(plans);
    const updated = db.prepare(
      'SELECT * FROM workforce_plans WHERE year = ? AND month = ? ORDER BY day ASC, worker_type ASC'
    ).all(Number(year), Number(month));
    const mapped = (updated as any[]).map(p => ({
      ...p,
      planned_hours: p.planned_hours || p.planned_count || 0,
    }));
    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── New: time-slot based planning ───

// Get all slots for a month
router.get('/slots', (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }
    const slots = db.prepare(
      'SELECT * FROM workforce_plan_slots WHERE year = ? AND month = ? ORDER BY day ASC, start_hour ASC'
    ).all(Number(year), Number(month));
    res.json(slots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a slot
router.post('/slots', (req: Request, res: Response) => {
  try {
    const { year, month, day, worker_type, start_hour, duration, headcount, memo } = req.body;
    if (!year || !month || !day || !worker_type || start_hour === undefined || !duration) {
      res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
      return;
    }
    const result = db.prepare(`
      INSERT INTO workforce_plan_slots (year, month, day, worker_type, start_hour, duration, headcount, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(year), Number(month), Number(day),
      worker_type, Number(start_hour), Number(duration),
      Number(headcount) || 1, memo || ''
    );
    const created = db.prepare('SELECT * FROM workforce_plan_slots WHERE id = ?').get(result.lastInsertRowid);
    res.json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a slot
router.put('/slots/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_type, start_hour, duration, headcount, memo } = req.body;
    db.prepare(`
      UPDATE workforce_plan_slots
      SET worker_type = ?, start_hour = ?, duration = ?, headcount = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(worker_type, Number(start_hour), Number(duration), Number(headcount) || 1, memo || '', Number(id));
    const updated = db.prepare('SELECT * FROM workforce_plan_slots WHERE id = ?').get(Number(id));
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
router.delete('/slots/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM workforce_plan_slots WHERE id = ?').get(Number(id));
    if (!existing) {
      res.status(404).json({ error: '슬롯을 찾을 수 없습니다.' });
      return;
    }
    db.prepare('DELETE FROM workforce_plan_slots WHERE id = ?').run(Number(id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Batch save slots for a month (delete all + re-insert)
router.post('/slots/batch', (req: Request, res: Response) => {
  try {
    const { year, month, slots } = req.body;
    if (!year || !month || !Array.isArray(slots)) {
      res.status(400).json({ error: 'year, month, slots 파라미터가 필요합니다.' });
      return;
    }

    const batchSave = db.transaction(() => {
      // Delete existing slots for this month
      db.prepare('DELETE FROM workforce_plan_slots WHERE year = ? AND month = ?')
        .run(Number(year), Number(month));

      // Insert new slots
      const insert = db.prepare(`
        INSERT INTO workforce_plan_slots (year, month, day, worker_type, start_hour, duration, headcount, memo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of slots) {
        insert.run(
          Number(year), Number(month), Number(s.day),
          s.worker_type, Number(s.start_hour), Number(s.duration),
          Number(s.headcount) || 1, s.memo || ''
        );
      }
    });

    batchSave();

    const result = db.prepare(
      'SELECT * FROM workforce_plan_slots WHERE year = ? AND month = ? ORDER BY day ASC, start_hour ASC'
    ).all(Number(year), Number(month));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
