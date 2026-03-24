import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendGeneralSms } from '../services/smsService';

const router = Router();

// ===== Employees CRUD =====

// GET /api/regular/employees - List with filters
router.get('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const { search, department, team, role, page = '1', limit = '50' } = req.query as Record<string, string>;

    let where = 'WHERE re.is_active = 1';
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
      ORDER BY re.department, re.team, re.name
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

// POST /api/regular/employees - Create employee
router.post('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const { phone, name, department, team, role, workplace_id } = req.body;

    if (!phone || !name) {
      res.status(400).json({ error: '전화번호와 이름은 필수입니다.' });
      return;
    }

    const token = uuidv4();

    const result = await dbRun(`
      INSERT INTO regular_employees (phone, name, token, department, team, role, workplace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, phone, name, token, department || '', team || '', role || '', workplace_id || null);

    const created = await dbGet('SELECT * FROM regular_employees WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/regular/employees/:id - Update employee
router.put('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { phone, name, department, team, role, workplace_id } = req.body;

    await dbRun(`
      UPDATE regular_employees SET phone = ?, name = ?, department = ?, team = ?, role = ?, workplace_id = ?
      WHERE id = ?
    `, phone, name, department || '', team || '', role || '', workplace_id || null, id);

    const updated = await dbGet('SELECT * FROM regular_employees WHERE id = ?', id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/regular/employees/:id - Soft delete
router.delete('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await dbRun('UPDATE regular_employees SET is_active = 0 WHERE id = ?', id);
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
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const workers = await dbAll(`
      SELECT re.id, re.phone, re.name, re.department, re.team, re.role,
             ra.clock_in_time, ra.clock_out_time, ra.gps_valid
      FROM regular_employees re
      LEFT JOIN regular_attendance ra ON re.id = ra.employee_id AND ra.date = ?
      WHERE re.is_active = 1
      ORDER BY re.department, re.team, re.name
    `, date) as any[];

    const byDepartment = new Map<string, { total: number; clocked_in: number; completed: number; not_clocked_in: number }>();

    for (const w of workers) {
      const dept = w.department || '미배정';
      if (!byDepartment.has(dept)) {
        byDepartment.set(dept, { total: 0, clocked_in: 0, completed: 0, not_clocked_in: 0 });
      }
      const stats = byDepartment.get(dept)!;
      stats.total++;

      if (w.clock_out_time) {
        stats.completed++;
      } else if (w.clock_in_time) {
        stats.clocked_in++;
      } else {
        stats.not_clocked_in++;
      }
    }

    const totals = {
      total: workers.length,
      clocked_in: workers.filter(w => w.clock_in_time && !w.clock_out_time).length,
      completed: workers.filter(w => w.clock_out_time).length,
      not_clocked_in: workers.filter(w => !w.clock_in_time).length,
    };

    res.json({
      date,
      byDepartment: Object.fromEntries(byDepartment),
      workers,
      totals,
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
    const created = await dbGet('SELECT * FROM regular_report_schedules WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
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

    const today = new Date().toISOString().slice(0, 10);
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

export default router;
