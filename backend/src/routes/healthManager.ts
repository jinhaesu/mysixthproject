import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';

const router = Router();

/**
 * 관리자용 보건 시스템 API — requireAuth 미들웨어 뒤에 마운트.
 * P3: 주간 순회 / 건강상담 / MSDS / 건강진단 / 보건증.
 */

// ── 주간 보건 순회점검 ────────────────────────────────────────────
router.get('/inspections', async (req: Request, res: Response) => {
  try {
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || '';
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (from) { clauses.push('inspection_date >= ?'); params.push(from); }
    if (to) { clauses.push('inspection_date <= ?'); params.push(to); }
    const rows = await dbAll(
      `SELECT * FROM health_weekly_inspections
        WHERE ${clauses.join(' AND ')}
        ORDER BY inspection_date DESC, id DESC
        LIMIT 200`,
      ...params
    );
    res.json({ inspections: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/inspections', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const inspectorId = user?.id || 0;
    const inspectorName = user?.email || '';
    const {
      inspection_date, noise_status, dust_status, temp_status,
      rest_area_status, wash_area_status, first_aid_status, aed_status,
      chemical_storage_status, overall_notes,
    } = req.body || {};
    const date = inspection_date || getKSTDate();
    const result = await dbRun(
      `INSERT INTO health_weekly_inspections
         (inspector_id, inspector_name, inspection_date,
          noise_status, dust_status, temp_status,
          rest_area_status, wash_area_status, first_aid_status, aed_status,
          chemical_storage_status, overall_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      inspectorId, inspectorName, date,
      noise_status || '', dust_status || '', temp_status || '',
      rest_area_status || '', wash_area_status || '', first_aid_status || '', aed_status || '',
      chemical_storage_status || '', overall_notes || ''
    );
    res.json({ success: true, id: result.lastInsertRowid, inspection_date: date });
  } catch (error: any) {
    console.error('[health-manager/inspections]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── 건강상담 기록 ─────────────────────────────────────────────
router.get('/consultations', async (req: Request, res: Response) => {
  try {
    const employeeId = req.query.employee_id ? parseInt(req.query.employee_id as string) : null;
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (employeeId) { clauses.push('c.employee_id = ?'); params.push(employeeId); }
    const rows = await dbAll(
      `SELECT c.*, re.department AS employee_department, re.team AS employee_team
         FROM health_consultations c
         LEFT JOIN regular_employees re ON re.id = c.employee_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY c.consultation_date DESC, c.id DESC
        LIMIT 300`,
      ...params
    );
    res.json({ consultations: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/consultations', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const consultedBy = user?.id || 0;
    const consultedByName = user?.email || '';
    const {
      employee_id, consultation_date, consultation_type,
      chief_complaint, action_taken, next_followup_date,
    } = req.body || {};
    if (!employee_id || !consultation_type) {
      res.status(400).json({ error: 'employee_id, consultation_type 필요' });
      return;
    }
    const emp = await dbGet(
      `SELECT id, name FROM regular_employees WHERE id = ?`, employee_id
    ) as any;
    if (!emp) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }
    const date = consultation_date || getKSTDate();
    const result = await dbRun(
      `INSERT INTO health_consultations
         (employee_id, employee_name, consultation_date, consultation_type,
          chief_complaint, action_taken, next_followup_date, consulted_by, consulted_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      employee_id, emp.name, date, consultation_type,
      chief_complaint || '', action_taken || '', next_followup_date || null,
      consultedBy, consultedByName
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[health-manager/consultations]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── MSDS 관리대장 ─────────────────────────────────────────────
router.get('/msds', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || '';
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (status) { clauses.push('status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT * FROM msds_registry
        WHERE ${clauses.join(' AND ')}
        ORDER BY updated_at DESC, id DESC`,
      ...params
    );
    res.json({ msds: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/msds', async (req: Request, res: Response) => {
  try {
    const {
      material_name, usage_description, handling_dept, handling_location,
      posted_photo_url, container_label_photo_url, required_ppe, status,
    } = req.body || {};
    if (!material_name) { res.status(400).json({ error: 'material_name 필요' }); return; }
    const result = await dbRun(
      `INSERT INTO msds_registry
         (material_name, usage_description, handling_dept, handling_location,
          posted_photo_url, container_label_photo_url, required_ppe, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      material_name, usage_description || '', handling_dept || '', handling_location || '',
      posted_photo_url || '', container_label_photo_url || '', required_ppe || '',
      status || 'pending'
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[health-manager/msds POST]', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/msds/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const {
      material_name, usage_description, handling_dept, handling_location,
      posted_photo_url, container_label_photo_url, required_ppe, status,
      training_completed_at,
    } = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (material_name !== undefined) { sets.push('material_name = ?'); params.push(material_name); }
    if (usage_description !== undefined) { sets.push('usage_description = ?'); params.push(usage_description); }
    if (handling_dept !== undefined) { sets.push('handling_dept = ?'); params.push(handling_dept); }
    if (handling_location !== undefined) { sets.push('handling_location = ?'); params.push(handling_location); }
    if (posted_photo_url !== undefined) { sets.push('posted_photo_url = ?'); params.push(posted_photo_url); }
    if (container_label_photo_url !== undefined) { sets.push('container_label_photo_url = ?'); params.push(container_label_photo_url); }
    if (required_ppe !== undefined) { sets.push('required_ppe = ?'); params.push(required_ppe); }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (training_completed_at !== undefined) {
      if (training_completed_at) { sets.push('training_completed_at = ?'); params.push(training_completed_at); }
      else { sets.push('training_completed_at = NULL'); }
    }
    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE msds_registry SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── 건강진단 관리 ─────────────────────────────────────────────
router.get('/checkups', async (req: Request, res: Response) => {
  try {
    const employeeId = req.query.employee_id ? parseInt(req.query.employee_id as string) : null;
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const type = (req.query.type as string) || '';
    const followupOnly = req.query.followup_only === '1' || req.query.followup_only === 'true';
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (employeeId) { clauses.push('c.employee_id = ?'); params.push(employeeId); }
    if (year) { clauses.push('c.scheduled_year = ?'); params.push(year); }
    if (type) { clauses.push('c.checkup_type = ?'); params.push(type); }
    if (followupOnly) { clauses.push('c.followup_required = 1 AND c.followup_completed_at IS NULL'); }
    const rows = await dbAll(
      `SELECT c.*, re.department AS employee_department, re.team AS employee_team, re.phone AS employee_phone
         FROM health_checkups c
         LEFT JOIN regular_employees re ON re.id = c.employee_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY c.scheduled_year DESC NULLS LAST, c.scheduled_month DESC NULLS LAST, c.id DESC
        LIMIT 500`,
      ...params
    );
    const summary = {
      total: rows.length,
      received: (rows as any[]).filter((r) => r.received_at).length,
      not_received: (rows as any[]).filter((r) => !r.received_at).length,
      followup: (rows as any[]).filter((r) => r.followup_required && !r.followup_completed_at).length,
    };
    res.json({ checkups: rows, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/checkups', async (req: Request, res: Response) => {
  try {
    const {
      employee_id, checkup_type, scheduled_year, scheduled_month,
      received_at, result_grade, result_notes, followup_required, followup_actions,
    } = req.body || {};
    if (!employee_id || !checkup_type) {
      res.status(400).json({ error: 'employee_id, checkup_type 필요' });
      return;
    }
    const emp = await dbGet(
      `SELECT id, name FROM regular_employees WHERE id = ?`, employee_id
    ) as any;
    if (!emp) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }
    const result = await dbRun(
      `INSERT INTO health_checkups
         (employee_id, employee_name, checkup_type, scheduled_year, scheduled_month,
          received_at, result_grade, result_notes, followup_required, followup_actions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      employee_id, emp.name, checkup_type,
      scheduled_year || null, scheduled_month || null,
      received_at || null, result_grade || '', result_notes || '',
      followup_required ? 1 : 0, followup_actions || ''
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[health-manager/checkups POST]', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/checkups/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const {
      checkup_type, scheduled_year, scheduled_month,
      received_at, result_grade, result_notes,
      followup_required, followup_actions, followup_completed_at,
    } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (checkup_type !== undefined) { sets.push('checkup_type = ?'); params.push(checkup_type); }
    if (scheduled_year !== undefined) { sets.push('scheduled_year = ?'); params.push(scheduled_year || null); }
    if (scheduled_month !== undefined) { sets.push('scheduled_month = ?'); params.push(scheduled_month || null); }
    if (received_at !== undefined) {
      if (received_at) { sets.push('received_at = ?'); params.push(received_at); }
      else { sets.push('received_at = NULL'); }
    }
    if (result_grade !== undefined) { sets.push('result_grade = ?'); params.push(result_grade); }
    if (result_notes !== undefined) { sets.push('result_notes = ?'); params.push(result_notes); }
    if (followup_required !== undefined) { sets.push('followup_required = ?'); params.push(followup_required ? 1 : 0); }
    if (followup_actions !== undefined) { sets.push('followup_actions = ?'); params.push(followup_actions); }
    if (followup_completed_at !== undefined) {
      if (followup_completed_at) { sets.push('followup_completed_at = ?'); params.push(followup_completed_at); }
      else { sets.push('followup_completed_at = NULL'); }
    }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE health_checkups SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── 보건증 관리 ───────────────────────────────────────────────
router.get('/certificates', async (req: Request, res: Response) => {
  try {
    const employeeId = req.query.employee_id ? parseInt(req.query.employee_id as string) : null;
    const status = (req.query.status as string) || '';
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    if (employeeId) { clauses.push('c.employee_id = ?'); params.push(employeeId); }
    if (status) { clauses.push('c.status = ?'); params.push(status); }
    const rows = await dbAll(
      `SELECT c.*, re.department AS employee_department, re.team AS employee_team, re.phone AS employee_phone, re.is_active
         FROM health_certificates c
         LEFT JOIN regular_employees re ON re.id = c.employee_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY c.expiry_date ASC, c.id DESC
        LIMIT 1000`,
      ...params
    );
    const today = getKSTDate();
    const items = (rows as any[]).map((r) => {
      const exp = r.expiry_date ? new Date(r.expiry_date) : null;
      const t = new Date(today);
      const daysLeft = exp ? Math.round((exp.getTime() - t.getTime()) / (24 * 60 * 60 * 1000)) : null;
      let hint: 'valid' | 'warning' | 'urgent' | 'expired' = 'valid';
      if (daysLeft === null) hint = 'valid';
      else if (daysLeft < 0) hint = 'expired';
      else if (daysLeft <= 30) hint = 'urgent';
      else if (daysLeft <= 60) hint = 'warning';
      return { ...r, days_until_expiry: daysLeft, status_hint: hint };
    });
    const summary = {
      total: items.length,
      urgent: items.filter((i) => i.status_hint === 'urgent').length,
      expired: items.filter((i) => i.status_hint === 'expired').length,
      warning: items.filter((i) => i.status_hint === 'warning').length,
      valid: items.filter((i) => i.status_hint === 'valid').length,
    };
    res.json({ certificates: items, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/certificates', async (req: Request, res: Response) => {
  try {
    const {
      employee_id, cert_type, issue_date, expiry_date, cert_photo_url, status,
    } = req.body || {};
    if (!employee_id || !issue_date || !expiry_date) {
      res.status(400).json({ error: 'employee_id, issue_date, expiry_date 필요' });
      return;
    }
    const emp = await dbGet(
      `SELECT id, name FROM regular_employees WHERE id = ?`, employee_id
    ) as any;
    if (!emp) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }
    const result = await dbRun(
      `INSERT INTO health_certificates
         (employee_id, employee_name, cert_type, issue_date, expiry_date, cert_photo_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      employee_id, emp.name, cert_type || 'food_handler', issue_date, expiry_date,
      cert_photo_url || '', status || 'valid'
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('[health-manager/certificates POST]', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/certificates/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { cert_type, issue_date, expiry_date, cert_photo_url, status } = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (cert_type !== undefined) { sets.push('cert_type = ?'); params.push(cert_type); }
    if (issue_date !== undefined) { sets.push('issue_date = ?'); params.push(issue_date); }
    if (expiry_date !== undefined) { sets.push('expiry_date = ?'); params.push(expiry_date); }
    if (cert_photo_url !== undefined) { sets.push('cert_photo_url = ?'); params.push(cert_photo_url); }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE health_certificates SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health-manager/expiring-certs
 * 오늘 기준 만료 D-30 이내(음수 포함) 보건증 목록.
 * 재직 중인 직원만.
 */
router.get('/expiring-certs', async (_req: Request, res: Response) => {
  try {
    const today = getKSTDate();
    const rows = await dbAll(
      `SELECT c.id, c.employee_id, c.employee_name, c.cert_type,
              c.issue_date, c.expiry_date, c.cert_photo_url, c.status,
              re.department AS employee_department, re.team AS employee_team, re.phone AS employee_phone
         FROM health_certificates c
         LEFT JOIN regular_employees re ON re.id = c.employee_id
        WHERE re.is_active = 1
          AND c.expiry_date IS NOT NULL
          AND c.expiry_date <> ''
          AND (c.expiry_date::date - ?::date) <= 30
        ORDER BY c.expiry_date ASC, c.id DESC
        LIMIT 500`,
      today
    );
    const t = new Date(today);
    const items = (rows as any[]).map((r) => {
      const exp = r.expiry_date ? new Date(r.expiry_date) : null;
      const daysLeft = exp ? Math.round((exp.getTime() - t.getTime()) / (24 * 60 * 60 * 1000)) : null;
      let hint: 'urgent' | 'expired' = 'urgent';
      if (daysLeft !== null && daysLeft < 0) hint = 'expired';
      return { ...r, days_until_expiry: daysLeft, status_hint: hint };
    });
    res.json({ today, items });
  } catch (error: any) {
    console.error('[health-manager/expiring-certs]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
