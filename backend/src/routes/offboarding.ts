/**
 * Offboarding (퇴사관리) API
 *
 * GET    /api/offboarding                      — list
 * GET    /api/offboarding/dashboard            — summary widget
 * GET    /api/offboarding/settings/email-recipients
 * PUT    /api/offboarding/settings/email-recipients
 * GET    /api/offboarding/export/insurance.csv — bulk CSV export
 * GET    /api/offboarding/:id                  — single record + employee snapshot + tax_breakdown
 * GET    /api/offboarding/:id/export.csv       — single record CSV
 * POST   /api/offboarding                      — create
 * PATCH  /api/offboarding/:id                  — partial update
 * DELETE /api/offboarding/:id                  — hard delete
 * POST   /api/offboarding/:id/recompute        — recompute auto values + tax
 * POST   /api/offboarding/:id/compute-tax      — ad-hoc tax computation
 * POST   /api/offboarding/:id/send-email       — re-send email
 */

import { Router, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendOffboardingNotification, OffboardingRecord } from '../services/offboardingEmail';
import { computeSeveranceTax, SeveranceTaxBreakdown } from '../services/severanceTax';
import { buildOffboardingCSV, OffboardingRecord as OffboardingCSVRecord } from '../services/insuranceExport';

const router = Router();

// ---------------------------------------------------------------------------
// Helper — add 1 day to YYYY-MM-DD string
// ---------------------------------------------------------------------------
function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Helper — compute months between two date strings
// ---------------------------------------------------------------------------
function monthsBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const years = end.getUTCFullYear() - start.getUTCFullYear();
  const months = end.getUTCMonth() - start.getUTCMonth();
  const days = end.getUTCDate() - start.getUTCDate();
  let total = years * 12 + months;
  if (days < 0) total -= 1;
  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// Helper — compute exact years of service (fractional) from hire/resign dates
// ---------------------------------------------------------------------------
function yearsOfServiceExact(hireDate: string, resignDate: string): number {
  if (!hireDate) return 0;
  const months = monthsBetween(hireDate, resignDate);
  return months / 12;
}

// ---------------------------------------------------------------------------
// Helper — read email recipients from admin_settings
// ---------------------------------------------------------------------------
async function getEmailRecipients(): Promise<string[]> {
  const row = await dbGet(
    "SELECT value FROM admin_settings WHERE key = 'offboarding_email_recipients'",
  );
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed.emails) ? parsed.emails : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helper — read global business_registration_no from admin_settings
// ---------------------------------------------------------------------------
async function getBusinessRegistrationNo(): Promise<string> {
  const row = await dbGet(
    "SELECT value FROM admin_settings WHERE key = 'business_registration_no'",
  );
  return row ? row.value : '';
}

// ---------------------------------------------------------------------------
// Helper — compute auto severance + annual leave pay + retirement income tax
// ---------------------------------------------------------------------------
async function computeAutoAmounts(
  employeeRefId: number,
  resignDate: string,
  hireDate: string,
): Promise<{
  severanceAuto: number;
  annualLeaveRemaining: number;
  annualLeavePayAuto: number;
  retirementIncomeTaxAuto: number;
  taxBreakdown: SeveranceTaxBreakdown;
}> {
  // Read latest salary settings
  const salary = await dbGet(
    'SELECT base_pay, meal_allowance, position_allowance, other_allowance, bonus FROM regular_salary_settings WHERE employee_id = ?',
    employeeRefId,
  );

  const monthlyAvg = salary
    ? Math.round(
        Number(salary.base_pay || 0) +
          Number(salary.meal_allowance || 0) +
          Number(salary.position_allowance || 0) +
          Number(salary.other_allowance || 0) +
          Number(salary.bonus || 0),
      )
    : 0;

  const months = hireDate ? monthsBetween(hireDate, resignDate) : 0;
  const years = months / 12;

  // Severance: 1년 미만 시 0, 이상 시 근속연수 × 월 평균임금
  const severanceAuto = years >= 1 ? Math.round(monthlyAvg * years) : 0;

  // Annual leave remaining
  const year = new Date(resignDate + 'T00:00:00Z').getUTCFullYear();
  const vacRow = await dbGet(
    'SELECT total_days, used_days FROM regular_vacation_balances WHERE employee_id = ? AND year = ?',
    employeeRefId,
    year,
  );
  const annualLeaveRemaining = vacRow
    ? Math.max(0, Number(vacRow.total_days) - Number(vacRow.used_days))
    : 0;

  // Daily wage = monthlyAvg / 30 (TODO Phase 3: use exact daily average from payroll)
  const dailyWage = monthlyAvg > 0 ? Math.round(monthlyAvg / 30) : 0;
  const annualLeavePayAuto = Math.round(annualLeaveRemaining * dailyWage);

  // Retirement income tax (precise formula)
  const taxBreakdown = computeSeveranceTax(severanceAuto, years);

  return {
    severanceAuto,
    annualLeaveRemaining,
    annualLeavePayAuto,
    retirementIncomeTaxAuto: taxBreakdown.total_tax,
    taxBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Helper — build tax breakdown for a record (from stored severance_final + dates)
// ---------------------------------------------------------------------------
function buildTaxBreakdownFromRecord(record: any): SeveranceTaxBreakdown {
  const severanceFinal = Number(record.severance_final || 0);
  const exactYears = yearsOfServiceExact(record.hire_date || '', record.resign_date || '');
  return computeSeveranceTax(severanceFinal, exactYears);
}

// ---------------------------------------------------------------------------
// Helper — map DB row to CSV OffboardingRecord shape
// ---------------------------------------------------------------------------
async function toOffboardingCSVRecord(row: any): Promise<OffboardingCSVRecord> {
  const bizNo = await getBusinessRegistrationNo();
  // Try to get id_number from linked employee
  let idNumber = '';
  if (row.employee_type === 'regular' && row.employee_ref_id) {
    const emp = await dbGet('SELECT id_number FROM regular_employees WHERE id = ?', row.employee_ref_id);
    idNumber = emp?.id_number || '';
  } else if (row.employee_ref_id) {
    const w = await dbGet('SELECT id_number FROM workers WHERE id = ?', row.employee_ref_id);
    idNumber = w?.id_number || '';
  }
  return {
    id: row.id,
    employee_name: row.employee_name,
    employee_phone: row.employee_phone,
    id_number: idNumber,
    loss_date: row.loss_date,
    reason_code: row.reason_code,
    severance_final: Number(row.severance_final || 0),
    annual_leave_pay_final: Number(row.annual_leave_pay_final || 0),
    retirement_income_tax: Number(row.retirement_income_tax || 0),
    severance_paid: Number(row.severance_paid || 0),
    notes: row.notes,
    business_registration_no: bizNo,
  };
}

// ---------------------------------------------------------------------------
// GET /api/offboarding
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status = 'all', search } = req.query as Record<string, string>;

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (status !== 'all') {
      where += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND employee_name ILIKE ?';
      params.push(`%${search}%`);
    }

    const rows = await dbAll(
      `SELECT *,
         CASE WHEN status = 'in_progress'
              THEN 14 - EXTRACT(DAY FROM (NOW() - (resign_date::date)))::int
              ELSE NULL
         END AS days_to_loss_deadline
       FROM employee_offboardings
       ${where}
       ORDER BY
         CASE status WHEN 'in_progress' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
         resign_date DESC`,
      ...params,
    );

    res.json({ items: rows });
  } catch (error: any) {
    console.error('GET /api/offboarding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/offboarding/dashboard  (must come before /:id)
// ---------------------------------------------------------------------------
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7); // YYYY-MM

    const summary = await dbGet(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
        COUNT(*) FILTER (
          WHERE status = 'in_progress'
            AND (14 - EXTRACT(DAY FROM (NOW() - resign_date::date))::int) <= 3
            AND (14 - EXTRACT(DAY FROM (NOW() - resign_date::date))::int) >= 0
        ) AS deadline_warning_count,
        COUNT(*) FILTER (
          WHERE status = 'in_progress'
            AND EXTRACT(DAY FROM (NOW() - resign_date::date))::int > 14
        ) AS overdue_count,
        COUNT(*) FILTER (
          WHERE status = 'completed'
            AND TO_CHAR(updated_at, 'YYYY-MM') = $1
        ) AS completed_this_month,
        COUNT(*) FILTER (
          WHERE status = 'in_progress'
            AND severance_paid = 0
            AND resign_date::date < CURRENT_DATE
        ) AS missing_severance
      FROM employee_offboardings
    `, yearMonth);

    const recent = await dbAll(`
      SELECT * FROM employee_offboardings
      WHERE status = 'in_progress'
      ORDER BY resign_date DESC
      LIMIT 5
    `);

    res.json({
      in_progress_count: Number(summary?.in_progress_count ?? 0),
      deadline_warning_count: Number(summary?.deadline_warning_count ?? 0),
      overdue_count: Number(summary?.overdue_count ?? 0),
      completed_this_month: Number(summary?.completed_this_month ?? 0),
      missing_severance: Number(summary?.missing_severance ?? 0),
      items: recent,
    });
  } catch (error: any) {
    console.error('GET /api/offboarding/dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/offboarding/settings/email-recipients  (must come before /:id)
// ---------------------------------------------------------------------------
router.get('/settings/email-recipients', async (req: AuthRequest, res: Response) => {
  try {
    const emails = await getEmailRecipients();
    res.json({ emails });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/offboarding/settings/email-recipients
// ---------------------------------------------------------------------------
router.put('/settings/email-recipients', async (req: AuthRequest, res: Response) => {
  try {
    const { emails } = req.body as { emails: string[] };
    if (!Array.isArray(emails)) {
      res.status(400).json({ error: 'emails must be an array' });
      return;
    }
    const invalid = emails.filter((e) => typeof e !== 'string' || !e.includes('@'));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid email(s): ${invalid.join(', ')}` });
      return;
    }

    const value = JSON.stringify({ emails });
    await dbRun(
      `INSERT INTO admin_settings (key, value, updated_at)
       VALUES ('offboarding_email_recipients', ?, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      value,
    );

    res.json({ emails });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/offboarding/export/insurance.csv  (must come before /:id)
// ---------------------------------------------------------------------------
router.get('/export/insurance.csv', async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.query as { ids?: string };

    let rows: any[];
    if (ids && ids.trim()) {
      const idList = ids
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      if (idList.length === 0) {
        res.status(400).json({ error: 'No valid ids provided' });
        return;
      }
      const placeholders = idList.map(() => '?').join(',');
      rows = await dbAll(
        `SELECT * FROM employee_offboardings WHERE id IN (${placeholders})`,
        ...idList,
      );
    } else {
      // Default: all in_progress records
      rows = await dbAll(
        "SELECT * FROM employee_offboardings WHERE status = 'in_progress' ORDER BY resign_date DESC",
      );
    }

    const csvRecords = await Promise.all(rows.map(toOffboardingCSVRecord));
    const csv = buildOffboardingCSV(csvRecords);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''%EC%83%81%EC%8B%A4%EC%8B%A0%EA%B3%A0_${dateStr}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('GET /api/offboarding/export/insurance.csv error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/offboarding/:id — single record + employee snapshot + tax_breakdown
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const record = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', id);
    if (!record) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    let employee: any = null;

    if (record.employee_type === 'regular' && record.employee_ref_id) {
      const emp = await dbGet(
        'SELECT id, name, phone, department, team, hire_date, bank_name, bank_account, id_number FROM regular_employees WHERE id = ?',
        record.employee_ref_id,
      );
      const salRow = await dbGet(
        'SELECT base_pay, meal_allowance, position_allowance, other_allowance, bonus FROM regular_salary_settings WHERE employee_id = ?',
        record.employee_ref_id,
      );
      employee = emp ? { ...emp, salary: salRow || null } : null;
    } else if (record.employee_ref_id) {
      const w = await dbGet(
        'SELECT id, name_ko AS name, phone, department, bank_name, bank_account, id_number, category FROM workers WHERE id = ?',
        record.employee_ref_id,
      );
      employee = w || null;
    }

    // Compute tax breakdown from current severance_final + dates
    const taxBreakdown = buildTaxBreakdownFromRecord(record);

    res.json({ ...record, employee, tax_breakdown: taxBreakdown });
  } catch (error: any) {
    console.error('GET /api/offboarding/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/offboarding/:id/export.csv — single record CSV
// ---------------------------------------------------------------------------
router.get('/:id/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const record = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', id);
    if (!record) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    const csvRecord = await toOffboardingCSVRecord(record);
    const csv = buildOffboardingCSV([csvRecord]);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''%EC%83%81%EC%8B%A4%EC%8B%A0%EA%B3%A0_${id}_${dateStr}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('GET /api/offboarding/:id/export.csv error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/offboarding — create
// ---------------------------------------------------------------------------
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      employee_type,
      employee_ref_id,
      resign_date,
      reason_code,
      reason_detail = '',
      send_email = false,
    } = req.body as {
      employee_type: string;
      employee_ref_id: number;
      resign_date: string;
      reason_code: string;
      reason_detail?: string;
      send_email?: boolean;
    };

    if (!employee_type || !resign_date || !reason_code) {
      res.status(400).json({ error: 'employee_type, resign_date, reason_code are required' });
      return;
    }

    // Snapshot employee info
    let employeeName = '';
    let employeePhone = '';
    let department = '';
    let hireDate = '';

    if (employee_type === 'regular') {
      const emp = await dbGet(
        'SELECT name, phone, department, hire_date FROM regular_employees WHERE id = ?',
        employee_ref_id,
      );
      if (!emp) {
        res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
        return;
      }
      employeeName = emp.name;
      employeePhone = emp.phone;
      department = emp.department;
      hireDate = emp.hire_date || '';
    } else {
      const w = await dbGet(
        'SELECT name_ko, phone, department FROM workers WHERE id = ?',
        employee_ref_id,
      );
      if (!w) {
        res.status(404).json({ error: '근무자를 찾을 수 없습니다.' });
        return;
      }
      employeeName = w.name_ko;
      employeePhone = w.phone;
      department = w.department;
    }

    // Compute loss_date = resign_date + 1
    const lossDate = addOneDay(resign_date);

    // Compute auto amounts (regular only)
    let severanceAuto = 0;
    let annualLeaveRemaining = 0;
    let annualLeavePayAuto = 0;
    let retirementIncomeTaxAuto = 0;

    if (employee_type === 'regular' && employee_ref_id) {
      const computed = await computeAutoAmounts(employee_ref_id, resign_date, hireDate);
      severanceAuto = computed.severanceAuto;
      annualLeaveRemaining = computed.annualLeaveRemaining;
      annualLeavePayAuto = computed.annualLeavePayAuto;
      retirementIncomeTaxAuto = computed.retirementIncomeTaxAuto;
    }

    const insertResult = await dbRun(
      `INSERT INTO employee_offboardings (
        employee_type, employee_ref_id, employee_name, employee_phone,
        department, hire_date, resign_date, loss_date,
        reason_code, reason_detail, status,
        severance_auto, severance_final,
        annual_leave_remaining, annual_leave_pay_auto, annual_leave_pay_final,
        retirement_income_tax,
        email_sent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())`,
      employee_type,
      employee_ref_id ?? null,
      employeeName,
      employeePhone,
      department,
      hireDate,
      resign_date,
      lossDate,
      reason_code,
      reason_detail,
      severanceAuto,
      severanceAuto, // severance_final = severance_auto initially
      annualLeaveRemaining,
      annualLeavePayAuto,
      annualLeavePayAuto, // annual_leave_pay_final = annual_leave_pay_auto initially
      retirementIncomeTaxAuto,
    );

    const newId = insertResult.lastInsertRowid as number;
    const newRecord = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', newId);

    // Send email if requested
    if (send_email) {
      const recipients = await getEmailRecipients();
      const emailRecord: OffboardingRecord = {
        id: newRecord.id,
        employee_type: newRecord.employee_type,
        employee_name: newRecord.employee_name,
        employee_phone: newRecord.employee_phone,
        department: newRecord.department,
        hire_date: newRecord.hire_date,
        resign_date: newRecord.resign_date,
        loss_date: newRecord.loss_date,
        reason_code: newRecord.reason_code,
        reason_detail: newRecord.reason_detail,
        severance_final: Number(newRecord.severance_final),
        annual_leave_pay_final: Number(newRecord.annual_leave_pay_final),
        retirement_income_tax: Number(newRecord.retirement_income_tax),
      };
      const emailResult = await sendOffboardingNotification(emailRecord, recipients);
      if (emailResult.ok) {
        await dbRun(
          'UPDATE employee_offboardings SET email_sent = 1, email_sent_at = NOW() WHERE id = ?',
          newId,
        );
        newRecord.email_sent = 1;
      }
    }

    res.status(201).json(newRecord);
  } catch (error: any) {
    console.error('POST /api/offboarding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/offboarding/:id — partial update
// ---------------------------------------------------------------------------
const PATCHABLE_FIELDS = new Set([
  'resign_date',
  'loss_date',
  'reason_code',
  'reason_detail',
  'status',
  'notes',
  'resignation_letter_received',
  'assets_returned',
  'pension_reported',
  'health_insurance_reported',
  'employment_insurance_reported',
  'industrial_accident_reported',
  'severance_paid',
  'annual_leave_settled',
  'income_tax_reported',
  'severance_method',
  'severance_final',
  'annual_leave_remaining',
  'annual_leave_pay_final',
  'retirement_income_tax',
]);

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = await dbGet('SELECT id FROM employee_offboardings WHERE id = ?', id);
    if (!existing) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(req.body)) {
      if (PATCHABLE_FIELDS.has(key)) {
        setClauses.push(`${key} = ?`);
        params.push(val);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push('updated_at = NOW()');
    params.push(id);

    await dbRun(
      `UPDATE employee_offboardings SET ${setClauses.join(', ')} WHERE id = ?`,
      ...params,
    );

    const updated = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', id);
    res.json(updated);
  } catch (error: any) {
    console.error('PATCH /api/offboarding/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/offboarding/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = await dbGet('SELECT id FROM employee_offboardings WHERE id = ?', id);
    if (!existing) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    await dbRun('DELETE FROM employee_offboardings WHERE id = ?', id);
    res.json({ ok: true });
  } catch (error: any) {
    console.error('DELETE /api/offboarding/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/offboarding/:id/recompute
// ---------------------------------------------------------------------------
router.post('/:id/recompute', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const record = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', id);
    if (!record) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    if (record.employee_type !== 'regular' || !record.employee_ref_id) {
      res.json(record);
      return;
    }

    const computed = await computeAutoAmounts(
      record.employee_ref_id,
      record.resign_date,
      record.hire_date,
    );

    await dbRun(
      `UPDATE employee_offboardings
       SET severance_auto = ?, severance_final = ?,
           annual_leave_remaining = ?, annual_leave_pay_auto = ?, annual_leave_pay_final = ?,
           retirement_income_tax = ?,
           updated_at = NOW()
       WHERE id = ?`,
      computed.severanceAuto,
      computed.severanceAuto,
      computed.annualLeaveRemaining,
      computed.annualLeavePayAuto,
      computed.annualLeavePayAuto,
      computed.retirementIncomeTaxAuto,
      id,
    );

    const updated = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', id);
    res.json({ ...updated, tax_breakdown: computed.taxBreakdown });
  } catch (error: any) {
    console.error('POST /api/offboarding/:id/recompute error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/offboarding/:id/compute-tax — ad-hoc tax computation
// Body: { severance: number, years_of_service: number }
// ---------------------------------------------------------------------------
router.post('/:id/compute-tax', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = await dbGet('SELECT id FROM employee_offboardings WHERE id = ?', id);
    if (!existing) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    const { severance, years_of_service } = req.body as {
      severance: number;
      years_of_service: number;
    };

    if (typeof severance !== 'number' || typeof years_of_service !== 'number') {
      res.status(400).json({ error: 'severance and years_of_service must be numbers' });
      return;
    }

    const breakdown = computeSeveranceTax(severance, years_of_service);
    res.json(breakdown);
  } catch (error: any) {
    console.error('POST /api/offboarding/:id/compute-tax error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/offboarding/:id/send-email
// ---------------------------------------------------------------------------
router.post('/:id/send-email', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const record = await dbGet('SELECT * FROM employee_offboardings WHERE id = ?', id);
    if (!record) {
      res.status(404).json({ error: '퇴사 기록을 찾을 수 없습니다.' });
      return;
    }

    const recipients = await getEmailRecipients();
    const emailRecord: OffboardingRecord = {
      id: record.id,
      employee_type: record.employee_type,
      employee_name: record.employee_name,
      employee_phone: record.employee_phone,
      department: record.department,
      hire_date: record.hire_date,
      resign_date: record.resign_date,
      loss_date: record.loss_date,
      reason_code: record.reason_code,
      reason_detail: record.reason_detail,
      severance_final: Number(record.severance_final),
      annual_leave_pay_final: Number(record.annual_leave_pay_final),
      retirement_income_tax: Number(record.retirement_income_tax),
    };

    const result = await sendOffboardingNotification(emailRecord, recipients);

    if (result.ok) {
      await dbRun(
        'UPDATE employee_offboardings SET email_sent = 1, email_sent_at = NOW(), updated_at = NOW() WHERE id = ?',
        id,
      );
    }

    res.json({ ok: result.ok, sent_to: result.sent_to ?? recipients, mock: result.mock });
  } catch (error: any) {
    console.error('POST /api/offboarding/:id/send-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
