/**
 * Onboarding (입사자 관리) API — 정규직 전용
 *
 * GET    /api/onboarding                             — list with completion info
 * GET    /api/onboarding/dashboard                   — summary widget
 * GET    /api/onboarding/settings/email-recipients
 * PUT    /api/onboarding/settings/email-recipients
 * GET    /api/onboarding/export/insurance.csv        — bulk CSV export (취득신고용)
 * GET    /api/onboarding/:id                         — single record + latest contract
 * GET    /api/onboarding/:id/export.csv              — single record CSV
 * PATCH  /api/onboarding/:id                         — partial update new fields
 * POST   /api/onboarding/:id/send-email              — send onboarding notification
 */

import { Router, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendOnboardingNotification, OnboardingRecord } from '../services/onboardingEmail';
import { buildOnboardingCSV, OnboardingRecord as OnboardingCSVRecord } from '../services/insuranceExport';

const router = Router();

// ---------------------------------------------------------------------------
// Required fields for onboarding completion
// ---------------------------------------------------------------------------
const BASE_REQUIRED_FIELDS = [
  'name',
  'phone',
  'email',
  'address',
  'id_number',
  'birth_date',
  'department',
  'team',
  'role',
  'employment_type',
  'hire_date',
  'monthly_salary',
  'job_code',
  'weekly_work_hours',
  'business_registration_no',
  'bank_name',
  'bank_account',
  'bank_slip_data',
  'family_register_data',
  'resident_register_data',
  'signed_contract_url',
] as const;

const FOREIGN_EXTRA_FIELDS = ['visa_type', 'visa_expiry', 'foreign_id_card_data'] as const;

// Numeric fields where 0 means "missing"
const NUMERIC_FIELDS = new Set(['monthly_salary', 'weekly_work_hours']);

// ---------------------------------------------------------------------------
// Helper — compute missing fields for one employee row
// hasSignedContract: true if regular_labor_contracts has a signed record
// ---------------------------------------------------------------------------
function computeMissingFields(emp: any, hasSignedContract: boolean): string[] {
  const fields: string[] = [...BASE_REQUIRED_FIELDS];
  if (emp.nationality === 'FOREIGN') {
    fields.push(...FOREIGN_EXTRA_FIELDS);
  }

  const missing: string[] = [];
  for (const field of fields) {
    const val = emp[field];

    // signed_contract_url can be satisfied by a signed contract row
    if (field === 'signed_contract_url') {
      if (hasSignedContract) continue;
      if (val && String(val).trim() !== '') continue;
      missing.push(field);
      continue;
    }

    if (NUMERIC_FIELDS.has(field)) {
      if (!val || Number(val) === 0) missing.push(field);
    } else {
      if (val === null || val === undefined || String(val).trim() === '') missing.push(field);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Helper — derive onboarding_status from missing_fields (for display/reporting)
// 'pending' = many fields missing, 'ready' = few/all filled but email not sent,
// 'completed' = email sent (set explicitly)
// We read the stored value but also expose computed missing_fields.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper — read email recipients from admin_settings
// ---------------------------------------------------------------------------
async function getEmailRecipients(): Promise<string[]> {
  const row = await dbGet(
    "SELECT value FROM admin_settings WHERE key = 'onboarding_email_recipients'",
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
// Helper — enrich a single employee row with missing_fields + completion_pct
// ---------------------------------------------------------------------------
async function enrichEmployee(emp: any): Promise<any> {
  // Check if signed contract exists in regular_labor_contracts
  const signedRow = await dbGet(
    "SELECT id FROM regular_labor_contracts WHERE employee_id = ? AND status = 'signed' LIMIT 1",
    emp.id,
  );
  const hasSignedContract = !!signedRow;

  const missingFields = computeMissingFields(emp, hasSignedContract);

  const totalFields =
    BASE_REQUIRED_FIELDS.length +
    (emp.nationality === 'FOREIGN' ? FOREIGN_EXTRA_FIELDS.length : 0);
  const completionPct =
    totalFields > 0 ? Math.round(((totalFields - missingFields.length) / totalFields) * 100) : 100;

  return {
    ...emp,
    missing_fields: missingFields,
    completion_pct: completionPct,
    has_signed_contract: hasSignedContract,
  };
}

// ---------------------------------------------------------------------------
// GET /api/onboarding
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status = 'all', search } = req.query as Record<string, string>;

    let where = 'WHERE is_active = 1';
    const params: any[] = [];

    if (status !== 'all') {
      where += ' AND onboarding_status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND (name ILIKE ? OR phone ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = await dbAll(
      `SELECT id, name, phone, email, address, department, team, role,
              hire_date, is_active, resigned_at,
              nationality, employment_type, id_number, birth_date,
              bank_name, bank_account, bank_slip_data, foreign_id_card_data,
              family_register_data, resident_register_data, signed_contract_url,
              job_code, weekly_work_hours, monthly_salary, non_taxable_meal, non_taxable_vehicle,
              business_registration_no, visa_type, visa_expiry,
              onboarding_status, onboarding_email_sent, onboarding_email_sent_at
       FROM regular_employees
       ${where}
       ORDER BY
         CASE onboarding_status WHEN 'pending' THEN 0 WHEN 'ready' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
         hire_date DESC`,
      ...params,
    );

    const enriched = await Promise.all(rows.map((r) => enrichEmployee(r)));

    // Totals across ALL active employees (not filtered)
    const allRows = await dbAll(
      "SELECT onboarding_status FROM regular_employees WHERE is_active = 1",
    );
    const pendingCount = allRows.filter((r) => r.onboarding_status === 'pending').length;
    const readyCount = allRows.filter((r) => r.onboarding_status === 'ready').length;
    const completedCount = allRows.filter((r) => r.onboarding_status === 'completed').length;

    res.json({
      items: enriched,
      total: allRows.length,
      pending_count: pendingCount,
      ready_count: readyCount,
      completed_count: completedCount,
    });
  } catch (error: any) {
    console.error('GET /api/onboarding error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/onboarding/dashboard  (must come before /:id)
// ---------------------------------------------------------------------------
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const yearMonth = now.toISOString().slice(0, 7); // YYYY-MM

    const summary = await dbGet(
      `SELECT
         COUNT(*) FILTER (WHERE onboarding_status = 'pending' AND is_active = 1) AS pending_count,
         COUNT(*) FILTER (WHERE onboarding_status = 'ready'   AND is_active = 1) AS ready_count,
         COUNT(*) FILTER (
           WHERE onboarding_status = 'completed'
             AND is_active = 1
             AND TO_CHAR(onboarding_email_sent_at, 'YYYY-MM') = $1
         ) AS completed_this_month
       FROM regular_employees`,
      yearMonth,
    );

    // Check if recipients are configured
    const recipients = await getEmailRecipients();

    const recentPending = await dbAll(
      `SELECT id, name, phone, department, team, role, hire_date, onboarding_status, onboarding_email_sent
       FROM regular_employees
       WHERE is_active = 1 AND onboarding_status = 'pending'
       ORDER BY hire_date DESC
       LIMIT 5`,
    );

    res.json({
      pending_count: Number(summary?.pending_count ?? 0),
      ready_count: Number(summary?.ready_count ?? 0),
      completed_this_month: Number(summary?.completed_this_month ?? 0),
      missing_email_recipients: recipients.length === 0,
      items: recentPending,
    });
  } catch (error: any) {
    console.error('GET /api/onboarding/dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/onboarding/settings/email-recipients  (must come before /:id)
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
// PUT /api/onboarding/settings/email-recipients
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
       VALUES ('onboarding_email_recipients', ?, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      value,
    );

    res.json({ emails });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Helper — map regular_employees row to OnboardingCSVRecord
// ---------------------------------------------------------------------------
function toOnboardingCSVRecord(emp: any): OnboardingCSVRecord {
  return {
    id: emp.id,
    name: emp.name,
    id_number: emp.id_number || '',
    hire_date: emp.hire_date || '',
    monthly_salary: Number(emp.monthly_salary || 0),
    job_code: emp.job_code || '',
    weekly_work_hours: Number(emp.weekly_work_hours || 40),
    nationality: emp.nationality || 'KR',
    visa_type: emp.visa_type || '',
    visa_expiry: emp.visa_expiry || '',
    phone: emp.phone || '',
    address: emp.address || '',
    email: emp.email || '',
    business_registration_no: emp.business_registration_no || '',
  };
}

// ---------------------------------------------------------------------------
// GET /api/onboarding/export/insurance.csv  (must come before /:id)
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
        `SELECT * FROM regular_employees WHERE is_active = 1 AND id IN (${placeholders})`,
        ...idList,
      );
    } else {
      // Default: all 'ready' (정보 완료, 미발송) records
      rows = await dbAll(
        "SELECT * FROM regular_employees WHERE is_active = 1 AND onboarding_status = 'ready' ORDER BY hire_date DESC",
      );
    }

    const csvRecords = rows.map(toOnboardingCSVRecord);
    const csv = buildOnboardingCSV(csvRecords);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''%EC%B7%A8%EB%93%9D%EC%8B%A0%EA%B3%A0_${dateStr}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('GET /api/onboarding/export/insurance.csv error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/onboarding/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const emp = await dbGet('SELECT * FROM regular_employees WHERE id = ?', id);
    if (!emp) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
      return;
    }

    const latestContract = await dbGet(
      `SELECT id, status, contract_start, contract_end, signature_data, created_at
       FROM regular_labor_contracts
       WHERE employee_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      id,
    );

    const enriched = await enrichEmployee(emp);
    res.json({ ...enriched, latest_contract: latestContract || null });
  } catch (error: any) {
    console.error('GET /api/onboarding/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/onboarding/:id/export.csv — single record CSV
// ---------------------------------------------------------------------------
router.get('/:id/export.csv', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const emp = await dbGet('SELECT * FROM regular_employees WHERE id = ?', id);
    if (!emp) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
      return;
    }

    const csvRecord = toOnboardingCSVRecord(emp);
    const csv = buildOnboardingCSV([csvRecord]);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''%EC%B7%A8%EB%93%9D%EC%8B%A0%EA%B3%A0_${id}_${dateStr}.csv`);
    res.send(csv);
  } catch (error: any) {
    console.error('GET /api/onboarding/:id/export.csv error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/onboarding/:id
// ---------------------------------------------------------------------------
const PATCHABLE_ONBOARDING_FIELDS = new Set([
  'email',
  'address',
  'nationality',
  'visa_type',
  'visa_expiry',
  'business_registration_no',
  'monthly_salary',
  'non_taxable_meal',
  'non_taxable_vehicle',
  'job_code',
  'weekly_work_hours',
  'employment_type',
  'bank_slip_data',
  'foreign_id_card_data',
  'family_register_data',
  'resident_register_data',
  'signed_contract_url',
  'onboarding_status',
]);

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const existing = await dbGet('SELECT id FROM regular_employees WHERE id = ?', id);
    if (!existing) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, val] of Object.entries(req.body)) {
      if (PATCHABLE_ONBOARDING_FIELDS.has(key)) {
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
      `UPDATE regular_employees SET ${setClauses.join(', ')} WHERE id = ?`,
      ...params,
    );

    const updated = await dbGet('SELECT * FROM regular_employees WHERE id = ?', id);
    const enriched = await enrichEmployee(updated);
    res.json(enriched);
  } catch (error: any) {
    console.error('PATCH /api/onboarding/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/:id/send-email
// ---------------------------------------------------------------------------
router.post('/:id/send-email', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const emp = await dbGet('SELECT * FROM regular_employees WHERE id = ?', id);
    if (!emp) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
      return;
    }

    const { override = false } = req.body as { override?: boolean };

    if (!override) {
      const signedRow = await dbGet(
        "SELECT id FROM regular_labor_contracts WHERE employee_id = ? AND status = 'signed' LIMIT 1",
        id,
      );
      const missingFields = computeMissingFields(emp, !!signedRow);
      if (missingFields.length > 0) {
        res.status(400).json({
          error: `필수 정보가 누락되어 있습니다. 누락 항목: ${missingFields.join(', ')}`,
          missing_fields: missingFields,
        });
        return;
      }
    }

    const recipients = await getEmailRecipients();

    const emailRecord: OnboardingRecord = {
      id: emp.id,
      name: emp.name,
      phone: emp.phone || '',
      email: emp.email || '',
      address: emp.address || '',
      id_number: emp.id_number || '',
      birth_date: emp.birth_date || '',
      department: emp.department || '',
      team: emp.team || '',
      role: emp.role || '',
      hire_date: emp.hire_date || '',
      nationality: emp.nationality || 'KR',
      visa_type: emp.visa_type || '',
      visa_expiry: emp.visa_expiry || '',
      employment_type: emp.employment_type || 'regular',
      monthly_salary: Number(emp.monthly_salary || 0),
      non_taxable_meal: Number(emp.non_taxable_meal || 0),
      non_taxable_vehicle: Number(emp.non_taxable_vehicle || 0),
      job_code: emp.job_code || '',
      weekly_work_hours: Number(emp.weekly_work_hours || 40),
      business_registration_no: emp.business_registration_no || '',
      bank_name: emp.bank_name || '',
      bank_account: emp.bank_account || '',
      bank_slip_data: emp.bank_slip_data || '',
      foreign_id_card_data: emp.foreign_id_card_data || '',
      family_register_data: emp.family_register_data || '',
      resident_register_data: emp.resident_register_data || '',
      signed_contract_url: emp.signed_contract_url || '',
    };

    const result = await sendOnboardingNotification(emailRecord, recipients);

    if (result.ok) {
      await dbRun(
        `UPDATE regular_employees
         SET onboarding_email_sent = 1,
             onboarding_email_sent_at = NOW(),
             onboarding_status = 'completed',
             updated_at = NOW()
         WHERE id = ?`,
        id,
      );
    }

    res.json({ ok: result.ok, sent_to: result.sent_to ?? recipients, mock: result.mock });
  } catch (error: any) {
    console.error('POST /api/onboarding/:id/send-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
