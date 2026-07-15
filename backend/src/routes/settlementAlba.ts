import { Router, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * 알바(사업소득) 정산 서버 영속 + 월 마감.
 * - 근태 원장 기반 기본급/수당은 매번 재계산 (여기 저장 X).
 * - 관리자가 조정한 값(조정+/-, 식대공제)과 월별 마감 상태만 DB 저장.
 * - 마감 후에는 upsert 요청 거부. 재개(reopen)는 관리자 명시적 액션.
 */

function normalizeYm(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  return m ? `${m[1]}-${m[2]}` : '';
}

// GET /api/settlement/alba/:yearMonth
router.get('/alba/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const state = await dbGet(
      `SELECT year_month, status, closed_at, closed_by, reopened_at, reopened_by, note, updated_at
         FROM alba_settlement_state WHERE year_month = ?`, ym
    ) as any;
    const lines = await dbAll(
      `SELECT employee_name, adjust_amount, meal_deduction, updated_at, updated_by
         FROM alba_settlement_line WHERE year_month = ? ORDER BY employee_name`, ym
    );
    res.json({
      year_month: ym,
      state: state || { year_month: ym, status: 'open', closed_at: null, closed_by: '', reopened_at: null, reopened_by: '', note: '' },
      lines,
    });
  } catch (error: any) {
    console.error('[settlement/alba GET]', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settlement/alba/:yearMonth/line  { employee_name, adjust_amount?, meal_deduction? }
router.put('/alba/:yearMonth/line', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const state = await dbGet(`SELECT status FROM alba_settlement_state WHERE year_month = ?`, ym) as any;
    if (state && state.status === 'closed') {
      res.status(409).json({ error: '마감된 월은 편집할 수 없습니다. 재개(reopen) 후 수정하세요.' });
      return;
    }
    const { employee_name, adjust_amount, meal_deduction } = req.body || {};
    if (!employee_name || typeof employee_name !== 'string') {
      res.status(400).json({ error: 'employee_name 필요' });
      return;
    }
    const adj = Number.isFinite(Number(adjust_amount)) ? Math.trunc(Number(adjust_amount)) : 0;
    const meal = Number.isFinite(Number(meal_deduction)) ? Math.max(0, Math.trunc(Number(meal_deduction))) : 0;
    const updater = req.user?.email || '';

    const existing = await dbGet(
      `SELECT id FROM alba_settlement_line WHERE year_month = ? AND employee_name = ?`,
      ym, employee_name
    ) as any;
    if (existing) {
      // 두 값 모두 0이면 삭제 (테이블 비우기)
      if (adj === 0 && meal === 0) {
        await dbRun(`DELETE FROM alba_settlement_line WHERE id = ?`, existing.id);
      } else {
        await dbRun(
          `UPDATE alba_settlement_line
              SET adjust_amount = ?, meal_deduction = ?, updated_at = NOW(), updated_by = ?
            WHERE id = ?`,
          adj, meal, updater, existing.id
        );
      }
    } else if (adj !== 0 || meal !== 0) {
      await dbRun(
        `INSERT INTO alba_settlement_line (year_month, employee_name, adjust_amount, meal_deduction, updated_by)
         VALUES (?, ?, ?, ?, ?)`,
        ym, employee_name, adj, meal, updater
      );
    }
    res.json({ success: true, year_month: ym, employee_name, adjust_amount: adj, meal_deduction: meal });
  } catch (error: any) {
    console.error('[settlement/alba PUT line]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settlement/alba/:yearMonth/close  { note? }
router.post('/alba/:yearMonth/close', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const { note } = req.body || {};
    const closer = req.user?.email || '';
    const existing = await dbGet(`SELECT year_month, status FROM alba_settlement_state WHERE year_month = ?`, ym) as any;
    if (existing) {
      if (existing.status === 'closed') {
        res.status(409).json({ error: '이미 마감된 월입니다.' });
        return;
      }
      await dbRun(
        `UPDATE alba_settlement_state
            SET status = 'closed', closed_at = NOW(), closed_by = ?, note = COALESCE(?, note), updated_at = NOW()
          WHERE year_month = ?`,
        closer, note || null, ym
      );
    } else {
      await dbRun(
        `INSERT INTO alba_settlement_state (year_month, status, closed_at, closed_by, note)
         VALUES (?, 'closed', NOW(), ?, ?)`,
        ym, closer, note || ''
      );
    }
    const state = await dbGet(
      `SELECT year_month, status, closed_at, closed_by, reopened_at, reopened_by, note FROM alba_settlement_state WHERE year_month = ?`, ym
    );
    res.json({ success: true, state });
  } catch (error: any) {
    console.error('[settlement/alba close]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settlement/alba/:yearMonth/reopen  { note? }
router.post('/alba/:yearMonth/reopen', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const { note } = req.body || {};
    const reopener = req.user?.email || '';
    const existing = await dbGet(`SELECT year_month, status FROM alba_settlement_state WHERE year_month = ?`, ym) as any;
    if (!existing || existing.status !== 'closed') {
      res.status(409).json({ error: '마감된 상태가 아닙니다.' });
      return;
    }
    await dbRun(
      `UPDATE alba_settlement_state
          SET status = 'open', reopened_at = NOW(), reopened_by = ?, note = COALESCE(?, note), updated_at = NOW()
        WHERE year_month = ?`,
      reopener, note || null, ym
    );
    const state = await dbGet(
      `SELECT year_month, status, closed_at, closed_by, reopened_at, reopened_by, note FROM alba_settlement_state WHERE year_month = ?`, ym
    );
    res.json({ success: true, state });
  } catch (error: any) {
    console.error('[settlement/alba reopen]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
