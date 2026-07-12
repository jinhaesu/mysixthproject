import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getBusinessDate } from '../db';

const router = Router();

/**
 * 안전보건 시스템 P1 — 근로자 문자 웹링크 경유 셀프체크 API.
 * 인증: 기존 regular_employees.token (문자로 발송된 영구 토큰) 재사용.
 * 게이팅: 카페 정규직은 대상 제외. department가 '카페'로 시작하는 직원은 게이팅 없음.
 */

export async function isSafetyGatedEmployee(department: string | null | undefined): Promise<boolean> {
  const dep = (department || '').trim();
  if (!dep) return false;
  // 카페팀 및 사무직 제외 — 생산·물류 라인만 게이팅
  if (dep.startsWith('카페')) return false;
  if (dep === '사무직' || dep.startsWith('사무')) return false;
  return true;
}

async function loadEmployeeByToken(token: string) {
  return await dbGet(
    `SELECT id, name, department, team, role, is_active FROM regular_employees WHERE token = ? AND is_active = 1`,
    token
  ) as any;
}

async function loadDailyTemplateWithItems(taskType: 'precheck' | 'postcheck') {
  // taskType 'precheck' ↔ 이름 '출근 전 셀프체크', 'postcheck' ↔ '퇴근 전 셀프체크'
  const nameFilter = taskType === 'precheck' ? '출근 전%' : '퇴근 전%';
  const template = await dbGet(
    `SELECT id, name, kind, frequency FROM safety_check_templates
      WHERE kind='safety' AND frequency='daily' AND target_role='worker' AND active=1 AND name LIKE ?
      ORDER BY id LIMIT 1`,
    nameFilter
  ) as any;
  if (!template) return null;
  const items = await dbAll(
    `SELECT id, item_no, item_title, item_detail, requires_photo_on_x
       FROM safety_check_items_master WHERE template_id = ? ORDER BY item_no`,
    template.id
  );
  return { template, items };
}

async function getTodayLog(employeeId: number, taskType: 'precheck' | 'postcheck') {
  const businessToday = getBusinessDate();
  return await dbGet(
    `SELECT id, response_json, overall_ok, completed_at
       FROM worker_safety_task_log
      WHERE employee_id = ? AND task_type = ? AND task_date = ?`,
    employeeId, taskType, businessToday
  ) as any;
}

/**
 * GET /api/regular-public/:token/safety/status
 * 오늘 셀프체크 완료 여부 + 게이팅 대상 여부 조회. 홈 카드용.
 */
router.get('/:token/safety/status', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }
    const gated = await isSafetyGatedEmployee(employee.department);
    if (!gated) {
      res.json({
        gated: false,
        department: employee.department,
        precheck_done: true,
        postcheck_done: true,
        message: '카페·사무직은 안전보건 셀프체크 대상이 아닙니다.',
      });
      return;
    }
    const businessToday = getBusinessDate();
    const pre = await getTodayLog(employee.id, 'precheck');
    const post = await getTodayLog(employee.id, 'postcheck');
    res.json({
      gated: true,
      department: employee.department,
      business_date: businessToday,
      precheck_done: !!pre,
      precheck_ok: pre ? !!pre.overall_ok : null,
      precheck_completed_at: pre?.completed_at || null,
      postcheck_done: !!post,
      postcheck_ok: post ? !!post.overall_ok : null,
      postcheck_completed_at: post?.completed_at || null,
    });
  } catch (error: any) {
    console.error('[safety/status]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/regular-public/:token/safety/template/:kind
 * kind = 'precheck' | 'postcheck' — 오늘의 체크리스트 항목 로드.
 */
router.get('/:token/safety/template/:kind', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const kind = req.params.kind as string;
    if (kind !== 'precheck' && kind !== 'postcheck') {
      res.status(400).json({ error: 'kind must be precheck or postcheck' });
      return;
    }
    const employee = await loadEmployeeByToken(token);
    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }
    const gated = await isSafetyGatedEmployee(employee.department);
    if (!gated) {
      res.status(400).json({ error: '이 직원은 셀프체크 대상이 아닙니다.' });
      return;
    }
    const bundle = await loadDailyTemplateWithItems(kind as 'precheck' | 'postcheck');
    if (!bundle) {
      res.status(500).json({ error: '체크리스트 템플릿이 등록되지 않았습니다.' });
      return;
    }
    const already = await getTodayLog(employee.id, kind as 'precheck' | 'postcheck');
    res.json({
      employee: { name: employee.name, department: employee.department, team: employee.team, role: employee.role },
      template: bundle.template,
      items: bundle.items,
      already_done: !!already,
      already_response: already?.response_json || null,
      business_date: getBusinessDate(),
    });
  } catch (error: any) {
    console.error('[safety/template]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/regular-public/:token/safety/submit/:kind
 * kind = 'precheck' | 'postcheck' — 응답 저장.
 * body: { items: [{ id, answer: 'O'|'X'|'△', note?: string }], notes?: string }
 */
router.post('/:token/safety/submit/:kind', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const kind = req.params.kind as string;
    if (kind !== 'precheck' && kind !== 'postcheck') {
      res.status(400).json({ error: 'kind must be precheck or postcheck' });
      return;
    }
    const employee = await loadEmployeeByToken(token);
    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }
    const gated = await isSafetyGatedEmployee(employee.department);
    if (!gated) {
      res.status(400).json({ error: '이 직원은 셀프체크 대상이 아닙니다.' });
      return;
    }
    const bundle = await loadDailyTemplateWithItems(kind as 'precheck' | 'postcheck');
    if (!bundle) {
      res.status(500).json({ error: '템플릿 없음' });
      return;
    }
    const { items, notes } = req.body || {};
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'items 배열 필요' });
      return;
    }
    // 검증 — 모든 마스터 항목이 응답에 있어야 함
    const masterIds = new Set(bundle.items.map((i: any) => i.id));
    const respIds = new Set(items.map((r: any) => r.id));
    for (const mid of masterIds) {
      if (!respIds.has(mid)) {
        res.status(400).json({ error: `누락된 체크 항목 id=${mid}` });
        return;
      }
    }
    const anyX = items.some((r: any) => r.answer === 'X');
    const overallOk = anyX ? 0 : 1;
    const businessToday = getBusinessDate();
    const responseJson = JSON.stringify({ items, notes: notes || '' });
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const userAgent = (req.headers['user-agent'] as string) || '';

    // UPSERT — 같은 날 재제출 허용
    await dbRun(
      `INSERT INTO worker_safety_task_log (employee_id, task_type, task_date, template_id, response_json, overall_ok, client_ip, user_agent)
       VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?)
       ON CONFLICT (employee_id, task_type, task_date)
       DO UPDATE SET response_json = EXCLUDED.response_json, overall_ok = EXCLUDED.overall_ok,
                     completed_at = NOW(), client_ip = EXCLUDED.client_ip, user_agent = EXCLUDED.user_agent`,
      employee.id, kind, businessToday, bundle.template.id, responseJson, overallOk, clientIp, userAgent
    );
    res.json({
      success: true,
      overall_ok: !!overallOk,
      x_count: items.filter((r: any) => r.answer === 'X').length,
      message: overallOk ? '셀프체크 완료' : '이상 항목이 감지되었습니다. 관리자에게 알림이 전송됩니다.',
    });
  } catch (error: any) {
    console.error('[safety/submit]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
