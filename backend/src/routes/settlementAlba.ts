import { Router, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendGeneralSms } from '../services/smsService';

const router = Router();

const fmt = (n: number): string => {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('ko-KR');
};

interface PayslipRow {
  employee_name: string;
  phone: string;
  department?: string;
  workplace?: string;
  bank_name?: string;
  bank_account?: string;
  work_days?: number;
  hourly_rate?: number;
  regular_hours?: number;
  overtime_hours?: number;
  night_hours?: number;
  holiday_pay_hours?: number;
  weekly_holiday_hours?: number;
  basePay?: number;
  overtimePay?: number;
  holidayPay?: number;
  nightPay?: number;
  whPay?: number;
  adjust?: number;
  grossPay?: number;
  meal?: number;
  incomeTax?: number;
  localTax?: number;
  netPay?: number;
}

function buildPayslipMessage(ym: string, r: PayslipRow): string {
  const hr = (v?: number) => (Number(v) || 0).toFixed(1);
  const soksok = r.department || r.workplace || '';
  const acct = [r.bank_name, r.bank_account].filter(Boolean).join(' ');
  const lines: string[] = [];
  lines.push(`[조인앤조인] ${ym} 급여명세서`);
  lines.push(`성명: ${r.employee_name}`);
  if (soksok) lines.push(`소속: ${soksok}`);
  lines.push('');
  lines.push('■ 근무');
  lines.push(`· 근무일 ${r.work_days || 0}일 / 시급 ${fmt(r.hourly_rate || 0)}원`);
  lines.push(`· 기본 ${hr(r.regular_hours)}h · 연장 ${hr(r.overtime_hours)}h · 야간 ${hr(r.night_hours)}h`);
  lines.push(`· 휴일 ${hr(r.holiday_pay_hours)}h · 주휴 ${hr(r.weekly_holiday_hours)}h`);
  lines.push('');
  lines.push('■ 지급');
  lines.push(`· 기본급    ${fmt(r.basePay || 0)}원`);
  if ((r.overtimePay || 0) > 0) lines.push(`· 연장수당   ${fmt(r.overtimePay || 0)}원`);
  if ((r.holidayPay || 0) > 0) lines.push(`· 휴일수당   ${fmt(r.holidayPay || 0)}원`);
  if ((r.nightPay || 0) > 0) lines.push(`· 야간수당   ${fmt(r.nightPay || 0)}원`);
  if ((r.whPay || 0) > 0) lines.push(`· 주휴수당   ${fmt(r.whPay || 0)}원`);
  if ((r.adjust || 0) !== 0) {
    const a = r.adjust || 0;
    lines.push(`· 조정      ${a > 0 ? '+' : ''}${fmt(a)}원`);
  }
  lines.push(`─────────────`);
  lines.push(`· 급여계    ${fmt(r.grossPay || 0)}원`);
  const meal = r.meal || 0;
  const incomeTax = r.incomeTax || 0;
  const localTax = r.localTax || 0;
  if (meal > 0 || incomeTax > 0 || localTax > 0) {
    lines.push('');
    lines.push('■ 공제');
    if (meal > 0) lines.push(`· 식대공제  -${fmt(meal)}원`);
    if (incomeTax > 0) lines.push(`· 소득세(3.3%) -${fmt(incomeTax)}원`);
    if (localTax > 0) lines.push(`· 지방세(0.33%) -${fmt(localTax)}원`);
  }
  lines.push('');
  lines.push(`■ 실지급   ${fmt(r.netPay || 0)}원`);
  if (acct) {
    lines.push('');
    lines.push(`입금계좌: ${acct}`);
  }
  lines.push('');
  lines.push('문의: 조인앤조인 인사팀');
  return lines.join('\n');
}

const normalizePhoneServer = (p: string | null | undefined): string =>
  (p || '').toString().replace(/[-\s]/g, '').trim();

/**
 * 알바(사업소득) 정산 서버 영속 + 월 마감.
 * - 근태 원장 기반 기본급/수당은 매번 재계산 (여기 저장 X).
 * - 관리자가 조정한 값(조정+/-, 식대공제)과 월별 마감 상태만 DB 저장.
 * - 마감 후에는 upsert 요청 거부. 재개(reopen)는 관리자 명시적 액션.
 */

function normalizeYm(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec((ym || '').trim());
  return m ? `${m[1]}-${m[2]}` : '';
}

// GET /api/settlement/alba/:yearMonth
router.get('/alba/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const state = await dbGet(
      `SELECT year_month, status, closed_at, closed_by, reopened_at, reopened_by, note, updated_at
         FROM alba_settlement_state WHERE year_month = ?`, ym
    ) as any;
    const lines = await dbAll(
      `SELECT employee_name, adjust_amount, meal_deduction, updated_at, updated_by
         FROM alba_settlement_line WHERE year_month = ? ORDER BY employee_name`, ym
    );
    res.json({
      year_month: ym,
      state: state || { year_month: ym, status: 'open', closed_at: null, closed_by: '', reopened_at: null, reopened_by: '', note: '' },
      lines,
    });
  } catch (error: any) {
    console.error('[settlement/alba GET]', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settlement/alba/:yearMonth/line  { employee_name, adjust_amount?, meal_deduction? }
router.put('/alba/:yearMonth/line', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const state = await dbGet(`SELECT status FROM alba_settlement_state WHERE year_month = ?`, ym) as any;
    if (state && state.status === 'closed') {
      res.status(409).json({ error: '마감된 월은 편집할 수 없습니다. 재개(reopen) 후 수정하세요.' });
      return;
    }
    const { employee_name, adjust_amount, meal_deduction } = req.body || {};
    if (!employee_name || typeof employee_name !== 'string') {
      res.status(400).json({ error: 'employee_name 필요' });
      return;
    }
    const adj = Number.isFinite(Number(adjust_amount)) ? Math.trunc(Number(adjust_amount)) : 0;
    const meal = Number.isFinite(Number(meal_deduction)) ? Math.max(0, Math.trunc(Number(meal_deduction))) : 0;
    const updater = req.user?.email || '';

    const existing = await dbGet(
      `SELECT id FROM alba_settlement_line WHERE year_month = ? AND employee_name = ?`,
      ym, employee_name
    ) as any;
    if (existing) {
      // 두 값 모두 0이면 삭제 (테이블 비우기)
      if (adj === 0 && meal === 0) {
        await dbRun(`DELETE FROM alba_settlement_line WHERE id = ?`, existing.id);
      } else {
        await dbRun(
          `UPDATE alba_settlement_line
              SET adjust_amount = ?, meal_deduction = ?, updated_at = NOW(), updated_by = ?
            WHERE id = ?`,
          adj, meal, updater, existing.id
        );
      }
    } else if (adj !== 0 || meal !== 0) {
      await dbRun(
        `INSERT INTO alba_settlement_line (year_month, employee_name, adjust_amount, meal_deduction, updated_by)
         VALUES (?, ?, ?, ?, ?)`,
        ym, employee_name, adj, meal, updater
      );
    }
    res.json({ success: true, year_month: ym, employee_name, adjust_amount: adj, meal_deduction: meal });
  } catch (error: any) {
    console.error('[settlement/alba PUT line]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settlement/alba/:yearMonth/close  { note? }
router.post('/alba/:yearMonth/close', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const { note } = req.body || {};
    const closer = req.user?.email || '';
    const existing = await dbGet(`SELECT year_month, status FROM alba_settlement_state WHERE year_month = ?`, ym) as any;
    if (existing) {
      if (existing.status === 'closed') {
        res.status(409).json({ error: '이미 마감된 월입니다.' });
        return;
      }
      await dbRun(
        `UPDATE alba_settlement_state
            SET status = 'closed', closed_at = NOW(), closed_by = ?, note = COALESCE(?, note), updated_at = NOW()
          WHERE year_month = ?`,
        closer, note || null, ym
      );
    } else {
      await dbRun(
        `INSERT INTO alba_settlement_state (year_month, status, closed_at, closed_by, note)
         VALUES (?, 'closed', NOW(), ?, ?)`,
        ym, closer, note || ''
      );
    }
    const state = await dbGet(
      `SELECT year_month, status, closed_at, closed_by, reopened_at, reopened_by, note FROM alba_settlement_state WHERE year_month = ?`, ym
    );
    res.json({ success: true, state });
  } catch (error: any) {
    console.error('[settlement/alba close]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settlement/alba/:yearMonth/reopen  { note? }
router.post('/alba/:yearMonth/reopen', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const { note } = req.body || {};
    const reopener = req.user?.email || '';
    const existing = await dbGet(`SELECT year_month, status FROM alba_settlement_state WHERE year_month = ?`, ym) as any;
    if (!existing || existing.status !== 'closed') {
      res.status(409).json({ error: '마감된 상태가 아닙니다.' });
      return;
    }
    await dbRun(
      `UPDATE alba_settlement_state
          SET status = 'open', reopened_at = NOW(), reopened_by = ?, note = COALESCE(?, note), updated_at = NOW()
        WHERE year_month = ?`,
      reopener, note || null, ym
    );
    const state = await dbGet(
      `SELECT year_month, status, closed_at, closed_by, reopened_at, reopened_by, note FROM alba_settlement_state WHERE year_month = ?`, ym
    );
    res.json({ success: true, state });
  } catch (error: any) {
    console.error('[settlement/alba reopen]', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settlement/alba/:yearMonth/send-payslips
// body: { employees: PayslipRow[] }  — 프론트에서 이미 계산·표시 중인 정산 라인을 그대로 전송.
// 마감(closed) 상태에서만 허용. 각 인원의 phone으로 SMS/LMS 발송 후 이력 저장.
router.post('/alba/:yearMonth/send-payslips', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }

    // 마감 상태 검증 — 마감된 월에서만 발송 허용
    const state = await dbGet(
      `SELECT status FROM alba_settlement_state WHERE year_month = ?`, ym
    ) as any;
    if (!state || state.status !== 'closed') {
      res.status(409).json({ error: '월 마감이 완료된 이후에만 급여명세서를 발송할 수 있습니다. 먼저 [월 마감]을 눌러주세요.' });
      return;
    }

    const body = req.body || {};
    const employees: PayslipRow[] = Array.isArray(body.employees) ? body.employees : [];
    if (employees.length === 0) {
      res.status(400).json({ error: '발송 대상이 없습니다. 최소 1명 이상 선택하세요.' });
      return;
    }
    if (employees.length > 100) {
      res.status(400).json({ error: '한 번에 최대 100명까지 발송할 수 있습니다.' });
      return;
    }

    const sender = req.user?.email || '';
    const results: Array<{ employee_name: string; phone: string; status: string; error?: string; message_length: number }> = [];
    let sent = 0, failed = 0;

    for (const emp of employees) {
      const name = String(emp.employee_name || '').trim();
      const phone = normalizePhoneServer(emp.phone);
      if (!name) {
        results.push({ employee_name: '(이름없음)', phone, status: 'skipped', error: 'employee_name 없음', message_length: 0 });
        failed++;
        continue;
      }
      if (!phone || phone.length < 9) {
        results.push({ employee_name: name, phone, status: 'skipped', error: '휴대폰 번호 없음/형식 오류', message_length: 0 });
        try {
          await dbRun(
            `INSERT INTO alba_payslip_send_log (year_month, employee_name, phone, message_text, message_length, status, error, sent_by)
             VALUES (?, ?, ?, ?, ?, 'skipped', ?, ?)`,
            ym, name, phone, '', 0, '휴대폰 번호 없음/형식 오류', sender
          );
        } catch {}
        failed++;
        continue;
      }

      const msg = buildPayslipMessage(ym, emp);
      const msgLen = Buffer.byteLength(msg, 'utf8');

      try {
        const r = await sendGeneralSms(phone, msg);
        if (r.success) {
          sent++;
          results.push({ employee_name: name, phone, status: 'sent', message_length: msgLen });
          await dbRun(
            `INSERT INTO alba_payslip_send_log (year_month, employee_name, phone, message_text, message_length, status, provider_message_id, sent_by)
             VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)`,
            ym, name, phone, msg, msgLen, r.messageId || '', sender
          );
        } else {
          failed++;
          results.push({ employee_name: name, phone, status: 'failed', error: r.error || '알 수 없는 오류', message_length: msgLen });
          await dbRun(
            `INSERT INTO alba_payslip_send_log (year_month, employee_name, phone, message_text, message_length, status, error, sent_by)
             VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
            ym, name, phone, msg, msgLen, r.error || '알 수 없는 오류', sender
          );
        }
      } catch (err: any) {
        failed++;
        results.push({ employee_name: name, phone, status: 'failed', error: err.message || '발송 예외', message_length: msgLen });
        try {
          await dbRun(
            `INSERT INTO alba_payslip_send_log (year_month, employee_name, phone, message_text, message_length, status, error, sent_by)
             VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)`,
            ym, name, phone, msg, msgLen, err.message || '발송 예외', sender
          );
        } catch {}
      }
    }

    res.json({
      success: true,
      year_month: ym,
      total: employees.length,
      sent,
      failed,
      results,
    });
  } catch (error: any) {
    console.error('[settlement/alba send-payslips]', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/settlement/alba/:yearMonth/payslip-log
// 이 월의 발송 이력 (인원별 최신 상태 요약 + 시간순 raw)
router.get('/alba/:yearMonth/payslip-log', async (req: AuthRequest, res: Response) => {
  try {
    const ym = normalizeYm(String(req.params.yearMonth || ''));
    if (!ym) { res.status(400).json({ error: 'yearMonth는 YYYY-MM 형식이어야 합니다.' }); return; }
    const rows = await dbAll(
      `SELECT id, employee_name, phone, message_length, status, error, sent_at, sent_by
         FROM alba_payslip_send_log
        WHERE year_month = ?
        ORDER BY sent_at DESC`, ym
    ) as any[];
    // 최신 성공/최신 시도 요약
    const lastByName: Record<string, any> = {};
    const lastSuccessByName: Record<string, any> = {};
    for (const r of rows) {
      if (!lastByName[r.employee_name]) lastByName[r.employee_name] = r;
      if (r.status === 'sent' && !lastSuccessByName[r.employee_name]) lastSuccessByName[r.employee_name] = r;
    }
    res.json({
      year_month: ym,
      total: rows.length,
      logs: rows,
      last_by_name: lastByName,
      last_success_by_name: lastSuccessByName,
    });
  } catch (error: any) {
    console.error('[settlement/alba payslip-log]', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
