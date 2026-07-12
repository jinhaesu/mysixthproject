import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';

const router = Router();

/**
 * P7D — 도급업체·용역 관리 (중처법 §4-9 수급인 안전보건 확보)
 * requireAuth 뒤에 마운트.
 *
 * contractor_registry           : 수급인·용역업체 마스터
 * contractor_work_permits       : 도급업체 작업허가서
 * contractor_joint_inspections  : 합동 안전점검
 */

// ═══════════════════════════════════════════════════════════════
// GET /api/contractor/registry?status=&search=
// ═══════════════════════════════════════════════════════════════
router.get('/registry', async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '').trim();
    const search = String(req.query.search || '').trim();
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (search) {
      clauses.push('(business_name LIKE ? OR business_reg_no LIKE ? OR work_scope LIKE ?)');
      const pat = `%${search}%`;
      params.push(pat, pat, pat);
    }
    const rows = await dbAll(
      `SELECT * FROM contractor_registry
        WHERE ${clauses.join(' AND ')}
        ORDER BY status ASC, id DESC`,
      ...params
    );
    res.json({ contractors: rows });
  } catch (error: any) {
    console.error('[contractor/registry/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/contractor/registry/:id
// ═══════════════════════════════════════════════════════════════
router.get('/registry/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const row = await dbGet(`SELECT * FROM contractor_registry WHERE id = ?`, id);
    if (!row) { res.status(404).json({ error: '업체 없음' }); return; }
    res.json({ contractor: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/contractor/registry
// body: { business_name, work_scope, ... }
// ═══════════════════════════════════════════════════════════════
router.post('/registry', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const business_name = String(b.business_name || '').trim();
    if (!business_name) { res.status(400).json({ error: 'business_name 필요' }); return; }
    const work_scope = String(b.work_scope || '').trim();
    if (!work_scope) { res.status(400).json({ error: 'work_scope 필요' }); return; }

    const result = await dbRun(
      `INSERT INTO contractor_registry
         (business_name, business_reg_no, representative_name,
          contact_phone, contact_email, work_scope,
          contract_start, contract_end,
          safety_docs_url, insurance_status, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      business_name,
      String(b.business_reg_no || ''),
      String(b.representative_name || ''),
      String(b.contact_phone || ''),
      String(b.contact_email || ''),
      work_scope,
      b.contract_start || null,
      b.contract_end || null,
      String(b.safety_docs_url || ''),
      String(b.insurance_status || ''),
      String(b.status || 'active'),
      String(b.notes || '')
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('[contractor/registry/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/contractor/registry/:id
// ═══════════════════════════════════════════════════════════════
router.patch('/registry/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id FROM contractor_registry WHERE id = ?`, id);
    if (!cur) { res.status(404).json({ error: '업체 없음' }); return; }
    const b = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    const strFields: Array<[string, string]> = [
      ['business_name', 'business_name'],
      ['business_reg_no', 'business_reg_no'],
      ['representative_name', 'representative_name'],
      ['contact_phone', 'contact_phone'],
      ['contact_email', 'contact_email'],
      ['work_scope', 'work_scope'],
      ['safety_docs_url', 'safety_docs_url'],
      ['insurance_status', 'insurance_status'],
      ['status', 'status'],
      ['notes', 'notes'],
    ];
    for (const [key, col] of strFields) {
      if (b[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(String(b[key] || ''));
      }
    }
    if (b.contract_start !== undefined) { sets.push('contract_start = ?'); params.push(b.contract_start || null); }
    if (b.contract_end !== undefined) { sets.push('contract_end = ?'); params.push(b.contract_end || null); }

    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE contractor_registry SET ${sets.join(', ')} WHERE id = ?`, ...params);
    const updated = await dbGet(`SELECT * FROM contractor_registry WHERE id = ?`, id);
    res.json({ success: true, contractor: updated });
  } catch (error: any) {
    console.error('[contractor/registry/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/contractor/permits?status=&contractor_id=
// ═══════════════════════════════════════════════════════════════
router.get('/permits', async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '').trim();
    const contractor_id = req.query.contractor_id ? parseInt(req.query.contractor_id as string) : null;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (status) { clauses.push('p.status = ?'); params.push(status); }
    if (contractor_id) { clauses.push('p.contractor_id = ?'); params.push(contractor_id); }
    const rows = await dbAll(
      `SELECT p.*, c.business_name AS contractor_name, a.name AS area_name
         FROM contractor_work_permits p
         JOIN contractor_registry c ON c.id = p.contractor_id
         LEFT JOIN safety_areas a ON a.id = p.area_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY p.permit_date DESC, p.id DESC`,
      ...params
    ) as any[];

    // overdue 판정 자동 (expiry_date < today AND status not in ('closed','overdue'))
    const today = getKSTDate();
    const permits = rows.map(r => {
      const overdue = r.expiry_date && r.expiry_date < today && !['closed', 'overdue'].includes(r.status);
      return { ...r, is_overdue: !!overdue };
    });
    res.json({ permits });
  } catch (error: any) {
    console.error('[contractor/permits/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/contractor/permits
// body: { contractor_id, work_description, permit_date, expiry_date,
//         permit_no?, hazard_types?, area_id?, ppe_required?,
//         safety_measures?, approver_name?, status? }
// ═══════════════════════════════════════════════════════════════
router.post('/permits', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    const contractor_id = Number(b.contractor_id);
    if (!contractor_id) { res.status(400).json({ error: 'contractor_id 필요' }); return; }
    const contractor = await dbGet(`SELECT id FROM contractor_registry WHERE id = ?`, contractor_id);
    if (!contractor) { res.status(400).json({ error: '해당 contractor_id 없음' }); return; }
    const work_description = String(b.work_description || '').trim();
    if (!work_description) { res.status(400).json({ error: 'work_description 필요' }); return; }
    const permit_date = String(b.permit_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(permit_date)) {
      res.status(400).json({ error: 'permit_date 는 YYYY-MM-DD' });
      return;
    }
    const expiry_date = String(b.expiry_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
      res.status(400).json({ error: 'expiry_date 는 YYYY-MM-DD' });
      return;
    }

    const result = await dbRun(
      `INSERT INTO contractor_work_permits
         (contractor_id, permit_no, work_description, hazard_types,
          permit_date, expiry_date, area_id,
          ppe_required, safety_measures,
          approver_id, approver_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      contractor_id,
      String(b.permit_no || ''),
      work_description,
      String(b.hazard_types || ''),
      permit_date, expiry_date,
      b.area_id ? Number(b.area_id) : null,
      String(b.ppe_required || ''),
      String(b.safety_measures || ''),
      user?.id || null,
      String(b.approver_name || user?.email || ''),
      String(b.status || 'pending')
    );
    res.json({ success: true, id: Number(result.lastInsertRowid) });
  } catch (error: any) {
    console.error('[contractor/permits/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/contractor/permits/:id
// closed 로 전환 시 closed_at 자동 세팅.
// ═══════════════════════════════════════════════════════════════
router.patch('/permits/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id, status FROM contractor_work_permits WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '허가 없음' }); return; }
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (b.permit_no !== undefined) { sets.push('permit_no = ?'); params.push(String(b.permit_no || '')); }
    if (b.work_description !== undefined) { sets.push('work_description = ?'); params.push(String(b.work_description || '')); }
    if (b.hazard_types !== undefined) { sets.push('hazard_types = ?'); params.push(String(b.hazard_types || '')); }
    if (b.permit_date !== undefined) {
      const v = String(b.permit_date || '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        res.status(400).json({ error: 'permit_date 는 YYYY-MM-DD' }); return;
      }
      sets.push('permit_date = ?'); params.push(v);
    }
    if (b.expiry_date !== undefined) {
      const v = String(b.expiry_date || '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        res.status(400).json({ error: 'expiry_date 는 YYYY-MM-DD' }); return;
      }
      sets.push('expiry_date = ?'); params.push(v);
    }
    if (b.area_id !== undefined) { sets.push('area_id = ?'); params.push(b.area_id ? Number(b.area_id) : null); }
    if (b.ppe_required !== undefined) { sets.push('ppe_required = ?'); params.push(String(b.ppe_required || '')); }
    if (b.safety_measures !== undefined) { sets.push('safety_measures = ?'); params.push(String(b.safety_measures || '')); }
    if (b.approver_name !== undefined) { sets.push('approver_name = ?'); params.push(String(b.approver_name || '')); }
    if (b.status !== undefined) {
      const st = String(b.status || 'pending');
      sets.push('status = ?'); params.push(st);
      if (st === 'closed' && cur.status !== 'closed') {
        sets.push('closed_at = NOW()');
      }
    }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE contractor_work_permits SET ${sets.join(', ')} WHERE id = ?`, ...params);
    const updated = await dbGet(`SELECT * FROM contractor_work_permits WHERE id = ?`, id);
    res.json({ success: true, permit: updated });
  } catch (error: any) {
    console.error('[contractor/permits/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/contractor/inspections?contractor_id=&permit_id=
// ═══════════════════════════════════════════════════════════════
router.get('/inspections', async (req: Request, res: Response) => {
  try {
    const contractor_id = req.query.contractor_id ? parseInt(req.query.contractor_id as string) : null;
    const permit_id = req.query.permit_id ? parseInt(req.query.permit_id as string) : null;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (contractor_id) { clauses.push('i.contractor_id = ?'); params.push(contractor_id); }
    if (permit_id) { clauses.push('i.permit_id = ?'); params.push(permit_id); }
    const rows = await dbAll(
      `SELECT i.*, c.business_name AS contractor_name, p.work_description AS permit_description
         FROM contractor_joint_inspections i
         LEFT JOIN contractor_registry c ON c.id = i.contractor_id
         LEFT JOIN contractor_work_permits p ON p.id = i.permit_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY i.inspected_at DESC, i.id DESC`,
      ...params
    );
    res.json({ inspections: rows });
  } catch (error: any) {
    console.error('[contractor/inspections/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/contractor/inspections
// body: { contractor_id?, permit_id?, inspected_at (ISO),
//         findings?, actions?, photos?, inspector_name? }
// findings 있으면 조치 티켓 자동 생성.
// ═══════════════════════════════════════════════════════════════
router.post('/inspections', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    if (!b.inspected_at) { res.status(400).json({ error: 'inspected_at 필요' }); return; }
    const contractor_id = b.contractor_id ? Number(b.contractor_id) : null;
    const permit_id = b.permit_id ? Number(b.permit_id) : null;
    if (!contractor_id && !permit_id) {
      res.status(400).json({ error: 'contractor_id 또는 permit_id 중 하나는 필요' });
      return;
    }
    let resolvedContractorId = contractor_id;
    if (!resolvedContractorId && permit_id) {
      const p = await dbGet(`SELECT contractor_id FROM contractor_work_permits WHERE id = ?`, permit_id) as any;
      resolvedContractorId = p?.contractor_id || null;
    }
    const findings = String(b.findings || '').trim();
    const actions = String(b.actions || '').trim();
    const inspector_name = String(b.inspector_name || user?.email || '').trim();

    let ticketId: number | null = null;
    if (findings) {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const today = kst.toISOString().slice(0, 10);
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 14);
      const contractor = resolvedContractorId
        ? await dbGet(`SELECT business_name FROM contractor_registry WHERE id = ?`, resolvedContractorId) as any
        : null;
      const ticketRes = await dbRun(
        `INSERT INTO safety_action_tickets
           (source_type, source_id, title, description, severity,
            assignee_name, due_date, status, created_by)
         VALUES ('contractor_joint_inspection', 0, ?, ?, 'mid', ?, ?, 'open', ?)`,
        `[도급 합동점검] ${contractor?.business_name || '수급인'} 지적사항`,
        `발견 사항: ${findings}\n조치 계획: ${actions || '-'}`,
        inspector_name,
        dueDate.toISOString().slice(0, 10),
        user?.id || 0
      );
      ticketId = Number(ticketRes.lastInsertRowid);
    }

    const result = await dbRun(
      `INSERT INTO contractor_joint_inspections
         (contractor_id, permit_id, inspected_at,
          inspector_id, inspector_name,
          findings, actions, photos, ticket_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      resolvedContractorId, permit_id, b.inspected_at,
      user?.id || null, inspector_name,
      findings, actions, String(b.photos || ''),
      ticketId
    );
    const inspId = Number(result.lastInsertRowid);
    if (ticketId) {
      try {
        await dbRun(
          `UPDATE safety_action_tickets SET source_id = ? WHERE id = ?`,
          inspId, ticketId
        );
      } catch {}
    }
    res.json({ success: true, id: inspId, ticket_id: ticketId });
  } catch (error: any) {
    console.error('[contractor/inspections/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/contractor/active-summary
// - active_contractor_count
// - open_permit_count (pending / approved / in_progress)
// - overdue_permit_count (expiry_date < today AND not closed)
// - inspection_count_30d
// ═══════════════════════════════════════════════════════════════
router.get('/active-summary', async (_req: Request, res: Response) => {
  try {
    const today = getKSTDate();
    const c = await dbGet(
      `SELECT COUNT(*)::int AS cnt FROM contractor_registry WHERE status = 'active'`
    ) as any;
    const openPermits = await dbGet(
      `SELECT COUNT(*)::int AS cnt
         FROM contractor_work_permits
        WHERE status IN ('pending', 'approved', 'in_progress')`
    ) as any;
    const overduePermits = await dbGet(
      `SELECT COUNT(*)::int AS cnt
         FROM contractor_work_permits
        WHERE expiry_date < ?
          AND status NOT IN ('closed')`,
      today
    ) as any;
    // 30d 합동점검
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    const inspections = await dbGet(
      `SELECT COUNT(*)::int AS cnt
         FROM contractor_joint_inspections
        WHERE inspected_at >= ?`,
      from.toISOString()
    ) as any;
    res.json({
      as_of: today,
      active_contractor_count: Number(c?.cnt) || 0,
      open_permit_count: Number(openPermits?.cnt) || 0,
      overdue_permit_count: Number(overduePermits?.cnt) || 0,
      inspection_count_30d: Number(inspections?.cnt) || 0,
    });
  } catch (error: any) {
    console.error('[contractor/active-summary]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
