import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';

const router = Router();

/**
 * P7A — 안전보건 방침·규정 문서 관리 (중처법 시행령 §4-1).
 * requireAuth 뒤에 마운트.
 *
 * kind:   policy | regulation | manual | goal
 * status: draft | published | archived
 * target_role: all | production | cafe | office
 */

const VALID_KINDS = new Set(['policy', 'regulation', 'manual', 'goal']);
const VALID_TARGET_ROLES = new Set(['all', 'production', 'cafe', 'office']);

// ═══════════════════════════════════════════════════════════════
// GET /api/policy-manager/documents?kind=&status=
// ═══════════════════════════════════════════════════════════════
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const kind = String(req.query.kind || '').trim();
    const status = String(req.query.status || '').trim();
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (kind) { clauses.push('kind = ?'); params.push(kind); }
    if (status) { clauses.push('status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT id, kind, title, version, content_html, attachment_url, status,
              effective_from, effective_to, superseded_by, requires_acknowledgment,
              target_role, published_at, published_by, ceo_signed_at, ceo_signature_name,
              created_at, updated_at
         FROM policy_documents
        WHERE ${clauses.join(' AND ')}
        ORDER BY kind ASC, id DESC`,
      ...params
    );
    res.json({ documents: rows });
  } catch (error: any) {
    console.error('[policy-manager/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/policy-manager/documents/:id
// ═══════════════════════════════════════════════════════════════
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const row = await dbGet(`SELECT * FROM policy_documents WHERE id = ?`, id);
    if (!row) { res.status(404).json({ error: '문서 없음' }); return; }
    res.json({ document: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/policy-manager/documents
// body: { kind, title, version?, content_html?, attachment_url?, target_role?, requires_acknowledgment? }
// ═══════════════════════════════════════════════════════════════
router.post('/documents', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const kind = String(b.kind || '').trim();
    if (!kind) { res.status(400).json({ error: 'kind 필요' }); return; }
    if (!VALID_KINDS.has(kind)) {
      res.status(400).json({ error: `kind 는 ${Array.from(VALID_KINDS).join('|')} 중 하나` });
      return;
    }
    const title = String(b.title || '').trim();
    if (!title) { res.status(400).json({ error: 'title 필요' }); return; }
    const version = String(b.version || '1.0').trim();
    let targetRole = String(b.target_role || 'all').trim();
    if (!VALID_TARGET_ROLES.has(targetRole)) targetRole = 'all';
    const reqAck = b.requires_acknowledgment === undefined ? 1 : (Number(b.requires_acknowledgment) ? 1 : 0);

    const result = await dbRun(
      `INSERT INTO policy_documents
         (kind, title, version, content_html, attachment_url,
          status, target_role, requires_acknowledgment)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      kind, title, version,
      String(b.content_html || ''), String(b.attachment_url || ''),
      targetRole, reqAck
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('[policy-manager/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/policy-manager/documents/:id
// ═══════════════════════════════════════════════════════════════
router.patch('/documents/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id, status FROM policy_documents WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '문서 없음' }); return; }

    const b = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (b.kind !== undefined) {
      const k = String(b.kind).trim();
      if (!VALID_KINDS.has(k)) {
        res.status(400).json({ error: `kind 는 ${Array.from(VALID_KINDS).join('|')} 중 하나` });
        return;
      }
      sets.push('kind = ?'); params.push(k);
    }
    if (b.title !== undefined) { sets.push('title = ?'); params.push(String(b.title || '')); }
    if (b.version !== undefined) { sets.push('version = ?'); params.push(String(b.version || '1.0')); }
    if (b.content_html !== undefined) { sets.push('content_html = ?'); params.push(String(b.content_html || '')); }
    if (b.attachment_url !== undefined) { sets.push('attachment_url = ?'); params.push(String(b.attachment_url || '')); }
    if (b.effective_from !== undefined) { sets.push('effective_from = ?'); params.push(b.effective_from || null); }
    if (b.effective_to !== undefined) { sets.push('effective_to = ?'); params.push(b.effective_to || null); }
    if (b.target_role !== undefined) {
      const r = String(b.target_role || 'all').trim();
      sets.push('target_role = ?');
      params.push(VALID_TARGET_ROLES.has(r) ? r : 'all');
    }
    if (b.requires_acknowledgment !== undefined) {
      sets.push('requires_acknowledgment = ?');
      params.push(Number(b.requires_acknowledgment) ? 1 : 0);
    }
    if (b.status !== undefined) {
      sets.push('status = ?');
      params.push(String(b.status || 'draft'));
    }
    if (b.ceo_signature_name !== undefined) {
      sets.push('ceo_signature_name = ?');
      params.push(String(b.ceo_signature_name || ''));
    }

    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE policy_documents SET ${sets.join(', ')} WHERE id = ?`, ...params);
    const updated = await dbGet(`SELECT * FROM policy_documents WHERE id = ?`, id);
    res.json({ success: true, document: updated });
  } catch (error: any) {
    console.error('[policy-manager/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/policy-manager/documents/:id/publish
// body: { effective_from?, ceo_signature_name? }
// published_at·ceo_signed_at 자동 세팅. 같은 kind 의 기존 published 는 archived 로 이동.
// ═══════════════════════════════════════════════════════════════
router.post('/documents/:id/publish', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT * FROM policy_documents WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '문서 없음' }); return; }
    const b = req.body || {};
    const todayStr = getKSTDate();
    const effectiveFrom = b.effective_from || cur.effective_from || todayStr;
    const ceoName = String(b.ceo_signature_name || cur.ceo_signature_name || '진해수');
    const user = (req as any).user;

    await dbRun(
      `UPDATE policy_documents
          SET status = 'published',
              effective_from = ?,
              published_at = NOW(),
              published_by = ?,
              ceo_signed_at = NOW(),
              ceo_signature_name = ?,
              updated_at = NOW()
        WHERE id = ?`,
      effectiveFrom, user?.id || 0, ceoName, id
    );
    // 같은 kind 의 이전 published 문서는 archived 로 이동 + superseded_by 세팅
    await dbRun(
      `UPDATE policy_documents
          SET status = 'archived',
              superseded_by = ?,
              updated_at = NOW()
        WHERE kind = ?
          AND id <> ?
          AND status = 'published'`,
      id, cur.kind, id
    );
    const updated = await dbGet(`SELECT * FROM policy_documents WHERE id = ?`, id);
    res.json({ success: true, document: updated });
  } catch (error: any) {
    console.error('[policy-manager/publish]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/policy-manager/documents/:id/archive
// published → archived (또는 draft → archived)
// ═══════════════════════════════════════════════════════════════
router.post('/documents/:id/archive', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id FROM policy_documents WHERE id = ?`, id);
    if (!cur) { res.status(404).json({ error: '문서 없음' }); return; }
    await dbRun(
      `UPDATE policy_documents
          SET status = 'archived',
              updated_at = NOW()
        WHERE id = ?`,
      id
    );
    const updated = await dbGet(`SELECT * FROM policy_documents WHERE id = ?`, id);
    res.json({ success: true, document: updated });
  } catch (error: any) {
    console.error('[policy-manager/archive]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/policy-manager/documents/:id/acknowledgments
// 근로자 확인 이력 조회
// ═══════════════════════════════════════════════════════════════
router.get('/documents/:id/acknowledgments', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const rows = await dbAll(
      `SELECT a.id, a.employee_id, a.acknowledged_at, a.signature_notes, a.client_ip,
              re.name AS employee_name, re.department, re.team
         FROM policy_acknowledgments a
         LEFT JOIN regular_employees re ON re.id = a.employee_id
        WHERE a.document_id = ?
        ORDER BY a.acknowledged_at DESC`,
      id
    );
    res.json({ acknowledgments: rows });
  } catch (error: any) {
    console.error('[policy-manager/acks]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/policy-manager/documents/:id/compliance
// 대상자 대비 확인율. target_role 기준으로 대상 산정.
// ═══════════════════════════════════════════════════════════════
router.get('/documents/:id/compliance', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const doc = await dbGet(`SELECT id, kind, target_role, status FROM policy_documents WHERE id = ?`, id) as any;
    if (!doc) { res.status(404).json({ error: '문서 없음' }); return; }

    // 대상자 필터: target_role
    let deptClause = '';
    if (doc.target_role === 'production') {
      deptClause = ` AND COALESCE(department, '') NOT LIKE '카페%' AND COALESCE(department, '') NOT LIKE '사무%'`;
    } else if (doc.target_role === 'cafe') {
      deptClause = ` AND COALESCE(department, '') LIKE '카페%'`;
    } else if (doc.target_role === 'office') {
      deptClause = ` AND COALESCE(department, '') LIKE '사무%'`;
    }
    // 대상 목록 with 확인 여부
    const rows = await dbAll(
      `SELECT re.id, re.name, re.department, re.team, re.role,
              a.acknowledged_at
         FROM regular_employees re
         LEFT JOIN policy_acknowledgments a
                ON a.employee_id = re.id AND a.document_id = ?
        WHERE re.is_active = 1 ${deptClause}
        ORDER BY re.department, re.team, re.name`,
      id
    ) as any[];

    const targetTotal = rows.length;
    const acknowledgedCount = rows.filter((r) => r.acknowledged_at).length;
    const missingCount = targetTotal - acknowledgedCount;
    const ratePct = targetTotal > 0 ? Math.round((acknowledgedCount / targetTotal) * 1000) / 10 : 0;

    // 부서별 요약
    const byDept: Record<string, { dept: string; total: number; done: number; missing: number }> = {};
    for (const r of rows) {
      const dept = r.department || '(미지정)';
      if (!byDept[dept]) byDept[dept] = { dept, total: 0, done: 0, missing: 0 };
      byDept[dept].total++;
      if (r.acknowledged_at) byDept[dept].done++;
      else byDept[dept].missing++;
    }

    res.json({
      document: { id: doc.id, kind: doc.kind, target_role: doc.target_role, status: doc.status },
      summary: {
        target_total: targetTotal,
        acknowledged_count: acknowledgedCount,
        missing_count: missingCount,
        rate_pct: ratePct,
      },
      by_department: Object.values(byDept),
      rows,
    });
  } catch (error: any) {
    console.error('[policy-manager/compliance]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
