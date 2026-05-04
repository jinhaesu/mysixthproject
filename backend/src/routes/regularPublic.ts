import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate, getKSTTimestamp, getBusinessDate, normalizePhone, getFrontendUrl } from '../db';
import { isWithinRadius, calculateDistance } from '../services/gpsService';
import { sendGeneralSms } from '../services/smsService';

const router = Router();

// In-memory OTP store: key = token, value = { code, phone, expiresAt }
const otpStore = new Map<string, { code: string; phone: string; expiresAt: number }>();

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

    const employee = await dbGet('SELECT * FROM regular_employees WHERE token = ? AND is_active = 1', token) as any;
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
    const employee = await dbGet('SELECT * FROM regular_employees WHERE token = ? AND is_active = 1', token) as any;
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

    const allowed = [
      'email','address','id_number','birth_date','bank_name','bank_account','bank_slip_data',
      'nationality','visa_type','visa_expiry','foreign_id_card_data',
    ];
    const clauses: string[] = [];
    const params: any[] = [];
    for (const f of allowed) {
      const v = (req.body || {})[f];
      if (v !== undefined && String(v).trim() !== '') {
        clauses.push(`${f} = ?`);
        params.push(v);
      }
    }
    if (clauses.length === 0) { res.status(400).json({ error: '입력된 정보가 없습니다.' }); return; }
    clauses.push('updated_at = NOW()');
    params.push(emp.id);

    // 진단용 로그 — 큰 첨부 파일에서 오류 발생 시 dump 가능하도록
    const totalSize = params.reduce((s, p) => s + (typeof p === 'string' ? p.length : 0), 0);
    console.log(`[onboarding-info] ${emp.name} (#${emp.id}) — fields=${clauses.length - 1}, total bytes=${totalSize}`);

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
    const contract = await dbGet(`
      SELECT rlc.*, re.department, re.team, re.role
      FROM regular_labor_contracts rlc
      JOIN regular_employees re ON rlc.employee_id = re.id
      WHERE rlc.token = ?
    `, token) as any;
    if (!contract) { res.status(404).json({ error: '유효하지 않은 링크입니다.' }); return; }
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

    const contract = await dbGet('SELECT employee_id, phone FROM regular_labor_contracts WHERE token = ?', token) as any;
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
    setIf('bank_slip_data', bank_slip_data);
    setIf('foreign_id_card_data', foreign_id_card_data);
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
      propagate('bank_slip_data', bank_slip_data);
      propagate('foreign_id_card_data', foreign_id_card_data);
      propagate('bank_name', bank_name);
      propagate('bank_account', bank_account);

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

    const contract = await dbGet('SELECT * FROM regular_labor_contracts WHERE token = ?', token) as any;
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
    if (bank_slip_data !== undefined)    { contractUpdateClauses.push('bank_slip_data = ?');    contractParams.push(bank_slip_data); }
    if (foreign_id_card_data !== undefined) { contractUpdateClauses.push('foreign_id_card_data = ?'); contractParams.push(foreign_id_card_data); }
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
      if (bank_slip_data)       { empUpdateClauses.push('bank_slip_data = CASE WHEN COALESCE(bank_slip_data, \'\') = \'\' THEN ? ELSE bank_slip_data END'); empParams.push(bank_slip_data); }
      if (foreign_id_card_data) { empUpdateClauses.push('foreign_id_card_data = CASE WHEN COALESCE(foreign_id_card_data, \'\') = \'\' THEN ? ELSE foreign_id_card_data END'); empParams.push(foreign_id_card_data); }
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

    const employee = await dbGet('SELECT * FROM regular_employees WHERE token = ? AND is_active = 1', token) as any;
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
      SELECT re.*, sw.name as workplace_name, sw.address as workplace_address,
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
      SELECT re.* FROM regular_employees re WHERE re.token = ? AND re.is_active = 1
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
      SELECT re.*, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters, sw.name as workplace_name
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
      SELECT re.*, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters, sw.name as workplace_name
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

