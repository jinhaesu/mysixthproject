import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate, getKSTTimestamp, getBusinessDate, normalizePhone, getFrontendUrl } from '../db';
import { isWithinRadius, calculateDistance } from '../services/gpsService';
import { sendGeneralSms } from '../services/smsService';
import { uploadBase64, getSignedUrl, isStorageEnabled, shouldUseStorage } from '../services/fileStorage';
import safetyPublicRouter, { isSafetyGatedEmployee } from './safetyPublic';
import { checkHealthCertGate, isHealthCertRequired } from './healthPublic';
import { checkTrainingSurveyGate } from './trainingPublic';

const router = Router();

// regular_employees 의 Base64 blob 컬럼 제외 — SELECT * 가 TOAST 디토스팅 유발해 stuck.
const EMP_COLS = `
  id, phone, name, token, department, team, role, workplace_id,
  is_active, created_at, updated_at,
  hire_date, resign_date, resigned_at,
  bank_name, bank_account, id_number, name_en,
  personal_info_completed,
  birth_date, email, address, nationality, visa_type, visa_expiry,
  business_registration_no, monthly_salary, non_taxable_meal, non_taxable_vehicle,
  job_code, weekly_work_hours, employment_type,
  onboarding_status, onboarding_completed_at, onboarding_email_sent, onboarding_email_sent_at,
  signed_contract_url
`;

// In-memory OTP store: key = token, value = { code, phone, expiresAt }
const otpStore = new Map<string, { code: string; phone: string; expiresAt: number }>();

/**
 * 첨부파일 업로드 처리 — base64 입력을 Storage 로 옮길지 base64 로 둘지 판단.
 *
 * @param scope 'employees' | 'contracts' — Storage 폴더 prefix
 * @param refId DB row id
 * @param field 'bank_slip' | 'foreign_id_card' | 'scanned_file' 등
 * @param value 입력된 base64 data URL (또는 undefined)
 * @returns { data, path } — UPDATE 절에 그대로 쓸 두 컬럼 값.
 *          value 가 undefined 면 null/null 반환 (caller 가 skip 판단).
 */
async function ingestBlob(
  scope: 'employees' | 'contracts' | 'offboardings',
  refId: number,
  field: string,
  value: string | undefined,
): Promise<{ data: string; path: string } | null> {
  if (value === undefined) return null;
  if (value === '') return { data: '', path: '' };   // 명시적 clear
  // Storage 가 enabled 이고 첨부파일이 충분히 크면 → Storage 로
  if (isStorageEnabled() && shouldUseStorage(value)) {
    try {
      const { path } = await uploadBase64(`${scope}/${refId}/${field}`, value);
      return { data: '', path };
    } catch (e: any) {
      console.error(`[Storage] upload failed (${scope}/${refId}/${field}):`, e.message);
      // fallback — base64 로 DB 에 저장 (legacy 동작 유지)
      return { data: value, path: '' };
    }
  }
  // Storage 미설정 또는 작은 파일 → DB 에 base64 유지
  return { data: value, path: '' };
}

/**
 * SELECT 결과의 *_path 컬럼이 있으면 signed URL 로 변환해서 *_data 자리에 대입.
 * 프론트엔드는 *_data 필드 한 곳만 보면 됨 (URL or base64).
 */
async function expandBlobUrls<T extends Record<string, any>>(row: T, fields: { data: string; path: string }[]): Promise<T> {
  if (!row) return row;
  for (const { data, path } of fields) {
    const p = row[path];
    if (p && typeof p === 'string') {
      try {
        const url = await getSignedUrl(p);
        if (url) (row as any)[data] = url;
      } catch (e: any) {
        console.error(`[Storage] signed URL failed (${p}):`, e.message);
      }
    }
  }
  return row;
}

// GET /api/regular-public/_health - Deploy/version verification (no auth)
// Returns current server time, business date, calendar date to verify 07:00 boundary is active.
router.get('/_health', async (_req: Request, res: Response) => {
  const now = new Date();
  res.json({
    server_utc: now.toISOString(),
    kst_calendar_date: getKSTDate(),
    kst_business_date: getBusinessDate(),
    business_day_start_hour: 7,
    build_marker: 'bdate-v1', // bump this to verify new deploys
  });
});

// POST /api/regular-public/:token/vacation - Request vacation (no GPS needed)
router.post('/:token/vacation', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { start_date, end_date, days, reason, type } = req.body;

    if (!start_date || !end_date || !days) {
      res.status(400).json({ error: '휴가 시작일, 종료일, 일수는 필수입니다.' });
      return;
    }

    const employee = await dbGet(`SELECT ${EMP_COLS} FROM regular_employees WHERE token = ? AND is_active = 1`, token) as any;
    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }

    const reqType = type || '연차';
    // 공가(민방위/예비군/투표 등 법정 유급 공가)는 연차 잔여에서 차감하지 않음 → 잔여 검증 생략
    const isPublicLeave = reqType.includes('공가');

    if (!isPublicLeave) {
      // Check remaining balance (연차/반차만)
      const year = parseInt(start_date.slice(0, 4));
      const balance = await dbGet('SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', employee.id, year) as any;
      const remaining = balance ? (parseFloat(balance.total_days) - parseFloat(balance.used_days)) : 0;

      // Count pending requests too (공가는 제외)
      const pendingResult = await dbGet(
        "SELECT COALESCE(SUM(days), 0) as pending_days FROM regular_vacation_requests WHERE employee_id = ? AND status = 'pending' AND start_date LIKE ? AND COALESCE(type, '연차') NOT LIKE '%공가%'",
        employee.id, `${year}%`
      ) as any;
      const pendingDays = parseFloat(pendingResult?.pending_days || 0);

      if (parseFloat(days) > (remaining - pendingDays)) {
        res.status(400).json({ error: `잔여 휴가가 부족합니다. (잔여: ${remaining - pendingDays}일)` });
        return;
      }
    }

    await dbRun(
      'INSERT INTO regular_vacation_requests (employee_id, start_date, end_date, days, reason, type) VALUES (?, ?, ?, ?, ?, ?)',
      employee.id, start_date, end_date, days, reason || '', reqType
    );

    res.json({ success: true, message: '휴가 신청이 완료되었습니다. 관리자 승인을 기다려주세요.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular-public/:token/vacations - Get my vacation requests
router.get('/:token/vacations', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const employee = await dbGet(`SELECT ${EMP_COLS} FROM regular_employees WHERE token = ? AND is_active = 1`, token) as any;
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }

    const year = new Date().getFullYear();
    const balance = await dbGet('SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', employee.id, year) as any;
    const requests = await dbAll('SELECT * FROM regular_vacation_requests WHERE employee_id = ? ORDER BY created_at DESC', employee.id);

    res.json({
      balance: balance ? { total: parseFloat(balance.total_days), used: parseFloat(balance.used_days) } : { total: 0, used: 0 },
      requests,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Onboarding info (입사자 추가 정보 수집) — operates on regular_employees only.
// Distinct from contract signing flow which operates on regular_labor_contracts.
// ───────────────────────────────────────────────────────────────────────────

// Map of fields admin should manage vs employee fills via SMS link
const EMPLOYEE_FIELDS = ['email','address','id_number','birth_date','bank_name','bank_account','bank_slip_data'] as const;
const FOREIGN_FIELDS = ['visa_type','visa_expiry','foreign_id_card_data'] as const;

router.get('/:emp_token/onboarding-info', async (req: Request, res: Response) => {
  try {
    const { emp_token } = req.params;
    const emp = await dbGet(
      `SELECT id, name, phone, hire_date, department, team, role,
              email, address, id_number, birth_date, bank_name, bank_account, bank_slip_data,
              nationality, visa_type, visa_expiry, foreign_id_card_data
       FROM regular_employees WHERE token = ? AND is_active = 1`,
      emp_token,
    ) as any;
    if (!emp) { res.status(404).json({ error: '유효하지 않은 링크입니다.' }); return; }

    const isForeign = emp.nationality === 'FOREIGN';
    const required = [...EMPLOYEE_FIELDS, ...(isForeign ? FOREIGN_FIELDS : [])];
    const missing = required.filter(f => {
      const v = (emp as any)[f];
      return v === null || v === undefined || String(v).trim() === '';
    });
    res.json({ ...emp, missing_fields: missing, complete: missing.length === 0 });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/:emp_token/onboarding-info', async (req: Request, res: Response) => {
  try {
    const { emp_token } = req.params;
    const emp = await dbGet('SELECT id, name FROM regular_employees WHERE token = ? AND is_active = 1', emp_token) as any;
    if (!emp) { res.status(404).json({ error: '유효하지 않은 링크입니다.' }); return; }

    const body = req.body || {};
    // 일반 필드 (text)
    const textFields = ['email','address','id_number','birth_date','bank_name','bank_account','nationality','visa_type','visa_expiry'];
    // blob 필드 (Storage 분기)
    const blobFields: { name: string; field: string }[] = [
      { name: 'bank_slip_data',       field: 'bank_slip' },
      { name: 'foreign_id_card_data', field: 'foreign_id_card' },
    ];

    const clauses: string[] = [];
    const params: any[] = [];

    for (const f of textFields) {
      const v = body[f];
      if (v !== undefined && String(v).trim() !== '') {
        clauses.push(`${f} = ?`);
        params.push(v);
      }
    }
    for (const { name, field } of blobFields) {
      const v = body[name];
      const result = await ingestBlob('employees', emp.id, field, v);
      if (result) {
        clauses.push(`${name} = ?`, `${field}_path = ?`);
        params.push(result.data, result.path);
      }
    }

    if (clauses.length === 0) { res.status(400).json({ error: '입력된 정보가 없습니다.' }); return; }
    clauses.push('updated_at = NOW()');
    params.push(emp.id);

    console.log(`[onboarding-info] ${emp.name} (#${emp.id}) — fields=${clauses.length - 1}`);

    await dbRun(`UPDATE regular_employees SET ${clauses.join(', ')} WHERE id = ?`, ...params);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[onboarding-info] DB 오류:', error?.code, error?.message);
    res.status(500).json({ error: error?.message || '저장 중 오류가 발생했습니다.' });
  }
});

// POST /api/regular-public/:emp_token/get-or-create-contract  — DEPRECATED.
// 정보수집 흐름은 /api/regular-public/:emp_token/onboarding-info 로 분리됨.
// 빈 계약서 자동 생성은 데이터 오염 우려로 차단. 근로계약서는 admin이 근무자 DB에서
// 명시적으로 contract_start / contract_end 와 함께 발송해야 함.
router.post('/:emp_token/get-or-create-contract', async (_req: Request, res: Response) => {
  res.status(410).json({ error: '이 경로는 폐기되었습니다. /onboarding-info 페이지를 사용하세요.' });
});

// GET /api/regular-public/contract/:token - Get contract for signing
router.get('/contract/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    // LEFT JOIN — 직원이 hard-delete 되거나 employee_id 가 0/null 이어도 계약서 자체는 조회 가능.
    // 이전 INNER JOIN 은 직원 삭제 시 not found 로 처리되어 '보기' 실패.
    // detail 조회 — 서명/통장사본/외국인등록증 등 BLOB 포함 (1행이므로 안전).
    // worker_name 은 frontend 가 contract.worker_name 으로 사용하므로 그대로 유지 + name alias 둘 다 노출.
    const contract = await dbGet(`
      SELECT rlc.id, rlc.employee_id, rlc.phone,
             rlc.worker_name, rlc.worker_name as name,
             rlc.contract_start, rlc.contract_end, rlc.status, rlc.token,
             rlc.sms_sent, rlc.created_at, rlc.created_at as updated_at, rlc.work_start_date,
             rlc.position_title, rlc.annual_salary, rlc.base_pay, rlc.meal_allowance,
             rlc.other_allowance, rlc.pay_day, rlc.work_hours, rlc.work_place,
             COALESCE(rlc.contract_kind, 'production') as contract_kind,
             COALESCE(rlc.work_duties, '') as work_duties,
             COALESCE(rlc.work_days, '') as work_days,
             COALESCE(rlc.break_time, '') as break_time,
             rlc.department as contract_department, rlc.email, rlc.nationality,
             rlc.visa_type, rlc.visa_expiry,
             rlc.address, rlc.birth_date, rlc.id_number,
             rlc.signature_data, rlc.consent_signature_data, rlc.consent_signed,
             -- 첨부파일: contract 우선, 없으면 employee 로 fallback. data + path 둘 다 가져옴.
             COALESCE(NULLIF(rlc.bank_slip_data, ''), re.bank_slip_data, '') as bank_slip_data,
             COALESCE(NULLIF(rlc.bank_slip_path, ''), re.bank_slip_path, '') as bank_slip_path,
             COALESCE(NULLIF(rlc.foreign_id_card_data, ''), re.foreign_id_card_data, '') as foreign_id_card_data,
             COALESCE(NULLIF(rlc.foreign_id_card_path, ''), re.foreign_id_card_path, '') as foreign_id_card_path,
             COALESCE(rlc.is_legacy_scan, 0) as is_legacy_scan,
             COALESCE(rlc.legacy_filename, '') as legacy_filename,
             COALESCE(rlc.scanned_file_data, '') as scanned_file_data,
             COALESCE(rlc.scanned_file_path, '') as scanned_file_path,
             COALESCE(re.department, '') as department,
             COALESCE(re.team, '') as team,
             COALESCE(re.role, '') as role,
             COALESCE(re.bank_name, '') as bank_name,
             COALESCE(re.bank_account, '') as bank_account
      FROM regular_labor_contracts rlc
      LEFT JOIN regular_employees re ON rlc.employee_id = re.id
      WHERE rlc.token = ?
    `, token) as any;
    if (!contract) { res.status(404).json({ error: '유효하지 않은 링크입니다.' }); return; }
    // Storage path 가 있는 필드 → signed URL 로 *_data 자리에 덮어쓰기
    await expandBlobUrls(contract, [
      { data: 'bank_slip_data',       path: 'bank_slip_path' },
      { data: 'foreign_id_card_data', path: 'foreign_id_card_path' },
      { data: 'scanned_file_data',    path: 'scanned_file_path' },
    ]);
    res.json(contract);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/contract/:token/update-info
// Update onboarding-related info fields WITHOUT requiring signature.
// Allowed even on already-signed contracts. Used by /regular-contract?mode=onboarding-fix.
router.post('/contract/:token/update-info', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const {
      email, address, id_number, birth_date,
      nationality, visa_type, visa_expiry,
      bank_slip_data, foreign_id_card_data,
      bank_name, bank_account,
    } = req.body || {};

    const contract = await dbGet('SELECT id, employee_id, phone FROM regular_labor_contracts WHERE token = ?', token) as any;
    if (!contract) { res.status(404).json({ error: '유효하지 않은 링크입니다.' }); return; }

    // Build dynamic UPDATE for regular_labor_contracts (only non-empty fields)
    const cClauses: string[] = [];
    const cParams: any[] = [];
    const setIf = (col: string, val: any) => {
      if (val !== undefined && val !== '') { cClauses.push(`${col} = ?`); cParams.push(val); }
    };
    setIf('email', email);
    setIf('address', address);
    setIf('id_number', id_number);
    setIf('birth_date', birth_date);
    setIf('nationality', nationality);
    setIf('visa_type', visa_type);
    setIf('visa_expiry', visa_expiry);
    // blob → Storage 분기
    for (const [name, field, val] of [
      ['bank_slip_data',       'bank_slip',       bank_slip_data],
      ['foreign_id_card_data', 'foreign_id_card', foreign_id_card_data],
    ] as const) {
      const result = await ingestBlob('contracts', contract.id, field, val);
      if (result && (result.data !== '' || result.path !== '')) {
        cClauses.push(`${name} = ?`, `${field}_path = ?`);
        cParams.push(result.data, result.path);
      }
    }
    if (cClauses.length > 0) {
      cParams.push(token);
      await dbRun(`UPDATE regular_labor_contracts SET ${cClauses.join(', ')} WHERE token = ?`, ...cParams);
    }

    // Propagate to regular_employees (only if currently empty)
    if (contract.employee_id) {
      const eClauses: string[] = [];
      const eParams: any[] = [];
      const propagate = (col: string, val: any, kr: boolean = false) => {
        if (val === undefined || val === '') return;
        if (kr) {
          eClauses.push(`${col} = CASE WHEN COALESCE(${col}, '') IN ('', 'KR') THEN ? ELSE ${col} END`);
        } else {
          eClauses.push(`${col} = CASE WHEN COALESCE(${col}, '') = '' THEN ? ELSE ${col} END`);
        }
        eParams.push(val);
      };
      propagate('email', email);
      propagate('address', address);
      propagate('id_number', id_number);
      propagate('birth_date', birth_date);
      propagate('nationality', nationality, true);
      propagate('visa_type', visa_type);
      propagate('visa_expiry', visa_expiry);
      propagate('bank_name', bank_name);
      propagate('bank_account', bank_account);

      // blob propagation — Storage 분기. 비어있는 경우만 채움 (덮어쓰기 방지).
      for (const [name, field, val] of [
        ['bank_slip_data',       'bank_slip',       bank_slip_data],
        ['foreign_id_card_data', 'foreign_id_card', foreign_id_card_data],
      ] as const) {
        const result = await ingestBlob('employees', contract.employee_id, field, val);
        if (result && (result.data !== '' || result.path !== '')) {
          eClauses.push(`${name} = CASE WHEN COALESCE(${name}, '') = '' AND COALESCE(${field}_path, '') = '' THEN ? ELSE ${name} END`);
          eParams.push(result.data);
          eClauses.push(`${field}_path = CASE WHEN COALESCE(${name}, '') = '' AND COALESCE(${field}_path, '') = '' THEN ? ELSE ${field}_path END`);
          eParams.push(result.path);
        }
      }

      if (eClauses.length > 0) {
        eClauses.push('updated_at = NOW()');
        eParams.push(contract.employee_id);
        await dbRun(`UPDATE regular_employees SET ${eClauses.join(', ')} WHERE id = ?`, ...eParams);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/regular-public/contract/:token/update-info error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/contract/:token/sign - Sign the contract
router.post('/contract/:token/sign', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const {
      address, signature_data, birth_date, id_number, consent_signed, consent_signature_data,
      // New onboarding fields (optional)
      email, nationality, visa_type, visa_expiry, bank_slip_data, foreign_id_card_data,
    } = req.body;
    if (!address || !signature_data) { res.status(400).json({ error: '주소와 서명은 필수입니다.' }); return; }

    const contract = await dbGet(
      `SELECT id, employee_id, phone, worker_name as name, contract_start, contract_end, status, token,
              sms_sent, created_at, updated_at, work_start_date,
              position_title, annual_salary, base_pay, meal_allowance, other_allowance,
              pay_day, work_hours, work_place, department, email, nationality,
              visa_type, visa_expiry
       FROM regular_labor_contracts WHERE token = ?`,
      token
    ) as any;
    if (!contract) { res.status(404).json({ error: '유효하지 않은 링크입니다.' }); return; }
    if (contract.status === 'signed') { res.status(400).json({ error: '이미 서명된 계약서입니다.' }); return; }

    // Build SET clauses for new optional fields in regular_labor_contracts
    const contractUpdateClauses: string[] = [
      'address = ?', 'signature_data = ?', 'birth_date = ?', 'id_number = ?',
      'consent_signed = ?', 'consent_signature_data = ?', 'status = ?',
    ];
    const contractParams: any[] = [
      address, signature_data, birth_date || '', id_number || '',
      consent_signed ? 1 : 0, consent_signature_data || '', 'signed',
    ];
    if (email !== undefined)             { contractUpdateClauses.push('email = ?');             contractParams.push(email); }
    if (nationality !== undefined)       { contractUpdateClauses.push('nationality = ?');       contractParams.push(nationality); }
    if (visa_type !== undefined)         { contractUpdateClauses.push('visa_type = ?');         contractParams.push(visa_type); }
    if (visa_expiry !== undefined)       { contractUpdateClauses.push('visa_expiry = ?');       contractParams.push(visa_expiry); }
    // blob → Storage 분기
    for (const [name, field, val] of [
      ['bank_slip_data',       'bank_slip',       bank_slip_data],
      ['foreign_id_card_data', 'foreign_id_card', foreign_id_card_data],
    ] as const) {
      const result = await ingestBlob('contracts', contract.id, field, val);
      if (result) {
        contractUpdateClauses.push(`${name} = ?`, `${field}_path = ?`);
        contractParams.push(result.data, result.path);
      }
    }
    contractParams.push(token);

    await dbRun(
      `UPDATE regular_labor_contracts SET ${contractUpdateClauses.join(', ')} WHERE token = ?`,
      ...contractParams
    );

    // Propagate new fields to regular_employees (only non-empty values, don't overwrite existing)
    if (contract.employee_id) {
      const empUpdateClauses: string[] = [];
      const empParams: any[] = [];

      if (address)              { empUpdateClauses.push('address = CASE WHEN COALESCE(address, \'\') = \'\' THEN ? ELSE address END');              empParams.push(address); }
      if (email)                { empUpdateClauses.push('email = CASE WHEN COALESCE(email, \'\') = \'\' THEN ? ELSE email END');                    empParams.push(email); }
      if (nationality)          { empUpdateClauses.push('nationality = CASE WHEN COALESCE(nationality, \'\') IN (\'\', \'KR\') THEN ? ELSE nationality END'); empParams.push(nationality); }
      if (visa_type)            { empUpdateClauses.push('visa_type = CASE WHEN COALESCE(visa_type, \'\') = \'\' THEN ? ELSE visa_type END');        empParams.push(visa_type); }
      if (visa_expiry)          { empUpdateClauses.push('visa_expiry = CASE WHEN COALESCE(visa_expiry, \'\') = \'\' THEN ? ELSE visa_expiry END');  empParams.push(visa_expiry); }
      // blob propagation — Storage 분기. 비어있는 경우만 채움.
      for (const [name, field, val] of [
        ['bank_slip_data',       'bank_slip',       bank_slip_data],
        ['foreign_id_card_data', 'foreign_id_card', foreign_id_card_data],
      ] as const) {
        if (!val) continue;
        const result = await ingestBlob('employees', contract.employee_id, field, val);
        if (result) {
          empUpdateClauses.push(`${name} = CASE WHEN COALESCE(${name}, '') = '' AND COALESCE(${field}_path, '') = '' THEN ? ELSE ${name} END`);
          empParams.push(result.data);
          empUpdateClauses.push(`${field}_path = CASE WHEN COALESCE(${name}, '') = '' AND COALESCE(${field}_path, '') = '' THEN ? ELSE ${field}_path END`);
          empParams.push(result.path);
        }
      }
      if (id_number)            { empUpdateClauses.push('id_number = CASE WHEN COALESCE(id_number, \'\') = \'\' THEN ? ELSE id_number END');        empParams.push(id_number); }
      if (birth_date)           { empUpdateClauses.push('birth_date = CASE WHEN COALESCE(birth_date, \'\') = \'\' THEN ? ELSE birth_date END');     empParams.push(birth_date); }

      if (empUpdateClauses.length > 0) {
        empUpdateClauses.push('updated_at = NOW()');
        empParams.push(contract.employee_id);
        await dbRun(
          `UPDATE regular_employees SET ${empUpdateClauses.join(', ')} WHERE id = ?`,
          ...empParams
        );
      }
    }

    // Send confirmation SMS with contract view link
    const viewLink = getFrontendUrl(`/regular-contract?token=${token}`);
    const message = `[조인앤조인 근로계약서]\n${contract.worker_name}님의 근로계약서가 체결되었습니다.\n계약기간: ${contract.contract_start} ~ ${contract.contract_end}\n\n계약서 확인: ${viewLink}`;
    await sendGeneralSms(contract.phone, message);
    await dbRun('UPDATE regular_labor_contracts SET sms_sent = 1 WHERE token = ?', token);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/:token/personal-info - Save personal info
router.post('/:token/personal-info', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { name_en, id_number, bank_name, bank_account } = req.body;

    if (!id_number || !bank_name || !bank_account) {
      res.status(400).json({ error: '주민번호, 은행명, 계좌번호는 필수입니다.' });
      return;
    }

    const employee = await dbGet(`SELECT ${EMP_COLS} FROM regular_employees WHERE token = ? AND is_active = 1`, token) as any;
    if (!employee) { res.status(403).json({ error: '접근 권한이 없습니다.' }); return; }

    await dbRun(
      'UPDATE regular_employees SET name_en = ?, id_number = ?, bank_name = ?, bank_account = ?, personal_info_completed = 1, updated_at = NOW() WHERE token = ?',
      name_en || '', id_number, bank_name, bank_account, token
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular-public/:token - Get employee info + today's state
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const employee = await dbGet(`
      SELECT re.id, re.phone, re.name, re.token, re.department, re.team, re.role, re.workplace_id,
             re.is_active, re.created_at, re.updated_at,
             re.hire_date, re.resign_date, re.resigned_at,
             re.bank_name, re.bank_account, re.id_number, re.name_en,
             re.personal_info_completed,
             re.birth_date, re.email, re.address, re.nationality, re.visa_type, re.visa_expiry,
             re.business_registration_no, re.monthly_salary, re.non_taxable_meal, re.non_taxable_vehicle,
             re.job_code, re.weekly_work_hours, re.employment_type,
             re.onboarding_status, re.onboarding_completed_at, re.onboarding_email_sent, re.onboarding_email_sent_at,
             re.signed_contract_url, sw.name as workplace_name, sw.address as workplace_address,
             sw.latitude, sw.longitude, sw.radius_meters
      FROM regular_employees re
      LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id
      WHERE re.token = ? AND re.is_active = 1
    `, token) as any;

    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다. 관리자에게 문의하세요.' });
      return;
    }

    const today = getKSTDate(); // calendar date for notices/contracts
    const businessToday = getBusinessDate(); // business day for attendance (07:00 boundary)
    // Check current business day first, then previous business day (for shifts ending after 07:00)
    let attendance = await dbGet('SELECT * FROM regular_attendance WHERE employee_id = ? AND date = ?', employee.id, businessToday) as any;
    let attendanceDate = businessToday;
    if (!attendance || (!attendance.clock_out_time && !attendance.clock_in_time)) {
      // Fallback: find most recent open session (any date), handles 2+ day gaps
      const openAtt = await dbGet('SELECT * FROM regular_attendance WHERE employee_id = ? AND clock_in_time IS NOT NULL AND clock_out_time IS NULL ORDER BY date DESC LIMIT 1', employee.id) as any;
      if (openAtt) {
        attendance = openAtt;
        attendanceDate = openAtt.date;
      }
    }

    // Get today's notices (specific date, daily, or date range + department filter)
    const allNotices = await dbAll(`
      SELECT * FROM regular_notices WHERE is_active = 1
        AND (
          (COALESCE(date_type, 'specific') = 'specific' AND date = ?)
          OR (date_type = 'daily')
          OR (date_type = 'range' AND date <= ? AND COALESCE(end_date, '') >= ?)
        )
      ORDER BY id
    `, today, today, today);
    // Filter by department: show if target_department is empty (all) or matches employee's department
    const notices = (allNotices as any[]).filter((n: any) =>
      !n.target_department || n.target_department === '' || n.target_department === employee.department
    );

    // Get org settings (all departments for full view)
    const orgRows = await dbAll('SELECT * FROM regular_org_settings ORDER BY sort_order, department, team') as any[];

    // Group into OrgDepartment structure
    const deptMap = new Map<string, { department: string; teams: { team: string; leader: string | null; leader_role: string }[] }>();
    for (const row of orgRows) {
      if (!deptMap.has(row.department)) {
        deptMap.set(row.department, { department: row.department, teams: [] });
      }
      deptMap.get(row.department)!.teams.push({
        team: row.team,
        leader: row.leader_name || null,
        leader_role: row.leader_role || '',
      });
    }
    const orgChart = Array.from(deptMap.values());

    // Check contract requirement (employees hired on/after 2026-03-27 must have signed contract)
    const hireDate = employee.hire_date || '';
    const needsContract = hireDate && hireDate >= '2026-03-27';
    let contractMissing = false;
    if (needsContract) {
      const signedContract = await dbGet(
        "SELECT id FROM regular_labor_contracts WHERE employee_id = ? AND status = 'signed' AND contract_end >= ?",
        employee.id, today
      );
      if (!signedContract) contractMissing = true;
    }

    // Determine status
    let status = 'ready'; // ready, clocked_in, completed
    if (attendance?.clock_out_time) status = 'completed';
    else if (attendance?.clock_in_time) status = 'clocked_in';

    res.json({
      status,
      contractMissing,
      employee: {
        name: employee.name,
        department: employee.department,
        team: employee.team,
        role: employee.role,
        name_en: employee.name_en || '',
        id_number: employee.id_number || '',
        bank_name: employee.bank_name || '',
        bank_account: employee.bank_account || '',
        personal_info_completed: employee.personal_info_completed || 0,
      },
      workplace: employee.workplace_id ? {
        name: employee.workplace_name,
        address: employee.workplace_address,
        latitude: employee.latitude,
        longitude: employee.longitude,
        radius_meters: employee.radius_meters,
      } : null,
      attendance: attendance ? {
        clock_in_time: attendance.clock_in_time,
        clock_out_time: attendance.clock_out_time,
      } : null,
      notices: notices || [],
      org_chart: orgChart,
      date: today,
      business_date: businessToday, // 07:00 경계 기준 근무일 (야간조 자정 넘김 대응)
      attendance_date: attendanceDate, // 실제 조회된 attendance record의 date
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/:token/send-otp - Send SMS verification code
router.post('/:token/send-otp', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { phone: rawPhone } = req.body;
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      res.status(400).json({ error: '전화번호를 입력해주세요.' });
      return;
    }

    const employee = await dbGet(`
      SELECT re.id, re.phone, re.name, re.token, re.department, re.team, re.role, re.workplace_id,
             re.is_active, re.created_at, re.updated_at,
             re.hire_date, re.resign_date, re.resigned_at,
             re.bank_name, re.bank_account, re.id_number, re.name_en,
             re.personal_info_completed,
             re.birth_date, re.email, re.address, re.nationality, re.visa_type, re.visa_expiry,
             re.business_registration_no, re.monthly_salary, re.non_taxable_meal, re.non_taxable_vehicle,
             re.job_code, re.weekly_work_hours, re.employment_type,
             re.onboarding_status, re.onboarding_completed_at, re.onboarding_email_sent, re.onboarding_email_sent_at,
             re.signed_contract_url FROM regular_employees re WHERE re.token = ? AND re.is_active = 1
    `, token) as any;

    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다.' });
      return;
    }

    // Verify phone matches the registered employee phone
    const normalizedInput = phone.replace(/[^0-9]/g, '');
    const normalizedRegistered = employee.phone.replace(/[^0-9]/g, '');
    if (normalizedInput !== normalizedRegistered) {
      res.status(400).json({ error: '등록된 전화번호와 일치하지 않습니다.' });
      return;
    }

    // Generate 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    otpStore.set(token, { code, phone: normalizedInput, expiresAt });

    // Send SMS
    const message = `[조인앤조인] 출근 인증번호: ${code}\n5분 내에 입력해주세요.`;
    const result = await sendGeneralSms(phone, message);

    if (!result.success) {
      res.status(500).json({ error: '인증번호 발송에 실패했습니다.' });
      return;
    }

    res.json({ success: true, message: '인증번호가 발송되었습니다.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/:token/verify-otp - Verify SMS code
router.post('/:token/verify-otp', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: '인증번호를 입력해주세요.' });
      return;
    }

    const stored = otpStore.get(token);
    if (!stored) {
      res.status(400).json({ error: '인증번호를 먼저 요청해주세요.' });
      return;
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(token);
      res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' });
      return;
    }

    if (stored.code !== code) {
      res.status(400).json({ error: '인증번호가 일치하지 않습니다.' });
      return;
    }

    // Mark as verified
    otpStore.delete(token);
    res.json({ success: true, verified: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/:token/clock-in
router.post('/:token/clock-in', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { latitude, longitude, agreement_accepted, agreement_accepted_at, phone_verified } = req.body;

    const employee = await dbGet(`
      SELECT re.id, re.phone, re.name, re.token, re.department, re.team, re.role, re.workplace_id,
             re.is_active, re.created_at, re.updated_at,
             re.hire_date, re.resign_date, re.resigned_at,
             re.bank_name, re.bank_account, re.id_number, re.name_en,
             re.personal_info_completed,
             re.birth_date, re.email, re.address, re.nationality, re.visa_type, re.visa_expiry,
             re.business_registration_no, re.monthly_salary, re.non_taxable_meal, re.non_taxable_vehicle,
             re.job_code, re.weekly_work_hours, re.employment_type,
             re.onboarding_status, re.onboarding_completed_at, re.onboarding_email_sent, re.onboarding_email_sent_at,
             re.signed_contract_url, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters, sw.name as workplace_name
      FROM regular_employees re
      LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id
      WHERE re.token = ? AND re.is_active = 1
    `, token) as any;

    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다. 관리자에게 문의하세요.' });
      return;
    }

    if (!agreement_accepted) {
      res.status(400).json({ error: '개인정보 수집 동의가 필요합니다.' });
      return;
    }

    if (!phone_verified) {
      res.status(400).json({ error: '전화번호 인증이 필요합니다.' });
      return;
    }

    // GPS validation: if workplace is assigned, must be within radius
    if (employee.wp_lat != null) {
      if (latitude == null || longitude == null) {
        res.status(400).json({ error: 'GPS 위치를 확인할 수 없습니다. 위치 권한을 허용해주세요.' });
        return;
      }
      const withinRange = isWithinRadius(latitude, longitude, employee.wp_lat, employee.wp_lng, employee.radius_meters);
      const dist = Math.round(calculateDistance(latitude, longitude, employee.wp_lat, employee.wp_lng));
      if (!withinRange) {
        res.status(400).json({ error: `근무지 범위를 벗어났습니다. 현재 ${dist}m 거리에 있습니다. (허용: ${employee.radius_meters}m 이내)` });
        return;
      }
    }

    const gpsValid = 1;
    const distance = (latitude != null && longitude != null && employee.wp_lat != null)
      ? Math.round(calculateDistance(latitude, longitude, employee.wp_lat, employee.wp_lng))
      : null;

    const today = getKSTDate(); // calendar date for contract check
    const businessToday = getBusinessDate(); // business day (07:00 boundary) for attendance record
    const clockInTime = getKSTTimestamp();

    // Check contract requirement (server-side enforcement)
    const hireDate = employee.hire_date || '';
    if (hireDate && hireDate >= '2026-03-27') {
      const signedContract = await dbGet(
        "SELECT id FROM regular_labor_contracts WHERE employee_id = ? AND status = 'signed' AND contract_end >= ?",
        employee.id, today
      );
      if (!signedContract) {
        res.status(403).json({ error: '근로계약서가 체결되지 않아 출근할 수 없습니다.' });
        return;
      }
    }

    // Check if already clocked in for this business day (UNIQUE constraint on employee_id + date)
    const existing = await dbGet('SELECT id FROM regular_attendance WHERE employee_id = ? AND date = ?', employee.id, businessToday) as any;
    if (existing) {
      res.status(400).json({ error: '이미 출근이 기록되었습니다.' });
      return;
    }

    // 안전보건 P1 — 출근 전 셀프체크(precheck) 게이팅.
    // 카페·사무직 제외. 게이팅 대상은 미완 시 SAFETY_TASK_INCOMPLETE 409.
    if (await isSafetyGatedEmployee(employee.department)) {
      const pre = await dbGet(
        `SELECT id FROM worker_safety_task_log WHERE employee_id = ? AND task_type = 'precheck' AND task_date = ?`,
        employee.id, businessToday
      );
      if (!pre) {
        res.status(409).json({
          error: '출근 전 안전 셀프체크를 먼저 완료해주세요.',
          code: 'SAFETY_TASK_INCOMPLETE',
          pending: ['precheck'],
          gate: 'clock-in',
        });
        return;
      }
    }

    // 보건 P3 — 보건증 만료 D-30 이내(또는 미보유) 게이팅.
    // 식품위생법상 식품 직접 취급자만 대상. 회사 실정: 생산팀만 필수. 물류·사무·카페 제외.
    if (isHealthCertRequired(employee.department)) {
      const healthGate = await checkHealthCertGate(employee.id);
      if (healthGate) {
        res.status(409).json({
          error: healthGate === 'health_cert_missing'
            ? '유효한 보건증이 없습니다. 보건증을 발급받아 등록해 주세요.'
            : '보건증 만료가 임박했거나 만료되었습니다. 갱신 후 등록해 주세요.',
          code: 'SAFETY_TASK_INCOMPLETE',
          pending: [healthGate],
          gate: 'clock-in',
        });
        return;
      }
    }

    await dbRun(`
      INSERT INTO regular_attendance (employee_id, date, clock_in_time, clock_in_lat, clock_in_lng, gps_valid, agreement_accepted, agreement_accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, employee.id, businessToday, clockInTime, latitude || null, longitude || null, gpsValid, agreement_accepted ? 1 : 0, agreement_accepted_at || null);

    res.json({
      success: true,
      clock_in_time: clockInTime,
      gps_valid: true,
      distance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/:token/clock-out
router.post('/:token/clock-out', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { latitude, longitude } = req.body;

    const employee = await dbGet(`
      SELECT re.id, re.phone, re.name, re.token, re.department, re.team, re.role, re.workplace_id,
             re.is_active, re.created_at, re.updated_at,
             re.hire_date, re.resign_date, re.resigned_at,
             re.bank_name, re.bank_account, re.id_number, re.name_en,
             re.personal_info_completed,
             re.birth_date, re.email, re.address, re.nationality, re.visa_type, re.visa_expiry,
             re.business_registration_no, re.monthly_salary, re.non_taxable_meal, re.non_taxable_vehicle,
             re.job_code, re.weekly_work_hours, re.employment_type,
             re.onboarding_status, re.onboarding_completed_at, re.onboarding_email_sent, re.onboarding_email_sent_at,
             re.signed_contract_url, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters, sw.name as workplace_name
      FROM regular_employees re
      LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id
      WHERE re.token = ? AND re.is_active = 1
    `, token) as any;

    if (!employee) {
      res.status(403).json({ error: '접근 권한이 없습니다. 관리자에게 문의하세요.' });
      return;
    }

    // GPS validation: if workplace is assigned, must be within radius
    if (employee.wp_lat != null) {
      if (latitude == null || longitude == null) {
        res.status(400).json({ error: 'GPS 위치를 확인할 수 없습니다. 위치 권한을 허용해주세요.' });
        return;
      }
      const withinRange = isWithinRadius(latitude, longitude, employee.wp_lat, employee.wp_lng, employee.radius_meters);
      const dist = Math.round(calculateDistance(latitude, longitude, employee.wp_lat, employee.wp_lng));
      if (!withinRange) {
        res.status(400).json({ error: `근무지 범위를 벗어났습니다. 현재 ${dist}m 거리에 있습니다. (허용: ${employee.radius_meters}m 이내)` });
        return;
      }
    }

    const gpsValid = 1;
    const distance = (latitude != null && longitude != null && employee.wp_lat != null)
      ? Math.round(calculateDistance(latitude, longitude, employee.wp_lat, employee.wp_lng))
      : null;

    const businessToday = getBusinessDate();
    const clockOutTime = getKSTTimestamp();

    // Must have clocked in first - check current business day, then previous business day
    // (handles shift ending after 07:00 when business day has already rolled over)
    let attendance = await dbGet('SELECT * FROM regular_attendance WHERE employee_id = ? AND date = ? AND clock_in_time IS NOT NULL', employee.id, businessToday) as any;
    if (!attendance) {
      // Find most recent open session (any date), handles 2+ day gaps
      attendance = await dbGet(
        'SELECT * FROM regular_attendance WHERE employee_id = ? AND clock_in_time IS NOT NULL AND clock_out_time IS NULL ORDER BY date DESC LIMIT 1',
        employee.id
      ) as any;
    }
    if (!attendance) {
      res.status(400).json({ error: '먼저 출근을 기록해주세요.' });
      return;
    }

    if (attendance.clock_out_time) {
      res.status(400).json({ error: '이미 퇴근이 기록되었습니다.' });
      return;
    }

    // 안전보건 P1 — 퇴근 전 셀프체크(postcheck) 게이팅.
    if (await isSafetyGatedEmployee(employee.department)) {
      const post = await dbGet(
        `SELECT id FROM worker_safety_task_log WHERE employee_id = ? AND task_type = 'postcheck' AND task_date = ?`,
        employee.id, attendance.date
      );
      if (!post) {
        res.status(409).json({
          error: '퇴근 전 안전 셀프체크를 먼저 완료해주세요.',
          code: 'SAFETY_TASK_INCOMPLETE',
          pending: ['postcheck'],
          gate: 'clock-out',
        });
        return;
      }
    }

    // 보건 P3 — 보건증 만료 D-30 이내(또는 미보유) 게이팅.
    // 식품위생법상 식품 직접 취급자만 대상. 회사 실정: 생산팀만 필수. 물류·사무·카페 제외.
    if (isHealthCertRequired(employee.department)) {
      const healthGateOut = await checkHealthCertGate(employee.id);
      if (healthGateOut) {
        res.status(409).json({
          error: healthGateOut === 'health_cert_missing'
            ? '유효한 보건증이 없습니다. 보건증을 발급받아 등록해 주세요.'
            : '보건증 만료가 임박했거나 만료되었습니다. 갱신 후 등록해 주세요.',
          code: 'SAFETY_TASK_INCOMPLETE',
          pending: [healthGateOut],
          gate: 'clock-out',
        });
        return;
      }
    }

    // 안전보건 P4 — 반기 마감 D-14 이내 필수 교육·설문 미이수 게이팅 (clock-out 만).
    // clock-in 은 출근 지장 방지 위해 게이팅 안 함 — 홈 카드로 경보만.
    const trainingSurveyPending = await checkTrainingSurveyGate(employee.id, employee.department);
    if (trainingSurveyPending.length > 0) {
      const first = trainingSurveyPending[0];
      const msg =
        first === 'training_incomplete' ? '이번 반기 필수 안전보건교육을 완료해야 합니다.' :
        first === 'musculoskeletal_survey' ? '근골격계 증상 설문을 제출해야 합니다.' :
        first === 'opinion_survey' ? '안전보건 의견 설문을 제출해야 합니다.' :
        '반기 필수 안전보건 과제가 남아 있습니다.';
      res.status(409).json({
        error: `${msg} (반기 마감 D-14 이내)`,
        code: 'SAFETY_TASK_INCOMPLETE',
        pending: trainingSurveyPending,
        gate: 'clock-out',
      });
      return;
    }

    await dbRun(`
      UPDATE regular_attendance SET clock_out_time = ?, clock_out_lat = ?, clock_out_lng = ?
      WHERE id = ?
    `, clockOutTime, latitude || null, longitude || null, attendance.id);

    res.json({
      success: true,
      clock_out_time: clockOutTime,
      gps_valid: true,
      distance,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular-public/dashboard-report/:date - Public dashboard view for regular employees (no auth)
router.get('/dashboard-report/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;

    const workers = await dbAll(`
      SELECT re.id, re.phone, re.name, re.department, re.team, re.role,
             ra.clock_in_time, ra.clock_out_time
      FROM regular_employees re
      LEFT JOIN regular_attendance ra ON re.id = ra.employee_id AND ra.date = ?
      WHERE re.is_active = 1
      ORDER BY re.department, re.team, re.name
    `, date);

    const totals = {
      total: workers.length,
      not_clocked_in: (workers as any[]).filter((w: any) => !w.clock_in_time).length,
      clocked_in: (workers as any[]).filter((w: any) => w.clock_in_time && !w.clock_out_time).length,
      completed: (workers as any[]).filter((w: any) => w.clock_out_time).length,
    };

    const vacations = await dbAll(`
      SELECT vr.*, re.name as employee_name, re.department, re.team, re.phone
      FROM regular_vacation_requests vr
      JOIN regular_employees re ON vr.employee_id = re.id
      WHERE vr.status = 'approved' AND vr.start_date <= ? AND vr.end_date >= ?
      ORDER BY re.department, re.name
    `, date, date) as any[];

    res.json({ date, workers, totals, vacations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

