import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';

const router = Router();

/**
 * 안전보건 P5 — 위험성평가 + LOTO + 산업재해 + 산업안전보건위원회
 * requireAuth 뒤에 마운트.
 * 산업안전보건법 36조·중대재해처벌법 대응 증빙 저장.
 */

// ═══════════════════════════════════════════════════════════════
// 위험성평가 (Risk Assessment)
// ═══════════════════════════════════════════════════════════════
function computeGrade(freq: number, intensity: number): string {
  const p = Math.max(1, Math.min(3, freq)) * Math.max(1, Math.min(3, intensity));
  if (p >= 6) return 'high';
  if (p >= 3) return 'mid';
  return 'low';
}

/** GET /api/safety-manager/risk-assessments?year=&status= */
router.get('/risk-assessments', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const status = req.query.status as string;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (year) { clauses.push('year = ?'); params.push(year); }
    if (status) { clauses.push('status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT ra.*,
              (SELECT COUNT(*) FROM risk_assessment_items i WHERE i.assessment_id = ra.id) AS item_count,
              (SELECT COUNT(*) FROM risk_assessment_participants p WHERE p.assessment_id = ra.id) AS participant_count,
              (SELECT COUNT(*) FROM risk_assessment_participants p WHERE p.assessment_id = ra.id AND p.signed_at IS NOT NULL) AS signed_count
         FROM risk_assessments ra
        WHERE ${clauses.join(' AND ')}
        ORDER BY ra.year DESC, ra.id DESC`,
      ...params
    );
    res.json({ items: rows });
  } catch (error: any) {
    console.error('[risk-assessments/list]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/safety-manager/risk-assessments/:id */
router.get('/risk-assessments/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const ra = await dbGet(`SELECT * FROM risk_assessments WHERE id = ?`, id);
    if (!ra) { res.status(404).json({ error: '위험성평가 없음' }); return; }
    const items = await dbAll(
      `SELECT * FROM risk_assessment_items WHERE assessment_id = ? ORDER BY id`,
      id
    );
    const participants = await dbAll(
      `SELECT * FROM risk_assessment_participants WHERE assessment_id = ? ORDER BY id`,
      id
    );
    res.json({ assessment: ra, items, participants });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/risk-assessments
 *  body: { year, kind?, title, triggered_by? }
 */
router.post('/risk-assessments', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { year, kind, title, triggered_by } = req.body || {};
    const y = parseInt(year) || new Date().getFullYear();
    if (!title) { res.status(400).json({ error: 'title 필요' }); return; }
    const result = await dbRun(
      `INSERT INTO risk_assessments (year, kind, title, triggered_by, status, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?)`,
      y, kind || 'regular', title, triggered_by || '', user?.id || 0
    );
    res.json({ success: true, id: result.lastInsertRowid, year: y });
  } catch (error: any) {
    console.error('[risk-assessments/create]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/safety-manager/risk-assessments/:id
 *  body: { status?, title?, triggered_by?, posted?, ceo_reported? }
 */
router.patch('/risk-assessments/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { status, title, triggered_by, posted, ceo_reported, kind } = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (title !== undefined) { sets.push('title = ?'); params.push(title); }
    if (triggered_by !== undefined) { sets.push('triggered_by = ?'); params.push(triggered_by); }
    if (kind !== undefined) { sets.push('kind = ?'); params.push(kind); }
    if (posted) { sets.push('posted_at = NOW()'); }
    if (ceo_reported) { sets.push('ceo_reported_at = NOW()'); }
    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE risk_assessments SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/risk-assessments/:id/items
 *  body: { process, task?, hazard, freq_score, intensity_score, mitigation?, assignee_name?, due_date? }
 *  risk_grade = matrix(freq × intensity) 자동. 조치 티켓 자동 생성.
 */
router.post('/risk-assessments/:id/items', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.id as string);
    const user = (req as any).user;
    const {
      process, task, hazard, freq_score, intensity_score,
      mitigation, assignee_name, assignee_id, due_date,
    } = req.body || {};
    const f = parseInt(freq_score) || 0;
    const i = parseInt(intensity_score) || 0;
    if (!process || !hazard || !f || !i) {
      res.status(400).json({ error: 'process/hazard/freq_score/intensity_score 필수' });
      return;
    }
    const grade = computeGrade(f, i);
    const assess = await dbGet(`SELECT * FROM risk_assessments WHERE id = ?`, assessmentId) as any;
    if (!assess) { res.status(404).json({ error: '위험성평가 없음' }); return; }
    const dueStr = due_date || (() => {
      const d = new Date();
      d.setDate(d.getDate() + (grade === 'high' ? 7 : grade === 'mid' ? 14 : 30));
      return d.toISOString().slice(0, 10);
    })();
    // 조치 티켓 생성
    const tRes = await dbRun(
      `INSERT INTO safety_action_tickets
         (source_type, source_id, title, description, severity, assignee_name, assignee_id, due_date, status, created_by)
       VALUES ('risk_assessment', ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      assessmentId,
      `위험성평가: ${process} - ${hazard}`,
      `공정: ${process} / 작업: ${task || ''} / 유해요인: ${hazard} / 대책: ${mitigation || ''}`,
      grade === 'high' ? 'high' : grade === 'mid' ? 'mid' : 'low',
      assignee_name || '', assignee_id || null, dueStr, user?.id || 0
    );
    const ticketId = Number(tRes.lastInsertRowid);
    const result = await dbRun(
      `INSERT INTO risk_assessment_items
         (assessment_id, process, task, hazard, freq_score, intensity_score, risk_grade,
          mitigation, assignee_id, assignee_name, due_date, ticket_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, process, task || '', hazard, f, i, grade,
      mitigation || '', assignee_id || null, assignee_name || '', dueStr, ticketId
    );
    res.json({
      success: true,
      id: result.lastInsertRowid,
      ticket_id: ticketId,
      risk_grade: grade,
    });
  } catch (error: any) {
    console.error('[risk-assessments/items/create]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/safety-manager/risk-assessments/:id/items/:itemId
 *  body: { closed_risk_grade?, mitigation? }
 */
router.patch('/risk-assessments/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId as string);
    const { closed_risk_grade, mitigation } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (closed_risk_grade !== undefined) { sets.push('closed_risk_grade = ?'); params.push(closed_risk_grade); }
    if (mitigation !== undefined) { sets.push('mitigation = ?'); params.push(mitigation); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(itemId);
    await dbRun(`UPDATE risk_assessment_items SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/risk-assessments/:id/participants
 *  body: { participant_name, employee_id?, role?, signature_notes?, signed? }
 */
router.post('/risk-assessments/:id/participants', async (req: Request, res: Response) => {
  try {
    const assessmentId = parseInt(req.params.id as string);
    const { participant_name, employee_id, role, signature_notes, signed } = req.body || {};
    if (!participant_name) { res.status(400).json({ error: 'participant_name 필요' }); return; }
    const result = await dbRun(
      `INSERT INTO risk_assessment_participants
         (assessment_id, employee_id, participant_name, role, signed_at, signature_notes)
       VALUES (?, ?, ?, ?, ${signed ? 'NOW()' : 'NULL'}, ?)`,
      assessmentId, employee_id || null, participant_name, role || 'worker', signature_notes || ''
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[risk-assessments/participants]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/safety-manager/risk-assessments/:id/participants/:pid
 *  body: { signed?: boolean, signature_notes? }
 */
router.patch('/risk-assessments/:id/participants/:pid', async (req: Request, res: Response) => {
  try {
    const pid = parseInt(req.params.pid as string);
    const { signed, signature_notes } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (signed === true) { sets.push('signed_at = NOW()'); }
    if (signed === false) { sets.push('signed_at = NULL'); }
    if (signature_notes !== undefined) { sets.push('signature_notes = ?'); params.push(signature_notes); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(pid);
    await dbRun(`UPDATE risk_assessment_participants SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// LOTO (Lockout / Tagout) 작업허가
// ═══════════════════════════════════════════════════════════════
/** GET /api/safety-manager/loto?status= */
router.get('/loto', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (status) { clauses.push('l.status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT l.*, a.name AS area_name, a.code AS area_code
         FROM loto_authorizations l
         LEFT JOIN safety_areas a ON a.id = l.area_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY
          CASE l.status
            WHEN 'requested' THEN 0
            WHEN 'energy_off' THEN 1
            WHEN 'locked' THEN 2
            WHEN 'verified' THEN 3
            WHEN 'working' THEN 4
            WHEN 'released' THEN 5
            ELSE 9 END,
          l.id DESC`,
      ...params
    );
    const summary = {
      total: rows.length,
      requested: (rows as any[]).filter(r => r.status === 'requested').length,
      in_progress: (rows as any[]).filter(r => ['energy_off','locked','verified','working'].includes(r.status)).length,
      released: (rows as any[]).filter(r => r.status === 'released').length,
    };
    res.json({ items: rows, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/safety-manager/loto/:id */
router.get('/loto/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const row = await dbGet(
      `SELECT l.*, a.name AS area_name, a.code AS area_code
         FROM loto_authorizations l
         LEFT JOIN safety_areas a ON a.id = l.area_id
        WHERE l.id = ?`,
      id
    );
    if (!row) { res.status(404).json({ error: 'LOTO 없음' }); return; }
    res.json({ item: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/loto
 *  body: { equipment_name, area_id?, work_description, worker_names?, worker_ids?, expected_hours? }
 */
router.post('/loto', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const {
      equipment_name, area_id, work_description,
      worker_ids, worker_names, expected_hours,
    } = req.body || {};
    if (!equipment_name || !work_description) {
      res.status(400).json({ error: 'equipment_name, work_description 필수' });
      return;
    }
    const result = await dbRun(
      `INSERT INTO loto_authorizations
         (equipment_name, area_id, work_description, worker_ids, worker_names, expected_hours, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)`,
      equipment_name, area_id || null, work_description,
      worker_ids || '', worker_names || '', parseFloat(expected_hours) || 1,
      user?.id || 0
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[loto/create]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/safety-manager/loto/:id
 *  body 필드에 따라 상태 자동 전이:
 *   - energy_off_photo_url → 'energy_off'
 *   - lock_photo_url → 'locked'
 *   - verify_no_energy=1 → 'verified' + started_at
 *   - trial_run_ok=1 & release_photo_url → 'released' + released_at
 */
router.patch('/loto/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const {
      equipment_name, area_id, work_description, worker_names, worker_ids, expected_hours,
      energy_off_photo_url, lock_photo_url, verify_no_energy,
      release_photo_url, trial_run_ok, status,
    } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (equipment_name !== undefined) { sets.push('equipment_name = ?'); params.push(equipment_name); }
    if (area_id !== undefined) { sets.push('area_id = ?'); params.push(area_id || null); }
    if (work_description !== undefined) { sets.push('work_description = ?'); params.push(work_description); }
    if (worker_names !== undefined) { sets.push('worker_names = ?'); params.push(worker_names); }
    if (worker_ids !== undefined) { sets.push('worker_ids = ?'); params.push(worker_ids); }
    if (expected_hours !== undefined) { sets.push('expected_hours = ?'); params.push(parseFloat(expected_hours) || 1); }
    if (energy_off_photo_url !== undefined) {
      sets.push('energy_off_photo_url = ?'); params.push(energy_off_photo_url);
      if (energy_off_photo_url) { sets.push("status = CASE WHEN status = 'requested' THEN 'energy_off' ELSE status END"); }
    }
    if (lock_photo_url !== undefined) {
      sets.push('lock_photo_url = ?'); params.push(lock_photo_url);
      if (lock_photo_url) { sets.push("status = CASE WHEN status IN ('requested','energy_off') THEN 'locked' ELSE status END"); }
    }
    if (verify_no_energy !== undefined) {
      const v = verify_no_energy ? 1 : 0;
      sets.push('verify_no_energy = ?'); params.push(v);
      if (v) {
        sets.push("status = CASE WHEN status IN ('requested','energy_off','locked') THEN 'verified' ELSE status END");
        sets.push('started_at = COALESCE(started_at, NOW())');
      }
    }
    if (release_photo_url !== undefined) { sets.push('release_photo_url = ?'); params.push(release_photo_url); }
    if (trial_run_ok !== undefined) {
      const v = trial_run_ok ? 1 : 0;
      sets.push('trial_run_ok = ?'); params.push(v);
      if (v) {
        sets.push("status = CASE WHEN status IN ('verified','working') THEN 'released' ELSE status END");
        sets.push('released_at = COALESCE(released_at, NOW())');
      }
    }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE loto_authorizations SET ${sets.join(', ')} WHERE id = ?`, ...params);
    const updated = await dbGet(`SELECT * FROM loto_authorizations WHERE id = ?`, id);
    res.json({ success: true, item: updated });
  } catch (error: any) {
    console.error('[loto/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 산업재해 (Incidents)
// ═══════════════════════════════════════════════════════════════
/** 중대재해 자동 판별 — 산안법 시행규칙 §67, 중대재해처벌법 §2·§8
 *  - 사망자 1명 이상
 *  - 3개월 이상 요양 필요한 부상자 2명 이상
 *  - 부상자 또는 직업성 질병자 동시 10명 이상
 */
function judgeCritical(row: {
  injury_severity?: string;
  hospitalization_days?: number;
}): { is_critical: boolean; requires_report: boolean; deadline_days: number } {
  const sev = (row.injury_severity || '').toLowerCase();
  const days = Number(row.hospitalization_days) || 0;
  const isFatal = sev.includes('fatal') || sev.includes('사망');
  const isCritical = isFatal || days >= 90;
  // 산업재해조사표 제출 대상: 3일 이상 휴업 또는 사망
  const requiresReport = isCritical || sev.includes('serious') || days >= 3;
  // 발생 후 30일 이내 제출 (중대재해는 즉시 신고 + 지방고용노동관서 보고)
  const deadlineDays = isCritical ? 1 : 30;
  return { is_critical: isCritical, requires_report: requiresReport, deadline_days: deadlineDays };
}

/** GET /api/safety-manager/incidents?year=&status= */
router.get('/incidents', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const status = req.query.status as string;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (year) {
      clauses.push('EXTRACT(YEAR FROM occurred_at) = ?');
      params.push(year);
    }
    if (status) { clauses.push('status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT i.*, a.name AS area_name_lookup
         FROM incidents i
         LEFT JOIN safety_areas a ON a.id = i.area_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY i.occurred_at DESC, i.id DESC`,
      ...params
    );
    const today = getKSTDate();
    const items = (rows as any[]).map(r => ({
      ...r,
      is_report_overdue: !!(r.requires_report && r.report_deadline && r.report_deadline < today && !r.report_submitted_at),
      days_until_deadline: r.report_deadline
        ? Math.ceil((new Date(r.report_deadline).getTime() - new Date(today).getTime()) / (86400 * 1000))
        : null,
    }));
    const summary = {
      total: items.length,
      critical: items.filter(i => i.is_critical).length,
      requires_report: items.filter(i => i.requires_report && !i.report_submitted_at).length,
      report_overdue: items.filter(i => i.is_report_overdue).length,
      closed: items.filter(i => i.status === 'closed').length,
    };
    res.json({ items, summary });
  } catch (error: any) {
    console.error('[incidents/list]', error);
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/safety-manager/incidents/:id */
router.get('/incidents/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const row = await dbGet(
      `SELECT i.*, a.name AS area_name_lookup
         FROM incidents i
         LEFT JOIN safety_areas a ON a.id = i.area_id
        WHERE i.id = ?`,
      id
    ) as any;
    if (!row) { res.status(404).json({ error: '재해 기록 없음' }); return; }
    const today = getKSTDate();
    res.json({
      item: {
        ...row,
        is_report_overdue: !!(row.requires_report && row.report_deadline && row.report_deadline < today && !row.report_submitted_at),
        days_until_deadline: row.report_deadline
          ? Math.ceil((new Date(row.report_deadline).getTime() - new Date(today).getTime()) / (86400 * 1000))
          : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/incidents
 *  body: { occurred_at, area_id?, area_name?, injured_employee_id?, injured_name?,
 *          injury_body_part?, injury_severity?, hospitalization_days?, description?, photo_url?,
 *          hospital_transfer?, first_aid_notes?, witnesses? }
 *  is_critical / requires_report / report_deadline 자동 판별.
 */
router.post('/incidents', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    if (!b.occurred_at) { res.status(400).json({ error: 'occurred_at 필수' }); return; }
    const judge = judgeCritical({
      injury_severity: b.injury_severity,
      hospitalization_days: b.hospitalization_days,
    });
    const occurredDate = new Date(b.occurred_at);
    const deadline = new Date(occurredDate);
    deadline.setDate(deadline.getDate() + judge.deadline_days);
    const deadlineStr = deadline.toISOString().slice(0, 10);
    const result = await dbRun(
      `INSERT INTO incidents
         (occurred_at, area_id, area_name, injured_employee_id, injured_name,
          injury_body_part, injury_severity, hospitalization_days,
          witnesses, description, photo_url, hospital_transfer, first_aid_notes,
          is_critical, requires_report, report_deadline, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?)`,
      b.occurred_at, b.area_id || null, b.area_name || '',
      b.injured_employee_id || null, b.injured_name || '',
      b.injury_body_part || '', b.injury_severity || '',
      parseInt(b.hospitalization_days) || 0,
      b.witnesses || '', b.description || '', b.photo_url || '',
      b.hospital_transfer ? 1 : 0, b.first_aid_notes || '',
      judge.is_critical ? 1 : 0,
      judge.requires_report ? 1 : 0,
      deadlineStr,
      user?.id || 0
    );
    res.json({
      success: true,
      id: result.lastInsertRowid,
      is_critical: judge.is_critical,
      requires_report: judge.requires_report,
      report_deadline: deadlineStr,
    });
  } catch (error: any) {
    console.error('[incidents/create]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/safety-manager/incidents/:id */
router.patch('/incidents/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const b = req.body || {};
    // 심각도·입원일 변경 시 재판별
    let judge: ReturnType<typeof judgeCritical> | null = null;
    if (b.injury_severity !== undefined || b.hospitalization_days !== undefined) {
      const cur = await dbGet(`SELECT * FROM incidents WHERE id = ?`, id) as any;
      if (!cur) { res.status(404).json({ error: '재해 없음' }); return; }
      judge = judgeCritical({
        injury_severity: b.injury_severity !== undefined ? b.injury_severity : cur.injury_severity,
        hospitalization_days: b.hospitalization_days !== undefined ? b.hospitalization_days : cur.hospitalization_days,
      });
    }
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    const fields: Array<[string, string, (v: any) => any]> = [
      ['area_id', 'area_id', (v) => v || null],
      ['area_name', 'area_name', (v) => v || ''],
      ['injured_name', 'injured_name', (v) => v || ''],
      ['injured_employee_id', 'injured_employee_id', (v) => v || null],
      ['injury_body_part', 'injury_body_part', (v) => v || ''],
      ['injury_severity', 'injury_severity', (v) => v || ''],
      ['hospitalization_days', 'hospitalization_days', (v) => parseInt(v) || 0],
      ['witnesses', 'witnesses', (v) => v || ''],
      ['description', 'description', (v) => v || ''],
      ['photo_url', 'photo_url', (v) => v || ''],
      ['hospital_transfer', 'hospital_transfer', (v) => v ? 1 : 0],
      ['first_aid_notes', 'first_aid_notes', (v) => v || ''],
      ['cause_unsafe_state', 'cause_unsafe_state', (v) => v || ''],
      ['cause_unsafe_action', 'cause_unsafe_action', (v) => v || ''],
      ['cause_managerial', 'cause_managerial', (v) => v || ''],
      ['mitigation', 'mitigation', (v) => v || ''],
      ['status', 'status', (v) => v || 'reported'],
    ];
    for (const [key, col, tx] of fields) {
      if (b[key] !== undefined) { sets.push(`${col} = ?`); params.push(tx(b[key])); }
    }
    if (judge) {
      sets.push('is_critical = ?'); params.push(judge.is_critical ? 1 : 0);
      sets.push('requires_report = ?'); params.push(judge.requires_report ? 1 : 0);
    }
    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE incidents SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[incidents/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/incidents/:id/report-submitted
 *  body: { report_receipt_url? }
 *  산업재해조사표 제출 완료 표기.
 */
router.post('/incidents/:id/report-submitted', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { report_receipt_url } = req.body || {};
    await dbRun(
      `UPDATE incidents
          SET report_submitted_at = NOW(),
              report_receipt_url = ?,
              status = CASE WHEN status = 'reported' THEN 'reported_to_labor' ELSE status END,
              updated_at = NOW()
        WHERE id = ?`,
      report_receipt_url || '', id
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 산업안전보건위원회 (Committee)
// ═══════════════════════════════════════════════════════════════
/** GET /api/safety-manager/committee-minutes?year= */
router.get('/committee-minutes', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (year) { clauses.push('year = ?'); params.push(year); }
    const rows = await dbAll(
      `SELECT * FROM safety_committee_minutes
        WHERE ${clauses.join(' AND ')}
        ORDER BY year DESC, quarter DESC, id DESC`,
      ...params
    );
    res.json({ items: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/safety-manager/committee-minutes/:id */
router.get('/committee-minutes/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const row = await dbGet(`SELECT * FROM safety_committee_minutes WHERE id = ?`, id);
    if (!row) { res.status(404).json({ error: '회의록 없음' }); return; }
    res.json({ item: row });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/safety-manager/committee-minutes
 *  body: { year, quarter, round_no?, held_at, location?, agenda_reported?, agenda_decided?,
 *          decisions?, worker_rep_input?, participants_employer?, participants_worker? }
 */
router.post('/committee-minutes', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    const year = parseInt(b.year) || new Date().getFullYear();
    const quarter = parseInt(b.quarter);
    if (!quarter || quarter < 1 || quarter > 4) {
      res.status(400).json({ error: 'quarter는 1~4' });
      return;
    }
    if (!b.held_at) { res.status(400).json({ error: 'held_at 필수' }); return; }
    // year+quarter 이미 있으면 400 (UNIQUE 위반 방지)
    const dup = await dbGet(
      `SELECT id FROM safety_committee_minutes WHERE year = ? AND quarter = ?`,
      year, quarter
    );
    if (dup) {
      res.status(400).json({ error: `${year}년 ${quarter}분기 회의록이 이미 있습니다.` });
      return;
    }
    const result = await dbRun(
      `INSERT INTO safety_committee_minutes
         (year, quarter, round_no, held_at, location, agenda_reported, agenda_decided,
          decisions, worker_rep_input, participants_employer, participants_worker, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      year, quarter, b.round_no || null, b.held_at, b.location || '',
      b.agenda_reported || '', b.agenda_decided || '', b.decisions || '',
      b.worker_rep_input || '',
      b.participants_employer || '', b.participants_worker || '',
      user?.id || 0
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[committee/create]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/safety-manager/committee-minutes/:id */
router.patch('/committee-minutes/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    const fields = [
      'round_no', 'held_at', 'location', 'agenda_reported', 'agenda_decided',
      'decisions', 'worker_rep_input', 'participants_employer', 'participants_worker', 'status',
    ];
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]); }
    }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE safety_committee_minutes SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
