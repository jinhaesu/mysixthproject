import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { currentHalfYearPeriod, halfYearEndDate } from './trainingPublic';
import { logManagerHours } from '../lib/managerHours';

const router = Router();

/**
 * 안전보건 P4 관리자 API — 교육 콘텐츠 CRUD + 이수·설문 응답 현황.
 */

/**
 * 유튜브 URL 정규화 — 서버측 방어. 프론트가 보내는 값 형식과 무관하게 embed 로 저장.
 * watch?v=X · youtu.be/X · shorts/X · embed/X → https://www.youtube.com/embed/X
 */
function normalizeYouTubeEmbedUrl(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    let vid = '';
    if (host === 'youtu.be') vid = u.pathname.replace(/^\//, '').split('/')[0];
    else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.pathname === '/watch') vid = u.searchParams.get('v') || '';
      else if (u.pathname.startsWith('/embed/')) vid = u.pathname.replace('/embed/', '').split('/')[0];
      else if (u.pathname.startsWith('/shorts/')) vid = u.pathname.replace('/shorts/', '').split('/')[0];
      else if (u.pathname.startsWith('/v/')) vid = u.pathname.replace('/v/', '').split('/')[0];
    }
    if (/^[a-zA-Z0-9_-]{6,}$/.test(vid)) return `https://www.youtube.com/embed/${vid}`;
    return raw;
  } catch { return raw; }
}

// ── 교육 콘텐츠 마스터 CRUD ────────────────────────────────────
router.get('/training-master', async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT c.id, c.title, c.description, c.video_source_type, c.video_url,
              c.duration_min, c.half_year_credit_hours, c.target_role, c.category,
              c.active, c.sort_order, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM training_quiz_items q WHERE q.course_id = c.id) AS quiz_count
         FROM training_courses c
        ORDER BY c.sort_order, c.id`
    );
    res.json({ courses: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/training-master', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { title, description, video_source_type, video_url, duration_min,
            half_year_credit_hours, target_role, category, active, sort_order } = req.body || {};
    if (!title) { res.status(400).json({ error: 'title 필요' }); return; }
    const normalizedVideoUrl = normalizeYouTubeEmbedUrl(video_url || '');
    const r = await dbRun(
      `INSERT INTO training_courses
         (title, description, video_source_type, video_url, duration_min,
          half_year_credit_hours, target_role, category, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, description || '', video_source_type || 'youtube', normalizedVideoUrl,
      Number(duration_min) || 0, Number(half_year_credit_hours) || 0,
      target_role || 'production', category || 'safety',
      active === 0 ? 0 : 1, Number(sort_order) || 0
    );
    const cid = Number(r.lastInsertRowid);
    // 교육 콘텐츠 신설 = 강사(안전·보건관리자) 준비·실시 활동 (180분)
    await logManagerHours({
      managerId: 0, managerName: user?.email || '',
      activityType: 'training_delivery', minutes: 180,
      sourceType: 'training_courses', sourceId: cid,
      notes: `교육 콘텐츠 등록: ${title}`,
    });
    res.json({ success: true, id: cid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch('/training-master/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    const map: Record<string, string> = {
      title: 'title', description: 'description', video_source_type: 'video_source_type',
      video_url: 'video_url', duration_min: 'duration_min',
      half_year_credit_hours: 'half_year_credit_hours', target_role: 'target_role',
      category: 'category', active: 'active', sort_order: 'sort_order',
    };
    for (const [k, col] of Object.entries(map)) {
      if (b[k] !== undefined) {
        sets.push(`${col} = ?`);
        // video_url 은 서버측에서도 embed 형태로 정규화
        params.push(k === 'video_url' ? normalizeYouTubeEmbedUrl(b[k]) : b[k]);
      }
    }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    sets.push('updated_at = NOW()');
    params.push(id);
    await dbRun(`UPDATE training_courses SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/training-master/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    // Soft delete — active=0
    await dbRun(`UPDATE training_courses SET active = 0, updated_at = NOW() WHERE id = ?`, id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 퀴즈 편집 ────────────────────────────────────────────────
router.get('/training-master/:id/quiz', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const items = await dbAll(
      `SELECT id, question_no, question, choices, correct_index
         FROM training_quiz_items WHERE course_id = ? ORDER BY question_no`,
      id
    );
    res.json({ items });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/training-master/:id/quiz', async (req: Request, res: Response) => {
  try {
    const courseId = parseInt(req.params.id as string);
    const { question, choices, correct_index } = req.body || {};
    if (!question || !Array.isArray(choices) || choices.length < 2) {
      res.status(400).json({ error: 'question + 2개 이상 choices 필요' }); return;
    }
    // Next question_no
    const maxRow = await dbGet(
      `SELECT COALESCE(MAX(question_no), 0) AS m FROM training_quiz_items WHERE course_id = ?`, courseId
    ) as any;
    const nextNo = Number(maxRow?.m || 0) + 1;
    const r = await dbRun(
      `INSERT INTO training_quiz_items (course_id, question_no, question, choices, correct_index)
       VALUES (?, ?, ?, ?::jsonb, ?)`,
      courseId, nextNo, question, JSON.stringify(choices), Number(correct_index) || 0
    );
    res.json({ success: true, id: r.lastInsertRowid, question_no: nextNo });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch('/training-master/:id/quiz/:qid', async (req: Request, res: Response) => {
  try {
    const qid = parseInt(req.params.qid as string);
    const { question, choices, correct_index } = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (question !== undefined) { sets.push('question = ?'); params.push(question); }
    if (choices !== undefined) {
      if (!Array.isArray(choices) || choices.length < 2) {
        res.status(400).json({ error: 'choices 배열 필요' }); return;
      }
      sets.push('choices = ?::jsonb'); params.push(JSON.stringify(choices));
    }
    if (correct_index !== undefined) { sets.push('correct_index = ?'); params.push(Number(correct_index) || 0); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(qid);
    await dbRun(`UPDATE training_quiz_items SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/training-master/:id/quiz/:qid', async (req: Request, res: Response) => {
  try {
    const qid = parseInt(req.params.qid as string);
    await dbRun(`DELETE FROM training_quiz_items WHERE id = ?`, qid);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── 교육 이수 현황 (부서별) ──────────────────────────────────
router.get('/training-status', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || currentHalfYearPeriod();
    // 필수 코스 (production 대상)
    const requiredRow = await dbGet(
      `SELECT COUNT(*) AS c FROM training_courses WHERE active = 1 AND target_role = 'production'`
    ) as any;
    const requiredCount = Number(requiredRow?.c || 0);
    // 대상 직원 = 재직 + 카페·사무직 제외
    const rows = await dbAll(
      `SELECT re.id, re.name, re.phone, re.department, re.team, re.role,
              (SELECT COUNT(*) FROM training_completions tc
                  JOIN training_courses c ON c.id = tc.course_id
                 WHERE tc.employee_id = re.id AND tc.half_year_period = ?
                   AND c.active = 1 AND c.target_role = 'production'
                   AND tc.completed_at IS NOT NULL) AS done_count,
              (SELECT COALESCE(SUM(tc.credited_hours), 0) FROM training_completions tc
                  JOIN training_courses c ON c.id = tc.course_id
                 WHERE tc.employee_id = re.id AND tc.half_year_period = ?
                   AND c.active = 1 AND c.target_role = 'production'
                   AND tc.completed_at IS NOT NULL) AS credited_hours
         FROM regular_employees re
        WHERE re.is_active = 1
          AND COALESCE(re.department, '') NOT LIKE '카페%'
          AND COALESCE(re.department, '') NOT LIKE '사무%'
        ORDER BY re.department, re.team, re.name`,
      period, period
    );
    const items = (rows as any[]).map((r) => ({
      employee_id: r.id,
      name: r.name,
      phone: r.phone,
      department: r.department,
      team: r.team,
      role: r.role,
      done_count: Number(r.done_count || 0),
      required_count: requiredCount,
      credited_hours: Number(r.credited_hours || 0),
      status:
        requiredCount === 0 ? 'no_required' :
        Number(r.done_count || 0) >= requiredCount ? 'complete' :
        Number(r.done_count || 0) > 0 ? 'partial' : 'not_started',
    }));
    // 부서별 요약
    const byDept: Record<string, { dept: string; total: number; complete: number; partial: number; not_started: number }> = {};
    for (const it of items) {
      const dept = it.department || '(미지정)';
      if (!byDept[dept]) byDept[dept] = { dept, total: 0, complete: 0, partial: 0, not_started: 0 };
      byDept[dept].total++;
      if (it.status === 'complete') byDept[dept].complete++;
      else if (it.status === 'partial') byDept[dept].partial++;
      else byDept[dept].not_started++;
    }
    const summary = {
      period,
      period_end: halfYearEndDate(period),
      required_count: requiredCount,
      target_count: items.length,
      complete: items.filter((i) => i.status === 'complete').length,
      partial: items.filter((i) => i.status === 'partial').length,
      not_started: items.filter((i) => i.status === 'not_started').length,
    };
    res.json({ period, period_end: halfYearEndDate(period), summary, rows: items, by_department: Object.values(byDept) });
  } catch (e: any) {
    console.error('[training-status]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── 설문 응답 현황 ───────────────────────────────────────────
router.get('/survey-status', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || currentHalfYearPeriod();
    const kindsRaw = req.query.kind ? String(req.query.kind) : '';
    const kinds = kindsRaw ? [kindsRaw] : ['musculoskeletal', 'opinion'];

    const surveys = await dbAll(
      `SELECT id, kind, title FROM surveys WHERE active = 1 AND kind = ANY(?::text[])`,
      kinds
    ) as any[];
    if (surveys.length === 0) {
      res.json({ period, rows: [], summary: { period } });
      return;
    }
    // 대상 직원 (게이팅 대상만)
    const emps = await dbAll(
      `SELECT id, name, phone, department, team, role FROM regular_employees
        WHERE is_active = 1
          AND COALESCE(department, '') NOT LIKE '카페%'
          AND COALESCE(department, '') NOT LIKE '사무%'
        ORDER BY department, team, name`
    ) as any[];
    // 응답 lookup
    const surveyIds = surveys.map((s) => s.id);
    const responses = await dbAll(
      `SELECT r.employee_id, r.survey_id, s.kind, r.submitted_at
         FROM survey_responses_safety r
         JOIN surveys s ON s.id = r.survey_id
        WHERE r.survey_id = ANY(?::int[]) AND r.period = ?`,
      surveyIds, period
    ) as any[];
    const doneMap = new Map<string, string>();
    for (const r of responses) doneMap.set(`${r.employee_id}:${r.kind}`, r.submitted_at);

    const rows = emps.map((e) => {
      const status: any = { employee_id: e.id, name: e.name, phone: e.phone, department: e.department, team: e.team, role: e.role };
      for (const k of kinds) {
        const key = `${e.id}:${k}`;
        status[`${k}_done`] = doneMap.has(key);
        status[`${k}_at`] = doneMap.get(key) || null;
      }
      return status;
    });
    const summary: any = { period, period_end: halfYearEndDate(period), target_count: rows.length };
    for (const k of kinds) {
      summary[`${k}_done`] = rows.filter((r) => (r as any)[`${k}_done`]).length;
      summary[`${k}_missing`] = rows.length - summary[`${k}_done`];
    }
    res.json({ period, period_end: halfYearEndDate(period), summary, rows });
  } catch (e: any) {
    console.error('[survey-status]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET 개별 설문 응답 상세 (익명이 아닌 응답만 이름·부서 노출)
router.get('/survey-status/:kind/responses', async (req: Request, res: Response) => {
  try {
    const kind = req.params.kind as string;
    const period = (req.query.period as string) || currentHalfYearPeriod();
    const rows = await dbAll(
      `SELECT r.id, r.employee_id, r.response_json, r.submitted_at,
              re.name, re.department, re.team, s.title AS survey_title
         FROM survey_responses_safety r
         JOIN surveys s ON s.id = r.survey_id
         LEFT JOIN regular_employees re ON re.id = r.employee_id
        WHERE s.kind = ? AND r.period = ?
        ORDER BY r.submitted_at DESC`,
      kind, period
    );
    // 익명 응답은 이름·부서 마스킹
    const safe = (rows as any[]).map((r) => {
      let anon = false;
      try {
        const parsed = typeof r.response_json === 'string' ? JSON.parse(r.response_json) : r.response_json;
        anon = !!parsed?.anonymous;
      } catch {}
      return {
        id: r.id,
        submitted_at: r.submitted_at,
        name: anon ? '(익명)' : r.name,
        department: anon ? '' : r.department,
        team: anon ? '' : r.team,
        response_json: r.response_json,
        survey_title: r.survey_title,
      };
    });
    res.json({ period, kind, responses: safe });
  } catch (e: any) {
    console.error('[survey-status/responses]', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
