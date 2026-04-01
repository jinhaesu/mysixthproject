import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun, getKSTDate, getKSTTimestamp, isHolidayOrWeekend } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendGeneralSms } from '../services/smsService';

const router = Router();

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

    const employees = await dbAll(`
      SELECT re.*, sw.name as workplace_name
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
    const { phone, name, department, team, role, workplace_id, hire_date } = req.body;

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
      const created = await dbGet('SELECT * FROM regular_employees WHERE id = ?', result.lastInsertRowid);
      res.status(201).json(created);
    } catch (insertErr: any) {
      // Unique constraint violation — record exists, just update it
      await dbRun(
        'UPDATE regular_employees SET name = ?, token = ?, department = ?, team = ?, role = ?, workplace_id = ?, hire_date = ?, is_active = 1, updated_at = NOW() WHERE phone = ?',
        name, token, dept, tm, rl, wpId, hire_date || '', phone
      );
      const updated = await dbGet('SELECT * FROM regular_employees WHERE phone = ?', phone);
      res.status(201).json(updated);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/employees/:id - Update employee
router.put('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { phone, name, department, team, role, workplace_id, hire_date } = req.body;

    await dbRun(`
      UPDATE regular_employees SET phone = ?, name = ?, department = ?, team = ?, role = ?, workplace_id = ?, hire_date = ?
      WHERE id = ?
    `, phone, name, department || '', team || '', role || '', workplace_id || null, hire_date || '', id);

    const updated = await dbGet('SELECT * FROM regular_employees WHERE id = ?', id);
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

    const employee = await dbGet('SELECT * FROM regular_employees WHERE id = ? AND is_active = 1', id) as any;
    if (!employee) {
      res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
      return;
    }

    const baseUrl = process.env.SURVEY_BASE_URL?.replace('/s', '/r') || 'http://localhost:3000/r';
    const url = `${baseUrl}?token=${employee.token}`;
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
      const employee = await dbGet('SELECT * FROM regular_employees WHERE id = ? AND is_active = 1', id) as any;
      if (!employee) continue;

      const baseUrl = process.env.SURVEY_BASE_URL?.replace('/s', '/r') || 'http://localhost:3000/r';
      const url = `${baseUrl}?token=${employee.token}`;
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

    const frontendUrl = process.env.FRONTEND_URL || process.env.SURVEY_BASE_URL?.replace('/s', '') || 'https://mysixthproject.vercel.app';
    const detailLink = `${frontendUrl}/report-regular?date=${today}`;
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

    // Update used_days in balance
    const year = parseInt(request.start_date.slice(0, 4));
    const balance = await dbGet('SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', request.employee_id, year) as any;
    if (balance) {
      await dbRun('UPDATE regular_vacation_balances SET used_days = used_days + ?, updated_at = NOW() WHERE id = ?', request.days, balance.id);
    }

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
    await dbRun('UPDATE regular_vacation_requests SET status = ?, admin_memo = ?, updated_at = NOW() WHERE id = ?', 'rejected', admin_memo || '', id);
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

      if (yearsWorked < 0) {
        // Hired after year start - 1 day per completed full month worked
        // Count full months from hire date to Dec 31
        let months = 0;
        const cur = new Date(hireDate);
        while (true) {
          const next = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
          if (next > yearEnd) break;
          months++;
          cur.setMonth(cur.getMonth() + 1);
        }
        totalDays = Math.min(months, 11); // 1 day per completed month, max 11
      } else if (yearsWorked < 1) {
        // In first year of employment at year start
        // 1 day per completed full month in this year
        let months = 0;
        const cur = new Date(hireDate);
        while (true) {
          const next = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
          if (next > yearEnd) break;
          months++;
          cur.setMonth(cur.getMonth() + 1);
        }
        totalDays = Math.min(months, 11);
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

      // Upsert balance
      const existing = await dbGet('SELECT id, used_days FROM regular_vacation_balances WHERE employee_id = ? AND year = ?', emp.id, targetYear) as any;
      if (existing) {
        await dbRun('UPDATE regular_vacation_balances SET total_days = ?, updated_at = NOW() WHERE id = ?', totalDays, existing.id);
      } else {
        await dbRun('INSERT INTO regular_vacation_balances (employee_id, year, total_days) VALUES (?, ?, ?)', emp.id, targetYear, totalDays);
      }
      updated++;
    }

    res.json({ success: true, updated, year: targetYear });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular/vacation-balances/init - Initialize balances for all active employees
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
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/employees/resigned - 퇴사자 목록
router.get('/employees/resigned', async (_req: AuthRequest, res: Response) => {
  try {
    const employees = await dbAll(`
      SELECT re.*, sw.name as workplace_name
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
router.post('/contracts/send', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, work_start_date, department, position_title, annual_salary, base_pay, meal_allowance, other_allowance, pay_day, work_hours } = req.body;
    const employee = await dbGet('SELECT * FROM regular_employees WHERE id = ?', employee_id) as any;
    if (!employee) { res.status(404).json({ error: '직원을 찾을 수 없습니다.' }); return; }

    const token = require('uuid').v4();
    const today = getKSTDate();
    const endYear = parseInt(today.slice(0, 4)) + 1;
    const endDate = endYear + today.slice(4);

    await dbRun(
      `INSERT INTO regular_labor_contracts (employee_id, phone, worker_name, contract_start, contract_end, token, work_start_date, department, position_title, annual_salary, base_pay, meal_allowance, other_allowance, pay_day, work_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      employee.id, employee.phone, employee.name, today, endDate, token,
      work_start_date || '', department || employee.department || '', position_title || '사원',
      annual_salary || '', base_pay || '', meal_allowance || '', other_allowance || '', pay_day || '10', work_hours || '09:00~18:00'
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://mysixthproject.vercel.app';
    const contractLink = `${frontendUrl}/regular-contract?token=${token}`;
    const message = `[조인앤조인 근로계약서]\n${employee.name}님, 근로계약서를 작성해주세요.\n아래 링크를 눌러 서명해주세요.\n${contractLink}`;
    await sendGeneralSms(employee.phone, message);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/regular/contracts - List all contracts
router.get('/contracts', async (_req: AuthRequest, res: Response) => {
  try {
    const contracts = await dbAll(`
      SELECT rlc.*, re.department, re.team
      FROM regular_labor_contracts rlc
      JOIN regular_employees re ON rlc.employee_id = re.id
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

    // Get all active employees with their attendance
    const employees = await dbAll('SELECT id, name, phone, department, team FROM regular_employees WHERE is_active = 1 ORDER BY department, team, name') as any[];

    const result = [];
    for (const emp of employees) {
      // Actual attendance
      const actuals = await dbAll(
        'SELECT date, clock_in_time, clock_out_time FROM regular_attendance WHERE employee_id = ? AND date >= ? AND date <= ? ORDER BY date',
        emp.id, startDate, endDate
      );

      // Planned shifts (filter by month if set, or include month=0 which means all months)
      const shifts = await dbAll(`
        SELECT rs.planned_clock_in, rs.planned_clock_out, rs.days_of_week, rs.day_of_week, rs.month
        FROM regular_shift_assignments rsa
        JOIN regular_shifts rs ON rsa.shift_id = rs.id
        WHERE rsa.employee_id = ? AND rs.is_active = 1 AND (rs.month = 0 OR rs.month = ?)
      `, emp.id, parseInt(month));

      result.push({
        id: emp.id,
        name: emp.name,
        phone: emp.phone,
        department: emp.department,
        team: emp.team,
        actuals: actuals,
        shifts: shifts,
        actual_days: actuals.length,
      });
    }

    res.json({ employees: result, startDate, endDate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

    // Look up departments
    const deptMap = new Map<string, string>();
    try {
      const workers = await dbAll("SELECT name_ko, department FROM workers WHERE name_ko IS NOT NULL AND name_ko != ''");
      for (const w of workers as any[]) { if (w.name_ko) deptMap.set(w.name_ko, w.department || ''); }
      const regs = await dbAll("SELECT name, department FROM regular_employees WHERE is_active = 1");
      for (const r of regs as any[]) { if (r.name) deptMap.set(r.name, r.department || ''); }
    } catch {}

    // Summarize by employee
    const empMap = new Map<string, any>();
    for (const r of records as any[]) {
      if (!empMap.has(r.employee_name)) {
        empMap.set(r.employee_name, {
          name: r.employee_name, phone: r.employee_phone, type: r.employee_type,
          department: deptMap.get(r.employee_name) || '',
          days: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0, break_hours: 0, holiday_days: 0,
          records: []
        });
      }
      const emp = empMap.get(r.employee_name)!;
      emp.days++;
      emp.regular_hours += parseFloat(r.regular_hours) || 0;
      emp.overtime_hours += parseFloat(r.overtime_hours) || 0;
      emp.night_hours += parseFloat(r.night_hours) || 0;
      emp.break_hours += parseFloat(r.break_hours) || 0;
      emp.holiday_days += r.holiday_work ? 1 : 0;
      emp.records.push(r);
    }

    res.json(Array.from(empMap.values()));
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
      const endMin = Math.floor((h2 * 60 + (m2 || 0)) / 30) * 30;
      const totalMin = endMin > startMin ? endMin - startMin : 0;
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

      // 휴일이면 전체 시간을 연장으로, 평일이면 8시간 기준 분리
      const isHoliday = isHolidayOrWeekend(r.date);
      const regularH = isHoliday ? 0 : Math.round(Math.min(workH, 8) * 10) / 10;
      const overtimeH = isHoliday ? Math.round(workH * 10) / 10 : Math.round(Math.max(workH - 8, 0) * 10) / 10;

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

    // Group by employee, reclassify holiday/weekend hours as overtime
    const empMap = new Map<string, { employee_name: string; employee_phone: string; total_regular: number; total_overtime: number; total_night: number; work_days: number; holiday_days: number; holiday_hours: number }>();
    for (const rec of allRecords) {
      if (!empMap.has(rec.employee_name)) {
        empMap.set(rec.employee_name, { employee_name: rec.employee_name, employee_phone: rec.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
      }
      const emp = empMap.get(rec.employee_name)!;
      emp.work_days++;
      const regH = parseFloat(rec.regular_hours) || 0;
      const otH = parseFloat(rec.overtime_hours) || 0;
      const nightH = parseFloat(rec.night_hours) || 0;
      const totalH = regH + otH;

      if (isHolidayOrWeekend(rec.date)) {
        // All hours on holidays/weekends count as overtime
        emp.total_overtime += totalH;
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
      for (let d = new Date(vacStart); d <= vacEnd; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        // Skip weekends and holidays — vacation on those days doesn't need to count as worked
        if (isHolidayOrWeekend(dateStr)) continue;
        // Skip dates that already have a confirmed attendance record
        const alreadyCounted = allRecords.some((r: any) => r.employee_name === vac.employee_name && r.date === dateStr);
        if (alreadyCounted) continue;
        // Add 8 hours of regular work for this vacation day
        if (!empMap.has(vac.employee_name)) {
          empMap.set(vac.employee_name, { employee_name: vac.employee_name, employee_phone: vac.employee_phone, total_regular: 0, total_overtime: 0, total_night: 0, work_days: 0, holiday_days: 0, holiday_hours: 0 });
        }
        const empEntry = empMap.get(vac.employee_name)!;
        empEntry.total_regular += 8;
        empEntry.work_days++;
      }
    }

    // Re-derive confirmed after vacation additions
    const confirmedWithVacation = Array.from(empMap.values());

    // Get salary settings
    const salaries = await dbAll(`
      SELECT re.name, re.phone, re.department, re.team, re.hire_date,
             COALESCE(re.bank_name, '') as bank_name,
             COALESCE(re.bank_account, '') as bank_account,
             COALESCE(re.id_number, '') as id_number,
             COALESCE(ss.base_pay, 0) as base_pay,
             COALESCE(ss.meal_allowance, 0) as meal_allowance,
             COALESCE(ss.bonus, 0) as bonus,
             COALESCE(ss.position_allowance, 0) as position_allowance,
             COALESCE(ss.other_allowance, 0) as other_allowance,
             COALESCE(ss.overtime_hourly_rate, 0) as overtime_hourly_rate
      FROM regular_employees re
      LEFT JOIN regular_salary_settings ss ON re.id = ss.employee_id
      WHERE re.is_active = 1
    `) as any[];

    const results = [];
    for (const sal of salaries) {
      const att = confirmedWithVacation.find(c => c.employee_name === sal.name);
      const overtimeHours = att?.total_overtime || 0;
      const holidayHours = att?.holiday_hours || 0;
      const hourlyRate = parseFloat(sal.overtime_hourly_rate) || 10030;
      const overtimePay = Math.round(overtimeHours * hourlyRate * 1.5);
      const holidayPay = Math.round(holidayHours * hourlyRate * 1.5);
      const grossPay = parseFloat(sal.base_pay) + parseFloat(sal.meal_allowance) + parseFloat(sal.bonus) + parseFloat(sal.position_allowance) + parseFloat(sal.other_allowance) + overtimePay + holidayPay;

      // 4대보험 계산 (근로자 부담분)
      const taxBase = parseFloat(sal.base_pay) + parseFloat(sal.meal_allowance);
      const nationalPension = Math.round(taxBase * 0.045);      // 국민연금 4.5%
      const healthInsurance = Math.round(taxBase * 0.03545);     // 건강보험 3.545%
      const longTermCare = Math.round(healthInsurance * 0.1281); // 장기요양 12.81%
      const employmentInsurance = Math.round(taxBase * 0.009);   // 고용보험 0.9%
      const totalDeductions = nationalPension + healthInsurance + longTermCare + employmentInsurance;

      // 소득세 (간이세액표 기준 근사)
      const incomeTax = Math.round(grossPay * 0.03);  // 약 3% 근사
      const localTax = Math.round(incomeTax * 0.1);   // 지방세 10%

      const netPay = grossPay - totalDeductions - incomeTax - localTax;

      results.push({
        name: sal.name, phone: sal.phone, department: sal.department, team: sal.team, hire_date: sal.hire_date,
        bank_name: sal.bank_name || '', bank_account: sal.bank_account || '', id_number: sal.id_number || '',
        base_pay: parseFloat(sal.base_pay), meal_allowance: parseFloat(sal.meal_allowance),
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
        net_pay: netPay,
      });
    }

    res.json({ year_month: yearMonth, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
