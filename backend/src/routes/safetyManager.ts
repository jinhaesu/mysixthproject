import { Router, Request, Response } from 'express';
import { dbGet, dbAll, getBusinessDate } from '../db';

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

export default router;
