import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

// Get plans for a specific month
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
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Save/update plans for a month (batch upsert)
router.post('/batch', (req: Request, res: Response) => {
  try {
    const { year, month, plans } = req.body;
    if (!year || !month || !Array.isArray(plans)) {
      res.status(400).json({ error: 'year, month, plans 파라미터가 필요합니다.' });
      return;
    }

    const upsert = db.prepare(`
      INSERT INTO workforce_plans (year, month, day, worker_type, planned_count, memo, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(year, month, day, worker_type)
      DO UPDATE SET planned_count = excluded.planned_count, memo = excluded.memo, updated_at = CURRENT_TIMESTAMP
    `);

    const batchUpsert = db.transaction((items: any[]) => {
      for (const item of items) {
        upsert.run(
          Number(year),
          Number(month),
          item.day,
          item.worker_type,
          item.planned_count || 0,
          item.memo || ''
        );
      }
    });

    batchUpsert(plans);

    const updated = db.prepare(
      'SELECT * FROM workforce_plans WHERE year = ? AND month = ? ORDER BY day ASC, worker_type ASC'
    ).all(Number(year), Number(month));

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
