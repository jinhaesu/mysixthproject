import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';
import { ACTIVITY_LABEL } from '../lib/managerHours';

const router = Router();

/**
 * P6 — 대표이사 대시보드 + 중처법 반기 이행점검.
 * requireAuth 뒤에 마운트.
 *
 * 5 KPI:
 *  - 중처법 이행률(당해 반기 review done/total 비율)
 *  - 미조치 지적사항(safety_action_tickets open/overdue)
 *  - 교육 이수율(반기 기준 완료 employee 비율)
 *  - 아차사고 트렌드(최근 6개월 월별 count)
 *  - 겸직 관리자 시간 게이지(당월·연간 누적, 목표 685~802h)
 */

// ═══════════════════════════════════════════════════════════════
// 반기(半期) 유틸
// ═══════════════════════════════════════════════════════════════
function currentHalf(now: Date = new Date()): { year: number; half: 1 | 2 } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  return { year, half: month <= 6 ? 1 : 2 };
}

function halfRange(year: number, half: number): { from: string; to: string } {
  if (half === 1) return { from: `${year}-01-01`, to: `${year}-06-30` };
  return { from: `${year}-07-01`, to: `${year}-12-31` };
}

function currentHalfYearPeriod(now: Date = new Date()): string {
  const { year, half } = currentHalf(now);
  return `${year}-H${half}`;
}

// 중처법 시행령 제4조 9개 의무 + 자동 근거 모듈 매핑 (P7E)
const CDPA_OBLIGATION_TITLES: Array<{
  item_no: number;
  obligation_name: string;
  evidence_module_key: string;
  module_link: string;
}> = [
  { item_no: 1, obligation_name: '안전보건 경영방침·목표 수립',                 evidence_module_key: 'policy',             module_link: '/admin/policy-management' },
  { item_no: 2, obligation_name: '안전보건 업무 총괄 조직/인력',                 evidence_module_key: 'org',                module_link: '/admin/safety-org' },
  { item_no: 3, obligation_name: '유해위험요인 확인·개선 절차(위험성평가)',      evidence_module_key: 'risk_assessment',    module_link: '/safety-manager/risk-assessment' },
  { item_no: 4, obligation_name: '안전보건 예산 편성·집행',                     evidence_module_key: 'budget',             module_link: '/admin/safety-budget/dashboard' },
  { item_no: 5, obligation_name: '안전보건관리책임자 등 충실 수행 지원',        evidence_module_key: 'manager_activity',   module_link: '/safety-manager/manager-hours' },
  { item_no: 6, obligation_name: '법정 인력 배치·업무시간 보장',                evidence_module_key: 'appointment_hours',  module_link: '/admin/safety-org' },
  { item_no: 7, obligation_name: '종사자 의견 청취 절차·개선 이행',              evidence_module_key: 'stakeholder_input',  module_link: '/safety-manager/committee' },
  { item_no: 8, obligation_name: '중대재해 대비 매뉴얼·반기 점검',              evidence_module_key: 'manual_drill',       module_link: '/admin/emergency-manuals' },
  { item_no: 9, obligation_name: '도급·용역 시 수급인 안전보건 확보',           evidence_module_key: 'contractor',         module_link: '/admin/contractors' },
];

async function seedCdpaItems(reviewId: number): Promise<void> {
  for (const it of CDPA_OBLIGATION_TITLES) {
    await dbRun(
      `INSERT INTO cdpa_review_items (review_id, item_no, obligation_name, status, evidence_module_key, module_link)
       VALUES (?, ?, ?, 'not_started', ?, ?)`,
      reviewId, it.item_no, it.obligation_name, it.evidence_module_key, it.module_link
    );
  }
}

// obligation_name 기반 자동 매핑 (기존 항목 대응 — evidence_module_key 미설정 시 채움)
function mapObligationToModuleKey(item_no: number, obligation_name: string): { evidence_module_key: string; module_link: string } {
  const found = CDPA_OBLIGATION_TITLES.find(o => o.item_no === item_no);
  if (found) return { evidence_module_key: found.evidence_module_key, module_link: found.module_link };
  const name = String(obligation_name || '');
  if (name.includes('방침') || name.includes('목표')) return { evidence_module_key: 'policy',           module_link: '/admin/policy-management' };
  if (name.includes('조직') || name.includes('인력')) return { evidence_module_key: 'org',              module_link: '/admin/safety-org' };
  if (name.includes('위험성'))                       return { evidence_module_key: 'risk_assessment',  module_link: '/safety-manager/risk-assessment' };
  if (name.includes('예산'))                         return { evidence_module_key: 'budget',           module_link: '/admin/safety-budget/dashboard' };
  if (name.includes('책임자'))                       return { evidence_module_key: 'manager_activity', module_link: '/safety-manager/manager-hours' };
  if (name.includes('업무시간') || name.includes('법정')) return { evidence_module_key: 'appointment_hours', module_link: '/admin/safety-org' };
  if (name.includes('의견'))                         return { evidence_module_key: 'stakeholder_input', module_link: '/safety-manager/committee' };
  if (name.includes('매뉴얼') || name.includes('중대재해')) return { evidence_module_key: 'manual_drill', module_link: '/admin/emergency-manuals' };
  if (name.includes('도급') || name.includes('수급인')) return { evidence_module_key: 'contractor',      module_link: '/admin/contractors' };
  return { evidence_module_key: '', module_link: '' };
}

// ═══════════════════════════════════════════════════════════════
// P7E — 자동 근거·상태 계산 (9개 항목)
// ═══════════════════════════════════════════════════════════════

async function computeAutoStatus(
  key: string,
  year: number,
  half: 1 | 2,
): Promise<{ auto_status: string; summary: Record<string, any> }> {
  const { from: halfFrom, to: halfTo } = halfRange(year, half);
  try {
    if (key === 'policy') {
      const rows = await dbAll(
        `SELECT kind, status, COUNT(*) AS c
           FROM policy_documents
          WHERE kind IN ('policy','goal')
          GROUP BY kind, status`
      ) as any[];
      const summary: Record<string, any> = { published: 0, draft: 0, by_kind: {} };
      for (const r of rows) {
        const c = Number(r.c) || 0;
        if (r.status === 'published') summary.published += c;
        else if (r.status === 'draft') summary.draft += c;
        summary.by_kind[r.kind] = (summary.by_kind[r.kind] || 0) + c;
      }
      const auto_status = summary.published > 0 ? 'done' : (summary.draft > 0 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'org') {
      const rows = await dbAll(
        `SELECT position_key, employee_id, employee_name
           FROM safety_org_positions
          WHERE position_key IN ('ceo','chief','safety_mgr','health_mgr','worker_rep')
            AND status = 'active'`
      ) as any[];
      const required = ['ceo', 'chief', 'safety_mgr', 'health_mgr', 'worker_rep'];
      const filled: string[] = [];
      const empty: string[] = [];
      for (const k of required) {
        const r = rows.find(x => x.position_key === k);
        if (r && (r.employee_id || (r.employee_name || '').trim())) filled.push(k);
        else empty.push(k);
      }
      const summary: Record<string, any> = {
        required_total: required.length,
        filled_count: filled.length,
        empty_positions: empty,
      };
      const auto_status = filled.length === required.length ? 'done' : (filled.length > 0 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'risk_assessment') {
      const total = await dbGet(
        `SELECT COUNT(*) AS c FROM risk_assessments WHERE year = ? AND kind = 'regular'`,
        year
      ) as any;
      const completed = await dbGet(
        `SELECT COUNT(*) AS c FROM risk_assessments WHERE year = ? AND kind = 'regular' AND status = 'completed'`,
        year
      ) as any;
      const highOpen = await dbGet(
        `SELECT COUNT(*) AS c FROM risk_assessment_items i
          JOIN risk_assessments a ON a.id = i.assessment_id
         WHERE a.year = ? AND i.risk_grade = '상'
           AND COALESCE(i.closed_risk_grade, '') = ''`,
        year
      ) as any;
      const summary: Record<string, any> = {
        year,
        total_regular: Number(total?.c || 0),
        completed: Number(completed?.c || 0),
        high_open: Number(highOpen?.c || 0),
      };
      const auto_status = summary.completed > 0 && summary.high_open === 0
        ? 'done'
        : (summary.total_regular > 0 || summary.high_open > 0 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'budget') {
      const planned = await dbGet(
        `SELECT COALESCE(SUM(planned_amount), 0) AS s FROM safety_budget_plans WHERE year = ?`, year
      ) as any;
      const exec = await dbGet(
        `SELECT COALESCE(SUM(e.amount), 0) AS s
           FROM safety_budget_executions e
           JOIN safety_budget_plans p ON p.id = e.budget_plan_id
          WHERE p.year = ?`, year
      ) as any;
      const plannedSum = Number(planned?.s || 0);
      const execSum = Number(exec?.s || 0);
      const rate = plannedSum > 0 ? execSum / plannedSum : 0;
      const summary: Record<string, any> = {
        year,
        planned_amount: plannedSum,
        executed_amount: execSum,
        execution_rate_pct: Math.round(rate * 1000) / 10,
      };
      const auto_status = plannedSum > 0 && rate >= 0.5 ? 'done'
        : (plannedSum > 0 && rate > 0 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'manager_activity') {
      const positions = await dbAll(
        `SELECT position_key, employee_id, employee_name, statutory_min_hours
           FROM safety_org_positions
          WHERE position_key IN ('safety_mgr','health_mgr') AND status = 'active'`
      ) as any[];
      let totalTargetHours = 0;
      let totalActualHours = 0;
      const perManager: Array<{ position_key: string; name: string; actual_hours: number; target_hours: number; rate: number }> = [];
      for (const p of positions) {
        const target = Number(p.statutory_min_hours || 0);
        if (target <= 0) continue;
        let actualRow: any = null;
        if (p.employee_id) {
          actualRow = await dbGet(
            `SELECT COALESCE(SUM(minutes),0) AS mins
               FROM manager_activity_hours
              WHERE manager_id = ?
                AND occurred_at >= ?::date
                AND occurred_at < (?::date + INTERVAL '1 day')`,
            p.employee_id, halfFrom, halfTo
          );
        } else if ((p.employee_name || '').trim()) {
          actualRow = await dbGet(
            `SELECT COALESCE(SUM(minutes),0) AS mins
               FROM manager_activity_hours
              WHERE manager_name = ?
                AND occurred_at >= ?::date
                AND occurred_at < (?::date + INTERVAL '1 day')`,
            p.employee_name, halfFrom, halfTo
          );
        }
        const mins = Number(actualRow?.mins || 0);
        const hours = Math.round((mins / 60) * 10) / 10;
        totalTargetHours += target;
        totalActualHours += hours;
        perManager.push({
          position_key: p.position_key,
          name: p.employee_name || '(미배치)',
          actual_hours: hours,
          target_hours: target,
          rate: target > 0 ? Math.round((hours / target) * 1000) / 10 : 0,
        });
      }
      const overallRate = totalTargetHours > 0 ? totalActualHours / totalTargetHours : 0;
      const summary: Record<string, any> = {
        year, half,
        managers: perManager,
        total_actual_hours: Math.round(totalActualHours * 10) / 10,
        total_target_hours: totalTargetHours,
        overall_rate_pct: Math.round(overallRate * 1000) / 10,
      };
      const auto_status = totalTargetHours > 0 && overallRate >= 0.5 ? 'done'
        : (totalTargetHours > 0 && overallRate >= 0.2 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'appointment_hours') {
      const positions = await dbAll(
        `SELECT position_key, employee_id, employee_name, statutory_min_hours
           FROM safety_org_positions
          WHERE position_key IN ('safety_mgr','health_mgr','chief','ceo','worker_rep')
            AND status = 'active'`
      ) as any[];
      const requiredKeys = ['safety_mgr', 'health_mgr', 'chief', 'ceo', 'worker_rep'];
      const filledKeys = positions
        .filter(p => p.employee_id || (p.employee_name || '').trim())
        .map(p => p.position_key);
      const missing = requiredKeys.filter(k => !filledKeys.includes(k));

      const mgrs = positions.filter(p =>
        (p.position_key === 'safety_mgr' || p.position_key === 'health_mgr')
        && Number(p.statutory_min_hours || 0) > 0
      );
      let totalTarget = 0, totalActual = 0;
      for (const m of mgrs) {
        totalTarget += Number(m.statutory_min_hours || 0);
        let row: any = null;
        if (m.employee_id) {
          row = await dbGet(
            `SELECT COALESCE(SUM(minutes),0) AS mins FROM manager_activity_hours
              WHERE manager_id = ? AND occurred_at >= ?::date AND occurred_at < (?::date + INTERVAL '1 day')`,
            m.employee_id, halfFrom, halfTo
          );
        } else if ((m.employee_name || '').trim()) {
          row = await dbGet(
            `SELECT COALESCE(SUM(minutes),0) AS mins FROM manager_activity_hours
              WHERE manager_name = ? AND occurred_at >= ?::date AND occurred_at < (?::date + INTERVAL '1 day')`,
            m.employee_name, halfFrom, halfTo
          );
        }
        totalActual += Number(row?.mins || 0) / 60;
      }
      const hoursRate = totalTarget > 0 ? totalActual / totalTarget : 0;
      const summary: Record<string, any> = {
        required_positions: requiredKeys.length,
        filled_positions: filledKeys.length,
        missing_positions: missing,
        target_hours_half: totalTarget,
        actual_hours_half: Math.round(totalActual * 10) / 10,
        hours_rate_pct: Math.round(hoursRate * 1000) / 10,
      };
      const auto_status = missing.length === 0 && hoursRate >= 0.5 ? 'done'
        : (filledKeys.length > 0 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'stakeholder_input') {
      const quarters = half === 1 ? [1, 2] : [3, 4];
      const commRow = await dbGet(
        `SELECT COUNT(*) AS c FROM safety_committee_minutes
          WHERE year = ? AND quarter = ANY(?::int[])`,
        year, `{${quarters.join(',')}}`
      ) as any;
      const commHeld = Number(commRow?.c || 0);

      const period = `${year}-H${half}`;
      const opinionSurvey = await dbGet(
        `SELECT id FROM surveys WHERE kind = 'opinion' AND active = 1 LIMIT 1`
      ) as any;
      let opinionResponses = 0;
      let opinionRate = 0;
      const empCntRow = await dbGet(
        `SELECT COUNT(*) AS c FROM regular_employees WHERE is_active = 1`
      ) as any;
      const empCnt = Number(empCntRow?.c || 0);
      if (opinionSurvey && empCnt > 0) {
        const respRow = await dbGet(
          `SELECT COUNT(*) AS c FROM survey_responses_safety
            WHERE survey_id = ? AND period = ?`,
          opinionSurvey.id, period
        ) as any;
        opinionResponses = Number(respRow?.c || 0);
        opinionRate = opinionResponses / empCnt;
      }

      const hazTotalRow = await dbGet(
        `SELECT COUNT(*) AS c FROM hazard_reports
          WHERE occurred_at >= ?::date AND occurred_at < (?::date + INTERVAL '1 day')`,
        halfFrom, halfTo
      ) as any;
      const hazClosedRow = await dbGet(
        `SELECT COUNT(*) AS c FROM hazard_reports
          WHERE occurred_at >= ?::date AND occurred_at < (?::date + INTERVAL '1 day')
            AND (status IN ('closed','resolved','completed') OR closed_at IS NOT NULL)`,
        halfFrom, halfTo
      ) as any;
      const hazTotal = Number(hazTotalRow?.c || 0);
      const hazClosed = Number(hazClosedRow?.c || 0);
      const hazRate = hazTotal > 0 ? hazClosed / hazTotal : 1;

      const summary: Record<string, any> = {
        year, half,
        committee_held: commHeld,
        opinion_responses: opinionResponses,
        opinion_target: empCnt,
        opinion_rate_pct: Math.round(opinionRate * 1000) / 10,
        hazard_total: hazTotal,
        hazard_closed: hazClosed,
        hazard_close_rate_pct: Math.round(hazRate * 1000) / 10,
      };
      const allOk = commHeld > 0 && opinionRate >= 0.5 && hazRate >= 0.7;
      const anyOk = commHeld > 0 || opinionRate > 0 || hazTotal > 0;
      const auto_status = allOk ? 'done' : (anyOk ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'manual_drill') {
      const manualRow = await dbGet(
        `SELECT COUNT(*) AS c FROM emergency_manuals
          WHERE scenario_kind = 'critical_incident' AND status = 'published'`
      ) as any;
      const publishedCount = Number(manualRow?.c || 0);
      const draftManualRow = await dbGet(
        `SELECT COUNT(*) AS c FROM emergency_manuals WHERE scenario_kind = 'critical_incident'`
      ) as any;
      const totalManuals = Number(draftManualRow?.c || 0);

      const drillRow = await dbGet(
        `SELECT COUNT(*) AS c FROM emergency_drills
          WHERE drill_date >= ? AND drill_date <= ?`,
        halfFrom, halfTo
      ) as any;
      const drillCount = Number(drillRow?.c || 0);

      const summary: Record<string, any> = {
        year, half,
        critical_manual_published: publishedCount,
        critical_manual_total: totalManuals,
        drills_half: drillCount,
      };
      const auto_status = publishedCount > 0 && drillCount >= 1 ? 'done'
        : (totalManuals > 0 || drillCount > 0 ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }

    if (key === 'contractor') {
      const today = getKSTDate();
      const activeRow = await dbGet(
        `SELECT COUNT(*) AS c FROM contractor_registry
          WHERE status = 'active'
            AND (contract_end IS NULL OR contract_end = '' OR contract_end >= ?)`,
        today
      ) as any;
      const activeCount = Number(activeRow?.c || 0);

      if (activeCount === 0) {
        return {
          auto_status: 'not_applicable',
          summary: { active_contractors: 0, note: '활성 도급·용역 계약 없음' },
        };
      }

      const permitRow = await dbGet(
        `SELECT COUNT(*) AS c FROM contractor_work_permits
          WHERE permit_date >= ? AND permit_date <= ?`,
        halfFrom, halfTo
      ) as any;
      const inspRow = await dbGet(
        `SELECT COUNT(*) AS c FROM contractor_joint_inspections
          WHERE inspected_at >= ?::date AND inspected_at < (?::date + INTERVAL '1 day')`,
        halfFrom, halfTo
      ) as any;
      const permitCnt = Number(permitRow?.c || 0);
      const inspCnt = Number(inspRow?.c || 0);
      const summary: Record<string, any> = {
        year, half,
        active_contractors: activeCount,
        permits_half: permitCnt,
        inspections_half: inspCnt,
      };
      const auto_status = permitCnt > 0 && inspCnt > 0 ? 'done'
        : ((permitCnt > 0 || inspCnt > 0) ? 'in_progress' : 'pending');
      return { auto_status, summary };
    }
  } catch (e: any) {
    console.error(`[cdpa/auto/${key}]`, e.message);
    return { auto_status: 'pending', summary: { error: e.message } };
  }

  return { auto_status: 'pending', summary: {} };
}

async function autoRecomputeReview(reviewId: number): Promise<{ updated: number; items: any[] }> {
  const review = await dbGet(`SELECT * FROM cdpa_reviews WHERE id = ?`, reviewId) as any;
  if (!review) throw new Error('review not found');
  const items = await dbAll(
    `SELECT id, item_no, obligation_name, evidence_module_key, module_link
       FROM cdpa_review_items WHERE review_id = ? ORDER BY item_no`,
    reviewId
  ) as any[];
  let updated = 0;
  const out: any[] = [];
  for (const it of items) {
    let key = it.evidence_module_key || '';
    let link = it.module_link || '';
    if (!key || !link) {
      const mapped = mapObligationToModuleKey(it.item_no, it.obligation_name);
      key = key || mapped.evidence_module_key;
      link = link || mapped.module_link;
    }
    const { auto_status, summary } = await computeAutoStatus(key, review.year, review.half);
    await dbRun(
      `UPDATE cdpa_review_items
          SET evidence_module_key = ?, module_link = ?, auto_status = ?, auto_status_summary = ?::jsonb
        WHERE id = ?`,
      key, link, auto_status, JSON.stringify(summary), it.id
    );
    updated++;
    out.push({ id: it.id, item_no: it.item_no, evidence_module_key: key, module_link: link, auto_status, auto_status_summary: summary });
  }
  return { updated, items: out };
}

// ═══════════════════════════════════════════════════════════════
// GET /api/ceo/dashboard — 5 KPI
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const now = new Date();
    const { year: curYear, half: curHalf } = currentHalf(now);
    const targetYear = req.query.year ? year : curYear;
    const period = `${targetYear}-H${curHalf}`;
    const { from: halfFrom, to: halfTo } = halfRange(targetYear, curHalf);

    // ── KPI 1: 중처법 이행률 ──────────────────────────────
    let cdpa: {
      review_id: number | null;
      total: number;
      done: number;
      in_progress: number;
      not_started: number;
      rate: number | null;
      status: string | null;
      ceo_signed_at: string | null;
    } = {
      review_id: null, total: 0, done: 0, in_progress: 0, not_started: 0,
      rate: null, status: null, ceo_signed_at: null,
    };
    const review = await dbGet(
      `SELECT id, status, ceo_signed_at FROM cdpa_reviews WHERE year = ? AND half = ?`,
      targetYear, curHalf
    ) as any;
    if (review) {
      const items = await dbAll(
        `SELECT status FROM cdpa_review_items WHERE review_id = ?`, review.id
      ) as any[];
      const total = items.length;
      const done = items.filter(i => i.status === 'done' || i.status === 'complete').length;
      const inp = items.filter(i => i.status === 'in_progress').length;
      const ns = total - done - inp;
      cdpa = {
        review_id: review.id,
        total,
        done,
        in_progress: inp,
        not_started: ns,
        rate: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
        status: review.status,
        ceo_signed_at: review.ceo_signed_at,
      };
    }

    // ── KPI 2: 미조치 지적사항 ────────────────────────────
    const today = getKSTDate();
    const ticketRow = await dbGet(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS open_cnt,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND due_date IS NOT NULL AND due_date < ?) AS overdue_cnt,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress') AND severity = 'high') AS high_cnt
       FROM safety_action_tickets`,
      today
    ) as any;

    // ── KPI 3: 교육 이수율 ─────────────────────────────────
    const requiredRow = await dbGet(
      `SELECT COUNT(*) AS c FROM training_courses WHERE active = 1 AND target_role = 'production'`
    ) as any;
    const requiredCount = Number(requiredRow?.c || 0);
    let trainingKpi = { period, target_count: 0, complete: 0, rate: null as number | null, required_count: requiredCount };
    if (requiredCount > 0) {
      const rows = await dbAll(
        `SELECT re.id,
                (SELECT COUNT(*) FROM training_completions tc
                    JOIN training_courses c ON c.id = tc.course_id
                   WHERE tc.employee_id = re.id AND tc.half_year_period = ?
                     AND c.active = 1 AND c.target_role = 'production'
                     AND tc.completed_at IS NOT NULL) AS done_count
           FROM regular_employees re
          WHERE re.is_active = 1
            AND COALESCE(re.department, '') NOT LIKE '카페%'
            AND COALESCE(re.department, '') NOT LIKE '사무%'`,
        period
      ) as any[];
      const total = rows.length;
      const complete = rows.filter(r => Number(r.done_count) >= requiredCount).length;
      trainingKpi = {
        period,
        target_count: total,
        complete,
        required_count: requiredCount,
        rate: total > 0 ? Math.round((complete / total) * 1000) / 10 : 0,
      };
    }

    // ── KPI 4: 아차사고 트렌드 (최근 6개월) ────────────────
    const trendRows = await dbAll(
      `SELECT to_char(date_trunc('month', occurred_at), 'YYYY-MM') AS month,
              COUNT(*) AS cnt
         FROM hazard_reports
        WHERE occurred_at >= (NOW() - INTERVAL '6 month')
        GROUP BY 1
        ORDER BY 1`
    ) as any[];
    const trendMap = new Map<string, number>(trendRows.map(r => [r.month, Number(r.cnt) || 0]));
    const trendMonths: Array<{ month: string; count: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trendMonths.push({ month: ym, count: trendMap.get(ym) || 0 });
    }

    // ── KPI 5: 겸직 관리자 시간 게이지 ─────────────────────
    // 목표: 산업안전보건법 시행규칙 별표 22 — 겸직 관리자 최소 업무시간
    //   반기 685시간 (사업장 규모별 최저 기준) ~ 802시간 (실무 권장)
    const nowKst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const thisMonth = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, '0')}`;
    const yearStart = `${targetYear}-01-01`;
    const yearEnd = `${targetYear}-12-31`;
    const monthAgg = await dbAll(
      `SELECT to_char(occurred_at, 'YYYY-MM') AS month,
              COALESCE(SUM(minutes), 0) AS mins
         FROM manager_activity_hours
        WHERE occurred_at >= ? AND occurred_at <= (?::date + INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1`,
      yearStart, yearEnd
    ) as any[];
    const monthMap = new Map<string, number>(monthAgg.map(r => [r.month, Number(r.mins) || 0]));
    const monthlyBreakdown: Array<{ month: string; hours: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${targetYear}-${String(m).padStart(2, '0')}`;
      const mins = monthMap.get(ym) || 0;
      monthlyBreakdown.push({ month: ym, hours: Math.round((mins / 60) * 10) / 10 });
    }
    const monthMinutes = monthMap.get(thisMonth) || 0;
    const halfMinsRow = await dbGet(
      `SELECT COALESCE(SUM(minutes), 0) AS mins
         FROM manager_activity_hours
        WHERE occurred_at >= ? AND occurred_at < (?::date + INTERVAL '1 day')`,
      halfFrom, halfTo
    ) as any;
    const halfMinutes = Number(halfMinsRow?.mins || 0);
    const yearMinsRow = await dbGet(
      `SELECT COALESCE(SUM(minutes), 0) AS mins
         FROM manager_activity_hours
        WHERE occurred_at >= ? AND occurred_at < (?::date + INTERVAL '1 day')`,
      yearStart, yearEnd
    ) as any;
    const yearMinutes = Number(yearMinsRow?.mins || 0);
    const HALF_TARGET_MIN = 685; // 반기 최소 목표
    const HALF_TARGET_MAX = 802; // 반기 실무 권장
    const managerHoursKpi = {
      current_month: thisMonth,
      current_month_hours: Math.round((monthMinutes / 60) * 10) / 10,
      current_half: `${targetYear}-H${curHalf}`,
      current_half_hours: Math.round((halfMinutes / 60) * 10) / 10,
      year: targetYear,
      year_hours: Math.round((yearMinutes / 60) * 10) / 10,
      half_target_min: HALF_TARGET_MIN,
      half_target_max: HALF_TARGET_MAX,
      half_gauge_pct: Math.min(200, Math.round((halfMinutes / 60 / HALF_TARGET_MIN) * 1000) / 10),
      monthly_breakdown: monthlyBreakdown,
    };

    res.json({
      kpis: {
        cdpa_compliance: cdpa,
        open_tickets: {
          open: Number(ticketRow?.open_cnt || 0),
          overdue: Number(ticketRow?.overdue_cnt || 0),
          high_severity: Number(ticketRow?.high_cnt || 0),
        },
        training_compliance: trainingKpi,
        hazard_trend: trendMonths,
        manager_hours: managerHoursKpi,
      },
      generated_at: new Date().toISOString(),
      year: targetYear,
      half: curHalf,
    });
  } catch (error: any) {
    console.error('[ceo/dashboard]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 중처법 반기 이행점검 (CDPA reviews)
// ═══════════════════════════════════════════════════════════════

/** GET /api/ceo/cdpa-reviews?year= */
router.get('/cdpa-reviews', async (req: Request, res: Response) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : null;
    const params: any[] = [];
    let where = '1=1';
    if (year) { where += ' AND year = ?'; params.push(year); }
    const rows = await dbAll(
      `SELECT r.*,
              (SELECT COUNT(*) FROM cdpa_review_items i WHERE i.review_id = r.id) AS item_count,
              (SELECT COUNT(*) FROM cdpa_review_items i WHERE i.review_id = r.id AND i.status = 'done') AS done_count
         FROM cdpa_reviews r
        WHERE ${where}
        ORDER BY year DESC, half DESC`,
      ...params
    );
    res.json({ items: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/ceo/cdpa-reviews/:id — 조회 시 자동 재계산도 실행 */
router.get('/cdpa-reviews/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const review = await dbGet(`SELECT * FROM cdpa_reviews WHERE id = ?`, id) as any;
    if (!review) { res.status(404).json({ error: '이행점검 없음' }); return; }
    // 자동 재계산 (P7E — 근거 최신 상태 유지)
    try { await autoRecomputeReview(id); }
    catch (e: any) { console.error('[cdpa-reviews/get/auto]', e.message); }
    const items = await dbAll(
      `SELECT * FROM cdpa_review_items WHERE review_id = ? ORDER BY item_no`, id
    );
    res.json({ review, items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** GET /api/ceo/cdpa-reviews/:id/auto-recompute — 수동 재계산 트리거 */
router.get('/cdpa-reviews/:id/auto-recompute', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const out = await autoRecomputeReview(id);
    res.json({ success: true, ...out });
  } catch (error: any) {
    console.error('[cdpa-reviews/auto-recompute]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ceo/cdpa-reviews/:id/items/:itemId/link
 *  body: { status?, notes?, evidence_source?, evidence_url? }
 * 관리자 수동 오버라이드 — auto_status 는 유지, 관리자 판단으로 status 변경.
 */
router.post('/cdpa-reviews/:id/items/:itemId/link', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId as string);
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined)          { sets.push('status = ?');             params.push(b.status); }
    if (b.notes !== undefined)           { sets.push('notes = ?');              params.push(b.notes); }
    if (b.evidence_source !== undefined) { sets.push('evidence_source = ?');    params.push(b.evidence_source); }
    if (b.evidence_url !== undefined)    { sets.push('evidence_url = ?');       params.push(b.evidence_url); }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(itemId);
    await dbRun(`UPDATE cdpa_review_items SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/ceo/cdpa-reviews  body:{ year, half } */
router.post('/cdpa-reviews', async (req: Request, res: Response) => {
  try {
    const { year, half } = req.body || {};
    const y = parseInt(year) || new Date().getFullYear();
    const h = parseInt(half);
    if (!h || (h !== 1 && h !== 2)) { res.status(400).json({ error: 'half 는 1 또는 2' }); return; }
    const dup = await dbGet(`SELECT id FROM cdpa_reviews WHERE year = ? AND half = ?`, y, h) as any;
    if (dup) { res.status(400).json({ error: `${y}년 하반기? 이미 존재 (id=${dup.id})` }); return; }
    const result = await dbRun(
      `INSERT INTO cdpa_reviews (year, half, status) VALUES (?, ?, 'draft')`,
      y, h
    );
    const id = Number(result.lastInsertRowid);
    await seedCdpaItems(id);
    // 생성 즉시 자동 상태 계산 (P7E)
    try { await autoRecomputeReview(id); }
    catch (e: any) { console.error('[cdpa-reviews/create/auto]', e.message); }
    res.json({ success: true, id, year: y, half: h });
  } catch (error: any) {
    console.error('[cdpa-reviews/create]', error);
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/ceo/cdpa-reviews/:id  body:{ summary?, improvement_plan?, status? } */
router.patch('/cdpa-reviews/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const b = req.body || {};
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    if (b.summary !== undefined) { sets.push('summary = ?'); params.push(b.summary); }
    if (b.improvement_plan !== undefined) { sets.push('improvement_plan = ?'); params.push(b.improvement_plan); }
    if (b.status !== undefined) { sets.push('status = ?'); params.push(b.status); }
    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(`UPDATE cdpa_reviews SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** PATCH /api/ceo/cdpa-reviews/:id/items/:itemId  body:{ status?, evidence_source?, evidence_url?, notes?, improvement_action? } */
router.patch('/cdpa-reviews/:id/items/:itemId', async (req: Request, res: Response) => {
  try {
    const itemId = parseInt(req.params.itemId as string);
    const b = req.body || {};
    const sets: string[] = [];
    const params: any[] = [];
    const fields = ['status', 'evidence_source', 'evidence_url', 'notes', 'improvement_action'];
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f} = ?`); params.push(b[f]); }
    }
    if (!sets.length) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(itemId);
    await dbRun(`UPDATE cdpa_review_items SET ${sets.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/ceo/cdpa-reviews/:id/sign  body:{ ceo_signature_name } */
router.post('/cdpa-reviews/:id/sign', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { ceo_signature_name } = req.body || {};
    if (!ceo_signature_name) { res.status(400).json({ error: 'ceo_signature_name 필요' }); return; }
    await dbRun(
      `UPDATE cdpa_reviews
          SET ceo_signature_name = ?, ceo_signed_at = NOW(), status = 'signed', updated_at = NOW()
        WHERE id = ?`,
      ceo_signature_name, id
    );
    res.json({ success: true, signed_at: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// activity type 라벨 export — 프론트에서 fetch 하는 대신 상수 응답으로도 제공
router.get('/activity-labels', (_req: Request, res: Response) => {
  res.json({ labels: ACTIVITY_LABEL });
});

export default router;
export { currentHalfYearPeriod, currentHalf };
