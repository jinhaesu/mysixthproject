import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';

const router = Router();

/**
 * P7D — 비상 대응 매뉴얼 관리 (중처법 §4-8)
 * requireAuth 뒤에 마운트.
 *
 * scenario_kind: fire | gas_leak | blackout | critical_incident | chemical | other
 * status: draft | active | superseded
 */

const VALID_KINDS = new Set(['fire', 'gas_leak', 'blackout', 'critical_incident', 'chemical', 'other']);

// ═══════════════════════════════════════════════════════════════
// GET /api/emergency-manual/manuals?kind=&status=
// ═══════════════════════════════════════════════════════════════
router.get('/manuals', async (req: Request, res: Response) => {
  try {
    const kind = String(req.query.kind || '').trim();
    const status = String(req.query.status || '').trim();
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (kind) { clauses.push('scenario_kind = ?'); params.push(kind); }
    if (status) { clauses.push('status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT * FROM emergency_manuals
        WHERE ${clauses.join(' AND ')}
        ORDER BY scenario_kind ASC, id DESC`,
      ...params
    );
    res.json({ manuals: rows });
  } catch (error: any) {
    console.error('[emergency-manual/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/emergency-manual/manuals/:id
// ═══════════════════════════════════════════════════════════════
router.get('/manuals/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const row = await dbGet(`SELECT * FROM emergency_manuals WHERE id = ?`, id);
    if (!row) { res.status(404).json({ error: '매뉴얼 없음' }); return; }
    res.json({ manual: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/emergency-manual/manuals
// body: { scenario_kind, title, version?, content_html?, attachment_url?, effective_from? }
// ═══════════════════════════════════════════════════════════════
router.post('/manuals', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    const scenario_kind = String(b.scenario_kind || '').trim();
    if (!scenario_kind) { res.status(400).json({ error: 'scenario_kind 필요' }); return; }
    if (!VALID_KINDS.has(scenario_kind)) {
      res.status(400).json({ error: `scenario_kind 는 ${Array.from(VALID_KINDS).join('|')} 중 하나` });
      return;
    }
    const title = String(b.title || '').trim();
    if (!title) { res.status(400).json({ error: 'title 필요' }); return; }
    const version = String(b.version || '1.0').trim();
    const result = await dbRun(
      `INSERT INTO emergency_manuals
         (scenario_kind, title, version, content_html, attachment_url,
          effective_from, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
      scenario_kind, title, version,
      String(b.content_html || ''), String(b.attachment_url || ''),
      b.effective_from || null,
      user?.id || 0
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('[emergency-manual/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/emergency-manual/manuals/:id
// ═══════════════════════════════════════════════════════════════
router.patch('/manuals/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id FROM emergency_manuals WHERE id = ?`, id);
    if (!cur) { res.status(404).json({ error: '매뉴얼 없음' }); return; }

    const b = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (b.scenario_kind !== undefined) {
      const k = String(b.scenario_kind).trim();
      if (!VALID_KINDS.has(k)) {
        res.status(400).json({ error: `scenario_kind 는 ${Array.from(VALID_KINDS).join('|')} 중 하나` });
        return;
      }
      sets.push('scenario_kind = ?'); params.push(k);
    }
    if (b.title !== undefined) { sets.push('title = ?'); params.push(String(b.title || '')); }
    if (b.version !== undefined) { sets.push('version = ?'); params.push(String(b.version || '1.0')); }
    if (b.content_html !== undefined) { sets.push('content_html = ?'); params.push(String(b.content_html || '')); }
    if (b.attachment_url !== undefined) { sets.push('attachment_url = ?'); params.push(String(b.attachment_url || '')); }
    if (b.effective_from !== undefined) { sets.push('effective_from = ?'); params.push(b.effective_from || null); }
    if (b.status !== undefined) { sets.push('status = ?'); params.push(String(b.status || 'draft')); }
    if (b.superseded_by !== undefined) {
      sets.push('superseded_by = ?');
      params.push(b.superseded_by ? Number(b.superseded_by) : null);
    }

    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE emergency_manuals SET ${sets.join(', ')} WHERE id = ?`, ...params);
    const updated = await dbGet(`SELECT * FROM emergency_manuals WHERE id = ?`, id);
    res.json({ success: true, manual: updated });
  } catch (error: any) {
    console.error('[emergency-manual/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/emergency-manual/manuals/:id/publish
// draft → active. 발효일(effective_from) 미지정 시 오늘 KST 자동 채움.
// ═══════════════════════════════════════════════════════════════
router.post('/manuals/:id/publish', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT * FROM emergency_manuals WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '매뉴얼 없음' }); return; }
    const b = req.body || {};
    const today = new Date();
    const kst = new Date(today.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kst.toISOString().slice(0, 10);
    const effectiveFrom = b.effective_from || cur.effective_from || todayStr;

    await dbRun(
      `UPDATE emergency_manuals
          SET status = 'active',
              effective_from = ?,
              updated_at = NOW()
        WHERE id = ?`,
      effectiveFrom, id
    );
    // 같은 scenario_kind 의 이전 active 매뉴얼은 superseded 로 이동
    await dbRun(
      `UPDATE emergency_manuals
          SET status = 'superseded',
              superseded_by = ?,
              updated_at = NOW()
        WHERE scenario_kind = ?
          AND id <> ?
          AND status = 'active'`,
      id, cur.scenario_kind, id
    );
    const updated = await dbGet(`SELECT * FROM emergency_manuals WHERE id = ?`, id);
    res.json({ success: true, manual: updated });
  } catch (error: any) {
    console.error('[emergency-manual/publish]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
