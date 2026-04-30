/**
 * Offboarding Public API — no auth, token-based
 *
 * GET  /api/offboarding-public/by-token/:token  — fetch offboarding info by token
 * POST /api/offboarding-public/submit/:token    — employee submits resignation reason
 */

import { Router } from 'express';
import { dbGet, dbRun } from '../db';

const router = Router();

const REASONS = [
  { code: '11', label: '개인 사정' },
  { code: '22', label: '근로계약기간 만료' },
  { code: '23', label: '경영상 필요/회사 사정' },
  { code: '26', label: '정년 퇴직' },
  { code: '31', label: '기타' },
  { code: '41', label: '사망' },
];

// ---------------------------------------------------------------------------
// GET /api/offboarding-public/by-token/:token
// ---------------------------------------------------------------------------
router.get('/by-token/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!token) {
      res.status(400).json({ error: '토큰이 필요합니다.' });
      return;
    }

    const row = await dbGet(
      `SELECT id, employee_name, employee_phone, hire_date, resign_date, loss_date,
              resignation_letter_token_expires_at,
              resignation_letter_submitted_at,
              resignation_letter_employee_reason,
              resignation_letter_detail
       FROM employee_offboardings
       WHERE resignation_letter_token = ?`,
      token,
    );

    if (!row) {
      res.status(404).json({ error: '사직서 작성 링크가 유효하지 않습니다.' });
      return;
    }

    if (
      row.resignation_letter_token_expires_at &&
      new Date(row.resignation_letter_token_expires_at) < new Date()
    ) {
      res.status(410).json({ error: '사직서 작성 링크가 만료되었습니다.' });
      return;
    }

    res.json({
      ...row,
      reasons: REASONS,
      already_submitted: !!row.resignation_letter_submitted_at,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/offboarding-public/submit/:token
// ---------------------------------------------------------------------------
router.post('/submit/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '');
    const { reason_label, detail } = req.body as {
      reason_label: string;
      detail?: string;
    };

    if (!token) {
      res.status(400).json({ error: '토큰이 필요합니다.' });
      return;
    }
    if (!reason_label) {
      res.status(400).json({ error: '사유를 선택해주세요.' });
      return;
    }

    const row = await dbGet(
      `SELECT id, resignation_letter_token_expires_at, resignation_letter_submitted_at
       FROM employee_offboardings
       WHERE resignation_letter_token = ?`,
      token,
    );

    if (!row) {
      res.status(404).json({ error: '유효하지 않은 토큰입니다.' });
      return;
    }

    if (
      row.resignation_letter_token_expires_at &&
      new Date(row.resignation_letter_token_expires_at) < new Date()
    ) {
      res.status(410).json({ error: '링크가 만료되었습니다.' });
      return;
    }

    if (row.resignation_letter_submitted_at) {
      res.status(409).json({ error: '이미 제출된 사직서입니다.' });
      return;
    }

    // Pick reason code from label
    const matched = REASONS.find((r) => r.label === reason_label);
    const reasonCode = matched?.code || '';

    await dbRun(
      `UPDATE employee_offboardings
       SET resignation_letter_employee_reason = ?,
           resignation_letter_detail = ?,
           resignation_letter_submitted_at = NOW(),
           resignation_letter_received = 1,
           reason_code = CASE WHEN reason_code = '' OR reason_code IS NULL THEN ? ELSE reason_code END,
           updated_at = NOW()
       WHERE id = ?`,
      reason_label,
      detail || '',
      reasonCode,
      row.id,
    );

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
