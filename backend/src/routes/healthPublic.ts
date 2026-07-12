import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';

const router = Router();

/**
 * 보건 시스템 P3 — 근로자 문자 웹링크 경유 API (regular_employees.token 재사용).
 * - 건강진단(정기·특수) 예정/완료 상태
 * - 보건증(식품위생법 30조, 매년 갱신) 상태 및 재발급 사진 업로드
 */

async function loadEmployeeByToken(token: string) {
  return await dbGet(
    `SELECT id, name, department, team, role, is_active FROM regular_employees WHERE token = ? AND is_active = 1`,
    token
  ) as any;
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date(getKSTDate());
  const diff = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diff;
}

// ── 건강진단 ────────────────────────────────────────────────────
router.get('/:token/health/checkup-status', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const rows = await dbAll(
      `SELECT id, checkup_type, scheduled_year, scheduled_month, received_at,
              result_grade, result_notes, followup_required, followup_actions, followup_completed_at
         FROM health_checkups
        WHERE employee_id = ?
        ORDER BY scheduled_year DESC NULLS LAST, scheduled_month DESC NULLS LAST, id DESC
        LIMIT 20`,
      employee.id
    );
    res.json({
      employee: { name: employee.name, department: employee.department, team: employee.team, role: employee.role },
      checkups: rows,
    });
  } catch (error: any) {
    console.error('[health/checkup-status]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /:token/health/checkup/received — 근로자 스스로 "수검 완료" 표시.
 * body: { checkup_id, received_at?, result_grade?, result_notes? }
 */
router.post('/:token/health/checkup/received', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const { checkup_id, result_grade, result_notes } = req.body || {};
    if (!checkup_id) { res.status(400).json({ error: 'checkup_id 필요' }); return; }
    const row = await dbGet(
      `SELECT id, employee_id FROM health_checkups WHERE id = ?`, checkup_id
    ) as any;
    if (!row || Number(row.employee_id) !== Number(employee.id)) {
      res.status(404).json({ error: '건강진단 대상이 없습니다.' });
      return;
    }
    await dbRun(
      `UPDATE health_checkups
          SET received_at = NOW(),
              result_grade = COALESCE(?, result_grade),
              result_notes = COALESCE(?, result_notes)
        WHERE id = ?`,
      result_grade ?? null, result_notes ?? null, checkup_id
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('[health/checkup/received]', error);
    res.status(500).json({ error: error.message });
  }
});

// ── 보건증 ────────────────────────────────────────────────────
router.get('/:token/health/certificate', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const cert = await dbGet(
      `SELECT id, cert_type, issue_date, expiry_date, cert_photo_url, status, updated_at
         FROM health_certificates
        WHERE employee_id = ?
        ORDER BY expiry_date DESC, id DESC
        LIMIT 1`,
      employee.id
    ) as any;
    const today = getKSTDate();
    const daysLeft = cert ? daysUntil(cert.expiry_date) : null;
    let statusHint: 'none' | 'valid' | 'warning' | 'urgent' | 'expired' = 'none';
    if (cert) {
      if (daysLeft === null) statusHint = 'valid';
      else if (daysLeft < 0) statusHint = 'expired';
      else if (daysLeft <= 30) statusHint = 'urgent';
      else if (daysLeft <= 60) statusHint = 'warning';
      else statusHint = 'valid';
    }
    res.json({
      employee: { name: employee.name, department: employee.department, team: employee.team, role: employee.role },
      today,
      certificate: cert,
      days_until_expiry: daysLeft,
      status_hint: statusHint,
    });
  } catch (error: any) {
    console.error('[health/certificate]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /:token/health/certificate/update
 * body: { issue_date, expiry_date, cert_photo_url? }
 * 재발급/갱신 시 새 보건증 사진과 만료일 업로드. 기존 최신 레코드를 UPDATE 하거나 INSERT.
 */
router.post('/:token/health/certificate/update', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await loadEmployeeByToken(token);
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }
    const { issue_date, expiry_date, cert_photo_url } = req.body || {};
    if (!issue_date || !expiry_date) {
      res.status(400).json({ error: '발급일·만료일 필요' });
      return;
    }
    // 가장 최근 보건증이 만료 전이면 UPDATE, 아니면 새 레코드
    const latest = await dbGet(
      `SELECT id, expiry_date FROM health_certificates WHERE employee_id = ? ORDER BY expiry_date DESC LIMIT 1`,
      employee.id
    ) as any;
    if (latest && (!latest.expiry_date || new Date(latest.expiry_date) < new Date(expiry_date))) {
      // 새 만료일이 더 미래 → 갱신으로 간주하여 신규 레코드 삽입 (이력 보존)
      await dbRun(
        `INSERT INTO health_certificates
           (employee_id, employee_name, cert_type, issue_date, expiry_date, cert_photo_url, status, updated_at)
         VALUES (?, ?, 'food_handler', ?, ?, ?, 'valid', NOW())`,
        employee.id, employee.name, issue_date, expiry_date, cert_photo_url || ''
      );
    } else if (latest) {
      await dbRun(
        `UPDATE health_certificates
            SET issue_date = ?, expiry_date = ?, cert_photo_url = COALESCE(?, cert_photo_url), status = 'valid', updated_at = NOW()
          WHERE id = ?`,
        issue_date, expiry_date, cert_photo_url || null, latest.id
      );
    } else {
      await dbRun(
        `INSERT INTO health_certificates
           (employee_id, employee_name, cert_type, issue_date, expiry_date, cert_photo_url, status, updated_at)
         VALUES (?, ?, 'food_handler', ?, ?, ?, 'valid', NOW())`,
        employee.id, employee.name, issue_date, expiry_date, cert_photo_url || ''
      );
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('[health/certificate/update]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

/**
 * 보건증 게이팅 판정 유틸 — clock-in/out 훅에서 재사용.
 * 반환 값이 truthy 이면 그 사유로 SAFETY_TASK_INCOMPLETE 응답을 내야 함.
 * - 유효한 보건증이 없으면 'health_cert_missing'
 * - 만료임박(D-30 이내, 오늘 포함) 또는 이미 만료면 'health_cert_expired'
 * - 그 외 null (통과)
 * NB: 카페·사무직도 식품업 필수 규제라 대상 포함.
 */
export async function checkHealthCertGate(employeeId: number): Promise<'health_cert_missing' | 'health_cert_expired' | null> {
  const cert = await dbGet(
    `SELECT id, expiry_date FROM health_certificates
      WHERE employee_id = ?
      ORDER BY expiry_date DESC LIMIT 1`,
    employeeId
  ) as any;
  if (!cert || !cert.expiry_date) return 'health_cert_missing';
  const today = new Date(getKSTDate());
  const exp = new Date(cert.expiry_date);
  const diffDays = Math.round((exp.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 30) return 'health_cert_expired';
  return null;
}
