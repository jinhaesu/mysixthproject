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
import { dbGet, dbAll, dbRun, getFrontendUrl } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendOnboardingNotification, OnboardingRecord } from '../services/onboardingEmail';
import { buildOnboardingCSV, OnboardingRecord as OnboardingCSVRecord } from '../services/insuranceExport';
import { sendGeneralSms } from '../services/smsService';

const router = Router();

// ---------------------------------------------------------------------------
// Required fields for onboarding completion
// ---------------------------------------------------------------------------
// 한국인 + 외국인 모두 필요한 공통 필드
const COMMON_REQUIRED_FIELDS = [
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
  'signed_contract_url',
] as const;

// 한국인 전용 (외국인 발급 불가)
const KOREAN_ONLY_FIELDS = ['family_register_data', 'resident_register_data'] as const;

// 외국인 전용
const FOREIGN_EXTRA_FIELDS = ['visa_type', 'visa_expiry', 'foreign_id_card_data'] as const;

// Numeric fields where 0 means "missing"
const NUMERIC_FIELDS = new Set(['monthly_salary', 'weekly_work_hours']);

// ---------------------------------------------------------------------------
// Helper — compute missing fields for one employee row
// hasSignedContract: true if regular_labor_contracts has a signed record
// hasSalarySettings: true if regular_salary_settings 의 base_pay 등이 등록됨 → monthly_salary 충족으로 간주
// companyDefaults: { job_code?, business_registration_no?, weekly_work_hours? } — 회사 기본값 fallback
// ---------------------------------------------------------------------------
function computeMissingFields(
  emp: any,
  hasSignedContract: boolean,
  hasSalarySettings: boolean,
  companyDefaults: { job_code?: string; business_registration_no?: string; weekly_work_hours?: number } = {},
): string[] {
  const fields: string[] = [...COMMON_REQUIRED_FIELDS];
  if (emp.nationality === 'FOREIGN') {
    fields.push(...FOREIGN_EXTRA_FIELDS);
  } else {
    // 한국인 (또는 미지정 default 'KR') 만 주민등록등본/가족관계증명서 검사
    fields.push(...KOREAN_ONLY_FIELDS);
  }

  const missing: string[] = [];
  for (const field of fields) {
    const val = emp[field];

    // signed_contract_url: 서명된 계약서 row 가 있으면 충족
    if (field === 'signed_contract_url') {
      if (hasSignedContract) continue;
      if (val && String(val).trim() !== '') continue;
      missing.push(field);
      continue;
    }

    // monthly_salary: regular_salary_settings 에 등록되어 있으면 충족
    if (field === 'monthly_salary') {
      if (hasSalarySettings) continue;
      if (val && Number(val) > 0) continue;
      missing.push(field);
      continue;
    }

    // 회사 기본값 fallback 적용 필드
    if (field === 'job_code' && (val === null || val === undefined || String(val).trim() === '')) {
      if (companyDefaults.job_code) continue;
      missing.push(field); continue;
    }
    if (field === 'business_registration_no' && (val === null || val === undefined || String(val).trim() === '')) {
      if (companyDefaults.business_registration_no) continue;
      missing.push(field); continue;
    }
    if (field === 'weekly_work_hours' && (!val || Number(val) === 0)) {
      if (companyDefaults.weekly_work_hours && Number(companyDefaults.weekly_work_hours) > 0) continue;
      missing.push(field); continue;
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
// 회사 기본값 (admin_settings 에 JSON 저장)
type CompanyDefaults = { job_code?: string; business_registration_no?: string; weekly_work_hours?: number };
async function getCompanyDefaults(): Promise<CompanyDefaults> {
  const row = await dbGet(
    "SELECT value FROM admin_settings WHERE key = 'onboarding_company_defaults'",
  );
  if (!row) return {};
  try { return JSON.parse(row.value) || {}; } catch { return {}; }
}

// 단일 직원 row 를 enrich. signed contract 존재 여부는 별도 쿼리로 (단건 조회용).
async function enrichEmployee(emp: any): Promise<any> {
  const [signedRow, salaryRow, defaults] = await Promise.all([
    dbGet("SELECT id FROM regular_labor_contracts WHERE employee_id = ? AND status = 'signed' LIMIT 1", emp.id),
    dbGet("SELECT base_pay, meal_allowance, position_allowance, other_allowance, bonus FROM regular_salary_settings WHERE employee_id = ?", emp.id),
    getCompanyDefaults(),
  ]);
  const hasSignedContract = !!signedRow;
  const hasSalarySettings = !!(salaryRow && (Number(salaryRow.base_pay) || 0) > 0);
  return enrichEmployeeSync(emp, hasSignedContract, hasSalarySettings, defaults);
}

// 동기 enrich — list 쿼리에서 boolean 값들이 같이 SELECT되어 N+1 제거됨
function enrichEmployeeSync(
  emp: any,
  hasSignedContract: boolean,
  hasSalarySettings: boolean = false,
  companyDefaults: CompanyDefaults = {},
): any {
  // 큰 Base64 필드는 list 쿼리에서 boolean으로 변환되어 옴.
  // computeMissingFields 는 string 빈값 체크 — boolean 을 string 으로 proxy 변환.
  const proxy = {
    ...emp,
    bank_slip_data: emp.has_bank_slip ? 'X' : '',
    foreign_id_card_data: emp.has_foreign_id ? 'X' : '',
    family_register_data: emp.has_family_register ? 'X' : '',
    resident_register_data: emp.has_resident_register ? 'X' : '',
    signed_contract_url: emp.has_signed_contract_url ? 'X' : '',
  };
  const missingFields = computeMissingFields(proxy, hasSignedContract, hasSalarySettings, companyDefaults);

  // 외국인은 한국인 전용 필드(주민등록등본/가족관계증명서) 검사 안함
  const totalFields =
    COMMON_REQUIRED_FIELDS.length +
    (emp.nationality === 'FOREIGN' ? FOREIGN_EXTRA_FIELDS.length : KOREAN_ONLY_FIELDS.length);
  const completionPct =
    totalFields > 0 ? Math.round(((totalFields - missingFields.length) / totalFields) * 100) : 100;

  // 응답 body 크기 줄이기: 큰 *_data 필드 제거, has_* boolean 만 노출
  const {
    bank_slip_data: _, foreign_id_card_data: __, family_register_data: ___,
    resident_register_data: ____, signed_contract_url: _____,
    has_bank_slip, has_foreign_id, has_family_register, has_resident_register, has_signed_contract_url,
    ...slim
  } = emp;
  void _; void __; void ___; void ____; void _____;

  return {
    ...slim,
    has_bank_slip: !!has_bank_slip,
    has_foreign_id: !!has_foreign_id,
    has_family_register: !!has_family_register,
    has_resident_register: !!has_resident_register,
    has_signed_contract_url: !!has_signed_contract_url,
    has_salary_settings: !!hasSalarySettings,
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

    let where = 'WHERE re.is_active = 1';
    const params: any[] = [];

    if (status !== 'all') {
      where += ' AND re.onboarding_status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND (re.name ILIKE ? OR re.phone ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // N+1 제거: has_signed_contract 를 list 쿼리에 같이 합쳐서 단일 쿼리로 처리.
    // 큰 Base64 필드 (bank_slip_data, foreign_id_card_data 등)는 boolean has_* 로 변환해서
    // 응답 body 크기를 수십 MB → 수백 KB 수준으로 축소.
    // salary_settings(base_pay > 0) 도 LEFT JOIN으로 통합 → 별도 쿼리 없이 monthly_salary 충족 여부 판단
    const rows = await dbAll(
      `SELECT re.id, re.name, re.phone, re.email, re.address, re.department, re.team, re.role,
              re.hire_date, re.is_active, re.resigned_at,
              re.nationality, re.employment_type, re.id_number, re.birth_date,
              re.bank_name, re.bank_account,
              (re.bank_slip_data IS NOT NULL AND re.bank_slip_data <> '')                 AS has_bank_slip,
              (re.foreign_id_card_data IS NOT NULL AND re.foreign_id_card_data <> '')     AS has_foreign_id,
              (re.family_register_data IS NOT NULL AND re.family_register_data <> '')     AS has_family_register,
              (re.resident_register_data IS NOT NULL AND re.resident_register_data <> '') AS has_resident_register,
              (re.signed_contract_url IS NOT NULL AND re.signed_contract_url <> '')       AS has_signed_contract_url,
              re.job_code, re.weekly_work_hours, re.monthly_salary,
              re.non_taxable_meal, re.non_taxable_vehicle,
              re.business_registration_no, re.visa_type, re.visa_expiry,
              re.onboarding_status, re.onboarding_email_sent, re.onboarding_email_sent_at,
              EXISTS(SELECT 1 FROM regular_labor_contracts rlc WHERE rlc.employee_id = re.id AND rlc.status = 'signed') AS has_signed_contract_row,
              COALESCE((SELECT (base_pay::numeric > 0) FROM regular_salary_settings WHERE employee_id = re.id LIMIT 1), false) AS has_salary_settings_row
       FROM regular_employees re
       ${where}
       ORDER BY
         CASE re.onboarding_status WHEN 'pending' THEN 0 WHEN 'ready' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
         re.hire_date DESC`,
      ...params,
    );

    const defaults = await getCompanyDefaults();
    const enriched = rows.map((r) => enrichEmployeeSync(r, !!r.has_signed_contract_row, !!r.has_salary_settings_row, defaults));

    // 카운트 쿼리도 단일 aggregation 으로
    const cnt = await dbGet(
      `SELECT
         COUNT(*)::int AS total,
         SUM(CASE WHEN onboarding_status='pending'   THEN 1 ELSE 0 END)::int AS pending_count,
         SUM(CASE WHEN onboarding_status='ready'     THEN 1 ELSE 0 END)::int AS ready_count,
         SUM(CASE WHEN onboarding_status='completed' THEN 1 ELSE 0 END)::int AS completed_count
       FROM regular_employees WHERE is_active = 1`
    );

    res.json({
      items: enriched,
      total: cnt?.total ?? 0,
      pending_count: cnt?.pending_count ?? 0,
      ready_count: cnt?.ready_count ?? 0,
      completed_count: cnt?.completed_count ?? 0,
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
// 회사 기본값 (직종코드·사업장관리번호·소정근로시간) — 누락 검사 fallback + 일괄 적용
// ---------------------------------------------------------------------------
router.get('/settings/company-defaults', async (_req: AuthRequest, res: Response) => {
  try { res.json(await getCompanyDefaults()); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/settings/company-defaults', async (req: AuthRequest, res: Response) => {
  try {
    const { job_code, business_registration_no, weekly_work_hours } = req.body || {};
    const payload: CompanyDefaults = {};
    if (typeof job_code === 'string') payload.job_code = job_code.trim();
    if (typeof business_registration_no === 'string') payload.business_registration_no = business_registration_no.trim();
    if (weekly_work_hours !== undefined && weekly_work_hours !== null && weekly_work_hours !== '') {
      payload.weekly_work_hours = Number(weekly_work_hours);
    }
    await dbRun(
      `INSERT INTO admin_settings (key, value, updated_at)
       VALUES ('onboarding_company_defaults', ?, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      JSON.stringify(payload),
    );
    res.json(payload);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// POST /api/onboarding/settings/company-defaults/apply-all
// 회사 기본값을 비어있는 모든 직원에게 일괄 적용 (이미 값이 있는 직원은 건드리지 않음)
router.post('/settings/company-defaults/apply-all', async (_req: AuthRequest, res: Response) => {
  try {
    const defaults = await getCompanyDefaults();
    if (!defaults.job_code && !defaults.business_registration_no && !defaults.weekly_work_hours) {
      res.status(400).json({ error: '회사 기본값이 설정되어 있지 않습니다.' });
      return;
    }
    const clauses: string[] = [];
    const params: any[] = [];
    if (defaults.job_code) {
      clauses.push("job_code = CASE WHEN COALESCE(job_code, '') = '' THEN ? ELSE job_code END");
      params.push(defaults.job_code);
    }
    if (defaults.business_registration_no) {
      clauses.push("business_registration_no = CASE WHEN COALESCE(business_registration_no, '') = '' THEN ? ELSE business_registration_no END");
      params.push(defaults.business_registration_no);
    }
    if (defaults.weekly_work_hours) {
      clauses.push("weekly_work_hours = CASE WHEN COALESCE(weekly_work_hours, 0) = 0 THEN ? ELSE weekly_work_hours END");
      params.push(defaults.weekly_work_hours);
    }
    clauses.push('updated_at = NOW()');
    const result = await dbRun(
      `UPDATE regular_employees SET ${clauses.join(', ')} WHERE is_active = 1`,
      ...params,
    );
    res.json({ success: true, updated: result.changes });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
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
      const [signedRow, salaryRow, defaults] = await Promise.all([
        dbGet("SELECT id FROM regular_labor_contracts WHERE employee_id = ? AND status = 'signed' LIMIT 1", id),
        dbGet("SELECT base_pay FROM regular_salary_settings WHERE employee_id = ?", id),
        getCompanyDefaults(),
      ]);
      const hasSalarySettings = !!(salaryRow && (Number(salaryRow.base_pay) || 0) > 0);
      const missingFields = computeMissingFields(emp, !!signedRow, hasSalarySettings, defaults);
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

// ---------------------------------------------------------------------------
// POST /api/onboarding/bulk-send-links
// Body: { ids: number[] }
// SMS contains a /regular-contract URL with a *contract* token (regular_labor_contracts.token).
// If no contract exists yet, create an empty pending contract so the employee can fill in info.
// ---------------------------------------------------------------------------
router.post('/bulk-send-links', async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }

    let sent = 0;
    const failed: { id: number; error: string }[] = [];

    for (const id of ids) {
      try {
        const emp = await dbGet(
          'SELECT id, name, phone, token FROM regular_employees WHERE id = ? AND is_active = 1',
          id,
        );
        if (!emp) { failed.push({ id, error: '직원을 찾을 수 없습니다.' }); continue; }
        if (!emp.phone) { failed.push({ id, error: '전화번호가 없습니다.' }); continue; }
        if (!emp.token) { failed.push({ id, error: '직원 토큰이 없습니다.' }); continue; }

        // Send link to dedicated /onboarding-info page (uses regular_employees.token).
        // This is SEPARATE from the formal contract signing flow at /regular-contract
        // which is initiated from 근무자 DB by an admin entering salary/work conditions.
        const url = getFrontendUrl(`/onboarding-info?token=${emp.token}`);
        const message = `[조인앤조인 정보 입력]\n${emp.name}님, 4대보험 신고에 필요한 추가 정보(이메일·통장사본·외국인 정보 등) 입력 부탁드립니다.\n근로계약서와는 별개입니다.\n${url}`;
        const result = await sendGeneralSms(emp.phone, message);

        if (result.success) {
          sent++;
        } else {
          failed.push({ id, error: result.error || '발송 실패' });
        }
      } catch (err: any) {
        failed.push({ id, error: err.message || String(err) });
      }
    }

    res.json({ ok: true, sent, failed });
  } catch (error: any) {
    console.error('POST /api/onboarding/bulk-send-links error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/bulk-update
// Body: { ids: number[], updates: { monthly_salary?, job_code?, ... } }
// ---------------------------------------------------------------------------
const BULK_UPDATE_ALLOWED_FIELDS = new Set([
  'monthly_salary',
  'job_code',
  'business_registration_no',
  'non_taxable_meal',
  'non_taxable_vehicle',
  'weekly_work_hours',
  'employment_type',
]);

router.post('/bulk-update', async (req: AuthRequest, res: Response) => {
  try {
    const { ids, updates } = req.body as {
      ids: number[];
      updates: Record<string, any>;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids must be a non-empty array' });
      return;
    }
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ error: 'updates object is required' });
      return;
    }

    // Build SET clause from allowed fields only
    const setClauses: string[] = [];
    const updateParams: any[] = [];
    for (const [key, val] of Object.entries(updates)) {
      if (BULK_UPDATE_ALLOWED_FIELDS.has(key) && val !== undefined) {
        setClauses.push(`${key} = ?`);
        updateParams.push(val);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    setClauses.push('updated_at = NOW()');

    let updated = 0;
    for (const id of ids) {
      const result = await dbRun(
        `UPDATE regular_employees SET ${setClauses.join(', ')} WHERE id = ?`,
        ...updateParams,
        id,
      );
      updated += result.changes;
    }

    res.json({ ok: true, updated });
  } catch (error: any) {
    console.error('POST /api/onboarding/bulk-update error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
