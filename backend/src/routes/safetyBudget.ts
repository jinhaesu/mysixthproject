import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';

const router = Router();

/**
 * P7C — 안전보건 예산 편성·집행 (중처법 시행령 §4-4)
 * requireAuth 뒤에 마운트.
 *
 * category 종류:
 *   ppe        = 보호구
 *   training   = 교육
 *   facility   = 설비개선
 *   checkup    = 검진
 *   consulting = 전문가 자문
 *   other      = 기타
 *
 * 편성(plans) : 연도·카테고리별 편성 예산 (planned_amount = 원 KRW, BIGINT)
 * 집행(executions) : 실제 지출 내역. plan 삭제 시 CASCADE 삭제.
 */

const CATEGORY_LABEL: Record<string, string> = {
  ppe: '보호구',
  training: '교육',
  facility: '설비개선',
  checkup: '검진',
  consulting: '전문가 자문',
  other: '기타',
};

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_LABEL));

function categoryOrder(cat: string): number {
  const order = ['ppe', 'training', 'facility', 'checkup', 'consulting', 'other'];
  const idx = order.indexOf(cat);
  return idx < 0 ? 99 : idx;
}

function labelFor(cat: string, provided?: string): string {
  const trimmed = (provided || '').trim();
  return trimmed || CATEGORY_LABEL[cat] || cat;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/safety-budget/plans?year=YYYY
// ═══════════════════════════════════════════════════════════════
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const year = req.query.year
      ? parseInt(req.query.year as string)
      : new Date().getFullYear();
    if (!year || Number.isNaN(year)) {
      res.status(400).json({ error: 'year 필요' });
      return;
    }
    const rows = await dbAll(
      `SELECT id, year, category, category_label,
              planned_amount::bigint AS planned_amount,
              notes, created_by, created_at, updated_at
         FROM safety_budget_plans
        WHERE year = ?
        ORDER BY id ASC`,
      year
    ) as any[];
    // BIGINT → number 변환 (pg 는 이미 pg.types.setTypeParser 로 number 처리됨)
    const plans = rows.map(r => ({
      ...r,
      planned_amount: Number(r.planned_amount) || 0,
    }));
    // 카테고리 정렬 (ppe → training → facility → checkup → consulting → other → 기타 신규)
    plans.sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category) || a.id - b.id);
    res.json({ year, plans });
  } catch (error: any) {
    console.error('[safety-budget/plans/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/safety-budget/plans
// body: { year, category, category_label?, planned_amount?, notes? }
// ═══════════════════════════════════════════════════════════════
router.post('/plans', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const year = Number(b.year);
    if (!year) { res.status(400).json({ error: 'year 필요' }); return; }
    const category = String(b.category || '').trim();
    if (!category) { res.status(400).json({ error: 'category 필요' }); return; }
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: `category 는 ${Array.from(VALID_CATEGORIES).join('|')} 중 하나` });
      return;
    }
    const category_label = labelFor(category, b.category_label);
    const planned_amount = Math.max(0, Math.round(Number(b.planned_amount) || 0));
    const notes = String(b.notes || '');

    const existing = await dbGet(
      `SELECT id FROM safety_budget_plans WHERE year = ? AND category = ?`,
      year, category
    ) as any;
    if (existing) {
      res.status(409).json({ error: '이미 해당 연도·카테고리 편성이 존재합니다.', id: existing.id });
      return;
    }

    const result = await dbRun(
      `INSERT INTO safety_budget_plans (year, category, category_label, planned_amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      year, category, category_label, planned_amount, notes
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('[safety-budget/plans/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/safety-budget/plans/:id
// body: { category_label?, planned_amount?, notes? }
// ═══════════════════════════════════════════════════════════════
router.patch('/plans/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const b = req.body || {};
    const cur = await dbGet(`SELECT * FROM safety_budget_plans WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '편성 없음' }); return; }

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (b.category_label !== undefined) {
      sets.push('category_label = ?');
      params.push(String(b.category_label || '').trim() || cur.category_label);
    }
    if (b.planned_amount !== undefined) {
      sets.push('planned_amount = ?');
      params.push(Math.max(0, Math.round(Number(b.planned_amount) || 0)));
    }
    if (b.notes !== undefined) {
      sets.push('notes = ?');
      params.push(String(b.notes || ''));
    }
    if (sets.length === 1) {
      res.status(400).json({ error: '변경사항 없음' });
      return;
    }
    params.push(id);
    await dbRun(
      `UPDATE safety_budget_plans SET ${sets.join(', ')} WHERE id = ?`,
      ...params
    );
    const updated = await dbGet(
      `SELECT id, year, category, category_label,
              planned_amount::bigint AS planned_amount,
              notes, updated_at
         FROM safety_budget_plans WHERE id = ?`, id
    ) as any;
    res.json({
      success: true,
      plan: { ...updated, planned_amount: Number(updated.planned_amount) || 0 },
    });
  } catch (error: any) {
    console.error('[safety-budget/plans/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/safety-budget/executions?year=&category=
// ═══════════════════════════════════════════════════════════════
router.get('/executions', async (req: Request, res: Response) => {
  try {
    const year = req.query.year
      ? parseInt(req.query.year as string)
      : new Date().getFullYear();
    const category = String(req.query.category || '').trim();
    if (!year || Number.isNaN(year)) {
      res.status(400).json({ error: 'year 필요' });
      return;
    }

    const filters: string[] = ['p.year = ?'];
    const params: any[] = [year];
    if (category) {
      filters.push('p.category = ?');
      params.push(category);
    }

    const rows = await dbAll(
      `SELECT e.id, e.budget_plan_id, e.executed_at,
              e.amount::bigint AS amount,
              e.description, e.receipt_url, e.vendor,
              e.executor_id, e.executor_name,
              e.approved_by, e.approved_by_name,
              e.linked_to_ticket_id,
              e.notes, e.created_at,
              p.year, p.category, p.category_label
         FROM safety_budget_executions e
         JOIN safety_budget_plans p ON p.id = e.budget_plan_id
        WHERE ${filters.join(' AND ')}
        ORDER BY e.executed_at DESC, e.id DESC`,
      ...params
    ) as any[];

    const executions = rows.map(r => ({
      ...r,
      amount: Number(r.amount) || 0,
    }));
    res.json({ year, category: category || null, executions });
  } catch (error: any) {
    console.error('[safety-budget/executions/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/safety-budget/executions
// body: { budget_plan_id, executed_at (YYYY-MM-DD), amount, description,
//         receipt_url?, vendor?, executor_name?, approved_by_name?,
//         linked_to_ticket_id?, notes? }
// ═══════════════════════════════════════════════════════════════
router.post('/executions', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    const budget_plan_id = Number(b.budget_plan_id);
    if (!budget_plan_id) { res.status(400).json({ error: 'budget_plan_id 필요' }); return; }
    const executed_at = String(b.executed_at || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(executed_at)) {
      res.status(400).json({ error: 'executed_at 은 YYYY-MM-DD 형식' });
      return;
    }
    const amount = Math.max(0, Math.round(Number(b.amount) || 0));
    if (amount <= 0) { res.status(400).json({ error: 'amount 는 0 초과' }); return; }
    const description = String(b.description || '').trim();
    if (!description) { res.status(400).json({ error: 'description 필요' }); return; }

    const plan = await dbGet(`SELECT id FROM safety_budget_plans WHERE id = ?`, budget_plan_id);
    if (!plan) { res.status(400).json({ error: '해당 budget_plan_id 없음' }); return; }

    // 조치티켓 연결 검증 (있을 때만)
    let linkedTicketId: number | null = null;
    if (b.linked_to_ticket_id !== undefined && b.linked_to_ticket_id !== null && b.linked_to_ticket_id !== '') {
      const tid = Number(b.linked_to_ticket_id);
      if (tid) {
        const ticket = await dbGet(`SELECT id FROM safety_action_tickets WHERE id = ?`, tid);
        if (!ticket) {
          res.status(400).json({ error: '해당 linked_to_ticket_id 없음' });
          return;
        }
        linkedTicketId = tid;
      }
    }

    const result = await dbRun(
      `INSERT INTO safety_budget_executions
         (budget_plan_id, executed_at, amount, description,
          receipt_url, vendor, executor_name, approved_by_name,
          linked_to_ticket_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      budget_plan_id, executed_at, amount, description,
      String(b.receipt_url || ''), String(b.vendor || ''),
      String(b.executor_name || user?.email || ''),
      String(b.approved_by_name || ''),
      linkedTicketId,
      String(b.notes || '')
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('[safety-budget/executions/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/safety-budget/executions/:id
// ═══════════════════════════════════════════════════════════════
router.patch('/executions/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const b = req.body || {};
    const cur = await dbGet(`SELECT * FROM safety_budget_executions WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '집행 없음' }); return; }

    const sets: string[] = [];
    const params: any[] = [];

    if (b.executed_at !== undefined) {
      const v = String(b.executed_at || '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        res.status(400).json({ error: 'executed_at 은 YYYY-MM-DD 형식' });
        return;
      }
      sets.push('executed_at = ?'); params.push(v || cur.executed_at);
    }
    if (b.amount !== undefined) {
      const amt = Math.max(0, Math.round(Number(b.amount) || 0));
      if (amt <= 0) { res.status(400).json({ error: 'amount 는 0 초과' }); return; }
      sets.push('amount = ?'); params.push(amt);
    }
    if (b.description !== undefined) {
      const v = String(b.description || '').trim();
      if (!v) { res.status(400).json({ error: 'description 필요' }); return; }
      sets.push('description = ?'); params.push(v);
    }
    if (b.receipt_url !== undefined) { sets.push('receipt_url = ?'); params.push(String(b.receipt_url || '')); }
    if (b.vendor !== undefined) { sets.push('vendor = ?'); params.push(String(b.vendor || '')); }
    if (b.executor_name !== undefined) { sets.push('executor_name = ?'); params.push(String(b.executor_name || '')); }
    if (b.approved_by_name !== undefined) { sets.push('approved_by_name = ?'); params.push(String(b.approved_by_name || '')); }
    if (b.notes !== undefined) { sets.push('notes = ?'); params.push(String(b.notes || '')); }

    if (b.linked_to_ticket_id !== undefined) {
      if (b.linked_to_ticket_id === null || b.linked_to_ticket_id === '') {
        sets.push('linked_to_ticket_id = ?'); params.push(null);
      } else {
        const tid = Number(b.linked_to_ticket_id);
        if (tid) {
          const t = await dbGet(`SELECT id FROM safety_action_tickets WHERE id = ?`, tid);
          if (!t) { res.status(400).json({ error: '해당 linked_to_ticket_id 없음' }); return; }
          sets.push('linked_to_ticket_id = ?'); params.push(tid);
        }
      }
    }

    if (sets.length === 0) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(
      `UPDATE safety_budget_executions SET ${sets.join(', ')} WHERE id = ?`,
      ...params
    );
    const updated = await dbGet(
      `SELECT id, budget_plan_id, executed_at, amount::bigint AS amount,
              description, receipt_url, vendor, executor_name, approved_by_name,
              linked_to_ticket_id, notes
         FROM safety_budget_executions WHERE id = ?`, id
    ) as any;
    res.json({
      success: true,
      execution: { ...updated, amount: Number(updated.amount) || 0 },
    });
  } catch (error: any) {
    console.error('[safety-budget/executions/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/safety-budget/executions/:id
// ═══════════════════════════════════════════════════════════════
router.delete('/executions/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id FROM safety_budget_executions WHERE id = ?`, id);
    if (!cur) { res.status(404).json({ error: '집행 없음' }); return; }
    await dbRun(`DELETE FROM safety_budget_executions WHERE id = ?`, id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[safety-budget/executions/delete]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/safety-budget/summary?year=
// - categories: [{ category, planned, executed, execution_rate, remaining, count }]
// - quarterly:  [{ quarter, month, executed }]
// - monthly:    [{ month, executed, by_category }]
// - totals:     { planned, executed, execution_rate, remaining }
// ═══════════════════════════════════════════════════════════════
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const year = req.query.year
      ? parseInt(req.query.year as string)
      : new Date().getFullYear();
    if (!year || Number.isNaN(year)) {
      res.status(400).json({ error: 'year 필요' });
      return;
    }

    const plans = await dbAll(
      `SELECT id, category, category_label,
              planned_amount::bigint AS planned_amount
         FROM safety_budget_plans WHERE year = ?`, year
    ) as any[];

    const executions = await dbAll(
      `SELECT e.id, e.budget_plan_id, e.executed_at,
              e.amount::bigint AS amount,
              p.category, p.category_label
         FROM safety_budget_executions e
         JOIN safety_budget_plans p ON p.id = e.budget_plan_id
        WHERE p.year = ?`, year
    ) as any[];

    // 카테고리별 집계
    const byCategory = new Map<string, {
      category: string; category_label: string;
      planned: number; executed: number; count: number;
    }>();
    for (const p of plans) {
      byCategory.set(p.category, {
        category: p.category,
        category_label: p.category_label,
        planned: Number(p.planned_amount) || 0,
        executed: 0,
        count: 0,
      });
    }
    for (const e of executions) {
      const bucket = byCategory.get(e.category);
      if (bucket) {
        bucket.executed += Number(e.amount) || 0;
        bucket.count += 1;
      }
    }
    const categories = Array.from(byCategory.values())
      .sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category))
      .map(c => {
        const execution_rate = c.planned > 0
          ? Math.round((c.executed / c.planned) * 1000) / 10
          : null;
        return {
          ...c,
          execution_rate,
          remaining: Math.max(0, c.planned - c.executed),
        };
      });

    // 월별·분기별 집계
    const monthlyMap = new Map<number, { executed: number; by_category: Record<string, number> }>();
    for (let m = 1; m <= 12; m++) monthlyMap.set(m, { executed: 0, by_category: {} });
    for (const e of executions) {
      const m = parseInt(String(e.executed_at).slice(5, 7));
      if (!m || m < 1 || m > 12) continue;
      const bucket = monthlyMap.get(m)!;
      const amt = Number(e.amount) || 0;
      bucket.executed += amt;
      bucket.by_category[e.category] = (bucket.by_category[e.category] || 0) + amt;
    }
    const monthly = Array.from(monthlyMap.entries())
      .map(([month, v]) => ({ month, executed: v.executed, by_category: v.by_category }))
      .sort((a, b) => a.month - b.month);

    const quarterly = [1, 2, 3, 4].map((q) => {
      const months = [q * 3 - 2, q * 3 - 1, q * 3];
      let executed = 0;
      for (const m of months) executed += monthlyMap.get(m)?.executed || 0;
      return { quarter: q, months, executed };
    });

    const totals = categories.reduce(
      (acc, c) => ({ planned: acc.planned + c.planned, executed: acc.executed + c.executed }),
      { planned: 0, executed: 0 }
    );
    const totals_rate = totals.planned > 0
      ? Math.round((totals.executed / totals.planned) * 1000) / 10
      : null;

    res.json({
      year,
      categories,
      monthly,
      quarterly,
      totals: {
        planned: totals.planned,
        executed: totals.executed,
        execution_rate: totals_rate,
        remaining: Math.max(0, totals.planned - totals.executed),
      },
    });
  } catch (error: any) {
    console.error('[safety-budget/summary]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
