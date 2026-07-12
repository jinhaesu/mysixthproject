import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';

const router = Router();

/**
 * P7A 근로자용 방침·규정 확인 API — regular_employees.token 재사용.
 * - 본인 target_role 매칭 + 미확인 문서 목록
 * - 문서 상세 열람 (?id=<n>)
 * - 확인 서명 (POST /:token/policy/:id/acknowledge)
 */

async function loadEmployeeByToken(token: string) {
  return await dbGet(
    `SELECT id, name, department, team, role, is_active
       FROM regular_employees WHERE token = ? AND is_active = 1`,
    token
  ) as any;
}

/**
 * 부서 → target_role 매핑.
 * 카페% → cafe, 사무% → office, 그 외(생산·물류) → production.
 * 문서 target_role 이 'all' 이면 전원 대상.
 */
function classifyEmployeeRole(department: string | null | undefined): 'production' | 'cafe' | 'office' {
  const dep = (department || '').trim();
  if (dep.startsWith('카페')) return 'cafe';
  if (dep.startsWith('사무')) return 'office';
  return 'production';
}

// ═══════════════════════════════════════════════════════════════
// GET /api/regular-public/:token/policy/pending
// 본인 target_role 매칭 + published + requires_acknowledgment=1 인 문서 중 미확인 목록.
// 응답: { employee, pending: PolicyDoc[], acknowledged: PolicyDoc[] }
// ═══════════════════════════════════════════════════════════════
router.get('/:token/policy/pending', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const role = classifyEmployeeRole(employee.department);

    const rows = await dbAll(
      `SELECT d.id, d.kind, d.title, d.version, d.effective_from,
              d.target_role, d.published_at, d.ceo_signature_name,
              a.acknowledged_at
         FROM policy_documents d
         LEFT JOIN policy_acknowledgments a
                ON a.document_id = d.id AND a.employee_id = ?
        WHERE d.status = 'published'
          AND d.requires_acknowledgment = 1
          AND (d.target_role = 'all' OR d.target_role = ?)
        ORDER BY (a.acknowledged_at IS NULL) DESC, d.kind ASC, d.published_at DESC NULLS LAST, d.id DESC`,
      employee.id, role
    ) as any[];

    const pending = rows.filter((r) => !r.acknowledged_at);
    const acknowledged = rows.filter((r) => r.acknowledged_at);
    res.json({
      employee: {
        id: employee.id,
        name: employee.name,
        department: employee.department,
        team: employee.team,
        role: employee.role,
        classified_role: role,
      },
      pending,
      acknowledged,
    });
  } catch (error: any) {
    console.error('[policy-public/pending]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/regular-public/:token/policy/view?id=<n>
// 문서 상세 열람 (본인 target_role 매칭 필수).
// ═══════════════════════════════════════════════════════════════
router.get('/:token/policy/view', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const id = parseInt(String(req.query.id || '0'));
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const role = classifyEmployeeRole(employee.department);
    const doc = await dbGet(
      `SELECT id, kind, title, version, content_html, attachment_url, status,
              effective_from, target_role, requires_acknowledgment,
              published_at, ceo_signed_at, ceo_signature_name
         FROM policy_documents
        WHERE id = ?`,
      id
    ) as any;
    if (!doc) { res.status(404).json({ error: '문서 없음' }); return; }
    if (doc.status !== 'published') {
      res.status(403).json({ error: '발행되지 않은 문서입니다.' }); return;
    }
    if (doc.target_role !== 'all' && doc.target_role !== role) {
      res.status(403).json({ error: '열람 대상이 아닙니다.' }); return;
    }
    const ack = await dbGet(
      `SELECT id, acknowledged_at, signature_notes
         FROM policy_acknowledgments
        WHERE document_id = ? AND employee_id = ?`,
      id, employee.id
    );
    res.json({
      employee: {
        id: employee.id, name: employee.name,
        department: employee.department, team: employee.team,
      },
      document: doc,
      acknowledgment: ack,
    });
  } catch (error: any) {
    console.error('[policy-public/view]', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/regular-public/:token/policy/:id/acknowledge
// body: { signature_notes? }
// 근로자 확인 서명 저장. 중복 시 UPDATE (UNIQUE 제약 활용).
// ═══════════════════════════════════════════════════════════════
router.post('/:token/policy/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const id = parseInt(req.params.id as string);
    if (!id) { res.status(400).json({ error: 'id 필요' }); return; }
    const role = classifyEmployeeRole(employee.department);
    const doc = await dbGet(
      `SELECT id, target_role, status, requires_acknowledgment
         FROM policy_documents WHERE id = ?`,
      id
    ) as any;
    if (!doc) { res.status(404).json({ error: '문서 없음' }); return; }
    if (doc.status !== 'published') {
      res.status(400).json({ error: '발행되지 않은 문서입니다.' }); return;
    }
    if (doc.target_role !== 'all' && doc.target_role !== role) {
      res.status(403).json({ error: '확인 대상이 아닙니다.' }); return;
    }
    const b = req.body || {};
    const notes = String(b.signature_notes || '');
    const clientIp = String(
      (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim() ||
      req.ip || ''
    );
    const userAgent = String(req.headers['user-agent'] || '');

    // UPSERT via ON CONFLICT (document_id, employee_id) UNIQUE
    await dbRun(
      `INSERT INTO policy_acknowledgments
         (document_id, employee_id, signature_notes, client_ip, user_agent, acknowledged_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON CONFLICT (document_id, employee_id) DO UPDATE
         SET signature_notes = EXCLUDED.signature_notes,
             client_ip = EXCLUDED.client_ip,
             user_agent = EXCLUDED.user_agent,
             acknowledged_at = NOW()`,
      id, employee.id, notes, clientIp, userAgent
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('[policy-public/ack]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
