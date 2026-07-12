import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getBusinessDate, getKSTDate } from '../db';
import { logManagerHours, ACTIVITY_LABEL, ACTIVITY_DEFAULT_MINUTES } from '../lib/managerHours';

const router = Router();

/**
 * 관리자용 안전보건 시스템 API — requireAuth 미들웨어 뒤에 마운트.
 * P1: 근로자 매일 셀프체크 이행 현황 대시보드.
 */

/**
 * GET /api/safety-manager/worker-compliance?date=YYYY-MM-DD
 * 특정 영업일 기준 게이팅 대상 근로자 이행 현황.
 * 카페 정규직·사무직 제외 → 생산직 대상만.
 */
router.get('/worker-compliance', async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || getBusinessDate();
    const dept = (req.query.department as string) || '';

    // 게이팅 대상 = 재직 중 + 카페·사무직 제외
    const params: any[] = [date];
    let deptFilter = '';
    if (dept) {
      deptFilter = ` AND re.department = ?`;
      params.push(dept);
    }
    const rows = await dbAll(
      `SELECT re.id, re.name, re.phone, re.department, re.team, re.role,
              pre.completed_at AS pre_at, pre.overall_ok AS pre_ok,
              post.completed_at AS post_at, post.overall_ok AS post_ok,
              ra.clock_in_time, ra.clock_out_time
         FROM regular_employees re
         LEFT JOIN worker_safety_task_log pre
                ON pre.employee_id = re.id AND pre.task_type = 'precheck' AND pre.task_date = ?
         LEFT JOIN worker_safety_task_log post
                ON post.employee_id = re.id AND post.task_type = 'postcheck' AND post.task_date = ?
         LEFT JOIN regular_attendance ra
                ON ra.employee_id = re.id AND ra.date = ?
        WHERE re.is_active = 1
          AND COALESCE(re.department, '') NOT LIKE '카페%'
          AND COALESCE(re.department, '') NOT LIKE '사무%'
          ${deptFilter}
        ORDER BY re.department, re.team, re.name`,
      date, date, date, ...(dept ? [dept] : [])
    );

    // 최근 7일 미완 카운트 (참고 지표)
    const recent = await dbAll(
      `SELECT re.id, re.name,
              SUM(CASE WHEN pre.id IS NULL THEN 1 ELSE 0 END) AS missing_pre_7d,
              SUM(CASE WHEN post.id IS NULL AND ra.clock_out_time IS NOT NULL THEN 1 ELSE 0 END) AS missing_post_7d
         FROM regular_employees re
         CROSS JOIN generate_series((CURRENT_DATE - INTERVAL '6 day')::date, CURRENT_DATE, INTERVAL '1 day') d
         LEFT JOIN regular_attendance ra
                ON ra.employee_id = re.id AND ra.date = to_char(d.d, 'YYYY-MM-DD')
         LEFT JOIN worker_safety_task_log pre
                ON pre.employee_id = re.id AND pre.task_type = 'precheck' AND pre.task_date = to_char(d.d, 'YYYY-MM-DD')
         LEFT JOIN worker_safety_task_log post
                ON post.employee_id = re.id AND post.task_type = 'postcheck' AND post.task_date = to_char(d.d, 'YYYY-MM-DD')
        WHERE re.is_active = 1
          AND ra.id IS NOT NULL
          AND COALESCE(re.department, '') NOT LIKE '카페%'
          AND COALESCE(re.department, '') NOT LIKE '사무%'
        GROUP BY re.id, re.name`
    );
    const missingMap = new Map<number, { missing_pre_7d: number; missing_post_7d: number }>();
    for (const r of recent as any[]) {
      missingMap.set(r.id, {
        missing_pre_7d: Number(r.missing_pre_7d) || 0,
        missing_post_7d: Number(r.missing_post_7d) || 0,
      });
    }

    const items = (rows as any[]).map((r) => {
      const clockedIn = !!r.clock_in_time;
      const clockedOut = !!r.clock_out_time;
      const preRequired = clockedIn;
      const postRequired = clockedOut;
      const preDone = !!r.pre_at;
      const postDone = !!r.post_at;
      return {
        employee_id: r.id,
        name: r.name,
        phone: r.phone,
        department: r.department,
        team: r.team,
        role: r.role,
        clock_in_time: r.clock_in_time,
        clock_out_time: r.clock_out_time,
        precheck_done: preDone,
        precheck_ok: r.pre_ok === null ? null : !!r.pre_ok,
        precheck_completed_at: r.pre_at,
        postcheck_done: postDone,
        postcheck_ok: r.post_ok === null ? null : !!r.post_ok,
        postcheck_completed_at: r.post_at,
        // 이행 상태 요약
        status:
          !clockedIn ? 'no_attendance' :
          !preDone ? 'pre_missing' :
          clockedOut && !postDone ? 'post_missing' :
          r.pre_ok === 0 || r.post_ok === 0 ? 'has_issue' :
          'complete',
        missing_pre_7d: missingMap.get(r.id)?.missing_pre_7d || 0,
        missing_post_7d: missingMap.get(r.id)?.missing_post_7d || 0,
      };
    });

    const summary = {
      total: items.length,
      no_attendance: items.filter((i) => i.status === 'no_attendance').length,
      pre_missing: items.filter((i) => i.status === 'pre_missing').length,
      post_missing: items.filter((i) => i.status === 'post_missing').length,
      has_issue: items.filter((i) => i.status === 'has_issue').length,
      complete: items.filter((i) => i.status === 'complete').length,
    };

    res.json({ date, items, summary });
  } catch (error: any) {
    console.error('[safety-manager/worker-compliance]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/safety-manager/worker-compliance/:employeeId/detail?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 직원 상세 — 기간 내 셀프체크 이력 + 응답 내용.
 */
router.get('/worker-compliance/:employeeId/detail', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string);
    const from = (req.query.from as string) || '';
    const to = (req.query.to as string) || getBusinessDate();
    if (!from) {
      res.status(400).json({ error: 'from 파라미터 필요 (YYYY-MM-DD)' });
      return;
    }
    const emp = await dbGet(
      `SELECT id, name, phone, department, team, role FROM regular_employees WHERE id = ?`,
      employeeId
    );
    if (!emp) {
      res.status(404).json({ error: '직원 없음' });
      return;
    }
    const logs = await dbAll(
      `SELECT id, task_type, task_date, response_json, overall_ok, completed_at, client_ip, user_agent
         FROM worker_safety_task_log
        WHERE employee_id = ? AND task_date BETWEEN ? AND ?
        ORDER BY task_date DESC, task_type`,
      employeeId, from, to
    );
    res.json({ employee: emp, from, to, logs });
  } catch (error: any) {
    console.error('[safety-manager/detail]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/safety-manager/templates
 * 등록된 체크리스트 템플릿 마스터 조회. 편집 UI 준비용.
 */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await dbAll(
      `SELECT t.id, t.kind, t.frequency, t.target_role, t.name, t.sort_order, t.active,
              (SELECT COUNT(*) FROM safety_check_items_master m WHERE m.template_id = t.id) AS item_count
         FROM safety_check_templates t
        ORDER BY t.frequency, t.sort_order, t.id`
    );
    res.json({ templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates/:id/items', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const items = await dbAll(
      `SELECT id, item_no, item_title, item_detail, requires_photo_on_x, sort_order
         FROM safety_check_items_master WHERE template_id = ? ORDER BY item_no`,
      id
    );
    res.json({ items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// P2 — 아차사고 / 순회점검 / 조치 티켓
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/safety-manager/areas
 * 안전 구역 마스터 조회.
 */
router.get('/areas', async (_req: Request, res: Response) => {
  try {
    const areas = await dbAll(
      `SELECT id, code, name, sort_order, active FROM safety_areas WHERE active = 1 ORDER BY sort_order, id`
    );
    res.json({ areas });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/safety-manager/inspection-templates?area_id=
 * 관리자 순회점검 템플릿(target_role='manager') 조회. area_id 지정 시 필터.
 */
router.get('/inspection-templates', async (req: Request, res: Response) => {
  try {
    const areaId = req.query.area_id ? parseInt(req.query.area_id as string) : null;
    const rows = areaId
      ? await dbAll(
          `SELECT t.id, t.name, t.area_id, t.sort_order, a.name AS area_name, a.code AS area_code
             FROM safety_check_templates t
             LEFT JOIN safety_areas a ON a.id = t.area_id
            WHERE t.kind='safety' AND t.frequency='daily' AND t.target_role='manager' AND t.active=1
              AND t.area_id = ?
            ORDER BY t.sort_order, t.id`,
          areaId
        )
      : await dbAll(
          `SELECT t.id, t.name, t.area_id, t.sort_order, a.name AS area_name, a.code AS area_code
             FROM safety_check_templates t
             LEFT JOIN safety_areas a ON a.id = t.area_id
            WHERE t.kind='safety' AND t.frequency='daily' AND t.target_role='manager' AND t.active=1
            ORDER BY a.sort_order, t.sort_order, t.id`
        );
    const templates: any[] = [];
    for (const t of rows as any[]) {
      const items = await dbAll(
        `SELECT id, item_no, item_title, item_detail, requires_photo_on_x, sort_order
           FROM safety_check_items_master WHERE template_id = ? ORDER BY item_no`,
        t.id
      );
      templates.push({ ...t, items });
    }
    res.json({ templates });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- 순회점검 헤더 ----
/**
 * GET /api/safety-manager/inspections?date=YYYY-MM-DD&area_id=
 */
router.get('/inspections', async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || getKSTDate();
    const areaId = req.query.area_id ? parseInt(req.query.area_id as string) : null;
    const rows = areaId
      ? await dbAll(
          `SELECT i.*, a.name AS area_name, a.code AS area_code,
                  (SELECT COUNT(*) FROM safety_inspection_findings f WHERE f.inspection_id = i.id) AS finding_count,
                  (SELECT COUNT(*) FROM safety_inspection_findings f WHERE f.inspection_id = i.id AND f.judgement = 'X') AS x_count
             FROM safety_daily_inspections i
             LEFT JOIN safety_areas a ON a.id = i.area_id
            WHERE i.inspection_date = ? AND i.area_id = ?
            ORDER BY i.inspected_at DESC`,
          date, areaId
        )
      : await dbAll(
          `SELECT i.*, a.name AS area_name, a.code AS area_code,
                  (SELECT COUNT(*) FROM safety_inspection_findings f WHERE f.inspection_id = i.id) AS finding_count,
                  (SELECT COUNT(*) FROM safety_inspection_findings f WHERE f.inspection_id = i.id AND f.judgement = 'X') AS x_count
             FROM safety_daily_inspections i
             LEFT JOIN safety_areas a ON a.id = i.area_id
            WHERE i.inspection_date = ?
            ORDER BY i.inspected_at DESC`,
          date
        );
    res.json({ date, inspections: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/safety-manager/inspections
 * body: { area_id, inspection_date?, weather?, overall_notes? }
 */
router.post('/inspections', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const inspectorId = user?.id || 0;
    const inspectorName = user?.email || '';
    const { area_id, inspection_date, weather, overall_notes } = req.body || {};
    const date = inspection_date || getKSTDate();
    const result = await dbRun(
      `INSERT INTO safety_daily_inspections (area_id, inspector_id, inspector_name, inspection_date, weather, overall_notes, status)
       VALUES (?, ?, ?, ?, ?, ?, 'in_progress')`,
      area_id || null, inspectorId, inspectorName, date, weather || '', overall_notes || ''
    );
    const insId = Number(result.lastInsertRowid);
    await logManagerHours({
      managerId: inspectorId, managerName: inspectorName,
      activityType: 'safety_daily_inspection', minutes: 60,
      sourceType: 'safety_daily_inspections', sourceId: insId,
      notes: `일일 순회점검 ${date}`,
    });
    res.json({ success: true, id: insId, inspection_date: date });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/safety-manager/inspections/:id
 * body: { status?, overall_notes?, weather? }
 */
router.patch('/inspections/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { status, overall_notes, weather } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (status !== undefined) { sets.push(`status = ?`); params.push(status); }
    if (overall_notes !== undefined) { sets.push(`overall_notes = ?`); params.push(overall_notes); }
    if (weather !== undefined) { sets.push(`weather = ?`); params.push(weather); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE safety_daily_inspections SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- 순회점검 지적사항 ----
router.get('/inspections/:id/findings', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const findings = await dbAll(
      `SELECT f.*, m.item_title AS master_title
         FROM safety_inspection_findings f
         LEFT JOIN safety_check_items_master m ON m.id = f.item_master_id
        WHERE f.inspection_id = ? ORDER BY f.id`,
      id
    );
    res.json({ inspection_id: id, findings });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/safety-manager/inspections/:id/findings
 * body: { findings: [{ item_master_id?, item_title, area_id?, judgement (O/△/X), photo_url?, notes? }] }
 * X 판정 항목은 조치 티켓을 자동 생성해 finding.ticket_id 에 링크.
 */
router.post('/inspections/:id/findings', async (req: Request, res: Response) => {
  try {
    const inspectionId = parseInt(req.params.id as string);
    const user = (req as any).user;
    const createdBy = user?.id || 0;
    const inspection = await dbGet(
      `SELECT id, area_id, inspection_date FROM safety_daily_inspections WHERE id = ?`,
      inspectionId
    ) as any;
    if (!inspection) { res.status(404).json({ error: '순회점검 없음' }); return; }
    const { findings } = req.body || {};
    if (!Array.isArray(findings)) {
      res.status(400).json({ error: 'findings 배열 필요' });
      return;
    }
    let ticketCount = 0;
    const results: any[] = [];
    for (const f of findings) {
      if (!f?.judgement || !['O', '△', 'X'].includes(f.judgement)) continue;
      // 지적 저장
      const insRes = await dbRun(
        `INSERT INTO safety_inspection_findings
           (inspection_id, item_master_id, item_title, area_id, judgement, photo_url, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        inspectionId, f.item_master_id || null, f.item_title || '',
        inspection.area_id || null, f.judgement, f.photo_url || '', f.notes || ''
      );
      const findingId = Number(insRes.lastInsertRowid);
      let ticketId: number | null = null;
      if (f.judgement === 'X') {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        const dueStr = dueDate.toISOString().slice(0, 10);
        const tRes = await dbRun(
          `INSERT INTO safety_action_tickets
             (source_type, source_id, area_id, title, description, severity, due_date, status, created_by)
           VALUES ('inspection', ?, ?, ?, ?, 'mid', ?, 'open', ?)`,
          findingId, inspection.area_id || null, f.item_title || '순회점검 지적', f.notes || '', dueStr, createdBy
        );
        ticketId = Number(tRes.lastInsertRowid);
        await dbRun(
          `UPDATE safety_inspection_findings SET ticket_id = ? WHERE id = ?`,
          ticketId, findingId
        );
        ticketCount++;
      }
      results.push({ finding_id: findingId, ticket_id: ticketId });
    }
    // 점검 상태 done 처리
    await dbRun(`UPDATE safety_daily_inspections SET status = 'done' WHERE id = ?`, inspectionId);
    res.json({
      success: true,
      inspection_id: inspectionId,
      findings_saved: results.length,
      tickets_created: ticketCount,
      results,
    });
  } catch (error: any) {
    console.error('[inspections/findings]', error);
    res.status(500).json({ error: error.message });
  }
});

// ---- 조치 티켓 ----
/**
 * GET /api/safety-manager/tickets?status=&severity=&area_id=&overdue=1
 */
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const clauses: string[] = ['1=1'];
    const params: any[] = [];
    const status = req.query.status as string;
    const severity = req.query.severity as string;
    const areaId = req.query.area_id ? parseInt(req.query.area_id as string) : null;
    const overdue = req.query.overdue === '1' || req.query.overdue === 'true';
    if (status) { clauses.push(`t.status = ?`); params.push(status); }
    if (severity) { clauses.push(`t.severity = ?`); params.push(severity); }
    if (areaId) { clauses.push(`t.area_id = ?`); params.push(areaId); }
    if (overdue) {
      clauses.push(`t.due_date IS NOT NULL AND t.due_date < ? AND t.status IN ('open','in_progress')`);
      params.push(getKSTDate());
    }
    const tickets = await dbAll(
      `SELECT t.*, a.name AS area_name, a.code AS area_code
         FROM safety_action_tickets t
         LEFT JOIN safety_areas a ON a.id = t.area_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY
          CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
          COALESCE(t.due_date, '9999-12-31') ASC,
          t.id DESC
        LIMIT 500`,
      ...params
    );
    const today = getKSTDate();
    const items = (tickets as any[]).map((t) => ({
      ...t,
      is_overdue: !!(t.due_date && t.due_date < today && (t.status === 'open' || t.status === 'in_progress')),
    }));
    const summary = {
      total: items.length,
      open: items.filter((t) => t.status === 'open').length,
      in_progress: items.filter((t) => t.status === 'in_progress').length,
      done: items.filter((t) => t.status === 'done').length,
      overdue: items.filter((t) => t.is_overdue).length,
    };
    res.json({ tickets: items, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/safety-manager/tickets/:id
 * body: { status?, severity?, assignee_name?, assignee_id?, due_date?, description?,
 *         completion_photo_url?, completion_notes? }
 */
router.patch('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = (req as any).user;
    const {
      status, severity, assignee_name, assignee_id, due_date, description, title,
      completion_photo_url, completion_notes,
    } = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (severity !== undefined) { sets.push('severity = ?'); params.push(severity); }
    if (assignee_name !== undefined) { sets.push('assignee_name = ?'); params.push(assignee_name); }
    if (assignee_id !== undefined) { sets.push('assignee_id = ?'); params.push(assignee_id); }
    if (due_date !== undefined) { sets.push('due_date = ?'); params.push(due_date || null); }
    if (title !== undefined) { sets.push('title = ?'); params.push(title); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (completion_photo_url !== undefined) { sets.push('completion_photo_url = ?'); params.push(completion_photo_url); }
    if (completion_notes !== undefined) { sets.push('completion_notes = ?'); params.push(completion_notes); }
    if (status === 'done') {
      sets.push('completed_at = NOW()');
      sets.push('verified_by = ?'); params.push(user?.id || 0);
      sets.push('verified_at = NOW()');
    }
    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE safety_action_tickets SET ${sets.join(', ')} WHERE id = ?`, ...params);
    // 티켓이 hazard_reports 에서 파생된 경우 신고 상태 동기화
    if (status === 'done') {
      await dbRun(
        `UPDATE hazard_reports SET status = 'closed', closed_at = NOW() WHERE ticket_id = ?`,
        id
      );
    }
    const updated = await dbGet(`SELECT * FROM safety_action_tickets WHERE id = ?`, id);
    res.json({ success: true, ticket: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- 아차사고 / 위험요인 신고 ----
/**
 * GET /api/safety-manager/hazard-reports?status=&limit=
 */
router.get('/hazard-reports', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const params: any[] = [];
    let where = '1=1';
    if (status) { where += ' AND h.status = ?'; params.push(status); }
    const rows = await dbAll(
      `SELECT h.*, a.name AS area_name_lookup, a.code AS area_code,
              t.status AS ticket_status, t.severity AS ticket_severity, t.due_date AS ticket_due_date
         FROM hazard_reports h
         LEFT JOIN safety_areas a ON a.id = h.area_id
         LEFT JOIN safety_action_tickets t ON t.id = h.ticket_id
        WHERE ${where}
        ORDER BY
          CASE h.status WHEN 'reported' THEN 0 WHEN 'assessed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'closed' THEN 3 ELSE 4 END,
          h.id DESC
        LIMIT ${limit}`,
      ...params
    );
    const summary = {
      total: rows.length,
      reported: (rows as any[]).filter((r) => r.status === 'reported').length,
      assessed: (rows as any[]).filter((r) => r.status === 'assessed').length,
      in_progress: (rows as any[]).filter((r) => r.status === 'in_progress').length,
      closed: (rows as any[]).filter((r) => r.status === 'closed').length,
    };
    res.json({ reports: rows, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/safety-manager/hazard-reports/:id
 * body: { status?, area_id?, description?, hazard_type? }
 */
router.patch('/hazard-reports/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { status, area_id, description, hazard_type, area_name } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (area_id !== undefined) { sets.push('area_id = ?'); params.push(area_id || null); }
    if (area_name !== undefined) { sets.push('area_name = ?'); params.push(area_name); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (hazard_type !== undefined) { sets.push('hazard_type = ?'); params.push(hazard_type); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE hazard_reports SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/safety-manager/hazard-reports/:id/assess
 * body: { freq_score (1~3), intensity_score (1~3), severity? ('low'|'mid'|'high'|'critical'),
 *         due_date?, assignee_name?, notes? }
 * 등급(grade) = freq * intensity → high/mid/low 자동 계산 + 조치 티켓 자동 생성.
 */
router.post('/hazard-reports/:id/assess', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const user = (req as any).user;
    const createdBy = user?.id || 0;
    const report = await dbGet(`SELECT * FROM hazard_reports WHERE id = ?`, id) as any;
    if (!report) { res.status(404).json({ error: '신고 없음' }); return; }
    const { freq_score, intensity_score, severity, due_date, assignee_name, notes } = req.body || {};
    const f = Math.max(1, Math.min(3, parseInt(freq_score) || 0));
    const i = Math.max(1, Math.min(3, parseInt(intensity_score) || 0));
    if (!f || !i) { res.status(400).json({ error: 'freq_score, intensity_score 1~3 필요' }); return; }
    const product = f * i;
    // 매트릭스 기준 grade + 기본 심각도
    const grade = product >= 6 ? 'high' : product >= 3 ? 'mid' : 'low';
    const sev = severity || (grade === 'high' ? 'high' : grade === 'mid' ? 'mid' : 'low');
    const dueDate = due_date || (() => {
      const d = new Date();
      d.setDate(d.getDate() + (grade === 'high' ? 3 : grade === 'mid' ? 7 : 14));
      return d.toISOString().slice(0, 10);
    })();
    // 기존 티켓 있으면 재사용, 없으면 생성
    let ticketId = report.ticket_id as number | null;
    if (ticketId) {
      await dbRun(
        `UPDATE safety_action_tickets
            SET severity = ?, due_date = ?, assignee_name = ?, updated_at = NOW()
          WHERE id = ?`,
        sev, dueDate, assignee_name || '', ticketId
      );
    } else {
      const tRes = await dbRun(
        `INSERT INTO safety_action_tickets
           (source_type, source_id, area_id, title, description, severity, assignee_name, due_date, status, created_by)
         VALUES ('hazard', ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
        id, report.area_id || null, `아차사고: ${report.hazard_type}`,
        report.description || notes || '', sev, assignee_name || '', dueDate, createdBy
      );
      ticketId = Number(tRes.lastInsertRowid);
    }
    await dbRun(
      `UPDATE hazard_reports
          SET freq_score = ?, intensity_score = ?, grade = ?, assessed_by = ?, assessed_at = NOW(),
              ticket_id = ?, status = CASE WHEN status = 'reported' THEN 'assessed' ELSE status END
        WHERE id = ?`,
      f, i, grade, createdBy, ticketId, id
    );
    const updated = await dbGet(`SELECT * FROM hazard_reports WHERE id = ?`, id);
    await logManagerHours({
      managerId: createdBy, managerName: user?.email || '',
      activityType: 'hazard_processing', minutes: 15,
      sourceType: 'hazard_reports', sourceId: id,
      notes: `아차사고 등급판정: ${grade}`,
    });
    res.json({ success: true, report: updated, ticket_id: ticketId });
  } catch (error: any) {
    console.error('[hazard/assess]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/safety-manager/hazard-reports/:id/reply
 * body: { response_to_reporter: string }
 * 신고자에게 조치 결과 통지 문구를 저장 (실제 SMS 발송은 후속 Phase).
 */
router.post('/hazard-reports/:id/reply', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { response_to_reporter } = req.body || {};
    if (!response_to_reporter || typeof response_to_reporter !== 'string') {
      res.status(400).json({ error: 'response_to_reporter 필요' });
      return;
    }
    await dbRun(
      `UPDATE hazard_reports
          SET response_to_reporter = ?, response_sent_at = NOW()
        WHERE id = ?`,
      response_to_reporter, id
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// P6 — 겸직 관리자 활동시간 결산
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/safety-manager/manager-hours?year=&month=&manager_name=
 * 월별·연간 결산. manager_name 로 필터, 미지정 시 전체(관리자별 집계).
 * 반기 685~802h 목표 대비 게이지 값 함께 반환.
 */
router.get('/manager-hours', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = req.query.year ? parseInt(req.query.year as string) : kstNow.getUTCFullYear();
    const managerName = (req.query.manager_name as string) || '';
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const params: any[] = [yearStart, yearEnd];
    let where = 'occurred_at >= ? AND occurred_at < (?::date + INTERVAL \'1 day\')';
    if (managerName) { where += ' AND manager_name = ?'; params.push(managerName); }

    // 월별 (활동유형별 breakdown 도)
    const monthlyRows = await dbAll(
      `SELECT to_char(occurred_at, 'YYYY-MM') AS month,
              activity_type,
              COALESCE(SUM(minutes), 0) AS mins,
              COUNT(*) AS event_count
         FROM manager_activity_hours
        WHERE ${where}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      ...params
    ) as any[];

    // 활동 유형별 합계 (연간)
    const byActivity: Record<string, { minutes: number; hours: number; events: number; label: string }> = {};
    // 월별 격자 구조
    const monthlyGrid: Record<string, Record<string, number>> = {};
    for (const r of monthlyRows) {
      byActivity[r.activity_type] = byActivity[r.activity_type] || { minutes: 0, hours: 0, events: 0, label: ACTIVITY_LABEL[r.activity_type] || r.activity_type };
      byActivity[r.activity_type].minutes += Number(r.mins) || 0;
      byActivity[r.activity_type].events += Number(r.event_count) || 0;
      monthlyGrid[r.month] = monthlyGrid[r.month] || {};
      monthlyGrid[r.month][r.activity_type] = Number(r.mins) || 0;
    }
    for (const k of Object.keys(byActivity)) {
      byActivity[k].hours = Math.round((byActivity[k].minutes / 60) * 10) / 10;
    }

    const monthly: Array<{ month: string; total_hours: number; by_activity: Record<string, number> }> = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${year}-${String(m).padStart(2, '0')}`;
      const g = monthlyGrid[ym] || {};
      const totalMins = Object.values(g).reduce((s, v) => s + v, 0);
      // by_activity 도 시간 단위로
      const perActivityHours: Record<string, number> = {};
      for (const [k, v] of Object.entries(g)) perActivityHours[k] = Math.round((v / 60) * 10) / 10;
      monthly.push({ month: ym, total_hours: Math.round((totalMins / 60) * 10) / 10, by_activity: perActivityHours });
    }

    // 관리자별(name) 집계 — 미필터 시 유용
    const perManager = managerName ? [] : await dbAll(
      `SELECT COALESCE(NULLIF(manager_name, ''), '(미지정)') AS name,
              COALESCE(SUM(minutes), 0) AS mins,
              COUNT(*) AS event_count
         FROM manager_activity_hours
        WHERE occurred_at >= ? AND occurred_at < (?::date + INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 2 DESC`,
      yearStart, yearEnd
    );
    const perManagerFmt = (perManager as any[]).map(r => ({
      name: r.name,
      hours: Math.round((Number(r.mins) / 60) * 10) / 10,
      minutes: Number(r.mins),
      event_count: Number(r.event_count),
    }));

    // 반기 게이지
    const h1Start = `${year}-01-01`, h1End = `${year}-06-30`;
    const h2Start = `${year}-07-01`, h2End = `${year}-12-31`;
    const halfSumParams: any[] = [];
    let halfWhere = 'occurred_at >= ? AND occurred_at < (?::date + INTERVAL \'1 day\')';
    if (managerName) { halfWhere += ' AND manager_name = ?'; }
    const h1 = await dbGet(
      `SELECT COALESCE(SUM(minutes), 0) AS mins FROM manager_activity_hours WHERE ${halfWhere}`,
      ...(managerName ? [h1Start, h1End, managerName] : [h1Start, h1End])
    ) as any;
    const h2 = await dbGet(
      `SELECT COALESCE(SUM(minutes), 0) AS mins FROM manager_activity_hours WHERE ${halfWhere}`,
      ...(managerName ? [h2Start, h2End, managerName] : [h2Start, h2End])
    ) as any;
    const yearMins = Number(h1?.mins || 0) + Number(h2?.mins || 0);
    const HALF_TARGET_MIN = 685;
    const HALF_TARGET_MAX = 802;

    res.json({
      year,
      manager_name: managerName || null,
      total_hours: Math.round((yearMins / 60) * 10) / 10,
      by_activity: byActivity,
      activity_labels: ACTIVITY_LABEL,
      monthly,
      per_manager: perManagerFmt,
      half_summary: {
        H1: {
          hours: Math.round((Number(h1?.mins || 0) / 60) * 10) / 10,
          target_min: HALF_TARGET_MIN,
          target_max: HALF_TARGET_MAX,
          gauge_pct: Math.min(200, Math.round((Number(h1?.mins || 0) / 60 / HALF_TARGET_MIN) * 1000) / 10),
        },
        H2: {
          hours: Math.round((Number(h2?.mins || 0) / 60) * 10) / 10,
          target_min: HALF_TARGET_MIN,
          target_max: HALF_TARGET_MAX,
          gauge_pct: Math.min(200, Math.round((Number(h2?.mins || 0) / 60 / HALF_TARGET_MIN) * 1000) / 10),
        },
      },
    });
  } catch (error: any) {
    console.error('[manager-hours]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/safety-manager/manager-hours/log — 수동 로깅
 * body: { activity_type, minutes, occurred_at?, manager_name?, notes? }
 */
router.post('/manager-hours/log', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    const activityType = b.activity_type as string;
    if (!activityType || !ACTIVITY_LABEL[activityType]) {
      res.status(400).json({ error: 'activity_type 필수' }); return;
    }
    const minutes = parseInt(b.minutes) || ACTIVITY_DEFAULT_MINUTES[activityType] || 30;
    const managerName = (b.manager_name as string) || user?.email || '';
    if (!managerName) { res.status(400).json({ error: 'manager_name 또는 로그인 필요' }); return; }
    await logManagerHours({
      managerId: 0,
      managerName,
      activityType: activityType as any,
      minutes,
      occurredAt: b.occurred_at || new Date().toISOString(),
      sourceType: 'manual',
      notes: b.notes || '',
    });
    res.json({ success: true, minutes });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/safety-manager/manager-hours/managers — dropdown용 관리자 이름 목록 */
router.get('/manager-hours/managers', async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT DISTINCT manager_name FROM manager_activity_hours
        WHERE COALESCE(manager_name, '') <> '' ORDER BY manager_name`
    );
    res.json({ managers: (rows as any[]).map(r => r.manager_name) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
