import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';

const router = Router();

/**
 * P7B — 안전보건 조직도·선임계.
 * requireAuth 뒤에 마운트.
 * 중처법 시행령 §4-2(안전보건 업무 총괄 조직·인력)
 * + §4-6(법정 인력 배치·업무시간 보장) 이행 증빙.
 *
 * position_key 종류:
 *   ceo            = 대표이사
 *   chief          = 안전보건관리책임자
 *   safety_mgr     = 안전관리자
 *   health_mgr     = 보건관리자
 *   supervisor     = 관리감독자 (여러 명 가능 — 조장/반장급)
 *   honor_inspector= 명예감독관
 *   worker_rep     = 근로자대표
 */

// 겸직 관리자 시간 요건 매핑 (반기 기준 최소 h)
const CONCURRENT_HOUR_KEYS = new Set(['safety_mgr', 'health_mgr']);
const REQUIRED_POSITION_KEYS = ['ceo', 'chief', 'safety_mgr', 'health_mgr', 'worker_rep'];

// ═══════════════════════════════════════════════════════════════
// 이력 기록 헬퍼
// ═══════════════════════════════════════════════════════════════
async function pushHistory(args: {
  positionId: number;
  action: 'appoint' | 'resign' | 'change' | 'certification_update';
  actorId?: number | null;
  details?: Record<string, any>;
  notes?: string;
}): Promise<void> {
  try {
    const detailsJson = JSON.stringify(args.details || {});
    await dbRun(
      `INSERT INTO safety_org_history
         (position_id, action, actor_id, details_json, notes)
       VALUES (?, ?, ?, ?::jsonb, ?)`,
      args.positionId, args.action, args.actorId ?? null,
      detailsJson, args.notes || ''
    );
  } catch (e: any) {
    console.warn('[safety_org_history] insert failed (non-fatal):', e?.message || e);
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/safety-org/positions — 전체 조직도
// ═══════════════════════════════════════════════════════════════
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT p.*, e.department AS emp_department, e.role AS emp_role
         FROM safety_org_positions p
         LEFT JOIN regular_employees e ON e.id = p.employee_id
        ORDER BY
          CASE p.position_key
            WHEN 'ceo' THEN 0
            WHEN 'chief' THEN 1
            WHEN 'safety_mgr' THEN 2
            WHEN 'health_mgr' THEN 3
            WHEN 'worker_rep' THEN 4
            WHEN 'supervisor' THEN 5
            WHEN 'honor_inspector' THEN 6
            ELSE 9 END,
          p.id ASC`
    );
    res.json({ positions: rows });
  } catch (error: any) {
    console.error('[safety-org/positions/list]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/safety-org/positions — 직위 신규 추가
// body: { position_key, position_name?, department?, is_concurrent?,
//         statutory_min_hours?, parent_position_id?, notes? }
// (관리감독자 등 여러 명 필요한 직위를 신규 추가할 때 사용)
// ═══════════════════════════════════════════════════════════════
router.post('/positions', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const b = req.body || {};
    if (!b.position_key) {
      res.status(400).json({ error: 'position_key 필수' });
      return;
    }
    const isConcurrent = b.is_concurrent ? 1 : 0;
    // safety_mgr / health_mgr 는 겸직 시 기본 685h 세팅
    let statutoryMinHours = Number(b.statutory_min_hours) || 0;
    if (isConcurrent && !statutoryMinHours && CONCURRENT_HOUR_KEYS.has(b.position_key)) {
      statutoryMinHours = 685;
    }
    const positionName = (b.position_name || '').trim() || defaultPositionName(b.position_key);
    const result = await dbRun(
      `INSERT INTO safety_org_positions
         (position_key, position_name, department, is_concurrent,
          statutory_min_hours, parent_position_id, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      b.position_key, positionName, b.department || '',
      isConcurrent, statutoryMinHours,
      b.parent_position_id ? Number(b.parent_position_id) : null,
      b.notes || ''
    );
    const id = Number(result.lastInsertRowid);
    await pushHistory({
      positionId: id,
      action: 'change',
      actorId: user?.id || null,
      details: { created: true, position_key: b.position_key, position_name: positionName },
      notes: '직위 신규 생성',
    });
    res.json({ success: true, id });
  } catch (error: any) {
    console.error('[safety-org/positions/create]', error);
    res.status(500).json({ error: error.message });
  }
});

function defaultPositionName(key: string): string {
  switch (key) {
    case 'ceo': return '대표이사';
    case 'chief': return '안전보건관리책임자';
    case 'safety_mgr': return '안전관리자';
    case 'health_mgr': return '보건관리자';
    case 'worker_rep': return '근로자대표';
    case 'supervisor': return '관리감독자';
    case 'honor_inspector': return '명예감독관';
    default: return key;
  }
}

// ═══════════════════════════════════════════════════════════════
// PATCH /api/safety-org/positions/:id — 선임·경력 업데이트
// employee_id 변화 시 history 자동 append (appoint / resign / change).
// ═══════════════════════════════════════════════════════════════
router.patch('/positions/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const user = (req as any).user;
    const cur = await dbGet(`SELECT * FROM safety_org_positions WHERE id = ?`, id) as any;
    if (!cur) { res.status(404).json({ error: '직위 없음' }); return; }
    const b = req.body || {};

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];

    // employee_id 처리 — null/0 는 해임, 그 외는 배치
    let newEmployeeId: number | null | undefined;
    let newEmployeeName: string | undefined;
    if (b.employee_id !== undefined) {
      const raw = b.employee_id;
      newEmployeeId = (raw === null || raw === '' || raw === 0) ? null : Number(raw);
      if (newEmployeeId) {
        const emp = await dbGet(
          `SELECT id, name, department FROM regular_employees WHERE id = ?`, newEmployeeId
        ) as any;
        if (!emp) { res.status(400).json({ error: '해당 employee_id 없음' }); return; }
        newEmployeeName = emp.name || '';
      } else {
        newEmployeeName = '';
      }
      sets.push('employee_id = ?'); params.push(newEmployeeId);
      sets.push('employee_name = ?'); params.push(newEmployeeName);
    } else if (b.employee_name !== undefined) {
      sets.push('employee_name = ?'); params.push(b.employee_name || '');
    }

    const scalarFields: Array<[string, (v: any) => any]> = [
      ['position_name', v => v || ''],
      ['appointed_at', v => v || null],
      ['resigned_at', v => v || null],
      ['appointment_doc_url', v => v || ''],
      ['certification_name', v => v || ''],
      ['certification_no', v => v || ''],
      ['statutory_min_hours', v => Number(v) || 0],
      ['department', v => v || ''],
      ['notes', v => v || ''],
      ['status', v => v || 'active'],
    ];
    for (const [key, tx] of scalarFields) {
      if (b[key] !== undefined) { sets.push(`${key} = ?`); params.push(tx(b[key])); }
    }
    if (b.is_concurrent !== undefined) {
      sets.push('is_concurrent = ?'); params.push(b.is_concurrent ? 1 : 0);
    }
    if (b.parent_position_id !== undefined) {
      sets.push('parent_position_id = ?');
      params.push(b.parent_position_id ? Number(b.parent_position_id) : null);
    }

    if (sets.length === 1) { res.status(400).json({ error: '변경사항 없음' }); return; }
    params.push(id);
    await dbRun(
      `UPDATE safety_org_positions SET ${sets.join(', ')} WHERE id = ?`,
      ...params
    );

    // 이력 자동 기록
    if (newEmployeeId !== undefined && newEmployeeId !== cur.employee_id) {
      if (!cur.employee_id && newEmployeeId) {
        await pushHistory({
          positionId: id,
          action: 'appoint',
          actorId: user?.id || null,
          details: {
            employee_id: newEmployeeId,
            employee_name: newEmployeeName,
            appointed_at: b.appointed_at || cur.appointed_at || null,
          },
          notes: `${cur.position_name} 신규 선임`,
        });
      } else if (cur.employee_id && !newEmployeeId) {
        await pushHistory({
          positionId: id,
          action: 'resign',
          actorId: user?.id || null,
          details: {
            previous_employee_id: cur.employee_id,
            previous_employee_name: cur.employee_name,
            resigned_at: b.resigned_at || null,
          },
          notes: `${cur.position_name} 해임`,
        });
      } else {
        await pushHistory({
          positionId: id,
          action: 'change',
          actorId: user?.id || null,
          details: {
            previous_employee_id: cur.employee_id,
            previous_employee_name: cur.employee_name,
            new_employee_id: newEmployeeId,
            new_employee_name: newEmployeeName,
          },
          notes: `${cur.position_name} 선임자 교체`,
        });
      }
    } else if (b.certification_name !== undefined || b.certification_no !== undefined) {
      await pushHistory({
        positionId: id,
        action: 'certification_update',
        actorId: user?.id || null,
        details: {
          certification_name: b.certification_name ?? cur.certification_name,
          certification_no: b.certification_no ?? cur.certification_no,
        },
        notes: '자격 정보 갱신',
      });
    } else {
      await pushHistory({
        positionId: id,
        action: 'change',
        actorId: user?.id || null,
        details: { patched_fields: Object.keys(b) },
        notes: '직위 정보 수정',
      });
    }

    const updated = await dbGet(`SELECT * FROM safety_org_positions WHERE id = ?`, id);
    res.json({ success: true, position: updated });
  } catch (error: any) {
    console.error('[safety-org/positions/patch]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/safety-org/positions/:id/history — 이력 조회
// ═══════════════════════════════════════════════════════════════
router.get('/positions/:id/history', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const rows = await dbAll(
      `SELECT * FROM safety_org_history
        WHERE position_id = ?
        ORDER BY occurred_at DESC, id DESC`,
      id
    );
    res.json({ history: rows });
  } catch (error: any) {
    console.error('[safety-org/positions/history]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/safety-org/compliance-check
// - 필수 직위 배치 여부
// - 겸직 관리자 반기 실적 시간 vs statutory_min_hours 대비 %
//   (manager_activity_hours + 이름/이메일 매칭)
// ═══════════════════════════════════════════════════════════════
function currentHalfRange(now: Date = new Date()): { year: number; half: 1 | 2; from: string; to: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const half: 1 | 2 = month <= 6 ? 1 : 2;
  const from = half === 1 ? `${year}-01-01` : `${year}-07-01`;
  const to = half === 1 ? `${year}-06-30` : `${year}-12-31`;
  return { year, half, from, to };
}

router.get('/compliance-check', async (_req: Request, res: Response) => {
  try {
    const positions = await dbAll(
      `SELECT p.*, e.department AS emp_department
         FROM safety_org_positions p
         LEFT JOIN regular_employees e ON e.id = p.employee_id
        WHERE p.status = 'active'
        ORDER BY p.position_key, p.id`
    ) as any[];

    // 필수 직위 배치 여부 (position_key 별로 employee_id 채워진 카드가 하나라도 있어야 OK)
    const missing: Array<{ position_key: string; position_name: string }> = [];
    for (const key of REQUIRED_POSITION_KEYS) {
      const filled = positions.some(p => p.position_key === key && p.employee_id);
      if (!filled) {
        const nameRow = positions.find(p => p.position_key === key);
        missing.push({
          position_key: key,
          position_name: nameRow?.position_name || defaultPositionName(key),
        });
      }
    }

    // 겸직 관리자 시간 결산 (safety_mgr / health_mgr 중심)
    const { year, half, from, to } = currentHalfRange();
    const hoursRows: Array<{
      position_id: number;
      position_key: string;
      position_name: string;
      employee_id: number | null;
      employee_name: string;
      statutory_min_hours: number;
      is_concurrent: number;
      half_minutes: number;
      half_hours: number;
      gauge_pct: number | null;
      shortfall_hours: number;
    }> = [];

    for (const p of positions) {
      if (!p.is_concurrent) continue;
      if (!p.statutory_min_hours || Number(p.statutory_min_hours) <= 0) continue;
      let mins = 0;
      if (p.employee_id || p.employee_name) {
        const row = await dbGet(
          `SELECT COALESCE(SUM(minutes), 0) AS mins
             FROM manager_activity_hours
            WHERE occurred_at >= ?
              AND occurred_at < (?::date + INTERVAL '1 day')
              AND (
                (? > 0 AND manager_id = ?)
                OR
                (COALESCE(?, '') <> '' AND LOWER(TRIM(manager_name)) = LOWER(TRIM(?)))
              )`,
          from, to,
          p.employee_id || 0, p.employee_id || 0,
          p.employee_name || '', p.employee_name || ''
        ) as any;
        mins = Number(row?.mins || 0);
      }
      const hours = Math.round((mins / 60) * 10) / 10;
      const target = Number(p.statutory_min_hours) || 0;
      const gaugePct = target > 0 ? Math.round((hours / target) * 1000) / 10 : null;
      const shortfall = Math.max(0, Math.round((target - hours) * 10) / 10);
      hoursRows.push({
        position_id: p.id,
        position_key: p.position_key,
        position_name: p.position_name,
        employee_id: p.employee_id,
        employee_name: p.employee_name || '',
        statutory_min_hours: target,
        is_concurrent: p.is_concurrent,
        half_minutes: mins,
        half_hours: hours,
        gauge_pct: gaugePct,
        shortfall_hours: shortfall,
      });
    }

    res.json({
      positions,
      missing,
      hours_summary: hoursRows,
      period: {
        year,
        half,
        from,
        to,
        label: `${year} H${half}`,
      },
      required_keys: REQUIRED_POSITION_KEYS,
      compliant: missing.length === 0 && hoursRows.every(r => (r.gauge_pct ?? 0) >= 100),
    });
  } catch (error: any) {
    console.error('[safety-org/compliance-check]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
