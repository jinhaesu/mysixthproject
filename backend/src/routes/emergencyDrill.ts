import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { logManagerHours } from '../lib/managerHours';

const router = Router();

/**
 * P7D — 비상 대응 훈련 관리 (중처법 §4-8 반기 훈련 실시 증빙)
 * requireAuth 뒤에 마운트.
 */

const VALID_KINDS = new Set(['fire', 'gas_leak', 'blackout', 'critical_incident', 'chemical', 'other']);

// ═══════════════════════════════════════════════════════════════
// GET /api/emergency-drill/drills?kind=&from=&to=
// ═══════════════════════════════════════════════════════════════
router.get('/drills', async (req: Request, res: Response) => {
  try {
    const kind = String(req.query.kind || '').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (kind) { clauses.push('d.scenario_kind = ?'); params.push(kind); }
    if (from) { clauses.push('d.drill_date >= ?'); params.push(from); }
    if (to) { clauses.push('d.drill_date <= ?'); params.push(to); }
    const rows = await dbAll(
      `SELECT d.*, m.title AS manual_title, m.version AS manual_version
         FROM emergency_drills d
         LEFT JOIN emergency_manuals m ON m.id = d.manual_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY d.drill_date DESC, d.id DESC`,
      ...params
    );
    res.json({ drills: rows });
  } catch (error: any) {
    console.error('[emergency-drill/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/emergency-drill/drills
// body: { scenario_kind, drill_date (YYYY-MM-DD), manual_id?, location?,
//         participant_count?, participant_names?, findings?, improvements?,
//         photo_urls?, led_by_name? }
// findings 있으면 조치 티켓 자동 생성.
// ═══════════════════════════════════════════════════════════════
router.post('/drills', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    const scenario_kind = String(b.scenario_kind || '').trim();
    if (!scenario_kind) { res.status(400).json({ error: 'scenario_kind 필요' }); return; }
    if (!VALID_KINDS.has(scenario_kind)) {
      res.status(400).json({ error: `scenario_kind 는 ${Array.from(VALID_KINDS).join('|')} 중 하나` });
      return;
    }
    const drill_date = String(b.drill_date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(drill_date)) {
      res.status(400).json({ error: 'drill_date 는 YYYY-MM-DD' });
      return;
    }
    const improvements = String(b.improvements || '').trim();
    const findings = String(b.findings || '').trim();
    const led_by_name = String(b.led_by_name || user?.email || '').trim();

    let ticketId: number | null = null;
    if (improvements || findings) {
      const dueDate = new Date(drill_date);
      dueDate.setDate(dueDate.getDate() + 30);
      const ticketRes = await dbRun(
        `INSERT INTO safety_action_tickets
           (source_type, source_id, title, description, severity,
            assignee_name, due_date, status, created_by)
         VALUES ('emergency_drill', 0, ?, ?, 'mid', ?, ?, 'open', ?)`,
        `[${scenario_kind}] 훈련 개선사항 (${drill_date})`,
        `발견 사항: ${findings || '-'}\n개선 조치: ${improvements || '-'}`,
        led_by_name,
        dueDate.toISOString().slice(0, 10),
        user?.id || 0
      );
      ticketId = Number(ticketRes.lastInsertRowid);
    }

    const result = await dbRun(
      `INSERT INTO emergency_drills
         (manual_id, scenario_kind, drill_date, location,
          participant_count, participant_names, findings, improvements,
          photo_urls, led_by, led_by_name, ticket_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.manual_id ? Number(b.manual_id) : null,
      scenario_kind, drill_date, String(b.location || ''),
      parseInt(b.participant_count) || 0,
      String(b.participant_names || ''),
      findings, improvements,
      String(b.photo_urls || ''),
      user?.id || null, led_by_name, ticketId
    );
    const drillId = Number(result.lastInsertRowid);
    // 조치티켓의 source_id를 실제 drill id 로 갱신
    if (ticketId) {
      try {
        await dbRun(
          `UPDATE safety_action_tickets SET source_id = ? WHERE id = ?`,
          drillId, ticketId
        );
      } catch {}
    }
    // 관리자 활동시간 로깅 (훈련 진행 = training_delivery 로 카운트)
    await logManagerHours({
      managerId: user?.id || 0, managerName: user?.email || '',
      activityType: 'training_delivery', minutes: 120,
      sourceType: 'emergency_drills', sourceId: drillId,
      occurredAt: drill_date,
      notes: `비상훈련: ${scenario_kind} @ ${drill_date}`,
    });
    res.json({ success: true, id: drillId, ticket_id: ticketId });
  } catch (error: any) {
    console.error('[emergency-drill/create]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/emergency-drill/drills/:id
// ═══════════════════════════════════════════════════════════════
router.patch('/drills/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const cur = await dbGet(`SELECT id FROM emergency_drills WHERE id = ?`, id);
    if (!cur) { res.status(404).json({ error: '훈련 없음' }); return; }
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (b.manual_id !== undefined) {
      sets.push('manual_id = ?');
      params.push(b.manual_id ? Number(b.manual_id) : null);
    }
    if (b.location !== undefined) { sets.push('location = ?'); params.push(String(b.location || '')); }
    if (b.participant_count !== undefined) {
      sets.push('participant_count = ?');
      params.push(parseInt(b.participant_count) || 0);
    }
    if (b.participant_names !== undefined) { sets.push('participant_names = ?'); params.push(String(b.participant_names || '')); }
    if (b.findings !== undefined) { sets.push('findings = ?'); params.push(String(b.findings || '')); }
    if (b.improvements !== undefined) { sets.push('improvements = ?'); params.push(String(b.improvements || '')); }
    if (b.photo_urls !== undefined) { sets.push('photo_urls = ?'); params.push(String(b.photo_urls || '')); }
    if (b.led_by_name !== undefined) { sets.push('led_by_name = ?'); params.push(String(b.led_by_name || '')); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE emergency_drills SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[emergency-drill/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/emergency-drill/coverage?half=2026H2
// 반기 훈련 실시 여부 (§4-8 반기 훈련 요건 증빙).
// half: YYYY H1 | YYYY H2
// ═══════════════════════════════════════════════════════════════
router.get('/coverage', async (req: Request, res: Response) => {
  try {
    const halfRaw = String(req.query.half || '').trim();
    let year: number;
    let half: 1 | 2;
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    if (halfRaw) {
      const m = halfRaw.match(/^(\d{4})H([12])$/);
      if (!m) { res.status(400).json({ error: "half 형식은 'YYYYH1' 또는 'YYYYH2'" }); return; }
      year = parseInt(m[1], 10);
      half = (parseInt(m[2], 10) as 1 | 2);
    } else {
      year = kstNow.getUTCFullYear();
      half = kstNow.getUTCMonth() < 6 ? 1 : 2;
    }
    const from = half === 1 ? `${year}-01-01` : `${year}-07-01`;
    const to = half === 1 ? `${year}-06-30` : `${year}-12-31`;
    const requiredKinds = ['fire', 'gas_leak', 'blackout', 'critical_incident'] as const;
    const drills = await dbAll(
      `SELECT scenario_kind, COUNT(*)::int AS cnt, MAX(drill_date) AS last_date
         FROM emergency_drills
        WHERE drill_date >= ? AND drill_date <= ?
        GROUP BY scenario_kind`,
      from, to
    ) as any[];
    const byKind = new Map<string, { cnt: number; last_date: string | null }>();
    for (const d of drills) byKind.set(d.scenario_kind, { cnt: Number(d.cnt) || 0, last_date: d.last_date });
    const items = requiredKinds.map(k => {
      const info = byKind.get(k);
      return {
        scenario_kind: k,
        drill_count: info?.cnt || 0,
        last_drill_date: info?.last_date || null,
        completed: !!(info && info.cnt > 0),
      };
    });
    const completedCount = items.filter(i => i.completed).length;
    res.json({
      period: { year, half, from, to, label: `${year} H${half}` },
      required_kinds: requiredKinds,
      items,
      completed_count: completedCount,
      required_count: requiredKinds.length,
      compliant: completedCount === requiredKinds.length,
    });
  } catch (error: any) {
    console.error('[emergency-drill/coverage]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
