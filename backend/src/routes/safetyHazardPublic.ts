import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';

const router = Router();

/**
 * P2 안전보건 — 근로자 아차사고·위험요인 신고 (public, token 인증)
 * regular_employees.token 재사용. 익명 옵션 시 reporter_* 필드 공란 저장.
 */

async function loadEmployeeByToken(token: string) {
  return await dbGet(
    `SELECT id, name, phone, department, team, role, is_active
       FROM regular_employees WHERE token = ? AND is_active = 1`,
    token
  ) as any;
}

/**
 * POST /api/regular-public/:token/hazard/report
 * body: {
 *   hazard_type: string,        // required
 *   description?: string,
 *   area_id?: number,
 *   area_name?: string,
 *   is_anonymous?: boolean,
 *   photo_url?: string,          // base64 dataURL 또는 URL
 *   occurred_at?: string ISO,
 * }
 */
router.post('/:token/hazard/report', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }
    const {
      hazard_type,
      description,
      area_id,
      area_name,
      is_anonymous,
      photo_url,
      occurred_at,
    } = req.body || {};
    if (!hazard_type || typeof hazard_type !== 'string') {
      res.status(400).json({ error: 'hazard_type 필수' });
      return;
    }
    const anon = is_anonymous ? 1 : 0;
    const reporterId = anon ? null : employee.id;
    const reporterName = anon ? '' : (employee.name || '');
    const reporterPhone = anon ? '' : (employee.phone || '');
    const result = await dbRun(
      `INSERT INTO hazard_reports
         (reporter_employee_id, reporter_name, reporter_phone, is_anonymous,
          occurred_at, area_id, area_name, hazard_type, description, photo_url, status)
       VALUES (?, ?, ?, ?, COALESCE(?::timestamptz, NOW()), ?, ?, ?, ?, ?, 'reported')`,
      reporterId,
      reporterName,
      reporterPhone,
      anon,
      occurred_at || null,
      area_id || null,
      area_name || '',
      hazard_type,
      description || '',
      photo_url || ''
    );
    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: '신고 접수되었습니다. 안전관리자가 검토 후 조치합니다.',
    });
  } catch (error: any) {
    console.error('[hazard/report]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/regular-public/:token/hazard/history
 * 본인이 신고한 이력 (익명 신고는 제외 — reporter_employee_id 매칭)
 */
router.get('/:token/hazard/history', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }
    const rows = await dbAll(
      `SELECT id, hazard_type, area_name, description, status, grade,
              response_to_reporter, response_sent_at, occurred_at, created_at
         FROM hazard_reports
        WHERE reporter_employee_id = ?
        ORDER BY id DESC
        LIMIT 50`,
      employee.id
    );
    res.json({ reports: rows });
  } catch (error: any) {
    console.error('[hazard/history]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
