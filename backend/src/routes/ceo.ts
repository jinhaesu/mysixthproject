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

// 중처법 시행령 제4조 9개 의무
const CDPA_OBLIGATION_TITLES: Array<{ item_no: number; obligation_name: string }> = [
  { item_no: 1, obligation_name: '안전보건 경영방침·목표 수립' },
  { item_no: 2, obligation_name: '안전보건 업무 총괄 조직/인력' },
  { item_no: 3, obligation_name: '유해위험요인 확인·개선 절차(위험성평가)' },
  { item_no: 4, obligation_name: '안전보건 예산 편성·집행' },
  { item_no: 5, obligation_name: '안전보건관리책임자 등 충실 수행 지원' },
  { item_no: 6, obligation_name: '법정 인력 배치·업무시간 보장' },
  { item_no: 7, obligation_name: '종사자 의견 청취 절차·개선 이행' },
  { item_no: 8, obligation_name: '중대재해 대비 매뉴얼·반기 점검' },
  { item_no: 9, obligation_name: '도급·용역 시 수급인 안전보건 확보' },
];

async function seedCdpaItems(reviewId: number): Promise<void> {
  for (const it of CDPA_OBLIGATION_TITLES) {
    await dbRun(
      `INSERT INTO cdpa_review_items (review_id, item_no, obligation_name, status)
       VALUES (?, ?, ?, 'not_started')`,
      reviewId, it.item_no, it.obligation_name
    );
  }
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

/** GET /api/ceo/cdpa-reviews/:id */
router.get('/cdpa-reviews/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const review = await dbGet(`SELECT * FROM cdpa_reviews WHERE id = ?`, id) as any;
    if (!review) { res.status(404).json({ error: '이행점검 없음' }); return; }
    const items = await dbAll(
      `SELECT * FROM cdpa_review_items WHERE review_id = ? ORDER BY item_no`, id
    );
    res.json({ review, items });
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
