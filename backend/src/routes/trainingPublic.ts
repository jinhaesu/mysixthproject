import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';

const router = Router();

/**
 * 안전보건 P4 — 근로자 반기 정기교육 + 근골격계·의견 설문 (근로자용).
 * 인증: regular_employees.token 재사용.
 */

// KST 오늘 기준 반기 코드 반환. 예: '2026-H1' / '2026-H2'
export function currentHalfYearPeriod(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date(getKSTDate());
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  return `${year}-H${month <= 6 ? 1 : 2}`;
}

// 반기 종료일 반환 (YYYY-MM-DD)
export function halfYearEndDate(period: string): string {
  const m = period.match(/^(\d{4})-H(1|2)$/);
  if (!m) return '';
  const y = m[1];
  const h = m[2];
  return h === '1' ? `${y}-06-30` : `${y}-12-31`;
}

async function loadEmployeeByToken(token: string) {
  return await dbGet(
    `SELECT id, name, department, team, role, is_active FROM regular_employees WHERE token = ? AND is_active = 1`,
    token
  ) as any;
}

// GET /:token/training/my — 이번 반기 이수 상태
router.get('/:token/training/my', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const period = currentHalfYearPeriod();
    const courses = await dbAll(
      `SELECT c.id, c.title, c.description, c.duration_min, c.half_year_credit_hours,
              c.category, c.video_source_type, c.sort_order,
              tc.id AS completion_id, tc.completed_at, tc.quiz_score, tc.quiz_total,
              tc.watched_seconds, tc.credited_hours
         FROM training_courses c
         LEFT JOIN training_completions tc
           ON tc.course_id = c.id AND tc.employee_id = ? AND tc.half_year_period = ?
        WHERE c.active = 1
        ORDER BY c.sort_order, c.id`,
      employee.id, period
    );
    const total = courses.length;
    const done = (courses as any[]).filter((r) => !!r.completed_at).length;
    const creditedHours = (courses as any[]).reduce(
      (a, r) => a + (r.completed_at ? Number(r.credited_hours || 0) : 0), 0
    );
    res.json({
      employee: { name: employee.name, department: employee.department, team: employee.team },
      period,
      period_end: halfYearEndDate(period),
      courses,
      summary: { total, done, remaining: total - done, credited_hours: creditedHours },
    });
  } catch (e: any) {
    console.error('[training/my]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /:token/training/:course_id — 코스 상세 (퀴즈 포함, 정답 제외)
router.get('/:token/training/:course_id', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const courseId = parseInt(req.params.course_id as string);
    const course = await dbGet(
      `SELECT id, title, description, video_source_type, video_url, duration_min,
              half_year_credit_hours, category, target_role
         FROM training_courses WHERE id = ? AND active = 1`,
      courseId
    ) as any;
    if (!course) { res.status(404).json({ error: '코스 없음' }); return; }
    const quiz = await dbAll(
      `SELECT id, question_no, question, choices
         FROM training_quiz_items WHERE course_id = ? ORDER BY question_no`,
      courseId
    );
    const period = currentHalfYearPeriod();
    const my = await dbGet(
      `SELECT id, watched_seconds, quiz_score, quiz_total, completed_at, signed_at, credited_hours
         FROM training_completions
        WHERE employee_id = ? AND course_id = ? AND half_year_period = ?`,
      employee.id, courseId, period
    );
    res.json({
      employee: { name: employee.name, department: employee.department, team: employee.team },
      course,
      quiz,
      my_completion: my || null,
      period,
      period_end: halfYearEndDate(period),
    });
  } catch (e: any) {
    console.error('[training/detail]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /:token/training/:course_id/watch-progress
// body: { watched_seconds: number }
router.post('/:token/training/:course_id/watch-progress', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const courseId = parseInt(req.params.course_id as string);
    const { watched_seconds } = req.body || {};
    const secs = Math.max(0, Math.min(24 * 3600, Number(watched_seconds) || 0));
    const period = currentHalfYearPeriod();
    // Upsert — 아직 미완료 상태로 진도만 갱신
    await dbRun(
      `INSERT INTO training_completions (employee_id, course_id, watched_seconds, half_year_period)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (employee_id, course_id, half_year_period)
       DO UPDATE SET watched_seconds = GREATEST(training_completions.watched_seconds, EXCLUDED.watched_seconds)`,
      employee.id, courseId, secs, period
    );
    res.json({ success: true, watched_seconds: secs });
  } catch (e: any) {
    console.error('[training/watch-progress]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /:token/training/:course_id/quiz — 퀴즈 제출·이수 처리 (전자서명)
// body: { answers: [{ question_no, choice_index }], signature_data? }
router.post('/:token/training/:course_id/quiz', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const courseId = parseInt(req.params.course_id as string);
    const { answers, signature_data } = req.body || {};
    if (!Array.isArray(answers)) { res.status(400).json({ error: 'answers 배열 필요' }); return; }

    const course = await dbGet(
      `SELECT id, half_year_credit_hours FROM training_courses WHERE id = ? AND active = 1`, courseId
    ) as any;
    if (!course) { res.status(404).json({ error: '코스 없음' }); return; }

    const quiz = await dbAll(
      `SELECT id, question_no, correct_index FROM training_quiz_items WHERE course_id = ? ORDER BY question_no`,
      courseId
    ) as any[];
    if (quiz.length === 0) { res.status(400).json({ error: '퀴즈가 등록되지 않았습니다.' }); return; }

    let score = 0;
    for (const q of quiz) {
      const a = answers.find((x: any) => Number(x.question_no) === Number(q.question_no));
      if (a && Number(a.choice_index) === Number(q.correct_index)) score++;
    }
    const total = quiz.length;
    const passed = score >= Math.ceil(total * 0.7); // 70% 이상 합격
    if (!passed) {
      res.status(400).json({
        error: `합격 점수 미달 (${score}/${total}). 70% 이상 정답이 필요합니다.`,
        score, total, passed: false,
      });
      return;
    }
    if (!signature_data || String(signature_data).trim() === '') {
      res.status(400).json({ error: '전자서명 필요' }); return;
    }

    const period = currentHalfYearPeriod();
    const creditedHours = Number(course.half_year_credit_hours || 0);
    await dbRun(
      `INSERT INTO training_completions
         (employee_id, course_id, watched_seconds, quiz_score, quiz_total,
          signed_at, completed_at, credited_hours, half_year_period)
       VALUES (?, ?, 0, ?, ?, NOW(), NOW(), ?, ?)
       ON CONFLICT (employee_id, course_id, half_year_period)
       DO UPDATE SET
         quiz_score = EXCLUDED.quiz_score,
         quiz_total = EXCLUDED.quiz_total,
         signed_at = COALESCE(training_completions.signed_at, EXCLUDED.signed_at),
         completed_at = COALESCE(training_completions.completed_at, EXCLUDED.completed_at),
         credited_hours = EXCLUDED.credited_hours`,
      employee.id, courseId, score, total, creditedHours, period
    );
    res.json({ success: true, score, total, passed: true, credited_hours: creditedHours, period });
  } catch (e: any) {
    console.error('[training/quiz]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /:token/surveys/:kind — 오늘 필요한 설문
router.get('/:token/surveys/:kind', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const kind = req.params.kind as string;
    if (!['musculoskeletal', 'opinion'].includes(kind)) {
      res.status(400).json({ error: 'unsupported kind' }); return;
    }
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const survey = await dbGet(
      `SELECT id, kind, title, description, form_json, frequency
         FROM surveys WHERE kind = ? AND active = 1 ORDER BY id LIMIT 1`,
      kind
    ) as any;
    if (!survey) { res.status(404).json({ error: '설문 마스터 없음' }); return; }
    const period = currentHalfYearPeriod();
    const already = await dbGet(
      `SELECT id, submitted_at, response_json FROM survey_responses_safety
        WHERE survey_id = ? AND employee_id = ? AND period = ?`,
      survey.id, employee.id, period
    );
    res.json({
      employee: { name: employee.name, department: employee.department, team: employee.team },
      survey,
      period,
      period_end: halfYearEndDate(period),
      already_submitted: !!already,
      already_response: already ? (already as any).response_json : null,
      already_submitted_at: already ? (already as any).submitted_at : null,
    });
  } catch (e: any) {
    console.error('[surveys/get]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /:token/surveys/:kind/submit
// body: { response: <json>, anonymous?: boolean }
router.post('/:token/surveys/:kind/submit', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const kind = req.params.kind as string;
    if (!['musculoskeletal', 'opinion'].includes(kind)) {
      res.status(400).json({ error: 'unsupported kind' }); return;
    }
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const survey = await dbGet(
      `SELECT id, kind, form_json FROM surveys WHERE kind = ? AND active = 1 ORDER BY id LIMIT 1`,
      kind
    ) as any;
    if (!survey) { res.status(500).json({ error: '설문 마스터 없음' }); return; }
    const { response, anonymous } = req.body || {};
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response 객체 필요' }); return;
    }
    const period = currentHalfYearPeriod();
    const payload = JSON.stringify({ response, anonymous: !!anonymous, submitted_at_iso: new Date().toISOString() });
    await dbRun(
      `INSERT INTO survey_responses_safety (survey_id, employee_id, response_json, period, submitted_at)
       VALUES (?, ?, ?::jsonb, ?, NOW())
       ON CONFLICT (survey_id, employee_id, period)
       DO UPDATE SET response_json = EXCLUDED.response_json, submitted_at = NOW()`,
      survey.id, employee.id, payload, period
    );
    res.json({ success: true, period });
  } catch (e: any) {
    console.error('[surveys/submit]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /:token/training-survey/status — 홈 카드용 통합 상태
router.get('/:token/training-survey/status', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const dep = (employee.department || '').trim();
    // 카페·사무직은 대상 제외 (게이팅과 동일 규칙)
    const gated = dep && !dep.startsWith('카페') && !(dep === '사무직' || dep.startsWith('사무'));
    const period = currentHalfYearPeriod();
    const periodEnd = halfYearEndDate(period);
    if (!gated) {
      res.json({ gated: false, period, period_end: periodEnd });
      return;
    }
    const status = await computeTrainingSurveyGate(employee.id, period);
    // D-days
    const today = new Date(getKSTDate());
    const end = new Date(periodEnd);
    const dLeft = Math.round((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    res.json({
      gated: true,
      period,
      period_end: periodEnd,
      days_left_in_period: dLeft,
      training_total: status.trainingTotal,
      training_done: status.trainingDone,
      training_incomplete: status.trainingIncomplete,
      musculoskeletal_done: status.musculoskeletalDone,
      opinion_done: status.opinionDone,
    });
  } catch (e: any) {
    console.error('[training-survey/status]', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 게이팅 헬퍼 — clock-out 훅에서 사용
// ═══════════════════════════════════════════════════════════════

export interface TrainingSurveyStatus {
  trainingTotal: number;
  trainingDone: number;
  trainingIncomplete: boolean;
  musculoskeletalDone: boolean;
  opinionDone: boolean;
}

export async function computeTrainingSurveyGate(
  employeeId: number,
  period?: string
): Promise<TrainingSurveyStatus> {
  const p = period || currentHalfYearPeriod();
  // 필수 코스 (target_role='production' 또는 그 하위) — production 부서 대상
  const totalRow = await dbGet(
    `SELECT COUNT(*) AS c FROM training_courses WHERE active = 1 AND target_role = 'production'`
  ) as any;
  const doneRow = await dbGet(
    `SELECT COUNT(*) AS c
       FROM training_completions tc
       JOIN training_courses c ON c.id = tc.course_id
      WHERE tc.employee_id = ? AND tc.half_year_period = ?
        AND c.active = 1 AND c.target_role = 'production'
        AND tc.completed_at IS NOT NULL`,
    employeeId, p
  ) as any;
  const trainRow = { total: totalRow?.c || 0, done: doneRow?.c || 0 };
  const trainingTotal = Number(trainRow?.total || 0);
  const trainingDone = Number(trainRow?.done || 0);
  const trainingIncomplete = trainingTotal > 0 && trainingDone < trainingTotal;

  const musc = await dbGet(
    `SELECT 1 FROM survey_responses_safety r
       JOIN surveys s ON s.id = r.survey_id
      WHERE r.employee_id = ? AND s.kind = 'musculoskeletal' AND r.period = ? LIMIT 1`,
    employeeId, p
  );
  const opin = await dbGet(
    `SELECT 1 FROM survey_responses_safety r
       JOIN surveys s ON s.id = r.survey_id
      WHERE r.employee_id = ? AND s.kind = 'opinion' AND r.period = ? LIMIT 1`,
    employeeId, p
  );
  return {
    trainingTotal,
    trainingDone,
    trainingIncomplete,
    musculoskeletalDone: !!musc,
    opinionDone: !!opin,
  };
}

/**
 * 반기 마감 D-14 이내에서만 게이팅 적용. clock-out 시.
 * 반환: 미완료 pending 배열. 빈 배열이면 통과.
 */
export async function checkTrainingSurveyGate(
  employeeId: number,
  department: string | null | undefined
): Promise<string[]> {
  const dep = (department || '').trim();
  if (!dep) return [];
  if (dep.startsWith('카페')) return [];
  if (dep === '사무직' || dep.startsWith('사무')) return [];

  const period = currentHalfYearPeriod();
  const periodEnd = halfYearEndDate(period);
  const today = new Date(getKSTDate());
  const end = new Date(periodEnd);
  const dLeft = Math.round((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (dLeft > 14) return []; // D-14 이내 아니면 통과 (경보만 홈 카드로)

  const s = await computeTrainingSurveyGate(employeeId, period);
  const pending: string[] = [];
  if (s.trainingIncomplete) pending.push('training_incomplete');
  if (!s.musculoskeletalDone) pending.push('musculoskeletal_survey');
  if (!s.opinionDone) pending.push('opinion_survey');
  return pending;
}

export default router;
