import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun, getKSTDate, getKSTTimestamp, isHolidayOrWeekend, normalizePhone, getRegularUrl, getFrontendUrl } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendGeneralSms } from '../services/smsService';

const router = Router();

// regular_employees 의 Base64 blob 컬럼을 제외한 컬럼 목록 (detail 용).
// 555MB TOAST 의 대부분이 이들 컬럼 → SELECT * 가 1행당 수 MB 전송 → 모든 쿼리 timeout.
// 문서 보기가 필요한 화면에서는 GET /employees/:id/documents 로 별도 조회.
const EMP_COLS_NO_BLOB = `
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

// LIST 전용 — 표 출력 핵심 컬럼만. has_* boolean 제거 (col != '' 체크가 TOAST 디토스팅 유발 → 쿼리 14초+).
// 문서 존재 여부 필요한 화면은 별도 detail/document-status 엔드포인트 호출.
const EMP_COLS_LIST = `
  id, phone, name, department, team, role, workplace_id,
  is_active, hire_date, resign_date, resigned_at,
  bank_name, bank_account, id_number,
  nationality, visa_expiry,
  employment_type, onboarding_status
`;

// ===== Employees CRUD =====

// GET /api/regular/employees - List with filters
router.get('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const { search, department, team, role, page = '1', limit = '50', include_resigned } = req.query as Record<string, string>;

    let where = include_resigned === '1' ? 'WHERE 1=1' : 'WHERE re.is_active = 1';
    const params: any[] = [];

    if (search) {
      where += ' AND (re.name LIKE ? OR re.phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (department) {
      where += ' AND re.department = ?';
      params.push(department);
    }
    if (team) {
      where += ' AND re.team = ?';
      params.push(team);
    }
    if (role) {
      where += ' AND re.role = ?';
      params.push(role);
    }

    const countResult = await dbGet(`SELECT COUNT(*) as total FROM regular_employees re ${where}`, ...params) as any;
    const total = countResult.total;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 500);
    const offset = (pageNum - 1) * limitNum;

    // List 핵심 컬럼만. has_* 디토스팅 제거 (TOAST 555MB 컬럼의 != '' 체크가 14초+ 걸림).
    const employees = await dbAll(`
      SELECT
        re.id, re.phone, re.name, re.department, re.team, re.role, re.workplace_id,
        re.is_active, re.hire_date, re.resign_date, re.resigned_at,
        re.bank_name, re.bank_account, re.id_number,
        re.nationality, re.visa_expiry,
        re.employment_type, re.onboarding_status,
        sw.name as workplace_name
      FROM regular_employees re
      LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id
      ${where}
      ORDER BY re.is_active DESC, re.hire_date DESC NULLS LAST, re.name
      LIMIT ? OFFSET ?
    `, ...params, limitNum, offset);

    res.json({
      employees,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/employees - Create employee (v6 - bulletproof)
router.post('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const { phone: rawPhone, name, department, team, role, workplace_id, hire_date } = req.body;
    const phone = normalizePhone(rawPhone);

    if (!phone || !name) {
      res.status(400).json({ error: '전화번호와 이름은 필수입니다.' });
      return;
    }

    const token = uuidv4();
    const dept = department || '';
    const tm = team || '';
    const rl = role || '';
    const wpId = workplace_id || null;

    // Strategy: try INSERT, if fails due to unique constraint, UPDATE instead
    try {
      const result = await dbRun(
        'INSERT INTO regular_employees (phone, name, token, department, team, role, workplace_id, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        phone, name, token, dept, tm, rl, wpId, hire_date || ''
      );
      const created = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE id = ?`, result.lastInsertRowid);
      res.status(201).json(created);
    } catch (insertErr: any) {
      // Unique constraint violation — record exists, just update it
      await dbRun(
        'UPDATE regular_employees SET name = ?, token = ?, department = ?, team = ?, role = ?, workplace_id = ?, hire_date = ?, is_active = 1, updated_at = NOW() WHERE phone = ?',
        name, token, dept, tm, rl, wpId, hire_date || '', phone
      );
      const updated = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE phone = ?`, phone);
      res.status(201).json(updated);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/employees/:id - Update employee (non-destructive: only updates fields explicitly provided)
router.put('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const clauses: string[] = [];
    const params: any[] = [];

    // For each updatable field, only include in UPDATE when the request explicitly sends it.
    // This prevents accidental clearing of fields like hire_date when the form omits them.
    if (body.phone !== undefined)         { clauses.push('phone = ?');         params.push(normalizePhone(body.phone)); }
    if (body.name !== undefined)          { clauses.push('name = ?');          params.push(body.name); }
    if (body.department !== undefined)    { clauses.push('department = ?');    params.push(body.department || ''); }
    if (body.team !== undefined)          { clauses.push('team = ?');          params.push(body.team || ''); }
    if (body.role !== undefined)          { clauses.push('role = ?');          params.push(body.role || ''); }
    if (body.workplace_id !== undefined)  { clauses.push('workplace_id = ?');  params.push(body.workplace_id || null); }
    if (body.hire_date !== undefined)     { clauses.push('hire_date = ?');     params.push(body.hire_date || ''); }
    if (body.bank_name !== undefined)     { clauses.push('bank_name = ?');     params.push(body.bank_name || ''); }
    if (body.bank_account !== undefined)  { clauses.push('bank_account = ?');  params.push(body.bank_account || ''); }
    if (body.id_number !== undefined)     { clauses.push('id_number = ?');     params.push(body.id_number || ''); }
    if (body.birth_date !== undefined)    { clauses.push('birth_date = ?');    params.push(body.birth_date || ''); }

    if (clauses.length === 0) {
      const cur = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE id = ?`, id);
      res.json(cur);
      return;
    }

    clauses.push('updated_at = NOW()');
    params.push(id);
    await dbRun(`UPDATE regular_employees SET ${clauses.join(', ')} WHERE id = ?`, ...params);

    const updated = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE id = ?`, id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/employees/:id - Hard delete (allows re-registration with same phone)
router.delete('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Also delete related attendance records
    await dbRun('DELETE FROM regular_attendance WHERE employee_id = ?', id);
    await dbRun('DELETE FROM regular_employees WHERE id = ?', id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/employees/:id/send-link - Send SMS with permanent link
router.post('/employees/:id/send-link', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const employee = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE id = ? AND is_active = 1`, id) as any;
    if (!employee) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
      return;
    }

    const url = getRegularUrl(employee.token);
    const message = `[조인앤조인 출퇴근]\n${employee.name}님, 출퇴근 기록 링크입니다.\n매일 이 링크로 출퇴근을 기록해주세요.\n${url}`;

    const result = await sendGeneralSms(employee.phone, message);

    res.json({ success: result.success, error: result.error });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/employees/send-link-batch - Send to multiple employee IDs
router.post('/employees/send-link-batch', async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '발송 대상을 선택해주세요.' });
      return;
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const id of ids) {
      const employee = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE id = ? AND is_active = 1`, id) as any;
      if (!employee) continue;

      const url = getRegularUrl(employee.token);
      const message = `[조인앤조인 출퇴근]\n${employee.name}님, 출퇴근 기록 링크입니다.\n매일 이 링크로 출퇴근을 기록해주세요.\n${url}`;

      const result = await sendGeneralSms(employee.phone, message);
      if (result.success) {
        sentCount++;
      } else {
        errors.push(`${employee.name}(${employee.phone}): ${result.error}`);
      }
    }

    res.json({
      success: true,
      total: ids.length,
      sent: sentCount,
      failed: ids.length - sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Dashboard =====

// GET /api/regular/dashboard - Real-time attendance by department/team
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const date = (req.query.date as string) || getKSTDate();

    const workers = await dbAll(`
      SELECT re.id, re.phone, re.name, re.department, re.team, re.role,
             ra.clock_in_time, ra.clock_out_time, ra.gps_valid
      FROM regular_employees re
      LEFT JOIN regular_attendance ra ON re.id = ra.employee_id AND ra.date = ?
      WHERE re.is_active = 1
      ORDER BY re.department, re.team, re.name
    `, date) as any[];

    // Build departments array with nested teams (matching frontend DepartmentSummary interface)
    const deptMap = new Map<string, { department: string; total: number; clocked_in: number; completed: number; not_clocked_in: number; teamMap: Map<string, any[]> }>();

    for (const w of workers) {
      const dept = w.department || '미배정';
      const team = w.team || '미배정';
      const status = w.clock_out_time ? 'completed' : w.clock_in_time ? 'clocked_in' : 'not_clocked_in';
      w.status = status;

      if (!deptMap.has(dept)) {
        deptMap.set(dept, { department: dept, total: 0, clocked_in: 0, completed: 0, not_clocked_in: 0, teamMap: new Map() });
      }
      const deptData = deptMap.get(dept)!;
      deptData.total++;
      if (status === 'completed') deptData.completed++;
      else if (status === 'clocked_in') deptData.clocked_in++;
      else deptData.not_clocked_in++;

      if (!deptData.teamMap.has(team)) deptData.teamMap.set(team, []);
      deptData.teamMap.get(team)!.push(w);
    }

    const departments = Array.from(deptMap.values()).map(d => ({
      department: d.department,
      total: d.total,
      clocked_in: d.clocked_in,
      completed: d.completed,
      not_clocked_in: d.not_clocked_in,
      teams: Array.from(d.teamMap.entries()).map(([team, employees]) => ({ team, employees })),
    }));

    const totals = {
      total: workers.length,
      clocked_in: workers.filter(w => w.clock_in_time && !w.clock_out_time).length,
      completed: workers.filter(w => w.clock_out_time).length,
      not_clocked_in: workers.filter(w => !w.clock_in_time).length,
    };

    // Get approved vacations for this date
    const vacations = await dbAll(`
      SELECT vr.*, re.name as employee_name, re.department, re.team, re.phone
      FROM regular_vacation_requests vr
      JOIN regular_employees re ON vr.employee_id = re.id
      WHERE vr.status = 'approved' AND vr.start_date <= ? AND vr.end_date >= ?
      ORDER BY re.department, re.name
    `, date, date) as any[];

    res.json({
      date,
      departments,
      workers,
      totals,
      vacations,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Notices CRUD =====

// GET /api/regular/notices - List notices
router.get('/notices', async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.query as Record<string, string>;

    let where = 'WHERE is_active = 1';
    const params: any[] = [];

    if (date) {
      where += ' AND date = ?';
      params.push(date);
    }

    const notices = await dbAll(`SELECT * FROM regular_notices ${where} ORDER BY date DESC, id DESC`, ...params);
    res.json(notices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/notices - Create notice
router.post('/notices', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, date, date_type, end_date, target_department } = req.body;

    if (!title || !content) {
      res.status(400).json({ error: '제목과 내용은 필수입니다.' });
      return;
    }

    const dtype = date_type || 'specific';
    if (dtype === 'specific' && !date) {
      res.status(400).json({ error: '날짜를 지정해주세요.' });
      return;
    }

    const result = await dbRun(
      'INSERT INTO regular_notices (title, content, date, date_type, end_date, target_department) VALUES (?, ?, ?, ?, ?, ?)',
      title, content, date || '', dtype, end_date || '', target_department || ''
    );

    const created = await dbGet('SELECT * FROM regular_notices WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/notices/:id - Update notice
router.put('/notices/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, date, date_type, end_date, target_department } = req.body;
    await dbRun(
      'UPDATE regular_notices SET title = ?, content = ?, date = ?, date_type = ?, end_date = ?, target_department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      title, content, date || '', date_type || 'specific', end_date || '', target_department || '', req.params.id
    );
    const updated = await dbGet('SELECT * FROM regular_notices WHERE id = ?', req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/notices/:id - Soft delete
router.delete('/notices/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('UPDATE regular_notices SET is_active = 0 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Org Settings CRUD =====

// GET /api/regular/org-settings - List all org settings
router.get('/org-settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await dbAll('SELECT * FROM regular_org_settings ORDER BY department, team, sort_order');
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/org-settings - Create org setting
router.post('/org-settings', async (req: AuthRequest, res: Response) => {
  try {
    const { department, team, leader_name, leader_role, sort_order } = req.body;

    const result = await dbRun(
      'INSERT INTO regular_org_settings (department, team, leader_name, leader_role, sort_order) VALUES (?, ?, ?, ?, ?)',
      department || '', team || '', leader_name || '', leader_role || '', sort_order || 0
    );

    const created = await dbGet('SELECT * FROM regular_org_settings WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/org-settings/:id - Update org setting
router.put('/org-settings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { department, team, leader_name, leader_role, sort_order } = req.body;

    await dbRun(
      'UPDATE regular_org_settings SET department = ?, team = ?, leader_name = ?, leader_role = ?, sort_order = ? WHERE id = ?',
      department || '', team || '', leader_name || '', leader_role || '', sort_order || 0, req.params.id
    );

    const updated = await dbGet('SELECT * FROM regular_org_settings WHERE id = ?', req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/org-settings/:id - Hard delete
router.delete('/org-settings/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM regular_org_settings WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Admin Time Edit =====

// POST /api/regular/edit-time/:id - Edit clock-in/out time for attendance record
router.post('/edit-time/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { clock_in_time, clock_out_time } = req.body;

    const attendance = await dbGet('SELECT * FROM regular_attendance WHERE id = ?', id) as any;

    if (!attendance) {
      res.status(404).json({ error: '출퇴근 기록을 찾을 수 없습니다.' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (clock_in_time !== undefined) {
      updates.push('clock_in_time = ?');
      params.push(clock_in_time || null);
    }
    if (clock_out_time !== undefined) {
      updates.push('clock_out_time = ?');
      params.push(clock_out_time || null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: '수정할 시간을 입력해주세요.' });
      return;
    }

    params.push(id);

    await dbRun(`UPDATE regular_attendance SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const updated = await dbGet('SELECT * FROM regular_attendance WHERE id = ?', id);
    res.json({ success: true, attendance: updated });
  } catch (error: any) {
    console.error('[regular/edit-time] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Regular Report Schedules =====

// GET /api/regular/report-schedules
router.get('/report-schedules', async (_req: AuthRequest, res: Response) => {
  try {
    const schedules = await dbAll('SELECT * FROM regular_report_schedules WHERE is_active = 1 ORDER BY time');
    res.json(schedules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/report-schedules
router.post('/report-schedules', async (req: AuthRequest, res: Response) => {
  try {
    const { time, phones, repeat_days } = req.body;
    if (!time || !phones) {
      res.status(400).json({ error: '시간과 전화번호는 필수입니다.' });
      return;
    }
    const phonesJson = JSON.stringify(Array.isArray(phones) ? phones : [phones]);
    const result = await dbRun(
      'INSERT INTO regular_report_schedules (time, phones, repeat_days) VALUES (?, ?, ?)',
      time, phonesJson, repeat_days || 'daily'
    );
    const newId = result.lastInsertRowid;
    const created = newId ? await dbGet('SELECT * FROM regular_report_schedules WHERE id = ?', newId) : null;
    res.status(201).json(created || { id: newId, time, phones: phonesJson, repeat_days: repeat_days || 'daily', is_active: 1 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/report-schedules/:id
router.delete('/report-schedules/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('UPDATE regular_report_schedules SET is_active = 0 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/report-schedules/:id/send-now - Manually trigger a report
router.post('/report-schedules/:id/send-now', async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await dbGet('SELECT * FROM regular_report_schedules WHERE id = ? AND is_active = 1', req.params.id) as any;
    if (!schedule) {
      res.status(404).json({ error: '스케줄을 찾을 수 없습니다.' });
      return;
    }

    const today = getKSTDate();
    const now = new Date();
    const kstHours = (now.getUTCHours() + 9) % 24;
    const kstMinutes = now.getUTCMinutes();
    const currentTime = `${String(kstHours).padStart(2, '0')}:${String(kstMinutes).padStart(2, '0')}`;

    const stats = await dbGet(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN ra.clock_in_time IS NOT NULL AND ra.clock_out_time IS NULL THEN 1 ELSE 0 END) as clocked_in,
        SUM(CASE WHEN ra.clock_out_time IS NOT NULL THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN ra.clock_in_time IS NULL THEN 1 ELSE 0 END) as not_clocked_in
      FROM regular_employees re
      LEFT JOIN regular_attendance ra ON re.id = ra.employee_id AND ra.date = ?
      WHERE re.is_active = 1
    `, today) as any;

    const detailLink = getFrontendUrl(`/report-regular?date=${today}`);
    const message = `[조인앤조인 정규직 출퇴근 현황]\n${today} ${currentTime} 기준\n\n전체: ${stats?.total || 0}명\n출근중: ${stats?.clocked_in || 0}명\n미출근: ${stats?.not_clocked_in || 0}명\n퇴근완료: ${stats?.completed || 0}명\n\n상세 현황: ${detailLink}`;

    const phones = JSON.parse(schedule.phones);
    let sent = 0;
    for (const phone of phones) {
      const result = await sendGeneralSms(phone, message);
      if (result.success) sent++;
    }

    await dbRun('UPDATE regular_report_schedules SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?', schedule.id);

    res.json({ success: true, sent, total: phones.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Vacation Management =====

// GET /api/regular/vacations - List all vacation requests
router.get('/vacations', async (req: AuthRequest, res: Response) => {
  try {
    const { status, employee_id } = req.query as Record<string, string>;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { where += ' AND vr.status = ?'; params.push(status); }
    if (employee_id) { where += ' AND vr.employee_id = ?'; params.push(employee_id); }

    const requests = await dbAll(`
      SELECT vr.*, re.name as employee_name, re.department, re.team, re.phone
      FROM regular_vacation_requests vr
      JOIN regular_employees re ON vr.employee_id = re.id
      ${where}
      ORDER BY vr.created_at DESC
    `, ...params);
    res.json(requests);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/vacations/:id/approve - Approve vacation
router.put('/vacations/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { admin_memo } = req.body;
    const request = await dbGet('SELECT * FROM regular_vacation_requests WHERE id = ?', id) as any;
    if (!request) { res.status(404).json({ error: '휴가 신청을 찾을 수 없습니다.' }); return; }
    if (request.status !== 'pending') { res.status(400).json({ error: '이미 처리된 신청입니다.' }); return; }

    await dbRun('UPDATE regular_vacation_requests SET status = ?, admin_memo = ?, updated_at = NOW() WHERE id = ?', 'approved', admin_memo || '', id);

    const reqType: string = request.type || '연차';
    const isPublicLeave = reqType.includes('공가'); // 공가/오전공가/오후공가
    const isFullDay = reqType === '연차' || reqType === '공가';

    // Update used_days in balance — 공가는 연차 잔여에서 차감하지 않음
    if (!isPublicLeave) {
      const year = parseInt(request.start_date.slice(0, 4));
      const balance = await dbGet('SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', request.employee_id, year) as any;
      if (balance) {
        await dbRun('UPDATE regular_vacation_balances SET used_days = used_days + ?, updated_at = NOW() WHERE id = ?', request.days, balance.id);
      }
    }

    // Auto-create confirmed_attendance for full-day leave (연차/공가)
    if (isFullDay) {
      const emp = await dbGet('SELECT name, phone, department FROM regular_employees WHERE id = ?', request.employee_id) as any;
      if (emp) {
        const start = new Date(request.start_date + 'T00:00:00+09:00');
        const end = new Date(request.end_date + 'T00:00:00+09:00');
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (isHolidayOrWeekend(dateStr)) continue;
          const ym = dateStr.slice(0, 7);
          try {
            await dbRun(`
              INSERT INTO confirmed_attendance (employee_type, employee_name, employee_phone, date, confirmed_clock_in, confirmed_clock_out, source, regular_hours, overtime_hours, night_hours, break_hours, holiday_work, memo, year_month, department)
              VALUES ('정규직', ?, ?, ?, '휴가', '휴가', 'vacation', 8, 0, 0, 0, 0, ?, ?, ?)
              ON CONFLICT (employee_type, employee_name, date) DO UPDATE SET confirmed_clock_in='휴가', confirmed_clock_out='휴가', source='vacation', regular_hours=8, overtime_hours=0, night_hours=0, break_hours=0, memo=EXCLUDED.memo
            `, emp.name, emp.phone || '', dateStr, reqType, ym, emp.department || '');
          } catch {}
        }
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/vacations/:id/update-type - Update vacation type
router.put('/vacations/:id/update-type', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, days } = req.body;
    const newType = type || '연차';
    // 반차/공가의 오전·오후 변형은 자동 0.5일, 그 외는 클라이언트가 보낸 days 또는 1
    const isHalf = newType.startsWith('오전') || newType.startsWith('오후');
    const newDays = isHalf ? 0.5 : (days != null ? days : 1);
    await dbRun('UPDATE regular_vacation_requests SET type = ?, days = ?, updated_at = NOW() WHERE id = ?', newType, newDays, id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/vacations/:id/reject - Reject vacation
router.put('/vacations/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { admin_memo } = req.body;
    const request = await dbGet('SELECT * FROM regular_vacation_requests WHERE id = ?', id) as any;
    if (!request) { res.status(404).json({ error: '휴가 신청을 찾을 수 없습니다.' }); return; }

    const wasApproved = request.status === 'approved';
    await dbRun('UPDATE regular_vacation_requests SET status = ?, admin_memo = ?, updated_at = NOW() WHERE id = ?', 'rejected', admin_memo || '', id);

    // 이미 승인되었던 휴가를 거절/취소하는 경우: confirmed_attendance 삭제 + (공가가 아닌 경우) used_days 차감
    if (wasApproved) {
      const reqType: string = request.type || '연차';
      const isPublicLeave = reqType.includes('공가');
      const isFullDay = reqType === '연차' || reqType === '공가';

      if (isFullDay) {
        const emp = await dbGet('SELECT name FROM regular_employees WHERE id = ?', request.employee_id) as any;
        if (emp) {
          const start = new Date(request.start_date + 'T00:00:00+09:00');
          const end = new Date(request.end_date + 'T00:00:00+09:00');
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            try {
              await dbRun(
                `DELETE FROM confirmed_attendance WHERE employee_type = '정규직' AND employee_name = ? AND date = ? AND source = 'vacation'`,
                emp.name, dateStr
              );
            } catch {}
          }
        }
      }
      // used_days 차감 — 공가는 차감하지 않았으므로 환원도 하지 않음
      if (!isPublicLeave) {
        const year = parseInt(request.start_date.slice(0, 4));
        const balance = await dbGet('SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', request.employee_id, year) as any;
        if (balance) {
          await dbRun('UPDATE regular_vacation_balances SET used_days = GREATEST(used_days - ?, 0), updated_at = NOW() WHERE id = ?', request.days, balance.id);
        }
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/vacation-balances - List all balances
router.get('/vacation-balances', async (req: AuthRequest, res: Response) => {
  try {
    const year = (req.query.year as string) || new Date().getFullYear().toString();
    const balances = await dbAll(`
      SELECT re.id as employee_id, re.name as employee_name, re.department, re.team, re.phone,
             COALESCE(vb.id, 0) as id, COALESCE(vb.total_days, 0) as total_days, COALESCE(vb.used_days, 0) as used_days, vb.year
      FROM regular_employees re
      LEFT JOIN regular_vacation_balances vb ON re.id = vb.employee_id AND vb.year = ?
      WHERE re.is_active = 1
      ORDER BY re.department, re.team, re.name
    `, year);
    res.json(balances);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/vacation-balances/:employeeId - Set vacation balance
router.put('/vacation-balances/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { year, total_days, used_days } = req.body;
    const y = year || new Date().getFullYear();

    const existing = await dbGet('SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', employeeId, y) as any;
    if (existing) {
      const updates = ['total_days = ?', 'updated_at = NOW()'];
      const params: any[] = [total_days];
      if (used_days !== undefined && used_days !== null) {
        updates.splice(1, 0, 'used_days = ?');
        params.push(used_days);
      }
      params.push(existing.id);
      await dbRun(`UPDATE regular_vacation_balances SET ${updates.join(', ')} WHERE id = ?`, ...params);
    } else {
      await dbRun('INSERT INTO regular_vacation_balances (employee_id, year, total_days, used_days) VALUES (?, ?, ?, ?)', employeeId, y, total_days, used_days || 0);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/vacation-balances/auto-calc - Auto-calculate based on Korean labor law
router.post('/vacation-balances/auto-calc', async (req: AuthRequest, res: Response) => {
  try {
    const { year } = req.body;
    const targetYear = year || new Date().getFullYear();
    const today = getKSTDate();

    const employees = await dbAll('SELECT id, hire_date, name FROM regular_employees WHERE is_active = 1') as any[];
    let updated = 0;

    for (const emp of employees) {
      if (!emp.hire_date) continue;

      const hireDate = new Date(emp.hire_date);
      const yearStart = new Date(`${targetYear}-01-01`);
      const yearEnd = new Date(`${targetYear}-12-31`);

      // Calculate months worked from hire_date to year start
      const msFromHire = yearStart.getTime() - hireDate.getTime();
      const yearsWorked = msFromHire / (365.25 * 24 * 60 * 60 * 1000);

      let totalDays: number;

      // 입사일~오늘 기준 완전한 달 수 계산
      const todayDate = new Date(today + 'T00:00:00+09:00');
      function countMonths(from: Date, to: Date) {
        let m = 0;
        const c = new Date(from);
        while (true) {
          const next = new Date(c.getFullYear(), c.getMonth() + 1, c.getDate());
          if (next > to) break;
          m++;
          c.setMonth(c.getMonth() + 1);
        }
        return m;
      }

      if (yearsWorked < 1) {
        // 1년 미만: 입사일~오늘 기준 완전 개월 수 (월 1개, 최대 11)
        totalDays = Math.min(countMonths(hireDate, todayDate), 11);
      } else {
        // 1+ years: Korean labor law Article 60
        // Base: 15 days
        // After 3 years: +1 day per 2 years over 1 year
        const fullYears = Math.floor(yearsWorked);
        if (fullYears < 1) {
          totalDays = 11;
        } else if (fullYears < 3) {
          totalDays = 15;
        } else {
          const extraDays = Math.floor((fullYears - 1) / 2);
          totalDays = Math.min(15 + extraDays, 25);
        }
      }

      // Upsert balance + log
      const existing = await dbGet('SELECT id, total_days, used_days FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', emp.id, targetYear) as any;
      const prevDays = existing ? parseFloat(existing.total_days) : 0;
      if (existing) {
        await dbRun('UPDATE regular_vacation_balances SET total_days = ?, updated_at = NOW() WHERE id = ?', totalDays, existing.id);
      } else {
        await dbRun('INSERT INTO regular_vacation_balances (employee_id, year, total_days) VALUES (?, ?, ?)', emp.id, targetYear, totalDays);
      }
      if (prevDays !== totalDays) {
        const yearsInfo = yearsWorked < 1 ? `1년미만 ${countMonths(hireDate, todayDate)}개월` : `근속 ${Math.floor(yearsWorked)}년`;
        try {
          await dbRun(
            'INSERT INTO vacation_update_logs (employee_id, employee_name, action, prev_days, new_days, reason) VALUES (?, ?, ?, ?, ?, ?)',
            emp.id, emp.name, '수동재계산', prevDays, totalDays, yearsInfo
          );
        } catch {}
      }
      updated++;
    }

    res.json({ success: true, updated, year: targetYear });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/vacation-balances/init - Initialize balances for all active employees
// GET /api/regular/vacation-logs - Get vacation update logs
router.get('/vacation-logs', async (_req: AuthRequest, res: Response) => {
  try {
    const logs = await dbAll('SELECT * FROM vacation_update_logs ORDER BY created_at DESC LIMIT 200');
    res.json(logs || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/vacation-balances/init', async (req: AuthRequest, res: Response) => {
  try {
    const { year, total_days } = req.body;
    const y = year || new Date().getFullYear();
    const days = total_days || 15;

    const employees = await dbAll('SELECT id FROM regular_employees WHERE is_active = 1');
    let count = 0;
    for (const emp of employees as any[]) {
      const existing = await dbGet('SELECT id FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', emp.id, y);
      if (!existing) {
        await dbRun('INSERT INTO regular_vacation_balances (employee_id, year, total_days) VALUES (?, ?, ?)', emp.id, y, days);
        count++;
      }
    }
    res.json({ success: true, initialized: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Shift Scheduling (계획 출퇴근 배치) =====

// GET /api/regular/shifts - List all shifts
router.get('/shifts', async (_req: AuthRequest, res: Response) => {
  try {
    const shifts = await dbAll(`
      SELECT rs.*,
        (SELECT COUNT(*) FROM regular_shift_assignments rsa WHERE rsa.shift_id = rs.id) as assigned_count
      FROM regular_shifts rs
      WHERE rs.is_active = 1
      ORDER BY rs.week_number, rs.day_of_week, rs.planned_clock_in
    `);
    res.json(shifts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/shifts - Create shift
router.post('/shifts', async (req: AuthRequest, res: Response) => {
  try {
    const { name, week_number, day_of_week, planned_clock_in, planned_clock_out, month, days_of_week } = req.body;
    if (!name || !planned_clock_in || !planned_clock_out) {
      res.status(400).json({ error: '배치명과 출퇴근 시간을 입력해주세요.' });
      return;
    }
    const result = await dbRun(
      'INSERT INTO regular_shifts (name, week_number, day_of_week, planned_clock_in, planned_clock_out, month, days_of_week) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, week_number || 1, day_of_week || 0, planned_clock_in, planned_clock_out, month || 0, days_of_week || ''
    );
    const created = await dbGet('SELECT * FROM regular_shifts WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/shifts/:id - Update shift
router.put('/shifts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, week_number, day_of_week, planned_clock_in, planned_clock_out, month, days_of_week } = req.body;
    await dbRun(
      'UPDATE regular_shifts SET name = ?, week_number = ?, day_of_week = ?, planned_clock_in = ?, planned_clock_out = ?, month = ?, days_of_week = ? WHERE id = ?',
      name, week_number, day_of_week || 0, planned_clock_in, planned_clock_out, month || 0, days_of_week || '', req.params.id
    );
    const updated = await dbGet('SELECT * FROM regular_shifts WHERE id = ?', req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/shifts/:id
router.delete('/shifts/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('UPDATE regular_shifts SET is_active = 0 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/shifts/:id/assignments - Get assigned employees for a shift
router.get('/shifts/:id/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const assignments = await dbAll(`
      SELECT rsa.id, rsa.employee_id, re.name, re.department, re.team, re.phone
      FROM regular_shift_assignments rsa
      JOIN regular_employees re ON rsa.employee_id = re.id
      WHERE rsa.shift_id = ? AND re.is_active = 1
      ORDER BY re.department, re.team, re.name
    `, req.params.id);
    res.json(assignments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/shifts/:id/assignments - Assign employees to shift
router.post('/shifts/:id/assignments', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_ids } = req.body;
    if (!employee_ids || !Array.isArray(employee_ids)) {
      res.status(400).json({ error: '직원 ID 목록이 필요합니다.' });
      return;
    }
    let added = 0;
    for (const empId of employee_ids) {
      try {
        await dbRun('INSERT INTO regular_shift_assignments (shift_id, employee_id) VALUES (?, ?)', req.params.id, empId);
        added++;
      } catch { /* skip duplicates */ }
    }
    res.json({ success: true, added });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/shifts/:shiftId/assignments/:employeeId - Remove assignment
router.delete('/shifts/:shiftId/assignments/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM regular_shift_assignments WHERE shift_id = ? AND employee_id = ?', req.params.shiftId, req.params.employeeId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/shift-plan?date=YYYY-MM-DD - Get planned shifts for a date (for attendance view)
router.get('/shift-plan', async (req: AuthRequest, res: Response) => {
  try {
    const date = (req.query.date as string) || getKSTDate();
    // Calculate week number and day of week from date
    const d = new Date(date + 'T00:00:00+09:00');
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    // ISO week number
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);

    const plans = await dbAll(`
      SELECT rsa.employee_id, rs.planned_clock_in, rs.planned_clock_out, rs.name as shift_name
      FROM regular_shift_assignments rsa
      JOIN regular_shifts rs ON rsa.shift_id = rs.id
      WHERE rs.is_active = 1 AND rs.day_of_week = ?
      ORDER BY rsa.employee_id
    `, dayOfWeek);

    res.json({ date, day_of_week: dayOfWeek, week_number: weekNumber, plans });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/employees/:id/resign - 퇴사처리
// 1) regular_employees.is_active=0 으로 비활성화
// 2) employee_offboardings 에 in_progress 레코드 없으면 자동 INSERT
//    (안 그러면 근무자DB 퇴사자 명단엔 떠도 퇴사관리 메뉴엔 안 나타남)
router.put('/employees/:id/resign', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { resign_date } = req.body;
    if (!resign_date) {
      res.status(400).json({ error: '퇴사일자를 입력해주세요.' });
      return;
    }
    await dbRun(
      'UPDATE regular_employees SET is_active = 0, resign_date = ?, resigned_at = ?, updated_at = NOW() WHERE id = ?',
      resign_date, getKSTTimestamp(), id
    );

    // 퇴사관리 레코드 자동 생성 (이미 있으면 skip)
    const existing = await dbGet(
      `SELECT id FROM employee_offboardings
       WHERE employee_type = 'regular' AND employee_ref_id = ? AND status != 'cancelled'`,
      id,
    );
    if (!existing) {
      const emp = await dbGet(
        'SELECT name, phone, department, hire_date FROM regular_employees WHERE id = ?',
        id,
      );
      if (emp) {
        // loss_date = resign_date + 1 day
        const d = new Date(resign_date + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + 1);
        const lossDate = d.toISOString().slice(0, 10);
        await dbRun(
          `INSERT INTO employee_offboardings (
            employee_type, employee_ref_id, employee_name, employee_phone,
            department, hire_date, resign_date, loss_date,
            reason_code, reason_detail, status,
            email_sent, created_at, updated_at
          ) VALUES ('regular', ?, ?, ?, ?, ?, ?, ?, '', '', 'in_progress', 0, NOW(), NOW())`,
          id,
          emp.name || '',
          emp.phone || '',
          emp.department || '',
          emp.hire_date || '',
          resign_date,
          lossDate,
        );
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/diagnose-employee?name=... - 직원 상태 진단 (퇴사일 동기화 확인용)
router.get('/diagnose-employee', async (req: AuthRequest, res: Response) => {
  try {
    const name = (req.query.name as string || '').trim();
    if (!name) {
      res.status(400).json({ error: 'name 쿼리 파라미터가 필요합니다.' });
      return;
    }
    const re_rows = await dbAll(
      `SELECT id, name, phone, is_active, hire_date, resign_date, resigned_at
       FROM regular_employees
       WHERE name = ? OR name ILIKE ?`,
      name, `%${name}%`
    );
    const eo_rows = await dbAll(
      `SELECT id, employee_type, employee_ref_id, employee_name, employee_phone,
              hire_date, resign_date, loss_date, status, created_at
       FROM employee_offboardings
       WHERE employee_name = ? OR employee_name ILIKE ?
       ORDER BY created_at DESC`,
      name, `%${name}%`
    );
    res.json({ name, regular_employees: re_rows, employee_offboardings: eo_rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/employees/resigned - 퇴사자 목록
router.get('/employees/resigned', async (_req: AuthRequest, res: Response) => {
  try {
    const employees = await dbAll(`
      SELECT re.id, re.phone, re.name, re.department, re.team, re.role, re.workplace_id,
             re.is_active, re.hire_date, re.resign_date, re.resigned_at,
             re.bank_name, re.bank_account, re.id_number,
             re.onboarding_status, sw.name as workplace_name
      FROM regular_employees re
      LEFT JOIN survey_workplaces sw ON re.workplace_id = sw.id
      WHERE re.is_active = 0 AND re.resign_date IS NOT NULL AND re.resign_date != ''
      ORDER BY re.resign_date DESC
    `);
    res.json(employees);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Regular Labor Contracts =====

// POST /api/regular/contracts/send - Send contract link to employee
// 계약서는 매번 새 row를 INSERT (옛 계약서 영향 없음). 1년 단위 재계약·임금협상 등으로 한 직원이
// 여러 계약서를 가질 수 있으며, 각 계약서는 독립적으로 보존됨.
router.post('/contracts/send', async (req: AuthRequest, res: Response) => {
  try {
    const {
      employee_id,
      contract_start,    // 계약 시작일 (재계약 시 admin 입력 필수). 미입력 시 today 기본
      contract_end,      // 계약 종료일. 미입력 시 contract_start + 1년
      work_start_date,   // 입사일 (regular_employees.hire_date 와 일치해야 함; 첫 계약 후엔 변경 X)
      department, position_title, annual_salary, base_pay, meal_allowance, other_allowance,
      pay_day, work_hours, work_place,
      contract_kind,     // 'production' | 'cafe' — 생략 시 부서명이 '카페'로 시작하면 자동 cafe
      work_duties,       // 카페용 명시 (미입력 시 contract_kind 별 기본값 사용)
      work_days,         // 카페용 명시 (예: '주5일(로테이션)')
      break_time,        // 카페용 명시 (예: '30분 (매장별 관행)')
    } = req.body;
    const employee = await dbGet(`SELECT ${EMP_COLS_NO_BLOB} FROM regular_employees WHERE id = ?`, employee_id) as any;
    if (!employee) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }

    const token = require('uuid').v4();
    const today = getKSTDate();
    const cStart = (contract_start && /^\d{4}-\d{2}-\d{2}$/.test(contract_start)) ? contract_start : today;

    const computedEnd = (() => {
      if (contract_end && /^\d{4}-\d{2}-\d{2}$/.test(contract_end)) return contract_end;
      // contract_start + 1년 - 1일 (만 1년 계약 = start ~ start+1년-1일)
      const [y, m, d] = cStart.split('-').map(Number);
      const next = new Date(Date.UTC(y + 1, m - 1, d));
      next.setUTCDate(next.getUTCDate() - 1);
      return next.toISOString().slice(0, 10);
    })();
    const cEnd = computedEnd;

    // work_start_date 명시되지 않으면 직원의 hire_date 사용 (입사일 = 변경 X)
    const wStart = (work_start_date && /^\d{4}-\d{2}-\d{2}$/.test(work_start_date))
      ? work_start_date
      : (employee.hire_date || cStart);

    // contract_kind 결정: 명시 > 부서명 접두어 자동감지 > production
    const deptForKind = String(department || employee.department || '');
    const kind: 'production' | 'cafe' = (contract_kind === 'cafe' || contract_kind === 'production')
      ? contract_kind
      : (deptForKind.startsWith('카페') ? 'cafe' : 'production');

    // kind 별 기본값
    const CAFE_WORK_DUTIES = '카페 매장 운영, 음료·베이커리 제조 및 판매, 매장 청결·재고 관리 및 이에 부수하는 업무';
    const CAFE_WORK_DAYS = '주 5일 (매장 스케줄에 따른 로테이션)';
    const CAFE_BREAK_TIME = '근로기준법 제54조에 따른 휴게시간 (매장 스케줄에 따라 부여)';
    const CAFE_STORE_ADDRESSES: Record<string, string> = {
      '카페(해방촌)': '서울특별시 용산구 신흥로15길 18-12 (널담은공간 해방촌점)',
      '카페(행궁동)': '경기도 수원시 팔달구 정조로886번길 14 1층 (널담은공간 화홍문점)',
      '카페(경복궁)': '서울특별시 종로구 삼청로 24 (널담은공간 경복궁점)',
    };
    const resolvedDuties = work_duties || (kind === 'cafe' ? CAFE_WORK_DUTIES : '');
    const resolvedDays = work_days || (kind === 'cafe' ? CAFE_WORK_DAYS : '');
    const resolvedBreak = break_time || (kind === 'cafe' ? CAFE_BREAK_TIME : '');
    const resolvedPlace = work_place || (kind === 'cafe' ? (CAFE_STORE_ADDRESSES[deptForKind] || '널담은공간 매장') : '');
    const resolvedHours = work_hours || (kind === 'cafe' ? '' : '09:00~18:00');

    await dbRun(
      `INSERT INTO regular_labor_contracts (employee_id, phone, worker_name, contract_start, contract_end, token, work_start_date, department, position_title, annual_salary, base_pay, meal_allowance, other_allowance, pay_day, work_hours, work_place, sms_sent, contract_kind, work_duties, work_days, break_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      employee.id, employee.phone, employee.name, cStart, cEnd, token,
      wStart, department || employee.department || '', position_title || '사원',
      annual_salary || '', base_pay || '', meal_allowance || '', other_allowance || '', pay_day || '10', resolvedHours, resolvedPlace, 0,
      kind, resolvedDuties, resolvedDays, resolvedBreak
    );

    const contractLink = getFrontendUrl(`/regular-contract?token=${token}`);
    const smsHeader = kind === 'cafe' ? '[조인앤조인 카페팀 근로계약서]' : '[조인앤조인 근로계약서]';
    const message = `${smsHeader}\n${employee.name}님, 근로계약서를 작성해주세요.\n아래 링크를 눌러 서명해주세요.\n${contractLink}`;
    const smsResult = await sendGeneralSms(employee.phone, message);

    if (smsResult.success) {
      await dbRun(`UPDATE regular_labor_contracts SET sms_sent = 1 WHERE token = ?`, token);
      res.json({ success: true, messageId: smsResult.messageId });
    } else {
      console.error(`[contracts/send] SMS 발송 실패 — employee_id=${employee.id} (${employee.name}) phone=${employee.phone} error=${smsResult.error}`);
      res.status(502).json({
        success: false,
        error: smsResult.error || 'SMS 발송 실패',
        message: 'DB에는 계약서 row 가 생성되었으나 SMS 가 발송되지 않았습니다. SOLAPI 설정·잔액·수신번호를 확인하세요.',
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/contracts/diagnose?name=... - 계약서 발송 진단 (sms_sent 상태 + SMS provider)
router.get('/contracts/diagnose', async (req: AuthRequest, res: Response) => {
  try {
    const name = (req.query.name as string || '').trim();
    if (!name) { res.status(400).json({ error: 'name 쿼리 파라미터가 필요합니다.' }); return; }

    const rows = await dbAll(
      `SELECT rlc.id, rlc.employee_id, rlc.worker_name, rlc.phone, rlc.contract_start,
              rlc.contract_end, rlc.status, rlc.sms_sent, rlc.token, rlc.created_at,
              re.is_active, re.phone as employee_phone_master
       FROM regular_labor_contracts rlc
       LEFT JOIN regular_employees re ON rlc.employee_id = re.id
       WHERE rlc.worker_name = ? OR rlc.worker_name ILIKE ?
          OR re.name = ? OR re.name ILIKE ?
       ORDER BY rlc.created_at DESC
       LIMIT 20`,
      name, `%${name}%`, name, `%${name}%`
    );

    res.json({
      name,
      sms_provider: process.env.SMS_PROVIDER || 'mock',
      solapi_configured: Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_NUMBER),
      solapi_sender: process.env.SOLAPI_SENDER_NUMBER ? process.env.SOLAPI_SENDER_NUMBER.replace(/(\d{3})\d+(\d{4})/, '$1****$2') : null,
      contracts: rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/contracts - List all contracts
router.get('/contracts', async (_req: AuthRequest, res: Response) => {
  try {
    // regular_labor_contracts 는 505MB(signature_data, scanned_file_data, bank_slip_data,
    // foreign_id_card_data 등 Base64 blob). list 에서는 has_* boolean 만 노출하고
    // 실제 데이터는 detail 엔드포인트(/contracts/:id)에서 조회.
    const contracts = await dbAll(`
      SELECT rlc.id, rlc.employee_id, rlc.phone, rlc.worker_name as name,
             rlc.contract_start, rlc.contract_end, rlc.status, rlc.token,
             rlc.sms_sent, rlc.created_at, rlc.created_at as updated_at, rlc.work_start_date,
             rlc.position_title, rlc.annual_salary, rlc.base_pay, rlc.meal_allowance,
             rlc.other_allowance, rlc.pay_day, rlc.work_hours, rlc.work_place,
             rlc.department as contract_department, rlc.email, rlc.nationality,
             rlc.visa_type, rlc.visa_expiry,
             COALESCE(rlc.is_legacy_scan, 0) as is_legacy_scan,
             COALESCE(rlc.legacy_filename, '') as legacy_filename,
             COALESCE(re.department, '') as department,
             COALESCE(re.team, '') as team
      FROM regular_labor_contracts rlc
      LEFT JOIN regular_employees re ON rlc.employee_id = re.id
      ORDER BY rlc.created_at DESC
    `);
    res.json(contracts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Password Management =====

// GET /api/regular/admin-password - Check if password is set
router.get('/admin-password', async (req: AuthRequest, res: Response) => {
  try {
    const setting = await dbGet("SELECT value FROM admin_settings WHERE key = 'contract_password'") as any;
    res.json({ has_password: !!(setting?.value) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/admin-password - Set password (only lion9080@joinandjoin.com)
router.post('/admin-password', async (req: AuthRequest, res: Response) => {
  try {
    if (req.user?.email !== 'lion9080@joinandjoin.com') {
      res.status(403).json({ error: '권한이 없습니다. lion9080@joinandjoin.com만 접근 가능합니다.' });
      return;
    }
    const { password } = req.body;
    if (!password) { res.status(400).json({ error: '비밀번호를 입력해주세요.' }); return; }

    const existing = await dbGet("SELECT id FROM admin_settings WHERE key = 'contract_password'");
    if (existing) {
      await dbRun("UPDATE admin_settings SET value = ?, updated_at = NOW() WHERE key = 'contract_password'", password);
    } else {
      await dbRun("INSERT INTO admin_settings (key, value) VALUES ('contract_password', ?)", password);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/verify-password - Verify contract password
router.post('/verify-password', async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    const setting = await dbGet("SELECT value FROM admin_settings WHERE key = 'contract_password'") as any;
    if (!setting?.value) {
      res.json({ verified: true }); // No password set, allow access
      return;
    }
    res.json({ verified: setting.value === password });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Attendance Summary =====

// GET /api/regular/attendance-summary - Monthly attendance summary (planned vs actual)
router.get('/attendance-summary', async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.query as Record<string, string>;
    if (!year || !month) { res.status(400).json({ error: 'year, month 필요' }); return; }

    const startDate = `${year}-${month.padStart(2,'0')}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${month.padStart(2,'0')}-${lastDay}`;

    // Batch queries instead of N+1 per employee
    const employees = await dbAll('SELECT id, name, phone, department, team FROM regular_employees WHERE is_active = 1 ORDER BY department, team, name') as any[];

    // All attendance for the month in one query
    const allActuals = await dbAll(
      'SELECT employee_id, date, clock_in_time, clock_out_time FROM regular_attendance WHERE date >= ? AND date <= ? ORDER BY date',
      startDate, endDate
    ) as any[];

    // All shift assignments for the month in one query
    const allShifts = await dbAll(`
      SELECT rsa.employee_id, rs.planned_clock_in, rs.planned_clock_out, rs.days_of_week, rs.day_of_week, rs.month, rs.week_number
      FROM regular_shift_assignments rsa
      JOIN regular_shifts rs ON rsa.shift_id = rs.id
      WHERE rs.is_active = 1 AND (rs.month = 0 OR rs.month = ?)
    `, parseInt(month)) as any[];

    // Index by employee_id
    const actualsMap = new Map<number, any[]>();
    for (const a of allActuals) {
      if (!actualsMap.has(a.employee_id)) actualsMap.set(a.employee_id, []);
      actualsMap.get(a.employee_id)!.push(a);
    }
    const shiftsMap = new Map<number, any[]>();
    for (const s of allShifts) {
      if (!shiftsMap.has(s.employee_id)) shiftsMap.set(s.employee_id, []);
      shiftsMap.get(s.employee_id)!.push(s);
    }

    const result = employees.map((emp: any) => ({
      id: emp.id,
      name: emp.name,
      phone: emp.phone,
      department: emp.department,
      team: emp.team,
      actuals: actualsMap.get(emp.id) || [],
      shifts: shiftsMap.get(emp.id) || [],
      actual_days: (actualsMap.get(emp.id) || []).length,
    }));

    res.json({ employees: result, startDate, endDate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/attendance-month/:employeeId?year=X&month=Y
// 특정 직원의 해당 월 regular_attendance + confirmed_attendance 완전 삭제
// 근태정보 종합요약의 '리스트에서 제거' 버튼이 호출 → 미확정 캘린더와 일치 유지
router.delete('/attendance-month/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const empIdNum = parseInt(String(req.params.employeeId || ''), 10);
    if (isNaN(empIdNum)) { res.status(400).json({ error: '잘못된 employeeId' }); return; }
    const { year, month } = req.query as Record<string, string>;
    if (!year || !month) { res.status(400).json({ error: 'year, month 필요' }); return; }
    const mm = month.padStart(2, '0');
    const startDate = `${year}-${mm}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
    const yearMonth = `${year}-${mm}`;

    // 직원 이름 조회 (confirmed_attendance는 name으로 저장됨)
    const emp = await dbGet('SELECT name FROM regular_employees WHERE id = ?', empIdNum) as any;
    const empName = emp?.name || '';

    let deletedAttendance = 0;
    let deletedConfirmed = 0;
    try {
      const delAtt = await dbRun(
        'DELETE FROM regular_attendance WHERE employee_id = ? AND date >= ? AND date <= ?',
        empIdNum, startDate, endDate
      );
      deletedAttendance = delAtt.changes || 0;
    } catch (e: any) {
      console.error('[delete attendance-month] regular_attendance error:', e?.message);
    }
    try {
      if (empName) {
        const delConf = await dbRun(
          "DELETE FROM confirmed_attendance WHERE employee_name = ? AND employee_type = '정규직' AND year_month = ?",
          empName, yearMonth
        );
        deletedConfirmed = delConf.changes || 0;
      }
    } catch (e: any) {
      console.error('[delete attendance-month] confirmed_attendance error:', e?.message);
    }
    res.json({
      success: true,
      deleted_attendance: deletedAttendance,
      deleted_confirmed: deletedConfirmed,
      employee_name: empName,
    });
  } catch (error: any) {
    console.error('[delete attendance-month] unexpected error:', error?.message);
    res.status(500).json({ error: error.message || '삭제 중 오류가 발생했습니다.' });
  }
});

// POST /api/regular/attendance-confirm - Confirm attendance records
router.post('/attendance-confirm', async (req: AuthRequest, res: Response) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) { res.status(400).json({ error: 'records 배열 필요' }); return; }

    let confirmed = 0;
    for (const r of records) {
      try {
        const existing = await dbGet(
          "SELECT id FROM confirmed_attendance WHERE employee_name = ? AND date = ?",
          r.employee_name, r.date
        );
        if (existing) {
          await dbRun(
            `UPDATE confirmed_attendance SET employee_type = ?, confirmed_clock_in = ?, confirmed_clock_out = ?, source = ?, regular_hours = ?, overtime_hours = ?, night_hours = ?, break_hours = ?, holiday_work = ?, memo = ?, department = ?, confirmed_at = NOW() WHERE id = ?`,
            r.employee_type || '정규직', r.confirmed_clock_in, r.confirmed_clock_out, r.source || 'planned', r.regular_hours || 0, r.overtime_hours || 0, r.night_hours || 0, r.break_hours !== undefined && r.break_hours !== null ? r.break_hours : 1, r.holiday_work || 0, r.memo || '', r.department || '', (existing as any).id
          );
        } else {
          await dbRun(
            `INSERT INTO confirmed_attendance (employee_type, employee_name, employee_phone, date, confirmed_clock_in, confirmed_clock_out, source, regular_hours, overtime_hours, night_hours, break_hours, holiday_work, memo, year_month, department)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            r.employee_type || '정규직', r.employee_name, r.employee_phone || '', r.date, r.confirmed_clock_in, r.confirmed_clock_out, r.source || 'planned', r.regular_hours || 0, r.overtime_hours || 0, r.night_hours || 0, r.break_hours !== undefined && r.break_hours !== null ? r.break_hours : 1, r.holiday_work || 0, r.memo || '', r.year_month || r.date.slice(0, 7), r.department || ''
          );
        }
        confirmed++;
      } catch {}
    }
    res.json({ success: true, confirmed });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/confirmed-list - Get confirmed attendance list
router.get('/confirmed-list', async (req: AuthRequest, res: Response) => {
  try {
    const { year_month, employee_type } = req.query as Record<string, string>;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (year_month) { where += ' AND year_month = ?'; params.push(year_month); }
    if (employee_type) { where += ' AND employee_type = ?'; params.push(employee_type); }

    const records = await dbAll(`SELECT * FROM confirmed_attendance ${where} ORDER BY employee_name, date`, ...params);

    // Look up departments + worker categories + worker IDs (phone 기준만)
    // NOTE: 이름 괄호 suffix('수빈(HO THI BICH)')는 별개 사람일 수 있어 병합 금지.
    const deptMap = new Map<string, string>();
    const catMap = new Map<string, string>();
    const wIdByPhone = new Map<string, number>();
    try {
      const workers = await dbAll("SELECT id, name_ko, phone, department, category FROM workers");
      for (const w of workers as any[]) {
        const np = normalizePhone(w.phone || '');
        if (w.name_ko) deptMap.set(w.name_ko, w.department || '');
        if (w.category) {
          if (np) catMap.set(np, w.category);
          if (w.phone) catMap.set(w.phone, w.category);
          if (w.name_ko) catMap.set(w.name_ko, w.category);
        }
        if (np) wIdByPhone.set(np, w.id);
      }
      const regs = await dbAll("SELECT name, department FROM regular_employees WHERE is_active = 1");
      for (const r of regs as any[]) { if (r.name) deptMap.set(r.name, r.department || ''); }
    } catch {}

    // Effective type: 명시값 있으면 그대로 사용, 빈 값만 workers.category로 fallback
    // '정규직' 등 명시값은 자동 재분류 안 함
    const getEffectiveType = (r: any): string => {
      let t = (r.employee_type || '').toString().trim();
      if (!t) {
        const np = normalizePhone(r.employee_phone || '');
        t = catMap.get(np) || catMap.get(r.employee_phone) || catMap.get(r.employee_name) || '';
      }
      if (t.includes('파견')) return '파견';
      if (t.includes('알바') || t.includes('사업소득')) return '알바';
      if (t.includes('정규')) return '정규직';
      return t || '?';
    };

    // Canonical identity: phone 우선, 없으면 raw name. 이름 normalization 금지.
    const canonicalIdentity = (r: any): string => {
      const normPhone = normalizePhone(r.employee_phone || '');
      const wid = wIdByPhone.get(normPhone);
      if (wid) return `w${wid}`;
      return normPhone || r.employee_name || '';
    };

    // Summarize by (normalized phone || name) + effective_type so that
    // (1) same person entered under different name spellings merges into one row,
    // (2) mixed-type records under one name split into per-type rows,
    // matching /api/survey/settlement's per-record classification.
    // Also attach effective_type to each record for client-side filtering/debugging.
    const empMap = new Map<string, any>();
    for (const r of records as any[]) {
      const effType = getEffectiveType(r);
      (r as any).effective_type = effType;
      const identity = canonicalIdentity(r);
      const key = `${identity}|${effType}`;
      if (!empMap.has(key)) {
        empMap.set(key, {
          name: r.employee_name, phone: r.employee_phone, type: effType,
          department: deptMap.get(r.employee_name) || '',
          days: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0, break_hours: 0, holiday_days: 0,
          records: []
        });
      }
      const emp = empMap.get(key)!;
      emp.days++;
      emp.regular_hours += parseFloat(r.regular_hours) || 0;
      emp.overtime_hours += parseFloat(r.overtime_hours) || 0;
      emp.night_hours += parseFloat(r.night_hours) || 0;
      emp.break_hours += parseFloat(r.break_hours) || 0;
      emp.holiday_days += r.holiday_work ? 1 : 0;
      emp.records.push(r);
    }

    // Round sums to 2 decimals to match /api/survey/settlement output exactly
    const result = Array.from(empMap.values()).map((e: any) => ({
      ...e,
      regular_hours: Math.round(e.regular_hours * 100) / 100,
      overtime_hours: Math.round(e.overtime_hours * 100) / 100,
      night_hours: Math.round(e.night_hours * 100) / 100,
      break_hours: Math.round(e.break_hours * 100) / 100,
    }));
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/confirmed-list/:id - Update single confirmed record
router.put('/confirmed-list/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { confirmed_clock_in, confirmed_clock_out, regular_hours, overtime_hours, night_hours, break_hours, holiday_work, memo } = req.body;
    await dbRun(
      `UPDATE confirmed_attendance SET confirmed_clock_in = ?, confirmed_clock_out = ?, regular_hours = ?, overtime_hours = ?, night_hours = ?, break_hours = ?, holiday_work = ?, memo = ?, confirmed_at = NOW() WHERE id = ?`,
      confirmed_clock_in, confirmed_clock_out, regular_hours || 0, overtime_hours || 0, night_hours || 0, break_hours !== undefined && break_hours !== null ? break_hours : 1, holiday_work || 0, memo || '', req.params.id
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/regular/confirmed-list/:id/type - Update employee_type for a single record
router.patch('/confirmed-list/:id/type', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_type } = req.body;
    if (typeof employee_type !== 'string') {
      res.status(400).json({ error: 'employee_type 필요' });
      return;
    }
    await dbRun(
      'UPDATE confirmed_attendance SET employee_type = ?, confirmed_at = NOW() WHERE id = ?',
      employee_type, req.params.id
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/confirmed-list/:id - Delete single confirmed record
router.delete('/confirmed-list/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM confirmed_attendance WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/recalc-confirmed - Recalculate all confirmed records with clock-in ceil30 + clock-out floor30
router.post('/recalc-confirmed', async (req: AuthRequest, res: Response) => {
  try {
    const records = await dbAll('SELECT * FROM confirmed_attendance') as any[];
    let updated = 0;
    for (const r of records) {
      if (!r.confirmed_clock_in || !r.confirmed_clock_out) continue;
      const [h1, m1] = r.confirmed_clock_in.split(':').map(Number);
      const [h2, m2] = r.confirmed_clock_out.split(':').map(Number);
      if (isNaN(h1) || isNaN(h2)) continue;

      // 출근: 30분 올림, 퇴근: 30분 내림
      const startMin = Math.ceil((h1 * 60 + (m1 || 0)) / 30) * 30;
      let endMin = Math.floor((h2 * 60 + (m2 || 0)) / 30) * 30;
      if (endMin <= startMin) endMin += 1440; // 야간조 자정 넘김
      const totalMin = endMin - startMin;
      const totalH = totalMin / 60;

      const parsedBreak = parseFloat(r.break_hours);
      const breakH = !isNaN(parsedBreak) ? parsedBreak : (totalH >= 8 ? 1 : totalH >= 4 ? 0.5 : 0);
      const workH = Math.max(totalH - breakH, 0);

      // Night hours (22:00~06:00)
      let nightMin = 0;
      for (let min = startMin; min < endMin; min++) {
        const h = Math.floor(min / 60) % 24;
        if (h >= 22 || h < 6) nightMin++;
      }
      const nightH = Math.round(nightMin / 60 * 10) / 10;
      const dayWork = Math.max(workH - nightH, 0); // 야간 분리

      const isHoliday = isHolidayOrWeekend(r.date);
      const regularH = isHoliday ? 0 : Math.round(Math.min(dayWork, 8) * 10) / 10;
      const overtimeH = isHoliday ? Math.round(dayWork * 10) / 10 : Math.round(Math.max(dayWork - 8, 0) * 10) / 10;

      await dbRun(
        'UPDATE confirmed_attendance SET regular_hours = ?, overtime_hours = ?, night_hours = ? WHERE id = ?',
        regularH, overtimeH, nightH, r.id
      );
      updated++;
    }
    res.json({ success: true, updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/vacation-dates - Get approved vacation dates for a month
router.get('/vacation-dates', async (req: AuthRequest, res: Response) => {
  try {
    const { year_month } = req.query as Record<string, string>;
    if (!year_month) { res.status(400).json({ error: 'year_month 필요' }); return; }

    const vacations = await dbAll(`
      SELECT vr.*, re.name as employee_name, re.department, re.team
      FROM regular_vacation_requests vr
      JOIN regular_employees re ON vr.employee_id = re.id
      WHERE vr.status = 'approved'
        AND vr.start_date <= ? AND vr.end_date >= ?
    `, year_month + '-31', year_month + '-01');

    res.json(vacations || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Salary Settings =====

// GET /api/regular/salary-settings - List all salary settings with employee info
router.get('/salary-settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await dbAll(`
      SELECT re.id as employee_id, re.name, re.department, re.team, re.role, re.hire_date, re.phone,
             COALESCE(ss.base_pay, 0) as base_pay,
             COALESCE(ss.meal_allowance, 0) as meal_allowance,
             COALESCE(ss.bonus, 0) as bonus,
             COALESCE(ss.position_allowance, 0) as position_allowance,
             COALESCE(ss.other_allowance, 0) as other_allowance,
             COALESCE(ss.overtime_hourly_rate, 0) as overtime_hourly_rate
      FROM regular_employees re
      LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
      WHERE re.is_active = 1
      ORDER BY re.department, re.team, re.name
    `);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/salary-settings/:employeeId - Update salary settings
router.put('/salary-settings/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { base_pay, meal_allowance, bonus, position_allowance, other_allowance, overtime_hourly_rate } = req.body;

    const existing = await dbGet('SELECT id FROM regular_salary_settings WHERE employee_id = ?', employeeId);
    if (existing) {
      await dbRun(
        'UPDATE regular_salary_settings SET base_pay = ?, meal_allowance = ?, bonus = ?, position_allowance = ?, other_allowance = ?, overtime_hourly_rate = ?, updated_at = NOW() WHERE employee_id = ?',
        base_pay || 0, meal_allowance || 0, bonus || 0, position_allowance || 0, other_allowance || 0, overtime_hourly_rate || 0, employeeId
      );
    } else {
      await dbRun(
        'INSERT INTO regular_salary_settings (employee_id, base_pay, meal_allowance, bonus, position_allowance, other_allowance, overtime_hourly_rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        employeeId, base_pay || 0, meal_allowance || 0, bonus || 0, position_allowance || 0, other_allowance || 0, overtime_hourly_rate || 0
      );
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/salary-settings/:employeeId/hourly-rate — 시급만 부분 update
router.put('/salary-settings/:employeeId/hourly-rate', async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { overtime_hourly_rate } = req.body || {};
    const rate = parseInt(overtime_hourly_rate, 10) || 0;
    const existing = await dbGet('SELECT id FROM regular_salary_settings WHERE employee_id = ?', employeeId) as any;
    if (existing) {
      await dbRun('UPDATE regular_salary_settings SET overtime_hourly_rate = ?, updated_at = NOW() WHERE employee_id = ?', rate, employeeId);
    } else {
      await dbRun('INSERT INTO regular_salary_settings (employee_id, overtime_hourly_rate) VALUES (?, ?)', employeeId, rate);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/salary-settings/bulk-hourly-rate — 일괄 시급 적용 (전체 활성 직원)
router.post('/salary-settings/bulk-hourly-rate', async (req: AuthRequest, res: Response) => {
  try {
    const { overtime_hourly_rate } = req.body || {};
    const rate = parseInt(overtime_hourly_rate, 10) || 0;
    if (rate <= 0) { res.status(400).json({ error: 'overtime_hourly_rate 필수' }); return; }
    // 활성 직원 + 활성 + 4월 등 최근 퇴사자 대상
    const emps = await dbAll(`SELECT id FROM regular_employees WHERE is_active = 1`) as any[];
    let updated = 0;
    for (const e of emps) {
      const existing = await dbGet('SELECT id FROM regular_salary_settings WHERE employee_id = ?', e.id) as any;
      if (existing) {
        await dbRun('UPDATE regular_salary_settings SET overtime_hourly_rate = ?, updated_at = NOW() WHERE employee_id = ?', rate, e.id);
      } else {
        await dbRun('INSERT INTO regular_salary_settings (employee_id, overtime_hourly_rate) VALUES (?, ?)', e.id, rate);
      }
      updated++;
    }
    res.json({ success: true, updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/payroll-calc - Calculate payroll based on confirmed attendance + salary settings
router.get('/payroll-calc', async (req: AuthRequest, res: Response) => {
  try {
    const yearMonth = (req.query.year_month as string) || getKSTDate().slice(0, 7);

    // Get all confirmed attendance records (not grouped, need per-day for holiday check)
    const allRecords = await dbAll(`
      SELECT * FROM confirmed_attendance
      WHERE year_month = ? AND employee_type = '정규직'
      ORDER BY employee_name, date
    `, yearMonth) as any[];

    // 직원의 hire_date 맵 (phone-norm 기반) — confirmed_attendance 의 입사일 이전 records 제외용.
    // 예: 4/15 입사자에게 4/8 records 가 있으면 actualWorkDays 부풀려져 결근 산정 왜곡됨.
    const norm = (p: string) => (p || '').replace(/[-\s]/g, '').trim();
    const hireMap = new Map<string, string>();
    const empHireRows = await dbAll(`SELECT phone, name, hire_date FROM regular_employees WHERE is_active = 1 OR (resign_date != '' AND resign_date >= ?)`, `${yearMonth}-01`) as any[];
    for (const r of empHireRows) {
      if (!r.hire_date) continue;
      const np = norm(r.phone);
      if (np) hireMap.set(np, r.hire_date);
      if (r.name) hireMap.set(`name:${r.name}`, r.hire_date);
    }

    // Group by employee. Use phone as canonical key when available, fallback to name.
    // This merges records that arrived under different name spellings for the same person
    // (e.g., '파타' vs 'AHMAD AZHARUL FATA(파타)') so payroll totals match confirmed-list totals.
    const keyFor = (rec: any) => norm(rec.employee_phone) || rec.employee_name;
    const empMap = new Map<string, { employee_name: string; employee_phone: string; total_regular: number; total_overtime: number; total_night: number; work_days: number; holiday_days: number; holiday_hours: number }>();
    for (const rec of allRecords) {
      // 입사일 이전 records 는 카운트에서 제외 (출근 일수 부풀려짐 방지)
      const np = norm(rec.employee_phone);
      const empHire = (np && hireMap.get(np)) || hireMap.get(`name:${rec.employee_name}`);
      if (empHire && rec.date < empHire) continue;

      const key = keyFor(rec);
      if (!empMap.has(key)) {
        empMap.set(key, { employee_name: rec.employee_name, employee_phone: rec.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
      }
      const emp = empMap.get(key)!;
      emp.work_days++;
      const regH = parseFloat(rec.regular_hours) || 0;
      const otH = parseFloat(rec.overtime_hours) || 0;
      const nightH = parseFloat(rec.night_hours) || 0;
      // 휴일 근무시간 = 그 날 실제로 일한 모든 시간(주간+야간). 야간 근로자가 토요일에 출근하면
      // recalc 시 regularH=0, overtimeH=0, nightH=8 형태로 기록되므로 nightH 도 합산해야 한다.
      const totalH = regH + otH + nightH;

      if (isHolidayOrWeekend(rec.date)) {
        // 휴일/주말 근무 시간은 holiday_hours에만 누적 (overtime과 별개로 계산)
        // 이전 버그: overtime에도 더하고 holiday_hours에도 더해서 이중 지급됨
        emp.holiday_days++;
        emp.holiday_hours += totalH;
      } else {
        emp.total_regular += regH;
        emp.total_overtime += otH;
      }
      emp.total_night += nightH;
    }
    const confirmed = Array.from(empMap.values());

    // Load approved vacation requests for the payroll month and add 8h per vacation day as regular hours
    const [yearStr, monthStr] = yearMonth.split('-');
    const monthStart = `${yearMonth}-01`;
    const lastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
    const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    const approvedVacations = await dbAll(`
      SELECT rvr.employee_id, re.name as employee_name, re.phone as employee_phone,
             rvr.start_date, rvr.end_date, rvr.type
      FROM regular_vacation_requests rvr
      JOIN regular_employees re ON rvr.employee_id = re.id
      WHERE rvr.status = 'approved'
        AND rvr.start_date <= ? AND rvr.end_date >= ?
    `, monthEnd, monthStart) as any[];

    for (const vac of approvedVacations) {
      // Iterate each calendar day in the vacation that falls within the payroll month
      const vacStart = new Date(Math.max(new Date(vac.start_date).getTime(), new Date(monthStart).getTime()));
      const vacEnd = new Date(Math.min(new Date(vac.end_date).getTime(), new Date(monthEnd).getTime()));
      const vacKey = norm(vac.employee_phone) || vac.employee_name;
      for (let d = new Date(vacStart); d <= vacEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        // Skip weekends and holidays — vacation on those days doesn't need to count as worked
        if (isHolidayOrWeekend(dateStr)) continue;
        // Skip dates that already have a confirmed attendance record (match by phone if possible)
        const alreadyCounted = allRecords.some((r: any) => keyFor(r) === vacKey && r.date === dateStr);
        if (alreadyCounted) continue;
        // Add 8 hours of regular work for this vacation day
        if (!empMap.has(vacKey)) {
          empMap.set(vacKey, { employee_name: vac.employee_name, employee_phone: vac.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
        }
        const empEntry = empMap.get(vacKey)!;
        empEntry.total_regular += 8;
        empEntry.work_days++;
      }
    }

    // Re-derive confirmed after vacation additions
    const confirmedWithVacation = Array.from(empMap.values());

    // Get salary settings
    // 포함 조건:
    //   1) 활성 직원 (is_active=1)
    //   2) 해당 월 1일 이후 퇴사자 (resign_date >= monthStart) — 5월에 퇴사한 사람은 5월 화면에 표시.
    //      그 이전 퇴사자(예: 4월 입사·퇴사 콴/파타)는 5월에 표시 안 함.
    //   3) 데이터 이상 안전망: is_active=0 + resign_date 비어있어도 그 월 confirmed_attendance 있으면 포함.
    //      → 동기화 누락 케이스는 db.ts startup migration 으로 backfill 됨.
    const salaries = await dbAll(`
      SELECT re.id as employee_id, re.name, re.phone, re.department, re.team, re.hire_date,
             COALESCE(re.resign_date, '') as resign_date,
             COALESCE(re.bank_name, '') as bank_name,
             COALESCE(re.bank_account, '') as bank_account,
             COALESCE(re.id_number, '') as id_number,
             COALESCE(ss.base_pay, 0) as base_pay,
             COALESCE(ss.meal_allowance, 0) as meal_allowance,
             COALESCE(ss.bonus, 0) as bonus,
             COALESCE(ss.position_allowance, 0) as position_allowance,
             COALESCE(ss.other_allowance, 0) as other_allowance,
             COALESCE(ss.overtime_hourly_rate, 0) as overtime_hourly_rate,
             COALESCE(adj.amount, 0) as adjustment_amount,
             COALESCE(adj.memo, '') as adjustment_memo
      FROM regular_employees re
      LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
      LEFT JOIN regular_payroll_adjustments adj ON re.id = adj.employee_id AND adj.year_month = ?
      WHERE re.is_active = 1
         OR (COALESCE(re.resign_date, '') <> '' AND re.resign_date >= ?)
         OR EXISTS (
           SELECT 1 FROM confirmed_attendance ca
           WHERE ca.year_month = ?
             AND ca.employee_type = '정규직'
             AND (
               (re.phone IS NOT NULL AND re.phone <> ''
                AND REGEXP_REPLACE(COALESCE(ca.employee_phone, ''), '[-\\s]', '', 'g')
                  = REGEXP_REPLACE(re.phone, '[-\\s]', '', 'g'))
               OR ca.employee_name = re.name
             )
         )
    `, yearMonth, monthStart, yearMonth) as any[];

    // resign_date fallback — regular_employees.resign_date 가 비어있는 직원에 대해
    // employee_offboardings 에서 보강. ref_id → name → phone 정규화 순으로 매칭.
    // 닷·반하이·실비아·카당카당·테오살린 등 동기화 누락 케이스를 즉시 해결.
    const emptyResignSalaries = salaries.filter((s: any) => !s.resign_date || s.resign_date === '');
    if (emptyResignSalaries.length > 0) {
      const offbs = await dbAll(`
        SELECT employee_ref_id, employee_name, employee_phone, resign_date, created_at
        FROM employee_offboardings
        WHERE status <> 'cancelled'
          AND resign_date IS NOT NULL AND resign_date <> ''
        ORDER BY created_at DESC
      `) as any[];

      const offbByRefId = new Map<number, string>();
      const offbByName = new Map<string, string>();
      const offbByPhone = new Map<string, string>();
      for (const eo of offbs) {
        if (eo.employee_ref_id && !offbByRefId.has(eo.employee_ref_id)) {
          offbByRefId.set(eo.employee_ref_id, eo.resign_date);
        }
        if (eo.employee_name && !offbByName.has(eo.employee_name)) {
          offbByName.set(eo.employee_name, eo.resign_date);
        }
        if (eo.employee_phone) {
          const np = norm(eo.employee_phone);
          if (np && !offbByPhone.has(np)) offbByPhone.set(np, eo.resign_date);
        }
      }
      for (const sal of emptyResignSalaries) {
        let r = offbByRefId.get(sal.employee_id);
        if (!r && sal.name) r = offbByName.get(sal.name);
        if (!r && sal.phone) r = offbByPhone.get(norm(sal.phone));
        if (r) sal.resign_date = r;
      }
    }

    // 마감 여부 먼저 확인 (마감 전이면 기본급 전액, 마감 후면 결근 차감)
    const closingCheck = await dbGet('SELECT * FROM payroll_closing WHERE year_month = ?', yearMonth) as any;
    const payrollClosed = !!closingCheck;

    // 활성 대출 — 직원별로 묶어서 해당 월 차감액 계산용
    const activeLoans = await dbAll(`SELECT * FROM employee_loans WHERE status = 'active'`) as any[];
    const loansByEmployee = new Map<number, any[]>();
    for (const l of activeLoans) {
      const arr = loansByEmployee.get(l.employee_id) || [];
      arr.push(l);
      loansByEmployee.set(l.employee_id, arr);
    }

    const results = [];
    const daysInMonth = lastDay;
    for (const sal of salaries) {
      // Match by phone first (canonical), fallback to name. Handles confirmed_attendance
      // records that arrived under different name spellings for the same employee.
      const salPhone = norm(sal.phone);
      const att = confirmedWithVacation.find(c =>
        (salPhone && norm(c.employee_phone) === salPhone) || c.employee_name === sal.name
      );
      const overtimeHours = att?.total_overtime || 0;
      const holidayHours = att?.holiday_hours || 0;
      const hourlyRate = parseFloat(sal.overtime_hourly_rate) || 10320;
      const overtimePay = Math.round(overtimeHours * hourlyRate * 1.5);
      const holidayPay = Math.round(holidayHours * hourlyRate * 1.5);

      // 소정근로일 계산
      const hireDate = sal.hire_date || '';
      const resignDate = sal.resign_date || '';
      const todayStr = getKSTDate();
      const cutoffDate = todayStr < monthEnd ? todayStr : monthEnd;

      // 전체 월 소정근로일 (입사일/퇴사일 고려)
      let totalScheduledDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
        if (isHolidayOrWeekend(dateStr)) continue;
        if (hireDate && dateStr < hireDate) continue;
        if (resignDate && resignDate >= monthStart && resignDate <= monthEnd && dateStr > resignDate) continue;
        totalScheduledDays++;
      }

      // 오늘까지 경과한 소정근로일 (결근 계산용)
      let elapsedScheduledDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
        if (dateStr > cutoffDate) break;
        if (isHolidayOrWeekend(dateStr)) continue;
        if (hireDate && dateStr < hireDate) continue;
        if (resignDate && resignDate >= monthStart && resignDate <= monthEnd && dateStr > resignDate) continue;
        elapsedScheduledDays++;
      }

      // 실제 근무일 = 평일 확정 출근일 + 휴가일 (주말/휴일 근무는 제외 - 별도 수당)
      const weekdayWorkDays = att ? att.work_days - (att.holiday_days || 0) : 0;
      const actualWorkDays = weekdayWorkDays;

      // 입사월·퇴사월 여부 — 입사일~퇴사일(없으면 월말) calendar window 기반 일할.
      // 산식: calRatio(window calendar / 월 calendar) × workRatio(실근무 / window 평일).
      //   - 4/1 입사·22일 평일 모두 근무 → 30/30 × 22/22 = 100%
      //   - 콴 4/20 입~4/21 퇴·1일 근무 → 2/30 × 1/2 = 1/30 (= 72,000원)
      //   - 파타 4/15 입~4/19 퇴·3일 근무 → 5/30 × 3/5 = 3/30 (= 216,000원)
      // 일반 직원은 결근 차감 모델 그대로.
      const hireMonth = hireDate ? hireDate.slice(0, 7) : '';
      const isFirstMonth = hireMonth === yearMonth;
      const resignMonthStr = resignDate ? resignDate.slice(0, 7) : '';
      const isResignMonth = resignMonthStr === yearMonth;
      const isPartialMonth = isFirstMonth || isResignMonth;

      const hireDay = isFirstMonth ? parseInt(hireDate.slice(8, 10), 10) : 1;
      const resignDay = isResignMonth ? parseInt(resignDate.slice(8, 10), 10) : daysInMonth;
      const workedCalDays = Math.max(resignDay - hireDay + 1, 0);

      // 결근일 = 오늘까지 경과 소정근로일 - 실제 근무일 (표시용 — 모든 직원 동일 산정)
      const absentDays = Math.max(elapsedScheduledDays - actualWorkDays, 0);

      // 기본급 일할 계산
      let basePay: number, mealAllowance: number, prorateRatio: number;
      if (isPartialMonth) {
        // 입사월·퇴사월: calendar 일할 × (실근무 / window 평일).
        // 마감 전이면 workRatio 미적용(미래 평일을 결근으로 취급하지 않음) — calRatio 만.
        const calRatio = daysInMonth > 0 ? workedCalDays / daysInMonth : 0;
        const workRatio = payrollClosed
          ? (totalScheduledDays > 0 ? Math.min(actualWorkDays / totalScheduledDays, 1) : 0)
          : 1;
        const finalRatio = calRatio * workRatio;
        prorateRatio = Math.round(finalRatio * 100);
        basePay = Math.round(parseFloat(sal.base_pay) * finalRatio);
        mealAllowance = Math.round(parseFloat(sal.meal_allowance) * finalRatio);
      } else if (payrollClosed) {
        // 일반 + 마감 후: 결근 차감
        const dailyRate = totalScheduledDays > 0 ? parseFloat(sal.base_pay) / totalScheduledDays : 0;
        const mealDailyRate = totalScheduledDays > 0 ? parseFloat(sal.meal_allowance) / totalScheduledDays : 0;
        prorateRatio = totalScheduledDays > 0 ? Math.round((1 - absentDays / totalScheduledDays) * 100) : 100;
        basePay = Math.round(parseFloat(sal.base_pay) - dailyRate * absentDays);
        mealAllowance = Math.round(parseFloat(sal.meal_allowance) - mealDailyRate * absentDays);
      } else {
        // 일반 + 마감 전: 기본급 전액
        basePay = parseFloat(sal.base_pay);
        mealAllowance = parseFloat(sal.meal_allowance);
        prorateRatio = 100;
      }
      const grossPay = basePay + mealAllowance + parseFloat(sal.bonus) + parseFloat(sal.position_allowance) + parseFloat(sal.other_allowance) + overtimePay + holidayPay;

      // 4대보험 계산 (근로자 부담분) - 일할 계산 기준
      const taxBase = basePay + mealAllowance;
      const nationalPension = Math.round(taxBase * 0.045);      // 국민연금 4.5%
      const healthInsurance = Math.round(taxBase * 0.03545);     // 건강보험 3.545%
      const longTermCare = Math.round(healthInsurance * 0.1281); // 장기요양 12.81%
      const employmentInsurance = Math.round(taxBase * 0.009);   // 고용보험 0.9%
      const totalDeductions = nationalPension + healthInsurance + longTermCare + employmentInsurance;

      // 소득세 (간이세액표 기준 근사)
      const incomeTax = Math.round(grossPay * 0.03);  // 약 3% 근사
      const localTax = Math.round(incomeTax * 0.1);   // 지방세 10%

      // 기타(조정) — 과지급/미지급 정산용 +/- 금액. 4대보험·세금 영향 없이 실지급액에만 가산.
      const adjustmentAmount = parseFloat(sal.adjustment_amount) || 0;
      const adjustmentMemo = sal.adjustment_memo || '';

      // 대출 상환 — 활성 대출들 중 해당 월에 차감되는 금액 합산
      const empLoans = loansByEmployee.get(sal.employee_id) || [];
      let loanRepayment = 0;
      const loanBreakdown: any[] = [];
      for (const l of empLoans) {
        const ded = computeLoanDeduction(l, yearMonth);
        if (ded > 0) {
          loanRepayment += ded;
          loanBreakdown.push({ id: l.id, amount: ded, method: l.repayment_method, memo: l.memo });
        }
      }

      const netPay = grossPay - totalDeductions - incomeTax - localTax + adjustmentAmount - loanRepayment;

      results.push({
        employee_id: sal.employee_id,
        name: sal.name, phone: sal.phone, department: sal.department, team: sal.team,
        hire_date: sal.hire_date || '', resign_date: resignDate,
        bank_name: sal.bank_name || '', bank_account: sal.bank_account || '', id_number: sal.id_number || '',
        base_pay_full: parseFloat(sal.base_pay), base_pay: basePay,
        meal_allowance_full: parseFloat(sal.meal_allowance), meal_allowance: mealAllowance,
        prorate_ratio: prorateRatio,
        is_first_month: isFirstMonth,
        worked_calendar_days: workedCalDays,
        days_in_month: daysInMonth,
        scheduled_work_days: totalScheduledDays, elapsed_scheduled_days: elapsedScheduledDays,
        actual_work_days: actualWorkDays, absent_days: absentDays,
        bonus: parseFloat(sal.bonus), position_allowance: parseFloat(sal.position_allowance),
        other_allowance: parseFloat(sal.other_allowance),
        overtime_hourly_rate: hourlyRate,
        work_days: att?.work_days || 0,
        overtime_hours: overtimeHours,
        holiday_days: att?.holiday_days || 0,
        holiday_hours: holidayHours,
        overtime_pay: overtimePay,
        holiday_pay: holidayPay,
        gross_pay: grossPay,
        national_pension: nationalPension,
        health_insurance: healthInsurance,
        long_term_care: longTermCare,
        employment_insurance: employmentInsurance,
        income_tax: incomeTax,
        local_tax: localTax,
        total_deductions: totalDeductions + incomeTax + localTax,
        adjustment_amount: adjustmentAmount,
        adjustment_memo: adjustmentMemo,
        loan_repayment: loanRepayment,
        loan_breakdown: loanBreakdown,
        net_pay: netPay,
      });
    }

    // 마감 여부 확인
    const closing = await dbGet('SELECT * FROM payroll_closing WHERE year_month = ?', yearMonth) as any;
    const isClosed = !!closing;
    // 지급 완료 여부
    const payment = await dbGet('SELECT * FROM regular_payroll_payment WHERE year_month = ?', yearMonth) as any;
    const isPaid = !!payment;

    res.json({
      year_month: yearMonth,
      is_closed: isClosed, closed_at: closing?.closed_at || null,
      is_paid: isPaid, paid_at: payment?.paid_at || null, paid_by: payment?.paid_by || '',
      results
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Payroll Closing (급여 마감) =====

// GET /api/regular/payroll-closing/:yearMonth
router.get('/payroll-closing/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    const closing = await dbGet('SELECT * FROM payroll_closing WHERE year_month = ?', req.params.yearMonth) as any;
    res.json({ is_closed: !!closing, closed_at: closing?.closed_at || null, closed_by: closing?.closed_by || '' });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// POST /api/regular/payroll-closing/:yearMonth - 마감
router.post('/payroll-closing/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    const { yearMonth } = req.params;
    await dbRun('INSERT INTO payroll_closing (year_month, closed_by) VALUES (?, ?) ON CONFLICT (year_month) DO UPDATE SET closed_at = NOW(), closed_by = ?',
      yearMonth, req.body.closed_by || '', req.body.closed_by || '');
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// DELETE /api/regular/payroll-closing/:yearMonth - 마감 취소
router.delete('/payroll-closing/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM payroll_closing WHERE year_month = ?', req.params.yearMonth);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ===== Payroll Adjustments (기타 — 과지급/미지급 조정) =====

// PUT /api/regular/payroll-adjustment - upsert 직원별 월별 조정 금액
router.put('/payroll-adjustment', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, year_month, amount, memo } = req.body || {};
    if (!employee_id || !year_month) { res.status(400).json({ error: 'employee_id, year_month 필수' }); return; }
    const amt = parseInt(amount, 10) || 0;
    if (amt === 0 && !(memo || '').trim()) {
      // 0 + 빈 메모 = 삭제
      await dbRun('DELETE FROM regular_payroll_adjustments WHERE employee_id = ? AND year_month = ?', employee_id, year_month);
    } else {
      await dbRun(
        `INSERT INTO regular_payroll_adjustments (employee_id, year_month, amount, memo)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (employee_id, year_month) DO UPDATE SET amount = ?, memo = ?, updated_at = NOW()`,
        employee_id, year_month, amt, memo || '', amt, memo || ''
      );
    }
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ===== Payroll Payment (지급 완료) =====

// POST /api/regular/payroll-payment/:yearMonth - 지급 완료 처리
router.post('/payroll-payment/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    const { yearMonth } = req.params;
    await dbRun(
      `INSERT INTO regular_payroll_payment (year_month, paid_by) VALUES (?, ?)
       ON CONFLICT (year_month) DO UPDATE SET paid_at = NOW(), paid_by = ?`,
      yearMonth, req.body?.paid_by || '', req.body?.paid_by || ''
    );
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// DELETE /api/regular/payroll-payment/:yearMonth - 지급 완료 취소
router.delete('/payroll-payment/:yearMonth', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM regular_payroll_payment WHERE year_month = ?', req.params.yearMonth);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ===== Employee Loans (직원 대출 관리) =====

// 한 직원의 한 월(YYYY-MM)에 대해 차감해야 할 대출 상환 금액 계산.
// monthly: start_month 부터 매월 monthly_amount, 누적이 amount 초과하기 전 마지막 달은 잔액만큼만 차감.
// lump_sum: lump_sum_date 가 속한 월에 전액 차감.
function computeLoanDeduction(loan: any, yearMonth: string): number {
  if (loan.status !== 'active') return 0;
  const amount = parseFloat(loan.amount) || 0;
  if (amount <= 0) return 0;

  if (loan.repayment_method === 'monthly') {
    const start = (loan.start_month || '').slice(0, 7);
    const monthly = parseFloat(loan.monthly_amount) || 0;
    if (!start || monthly <= 0) return 0;
    if (yearMonth < start) return 0;

    // 시작월 부터 yearMonth 까지 경과 개월수 (1-indexed)
    const [sy, sm] = start.split('-').map(Number);
    const [cy, cm] = yearMonth.split('-').map(Number);
    const monthsElapsed = (cy - sy) * 12 + (cm - sm) + 1;
    if (monthsElapsed <= 0) return 0;

    const cumulativeBefore = (monthsElapsed - 1) * monthly;
    if (cumulativeBefore >= amount) return 0;  // 이미 다 갚음
    const remaining = amount - cumulativeBefore;
    return Math.min(monthly, remaining);
  }

  if (loan.repayment_method === 'lump_sum') {
    const target = (loan.lump_sum_date || '').slice(0, 7);
    if (!target) return 0;
    return target === yearMonth ? amount : 0;
  }

  return 0;
}

// GET /api/regular/loans - 전체 대출 목록 (직원 정보 포함)
router.get('/loans', async (_req: AuthRequest, res: Response) => {
  try {
    const loans = await dbAll(`
      SELECT l.*, re.name as employee_name, re.department, re.team, re.phone
      FROM employee_loans l
      JOIN regular_employees re ON l.employee_id = re.id
      ORDER BY l.status ASC, l.executed_date DESC, l.id DESC
    `) as any[];
    res.json(loans || []);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// POST /api/regular/loans - 대출 등록
router.post('/loans', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, amount, executed_date, repayment_method, monthly_amount, start_month, lump_sum_date, memo } = req.body || {};
    if (!employee_id || !amount || !executed_date || !repayment_method) {
      res.status(400).json({ error: 'employee_id, amount, executed_date, repayment_method 필수' }); return;
    }
    if (repayment_method === 'monthly' && (!monthly_amount || !start_month)) {
      res.status(400).json({ error: '월별 상환은 monthly_amount, start_month 필수' }); return;
    }
    if (repayment_method === 'lump_sum' && !lump_sum_date) {
      res.status(400).json({ error: '일괄 상환은 lump_sum_date 필수' }); return;
    }
    const result = await dbRun(
      `INSERT INTO employee_loans (employee_id, amount, executed_date, repayment_method, monthly_amount, start_month, lump_sum_date, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      employee_id, amount, executed_date, repayment_method,
      repayment_method === 'monthly' ? (monthly_amount || 0) : 0,
      repayment_method === 'monthly' ? (start_month || '') : '',
      repayment_method === 'lump_sum' ? (lump_sum_date || '') : '',
      memo || ''
    );
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// PUT /api/regular/loans/:id - 대출 수정
router.put('/loans/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { amount, executed_date, repayment_method, monthly_amount, start_month, lump_sum_date, status, memo } = req.body || {};
    await dbRun(
      `UPDATE employee_loans SET
        amount = ?, executed_date = ?, repayment_method = ?,
        monthly_amount = ?, start_month = ?, lump_sum_date = ?,
        status = ?, memo = ?, updated_at = NOW()
       WHERE id = ?`,
      amount || 0, executed_date || '', repayment_method || 'monthly',
      monthly_amount || 0, start_month || '', lump_sum_date || '',
      status || 'active', memo || '', req.params.id
    );
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// DELETE /api/regular/loans/:id - 대출 삭제
router.delete('/loans/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('DELETE FROM employee_loans WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// GET /api/regular/loans/employee-search?q=... - 직원 검색 (대출 등록용)
router.get('/loans/employee-search', async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    let employees;
    if (q) {
      const like = `%${q}%`;
      employees = await dbAll(`
        SELECT id, name, department, team, phone
        FROM regular_employees
        WHERE is_active = 1 AND (name ILIKE ? OR phone ILIKE ?)
        ORDER BY name ASC
        LIMIT 30
      `, like, like) as any[];
    } else {
      employees = await dbAll(`
        SELECT id, name, department, team, phone
        FROM regular_employees
        WHERE is_active = 1
        ORDER BY name ASC
        LIMIT 200
      `) as any[];
    }
    res.json(employees || []);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export { computeLoanDeduction };
export default router;
