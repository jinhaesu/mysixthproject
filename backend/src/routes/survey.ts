import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { dbGet, dbAll, dbRun, getKSTDate, isHolidayOrWeekend, isKoreanHoliday, normalizePhone, getFrontendUrl } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendSurveyMessage, sendGeneralSms } from '../services/smsService';

const router = Router();

const TOKEN_EXPIRY_HOURS = parseInt(process.env.SURVEY_TOKEN_EXPIRY_HOURS || '48', 10);

// ===== Workplace CRUD =====

// GET /api/survey/workplaces
router.get('/workplaces', async (_req: AuthRequest, res: Response) => {
  const workplaces = await dbAll('SELECT * FROM survey_workplaces WHERE is_active = 1 ORDER BY name');
  res.json(workplaces);
});

// POST /api/survey/workplaces
router.post('/workplaces', async (req: AuthRequest, res: Response) => {
  const { name, address, latitude, longitude, radius_meters } = req.body;

  if (!name || latitude == null || longitude == null) {
    res.status(400).json({ error: '근무지 이름, 위도, 경도는 필수입니다.' });
    return;
  }

  const result = await dbRun(`
    INSERT INTO survey_workplaces (name, address, latitude, longitude, radius_meters)
    VALUES (?, ?, ?, ?, ?)
  `, name, address || '', latitude, longitude, radius_meters || 200);

  const created = await dbGet('SELECT * FROM survey_workplaces WHERE id = ?', result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/survey/workplaces/:id
router.put('/workplaces/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, address, latitude, longitude, radius_meters } = req.body;

  await dbRun(`
    UPDATE survey_workplaces SET name = ?, address = ?, latitude = ?, longitude = ?, radius_meters = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, name, address || '', latitude, longitude, radius_meters || 200, id);

  const updated = await dbGet('SELECT * FROM survey_workplaces WHERE id = ?', id);
  res.json(updated);
});

// DELETE /api/survey/workplaces/:id (soft delete)
router.delete('/workplaces/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await dbRun('UPDATE survey_workplaces SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', id);
  res.json({ success: true });
});

// ===== Admin Edit Time =====

// POST /api/survey/edit-time/:id - Admin edit clock-in/out times
router.post('/edit-time/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { clock_in_time, clock_out_time, agency, gender, birth_year, overtime_willing } = req.body;

    const request = await dbGet(`
      SELECT sr.id, sr.phone, sr.date, sr.status, resp.id as resp_id, resp.clock_in_time, resp.clock_out_time,
             resp.worker_name_ko
      FROM survey_requests sr
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.id = ?
    `, id) as any;

    if (!request || !request.resp_id) {
      res.status(404).json({ error: '응답을 찾을 수 없습니다.' });
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

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(request.resp_id);

    await dbRun(`UPDATE survey_responses SET ${updates.join(', ')} WHERE id = ?`, ...params);

    if (clock_in_time !== undefined || clock_out_time !== undefined) {
      const uploadId = 'survey-' + request.date;
      const updatedResp = await dbGet('SELECT * FROM survey_responses WHERE id = ?', request.resp_id);

      if (updatedResp && updatedResp.clock_in_time && updatedResp.clock_out_time) {
        const clockIn = new Date(updatedResp.clock_in_time);
        const clockOut = new Date(updatedResp.clock_out_time);
        const totalMs = clockOut.getTime() - clockIn.getTime();
        const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
        const breakTime = totalHours >= 8 ? 1 : totalHours >= 4 ? 0.5 : 0;
        const regularHours = Math.min(Math.max(totalHours - breakTime, 0), 8);
        const overtimeHours = Math.max(totalHours - breakTime - 8, 0);
        const clockInStr = clockIn.toTimeString().slice(0, 5);
        const clockOutStr = clockOut.toTimeString().slice(0, 5);

        const existing = await dbGet(
          'SELECT id FROM attendance_records WHERE upload_id = ? AND name = ? AND date = ?',
          uploadId, updatedResp.worker_name_ko, request.date
        );

        if (existing) {
          await dbRun(`
            UPDATE attendance_records SET clock_in = ?, clock_out = ?, total_hours = ?, regular_hours = ?, overtime_hours = ?, break_time = ?
            WHERE id = ?
          `, clockInStr, clockOutStr, totalHours, regularHours, overtimeHours, breakTime, existing.id);
        }
      }
    }

    // Update additional fields if provided
    if (agency !== undefined || gender !== undefined || birth_year !== undefined || overtime_willing !== undefined) {
      const updates: string[] = [];
      const params: any[] = [];
      if (agency !== undefined) { updates.push('agency = ?'); params.push(agency); }
      if (gender !== undefined) { updates.push('gender = ?'); params.push(gender); }
      if (birth_year !== undefined) { updates.push('birth_year = ?'); params.push(birth_year); }
      if (overtime_willing !== undefined) { updates.push('overtime_willing = ?'); params.push(overtime_willing); }
      if (updates.length > 0) {
        params.push(request.resp_id);
        await dbRun(`UPDATE survey_responses SET ${updates.join(', ')} WHERE id = ?`, ...params);
        // Also update all other responses for the same phone
        if (request.phone) {
          const otherParams = [...params.slice(0, -1), request.phone];
          await dbRun(`UPDATE survey_responses SET ${updates.join(', ')} WHERE id IN (SELECT resp.id FROM survey_responses resp JOIN survey_requests sr ON resp.request_id = sr.id WHERE sr.phone = ?)`, ...otherParams);
        }
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[edit-time] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Safety Notices =====

// GET /api/survey/safety-notices - List all notice templates
router.get('/safety-notices', async (_req: AuthRequest, res: Response) => {
  try {
    const notices = await dbAll('SELECT * FROM safety_notices WHERE is_active = 1 ORDER BY id');
    res.json(notices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/safety-notices - Create notice template
router.post('/safety-notices', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: '제목과 내용은 필수입니다.' });
      return;
    }
    const result = await dbRun(
      'INSERT INTO safety_notices (title, content) VALUES (?, ?)', title, content
    );
    const created = await dbGet('SELECT * FROM safety_notices WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/survey/safety-notices/:id - Update notice template
router.put('/safety-notices/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, content } = req.body;
    await dbRun(
      'UPDATE safety_notices SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      title, content, req.params.id
    );
    const updated = await dbGet('SELECT * FROM safety_notices WHERE id = ?', req.params.id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/survey/safety-notices/:id - Soft delete
router.delete('/safety-notices/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('UPDATE safety_notices SET is_active = 0 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/send-safety-notice - Send safety notice to phones (direct) or survey workers
router.post('/send-safety-notice', async (req: AuthRequest, res: Response) => {
  try {
    const { date, notice_id, phones, scheduled_at, schedule_range } = req.body;
    if (!notice_id) {
      res.status(400).json({ error: '안내문을 선택해주세요.' });
      return;
    }

    const notice = await dbGet('SELECT * FROM safety_notices WHERE id = ? AND is_active = 1', notice_id);
    if (!notice) {
      res.status(404).json({ error: '안내문을 찾을 수 없습니다.' });
      return;
    }

    // Determine target phone numbers
    let targetPhones: string[] = [];

    if (phones && Array.isArray(phones) && phones.length > 0) {
      // Direct phone list
      targetPhones = phones.map((p: string) => p.trim()).filter(Boolean);
    } else if (date) {
      // From survey requests for the given date
      const workers = await dbAll(`
        SELECT DISTINCT sr.phone
        FROM survey_requests sr
        WHERE sr.date = ? AND sr.status IN ('sent', 'clock_in')
      `, date);
      targetPhones = workers.map((w: any) => w.phone);
    }

    if (targetPhones.length === 0) {
      res.json({ success: true, total: 0, sent: 0, message: '발송 대상이 없습니다.' });
      return;
    }

    // Date-range scheduled sending for safety notices
    const hasRange = !scheduled_at && schedule_range;
    if (hasRange) {
      const { start_date, end_date, daily_time } = schedule_range;
      const start = new Date(start_date);
      const end = new Date(end_date);
      const results = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const schedTime = new Date(`${dateStr}T${daily_time}`).toISOString();

        await dbRun(
          'INSERT INTO scheduled_messages (type, notice_id, phones, date, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)',
          'safety_notice', notice_id, JSON.stringify(targetPhones), dateStr, schedTime, 'scheduled'
        );
        results.push({ date: dateStr, scheduled_at: schedTime });
      }

      res.json({
        success: true,
        total: targetPhones.length,
        scheduled_range: true,
        count: results.length,
        items: results,
        message: `${targetPhones.length}명 x ${results.length}일 = ${targetPhones.length * results.length}건 예약 완료`,
      });
      return;
    }

    // If scheduled, insert into scheduled_messages table instead of sending immediately
    if (scheduled_at) {
      await dbRun(
        'INSERT INTO scheduled_messages (type, notice_id, phones, date, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)',
        'safety_notice', notice_id, JSON.stringify(targetPhones), date || getKSTDate(), scheduled_at, 'scheduled'
      );
      res.json({
        success: true,
        total: targetPhones.length,
        scheduled: true,
        scheduled_at,
        message: `${targetPhones.length}건이 예약되었습니다.`,
      });
      return;
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const phone of targetPhones) {
      const result = await sendGeneralSms(phone, notice.content);
      if (result.success) {
        sentCount++;
      } else {
        errors.push(`${phone}: ${result.error}`);
      }
    }

    res.json({
      success: true,
      total: targetPhones.length,
      sent: sentCount,
      failed: targetPhones.length - sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Survey Send =====

// POST /api/survey/send - Send survey to a single phone
router.post('/send', async (req: AuthRequest, res: Response) => {
  const { phone: rawPhone, date, workplace_id, message_type, department, planned_clock_in, planned_clock_out, scheduled_at, schedule_range } = req.body;
  const phone = normalizePhone(rawPhone);

  if (!phone || !date || !workplace_id) {
    res.status(400).json({ error: '전화번호, 날짜, 근무지는 필수입니다.' });
    return;
  }

  const workplace = await dbGet('SELECT name FROM survey_workplaces WHERE id = ? AND is_active = 1', workplace_id) as any;
  if (!workplace) {
    res.status(400).json({ error: '유효하지 않은 근무지입니다.' });
    return;
  }

  // Date-range scheduled sending
  const hasRange = !scheduled_at && schedule_range;
  if (hasRange) {
    const { start_date, end_date, daily_time } = schedule_range;
    const start = new Date(start_date);
    const end = new Date(end_date);
    const results = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const schedTime = new Date(`${dateStr}T${daily_time}`).toISOString();
      const t = uuidv4();
      const exp = new Date(new Date(schedTime).getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

      const r = await dbRun(`
        INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at, department, planned_clock_in, planned_clock_out, scheduled_at, scheduled_status, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, t, phone, workplace_id, dateStr, message_type || 'sms', exp, department || '', planned_clock_in || null, planned_clock_out || null, schedTime, 'scheduled', 'scheduled');

      await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', r.lastInsertRowid);
      results.push({ date: dateStr, scheduled_at: schedTime });
    }

    res.status(201).json({ success: true, scheduled_range: true, count: results.length, items: results });
    return;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  const isScheduled = !!scheduled_at;

  // Create survey request
  const result = await dbRun(`
    INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at, department, planned_clock_in, planned_clock_out, scheduled_at, scheduled_status, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, token, phone, workplace_id, date, message_type || 'sms', expiresAt, department || '', planned_clock_in || null, planned_clock_out || null, scheduled_at || null, isScheduled ? 'scheduled' : 'immediate', isScheduled ? 'scheduled' : 'sent');

  // Create empty response row
  await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', result.lastInsertRowid);

  // Only send SMS if not scheduled
  let sendResult: any = { success: true };
  if (!isScheduled) {
    sendResult = await sendSurveyMessage(phone, token, date, workplace.name, message_type || 'sms', department || '');

    if (sendResult.messageId) {
      await dbRun('UPDATE survey_requests SET message_id = ? WHERE id = ?', sendResult.messageId, result.lastInsertRowid);
    }
  }

  const created = await dbGet(`
    SELECT sr.*, sw.name as workplace_name
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.id = ?
  `, result.lastInsertRowid);

  res.status(201).json({
    request: created,
    message: sendResult,
    scheduled: isScheduled,
  });
});

// POST /api/survey/send-batch - Send to multiple phones
router.post('/send-batch', async (req: AuthRequest, res: Response) => {
  const { phones, date, workplace_id, message_type, department, planned_clock_in, planned_clock_out, scheduled_at, schedule_range } = req.body;

  if (!phones || !Array.isArray(phones) || phones.length === 0 || !date || !workplace_id) {
    res.status(400).json({ error: '전화번호 목록, 날짜, 근무지는 필수입니다.' });
    return;
  }

  const workplace = await dbGet('SELECT name FROM survey_workplaces WHERE id = ? AND is_active = 1', workplace_id) as any;
  if (!workplace) {
    res.status(400).json({ error: '유효하지 않은 근무지입니다.' });
    return;
  }

  // Date-range scheduled sending (batch)
  const hasRange = !scheduled_at && schedule_range;
  if (hasRange) {
    const { start_date, end_date, daily_time } = schedule_range;
    const start = new Date(start_date);
    const end = new Date(end_date);
    const results = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const schedTime = new Date(`${dateStr}T${daily_time}`).toISOString();

      for (const phone of phones) {
        const trimmedPhone = normalizePhone(phone);
        if (!trimmedPhone) continue;

        const t = uuidv4();
        const exp = new Date(new Date(schedTime).getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

        const r = await dbRun(`
          INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at, department, planned_clock_in, planned_clock_out, scheduled_at, scheduled_status, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, t, trimmedPhone, workplace_id, dateStr, message_type || 'sms', exp, department || '', planned_clock_in || null, planned_clock_out || null, schedTime, 'scheduled', 'scheduled');

        await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', r.lastInsertRowid);
        results.push({ phone: trimmedPhone, date: dateStr, scheduled_at: schedTime });
      }
    }

    res.status(201).json({ success: true, scheduled_range: true, count: results.length, items: results });
    return;
  }

  const isScheduled = !!scheduled_at;
  const results = [];

  for (const phone of phones) {
    const trimmedPhone = normalizePhone(phone);
    if (!trimmedPhone) continue;

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const result = await dbRun(`
      INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at, department, planned_clock_in, planned_clock_out, scheduled_at, scheduled_status, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, token, trimmedPhone, workplace_id, date, message_type || 'sms', expiresAt, department || '', planned_clock_in || null, planned_clock_out || null, scheduled_at || null, isScheduled ? 'scheduled' : 'immediate', isScheduled ? 'scheduled' : 'sent');

    await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', result.lastInsertRowid);

    if (!isScheduled) {
      const sendResult = await sendSurveyMessage(trimmedPhone, token, date, workplace.name, message_type || 'sms', department || '');

      if (sendResult.messageId) {
        await dbRun('UPDATE survey_requests SET message_id = ? WHERE id = ?', sendResult.messageId, result.lastInsertRowid);
      }

      results.push({ phone: trimmedPhone, success: sendResult.success, error: sendResult.error });
    } else {
      results.push({ phone: trimmedPhone, success: true, scheduled: true });
    }
  }

  res.json({ total: results.length, results, scheduled: isScheduled });
});

// POST /api/survey/resend/:id - Resend an expired or sent survey with new token
router.post('/resend/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const original = await dbGet(`
    SELECT sr.*, sw.name as workplace_name
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.id = ?
  `, id);

  if (!original) {
    res.status(404).json({ error: '설문 요청을 찾을 수 없습니다.' });
    return;
  }

  // Create new survey request with same phone/workplace/date
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  const result = await dbRun(`
    INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, token, original.phone, original.workplace_id, original.date, original.message_type || 'sms', expiresAt);

  await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', result.lastInsertRowid);

  // Send SMS
  const workplace = await dbGet('SELECT name FROM survey_workplaces WHERE id = ?', original.workplace_id);
  const sendResult = await sendSurveyMessage(original.phone, token, original.date, workplace?.name || '', original.message_type || 'sms');

  if (sendResult.messageId) {
    await dbRun('UPDATE survey_requests SET message_id = ? WHERE id = ?', sendResult.messageId, result.lastInsertRowid);
  }

  // Mark original as expired if it was still active
  if (original.status === 'sent') {
    await dbRun('UPDATE survey_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 'expired', original.id);
  }

  res.status(201).json({ success: true, message: sendResult });
});

// GET /api/survey/stats - Summary statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const today = getKSTDate();
    const department = req.query.department as string || '';

    const deptWhere = department ? " AND department = ?" : "";
    const deptParams = department ? [department] : [];

    const total = await dbGet(`SELECT COUNT(*) as count FROM survey_requests WHERE 1=1${deptWhere}`, ...deptParams);
    const todayCount = await dbGet(`SELECT COUNT(*) as count FROM survey_requests WHERE date = ?${deptWhere}`, today, ...deptParams);
    const byStatus = await dbAll(`
      SELECT status, COUNT(*) as count
      FROM survey_requests
      WHERE 1=1${deptWhere}
      GROUP BY status
    `, ...deptParams);
    const todayByStatus = await dbAll(`
      SELECT status, COUNT(*) as count
      FROM survey_requests
      WHERE date = ?${deptWhere}
      GROUP BY status
    `, today, ...deptParams);

    res.json({
      total: total.count,
      today: todayCount.count,
      byStatus: Object.fromEntries(byStatus.map((r: any) => [r.status, r.count])),
      todayByStatus: Object.fromEntries(todayByStatus.map((r: any) => [r.status, r.count])),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Dashboard =====

// GET /api/survey/dashboard - Real-time attendance by workplace
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const date = (req.query.date as string) || getKSTDate();

    const byWorkplace = await dbAll(`
      SELECT sw.id as workplace_id, sw.name as workplace_name,
        COUNT(*) as total,
        SUM(CASE WHEN sr.status = 'sent' THEN 1 ELSE 0 END) as not_clocked_in,
        SUM(CASE WHEN sr.status = 'clock_in' THEN 1 ELSE 0 END) as clocked_in,
        SUM(CASE WHEN sr.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN sr.status = 'expired' THEN 1 ELSE 0 END) as expired
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.date = ?
      GROUP BY sw.id, sw.name
      ORDER BY sw.name
    `, date);

    const workers = await dbAll(`
      SELECT sr.id, sr.phone, sr.status, sr.workplace_id, sr.department,
             sw.name as workplace_name,
             resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time,
             sr.planned_clock_in, sr.planned_clock_out
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.date = ?
      ORDER BY sw.name, sr.status, resp.worker_name_ko
    `, date);

    const totals = {
      total: workers.length,
      not_clocked_in: workers.filter((w: any) => w.status === 'sent').length,
      clocked_in: workers.filter((w: any) => w.status === 'clock_in').length,
      completed: workers.filter((w: any) => w.status === 'completed').length,
    };

    res.json({ date, byWorkplace, workers, totals });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Reminders =====

// POST /api/survey/remind - Send reminders to workers who haven't clocked in
router.post('/remind', async (req: AuthRequest, res: Response) => {
  try {
    const { date, threshold_hours = 2 } = req.body;
    const targetDate = date || getKSTDate();

    // Find requests that are still 'sent' and older than threshold
    const threshold = new Date(Date.now() - threshold_hours * 60 * 60 * 1000).toISOString();

    const pending = await dbAll(`
      SELECT sr.id, sr.phone, sr.token, sr.date, sr.workplace_id, sw.name as workplace_name
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.date = ? AND sr.status = 'sent' AND sr.reminder_sent = 0
        AND sr.created_at < ?
    `, targetDate, threshold);

    let sentCount = 0;
    for (const req of pending) {
      const result = await sendSurveyMessage(
        req.phone, req.token, req.date, req.workplace_name || '', 'sms'
      );
      if (result.success) {
        await dbRun(
          'UPDATE survey_requests SET reminder_sent = 1, reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
          req.id
        );
        sentCount++;
      }
    }

    res.json({ success: true, total_pending: pending.length, reminders_sent: sentCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Survey Responses Query =====

// GET /api/survey/responses
router.get('/responses', async (req: AuthRequest, res: Response) => {
  const { startDate, endDate, phone, name, status, workplace, page = '1', limit = '50' } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) { where += ' AND sr.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND sr.date <= ?'; params.push(endDate); }
  if (phone) { where += ' AND sr.phone LIKE ?'; params.push(`%${phone}%`); }
  if (name) { where += ' AND resp.worker_name_ko LIKE ?'; params.push(`%${name}%`); }
  if (status) { where += ' AND sr.status = ?'; params.push(status); }
  if (workplace) { where += ' AND sr.workplace_id = ?'; params.push(workplace); }

  const countResult = await dbGet(`
    SELECT COUNT(*) as total
    FROM survey_requests sr
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    ${where}
  `, ...params) as any;

  const total = countResult.total;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 500);
  const offset = (pageNum - 1) * limitNum;

  const rows = await dbAll(`
    SELECT sr.id, sr.token, sr.phone, sr.date, sr.status, sr.message_type, sr.created_at as sent_at,
           resp.clock_in_time, resp.clock_in_gps_valid, resp.clock_out_time, resp.clock_out_gps_valid,
           resp.worker_name_ko, resp.worker_name_en, resp.bank_name, resp.bank_account,
           resp.id_number, resp.emergency_contact, resp.memo,
           resp.gender, resp.birth_year, resp.agency, resp.overtime_willing, resp.worker_type,
           sw.name as workplace_name, sw.address as workplace_address,
           sr.planned_clock_in, sr.planned_clock_out, sr.department
    FROM survey_requests sr
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    ${where}
    ORDER BY sr.date DESC, sr.created_at DESC
    LIMIT ? OFFSET ?
  `, ...params, limitNum, offset);

  res.json({
    responses: rows,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// GET /api/survey/responses/export - Excel export
router.get('/responses/export', async (req: AuthRequest, res: Response) => {
  const { startDate, endDate, phone, status } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) { where += ' AND sr.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND sr.date <= ?'; params.push(endDate); }
  if (phone) { where += ' AND sr.phone LIKE ?'; params.push(`%${phone}%`); }
  if (status) { where += ' AND sr.status = ?'; params.push(status); }

  const rows = await dbAll(`
    SELECT sr.date as "근무일", sr.phone as "전화번호", sr.status as "상태",
           resp.worker_name_ko as "한글이름", resp.worker_name_en as "영문이름",
           resp.clock_in_time as "출근시간", resp.clock_in_gps_valid as "출근GPS유효",
           resp.clock_out_time as "퇴근시간", resp.clock_out_gps_valid as "퇴근GPS유효",
           resp.bank_name as "은행명", resp.bank_account as "계좌번호",
           resp.emergency_contact as "비상연락처", resp.memo as "비고",
           resp.gender as "성별", resp.birth_year as "출생연도",
           resp.agency as "연결업체", resp.overtime_willing as "잔업희망",
           sw.name as "근무지", sr.department as "배정파트"
    FROM survey_requests sr
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    ${where}
    ORDER BY sr.date DESC, sr.created_at DESC
  `, ...params) as any[];

  // Convert GPS valid flags and status
  const formatted = rows.map(row => ({
    ...row,
    '출근GPS유효': row['출근GPS유효'] === 1 ? 'O' : 'X',
    '퇴근GPS유효': row['퇴근GPS유효'] === 1 ? 'O' : 'X',
    '상태': { sent: '발송완료', clock_in: '출근완료', completed: '퇴근완료', expired: '만료' }[row['상태'] as string] || row['상태'],
    '출근시간': row['출근시간'] ? new Date(row['출근시간']).toLocaleString('ko-KR') : '',
    '퇴근시간': row['퇴근시간'] ? new Date(row['퇴근시간']).toLocaleString('ko-KR') : '',
  }));

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '설문응답');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=survey_responses_${getKSTDate()}.xlsx`);
  res.send(buf);
});

// GET /api/survey/requests - List sent requests (for recent sends view)
router.get('/requests', async (req: AuthRequest, res: Response) => {
  const { date, startDate, endDate, department, search, limit = '200' } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (date) { where += ' AND sr.date = ?'; params.push(date); }
  if (startDate) { where += ' AND sr.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND sr.date <= ?'; params.push(endDate); }
  if (department) { where += ' AND sr.department = ?'; params.push(department); }
  if (search) {
    where += ' AND (sr.phone LIKE ? OR resp.worker_name_ko LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const rows = await dbAll(`
    SELECT sr.*, sw.name as workplace_name,
           resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time,
           sr.planned_clock_in, sr.planned_clock_out
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    ${where}
    ORDER BY sr.created_at DESC
    LIMIT ?
  `, ...params, parseInt(limit));

  res.json(rows);
});

// DELETE /api/survey/requests/:id
router.delete('/requests/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // survey_responses has ON DELETE CASCADE, so it will be cleaned up automatically
    await dbRun('DELETE FROM survey_requests WHERE id = ?', id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Report Schedules =====

router.get('/report-schedules', async (_req: AuthRequest, res: Response) => {
  try {
    const schedules = await dbAll('SELECT * FROM report_schedules WHERE is_active = 1 ORDER BY time');
    res.json(schedules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/report-schedules', async (req: AuthRequest, res: Response) => {
  try {
    const { time, phones, repeat_days } = req.body;
    if (!time || !phones) {
      res.status(400).json({ error: '시간과 전화번호는 필수입니다.' });
      return;
    }
    const phonesJson = JSON.stringify(Array.isArray(phones) ? phones : [phones]);
    const result = await dbRun(
      'INSERT INTO report_schedules (time, phones, repeat_days) VALUES (?, ?, ?)',
      time, phonesJson, repeat_days || 'daily'
    );
    const created = await dbGet('SELECT * FROM report_schedules WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/report-schedules/:id', async (req: AuthRequest, res: Response) => {
  try {
    await dbRun('UPDATE report_schedules SET is_active = 0 WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/responses/batch-edit-time - Batch edit clock-in/out times
router.post('/responses/batch-edit-time', async (req: AuthRequest, res: Response) => {
  try {
    const { ids, clock_in_time, clock_out_time } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '수정할 항목을 선택해주세요.' });
      return;
    }

    let updated = 0;
    for (const id of ids) {
      const request = await dbGet(`
        SELECT sr.id, sr.date, resp.id as resp_id
        FROM survey_requests sr
        LEFT JOIN survey_responses resp ON sr.id = resp.request_id
        WHERE sr.id = ?
      `, id);

      if (!request || !request.resp_id) continue;

      const updates: string[] = [];
      const params: any[] = [];
      if (clock_in_time !== undefined && clock_in_time !== '') {
        updates.push('clock_in_time = ?');
        params.push(clock_in_time);
      }
      if (clock_out_time !== undefined && clock_out_time !== '') {
        updates.push('clock_out_time = ?');
        params.push(clock_out_time);
      }
      if (updates.length === 0) continue;

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(request.resp_id);
      await dbRun(`UPDATE survey_responses SET ${updates.join(', ')} WHERE id = ?`, ...params);
      updated++;
    }

    res.json({ success: true, updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/responses/batch-delete - Batch delete survey requests and responses
router.post('/responses/batch-delete', async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '삭제할 항목을 선택해주세요.' });
      return;
    }

    let deleted = 0;
    for (const id of ids) {
      await dbRun('DELETE FROM survey_responses WHERE request_id = ?', id);
      await dbRun('DELETE FROM survey_requests WHERE id = ?', id);
      deleted++;
    }

    res.json({ success: true, deleted });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/report-schedules/:id/send-now - Manually trigger a report
router.post('/report-schedules/:id/send-now', async (req: AuthRequest, res: Response) => {
  try {
    const schedule = await dbGet('SELECT * FROM report_schedules WHERE id = ? AND is_active = 1', req.params.id);
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
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as not_clocked_in,
        SUM(CASE WHEN status = 'clock_in' THEN 1 ELSE 0 END) as clocked_in,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM survey_requests WHERE date = ?
    `, today);

    const detailLink = getFrontendUrl(`/report?date=${today}`);
    const message = `[조인앤조인 알바/파견 출퇴근 현황]\n${today} ${currentTime} 기준\n\n전체: ${stats?.total || 0}명\n출근완료: ${stats?.clocked_in || 0}명\n미출근: ${stats?.not_clocked_in || 0}명\n퇴근완료: ${stats?.completed || 0}명\n\n상세 현황: ${detailLink}`;

    const phones = JSON.parse(schedule.phones);
    let sent = 0;
    for (const phone of phones) {
      const result = await sendGeneralSms(phone, message);
      if (result.success) sent++;
    }

    await dbRun('UPDATE report_schedules SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?', schedule.id);

    res.json({ success: true, sent, total: phones.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/run-scheduler - Manually trigger all schedulers
router.post('/run-scheduler', async (_req: AuthRequest, res: Response) => {
  try {
    // Send all scheduled surveys whose time has passed
    const pendingSurveys = await dbAll(`
      SELECT sr.id, sr.phone, sr.token, sr.date, sr.department, sw.name as workplace_name
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.scheduled_status = 'scheduled' AND sr.scheduled_at <= NOW()
    `);

    let surveysSent = 0;
    for (const req of pendingSurveys) {
      const result = await sendSurveyMessage(req.phone, req.token, req.date, req.workplace_name || '', 'sms', req.department || '');
      if (result.success) {
        await dbRun("UPDATE survey_requests SET scheduled_status = 'sent', status = 'sent' WHERE id = ?", req.id);
        surveysSent++;
      }
    }

    // Send all scheduled safety messages whose time has passed
    const pendingMessages = await dbAll(`
      SELECT sm.*, sn.content as notice_content
      FROM scheduled_messages sm
      LEFT JOIN safety_notices sn ON sm.notice_id = sn.id
      WHERE sm.status = 'scheduled' AND sm.scheduled_at <= NOW()
    `);

    let messagesSent = 0;
    for (const msg of pendingMessages) {
      try {
        const phones = JSON.parse(msg.phones);
        for (const phone of phones) {
          await sendGeneralSms(phone, msg.notice_content);
        }
        await dbRun("UPDATE scheduled_messages SET status = 'sent' WHERE id = ?", msg.id);
        messagesSent++;
      } catch {}
    }

    res.json({
      success: true,
      surveys: { pending: pendingSurveys.length, sent: surveysSent },
      messages: { pending: pendingMessages.length, sent: messagesSent },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/force-send-scheduled - Force send all stuck scheduled items
router.post('/force-send-scheduled', async (_req: AuthRequest, res: Response) => {
  try {
    // Update all scheduled items' scheduled_at to now so they get picked up
    const updated1 = await dbRun("UPDATE survey_requests SET scheduled_at = NOW() WHERE scheduled_status = 'scheduled'");
    const updated2 = await dbRun("UPDATE scheduled_messages SET scheduled_at = NOW() WHERE status = 'scheduled'");

    res.json({
      success: true,
      surveys_updated: updated1.changes,
      messages_updated: updated2.changes,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Weekly Holiday Pay (주휴수당) Monitoring =====

// GET /api/survey/weekly-holiday-status - Weekly holiday pay monitoring
router.get('/weekly-holiday-status', async (req: AuthRequest, res: Response) => {
  try {
    const { week_start, week_end } = req.query as Record<string, string>;

    let monday: string;
    let sundayStr: string;

    if (week_start && week_end) {
      monday = week_start;
      sundayStr = week_end;
    } else {
      const now = new Date();
      const day = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday = mon.toISOString().slice(0, 10);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      sundayStr = sun.toISOString().slice(0, 10);
    }

    // Get all survey-based attendance in this week
    const records = await dbAll(`
      SELECT sr.phone, sr.date, sr.department,
             resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time,
             sw.name as workplace_name
      FROM survey_requests sr
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.date >= ? AND sr.date <= ?
        AND sr.status IN ('clock_in', 'completed')
      ORDER BY sr.phone, sr.date
    `, monday, sundayStr);

    // Group by worker (phone)
    const workerMap = new Map<string, any>();
    for (const r of records) {
      const key = r.phone;
      if (!workerMap.has(key)) {
        workerMap.set(key, {
          phone: r.phone,
          name: r.worker_name_ko || r.phone,
          department: r.department || '',
          workplace: r.workplace_name || '',
          days: new Set<string>(),
          total_hours: 0,
          daily_details: [] as { date: string; hours: number }[],
        });
      }
      const w = workerMap.get(key)!;
      w.days.add(r.date);

      // Calculate hours for this day
      let hours = 0;
      if (r.clock_in_time && r.clock_out_time) {
        const inTime = new Date(r.clock_in_time);
        const outTime = new Date(r.clock_out_time);
        hours = Math.round(((outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60)) * 10) / 10;
      }
      w.total_hours += hours;
      w.daily_details.push({ date: r.date, hours });
    }

    // Build result with warnings
    const workers = [];
    for (const [, w] of workerMap) {
      const workDays = w.days.size;
      const totalHours = Math.round(w.total_hours * 10) / 10;

      // 주휴수당 발생 조건: 주 15시간 이상 + 개근 (5일 이상)
      const qualifies = totalHours >= 15 && workDays >= 5;

      // 경고 레벨
      let warning = 'safe'; // safe, caution, danger
      let warningMessage = '';

      if (qualifies) {
        warning = 'danger';
        warningMessage = `주휴수당 발생! (${workDays}일, ${totalHours}시간)`;
      } else if (workDays >= 4 && totalHours >= 12) {
        warning = 'caution';
        warningMessage = `주의: 1일 추가 근무 시 주휴수당 발생 가능 (현재 ${workDays}일, ${totalHours}시간)`;
      } else if (totalHours >= 13) {
        warning = 'caution';
        warningMessage = `주의: 시간 초과 임박 (현재 ${totalHours}시간/15시간)`;
      }

      workers.push({
        phone: w.phone,
        name: w.name,
        department: w.department,
        workplace: w.workplace,
        work_days: workDays,
        total_hours: totalHours,
        qualifies,
        warning,
        warning_message: warningMessage,
        daily_details: w.daily_details,
      });
    }

    // Sort: danger first, then caution, then safe
    const order: Record<string, number> = { danger: 0, caution: 1, safe: 2 };
    workers.sort((a, b) => (order[a.warning] ?? 9) - (order[b.warning] ?? 9));

    const summary = {
      week_start: monday,
      week_end: sundayStr,
      total_workers: workers.length,
      danger_count: workers.filter(w => w.warning === 'danger').length,
      caution_count: workers.filter(w => w.warning === 'caution').length,
      safe_count: workers.filter(w => w.warning === 'safe').length,
    };

    res.json({ summary, workers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/fix-timestamps - Shift all timestamps by specified hours
router.post('/fix-timestamps', async (req: AuthRequest, res: Response) => {
  try {
    const { hours } = req.body || {};  // positive = add, negative = subtract
    const shift = (hours || 0) * 60 * 60 * 1000;

    const responses = await dbAll(`
      SELECT id, clock_in_time, clock_out_time FROM survey_responses
      WHERE (clock_in_time IS NOT NULL OR clock_out_time IS NOT NULL)
        AND created_at >= '2026-03-24'
    `) as any[];

    let fixed = 0;
    for (const r of responses) {
      const updates: string[] = [];
      const params: any[] = [];
      if (r.clock_in_time) {
        updates.push('clock_in_time = ?');
        params.push(new Date(new Date(r.clock_in_time).getTime() + shift).toISOString());
      }
      if (r.clock_out_time) {
        updates.push('clock_out_time = ?');
        params.push(new Date(new Date(r.clock_out_time).getTime() + shift).toISOString());
      }
      if (updates.length > 0) {
        params.push(r.id);
        await dbRun(`UPDATE survey_responses SET ${updates.join(', ')} WHERE id = ?`, ...params);
        fixed++;
      }
    }

    const attendances = await dbAll(`
      SELECT id, clock_in_time, clock_out_time FROM regular_attendance
      WHERE (clock_in_time IS NOT NULL OR clock_out_time IS NOT NULL)
        AND date >= '2026-03-24'
    `) as any[];

    let fixedRegular = 0;
    for (const a of attendances) {
      const updates: string[] = [];
      const params: any[] = [];
      if (a.clock_in_time) {
        updates.push('clock_in_time = ?');
        params.push(new Date(new Date(a.clock_in_time).getTime() + shift).toISOString());
      }
      if (a.clock_out_time) {
        updates.push('clock_out_time = ?');
        params.push(new Date(new Date(a.clock_out_time).getTime() + shift).toISOString());
      }
      if (updates.length > 0) {
        params.push(a.id);
        await dbRun(`UPDATE regular_attendance SET ${updates.join(', ')} WHERE id = ?`, ...params);
        fixedRegular++;
      }
    }

    res.json({ success: true, fixed_survey: fixed, fixed_regular: fixedRegular, shift_hours: hours });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/fix-out-before-in - Fix records where clock_out < clock_in (add 9h to clock_out)
router.post('/fix-out-before-in', async (_req: AuthRequest, res: Response) => {
  try {
    const NINE_H = 9 * 60 * 60 * 1000;
    const responses = await dbAll(`
      SELECT id, clock_in_time, clock_out_time FROM survey_responses
      WHERE clock_in_time IS NOT NULL AND clock_out_time IS NOT NULL
        AND created_at >= '2026-03-24'
    `) as any[];

    let fixed = 0;
    for (const r of responses) {
      const inTime = new Date(r.clock_in_time).getTime();
      const outTime = new Date(r.clock_out_time).getTime();
      if (outTime < inTime) {
        const corrected = new Date(outTime + NINE_H).toISOString();
        await dbRun('UPDATE survey_responses SET clock_out_time = ? WHERE id = ?', corrected, r.id);
        fixed++;
      }
    }

    const attendances = await dbAll(`
      SELECT id, clock_in_time, clock_out_time FROM regular_attendance
      WHERE clock_in_time IS NOT NULL AND clock_out_time IS NOT NULL
        AND date >= '2026-03-24'
    `) as any[];

    let fixedRegular = 0;
    for (const a of attendances) {
      const inTime = new Date(a.clock_in_time).getTime();
      const outTime = new Date(a.clock_out_time).getTime();
      if (outTime < inTime) {
        const corrected = new Date(outTime + NINE_H).toISOString();
        await dbRun('UPDATE regular_attendance SET clock_out_time = ? WHERE id = ?', corrected, a.id);
        fixedRegular++;
      }
    }

    res.json({ success: true, fixed_survey: fixed, fixed_regular: fixedRegular });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/fix-clockout-only - Fix only clock_out times that are > current time (future = +9h bug)
router.post('/fix-clockout-only', async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const NINE_H = 9 * 60 * 60 * 1000;

    const responses = await dbAll(`
      SELECT id, clock_out_time FROM survey_responses
      WHERE clock_out_time IS NOT NULL AND created_at >= '2026-03-24'
    `) as any[];

    let fixed = 0;
    for (const r of responses) {
      const outTime = new Date(r.clock_out_time);
      if (outTime.getTime() > now.getTime()) {
        const corrected = new Date(outTime.getTime() - NINE_H).toISOString();
        await dbRun('UPDATE survey_responses SET clock_out_time = ? WHERE id = ?', corrected, r.id);
        fixed++;
      }
    }

    const attendances = await dbAll(`
      SELECT id, clock_out_time FROM regular_attendance
      WHERE clock_out_time IS NOT NULL AND date >= '2026-03-24'
    `) as any[];

    let fixedRegular = 0;
    for (const a of attendances) {
      const outTime = new Date(a.clock_out_time);
      if (outTime.getTime() > now.getTime()) {
        const corrected = new Date(outTime.getTime() - NINE_H).toISOString();
        await dbRun('UPDATE regular_attendance SET clock_out_time = ? WHERE id = ?', corrected, a.id);
        fixedRegular++;
      }
    }

    res.json({ success: true, fixed_survey: fixed, fixed_regular: fixedRegular });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/survey/fix-long-shifts - Fix clock_out where work duration > 15h (likely +9h bug on clock_out)
router.post('/fix-long-shifts', async (_req: AuthRequest, res: Response) => {
  try {
    const NINE_H = 9 * 60 * 60 * 1000;
    const FIFTEEN_H = 15 * 60 * 60 * 1000;

    const responses = await dbAll(`
      SELECT id, clock_in_time, clock_out_time FROM survey_responses
      WHERE clock_in_time IS NOT NULL AND clock_out_time IS NOT NULL
        AND created_at >= '2026-03-24'
    `) as any[];

    let fixed = 0;
    for (const r of responses) {
      const inT = new Date(r.clock_in_time).getTime();
      const outT = new Date(r.clock_out_time).getTime();
      const duration = outT - inT;
      if (duration > FIFTEEN_H) {
        const corrected = new Date(outT - NINE_H).toISOString();
        await dbRun('UPDATE survey_responses SET clock_out_time = ? WHERE id = ?', corrected, r.id);
        fixed++;
      }
    }

    const attendances = await dbAll(`
      SELECT id, clock_in_time, clock_out_time FROM regular_attendance
      WHERE clock_in_time IS NOT NULL AND clock_out_time IS NOT NULL AND date >= '2026-03-24'
    `) as any[];

    let fixedR = 0;
    for (const a of attendances) {
      const inT = new Date(a.clock_in_time).getTime();
      const outT = new Date(a.clock_out_time).getTime();
      if ((outT - inT) > FIFTEEN_H) {
        await dbRun('UPDATE regular_attendance SET clock_out_time = ? WHERE id = ?', new Date(outT - NINE_H).toISOString(), a.id);
        fixedR++;
      }
    }

    res.json({ success: true, fixed_survey: fixed, fixed_regular: fixedR });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/survey/contracts - List all contracts
router.get('/contracts', async (_req: AuthRequest, res: Response) => {
  try {
    const contracts = await dbAll('SELECT * FROM labor_contracts ORDER BY created_at DESC');
    res.json(contracts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/survey/attendance-summary - Monthly attendance summary for dispatch/alba workers
router.get('/attendance-summary', async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.query as Record<string, string>;
    if (!year || !month) { res.status(400).json({ error: 'year, month 필요' }); return; }

    const startDate = `${year}-${month.padStart(2,'0')}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${month.padStart(2,'0')}-${lastDay}`;

    // Get unique workers from survey_requests for this month
    const workers = await dbAll(`
      SELECT DISTINCT ON (sr.phone) sr.phone, resp.worker_name_ko as name, sr.department,
             sr.planned_clock_in, sr.planned_clock_out,
             COALESCE(NULLIF(resp.worker_type, ''), '') as worker_type
      FROM survey_requests sr
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.date >= ? AND sr.date <= ?
        AND resp.worker_name_ko IS NOT NULL AND resp.worker_name_ko != ''
      ORDER BY sr.phone, resp.created_at DESC
    `, startDate, endDate);

    // Get workers DB category as fallback
    const workerCategories = await dbAll('SELECT phone, category, name_ko FROM workers') as any[];
    const catMap = new Map<string, string>();
    for (const wk of workerCategories) {
      if (wk.category) catMap.set(wk.phone, wk.category);
      if (wk.category && wk.name_ko) catMap.set(wk.name_ko, wk.category);
    }

    // Group by phone to get unique workers
    const phoneMap = new Map<string, any>();
    for (const w of workers as any[]) {
      if (!phoneMap.has(w.phone)) {
        // Determine type: survey_responses.worker_type > workers.category
        let type = (w as any).worker_type || '';
        // Normalize English and Korean variants
        if (type === 'dispatch' || type === '파견' || type.includes('파견')) type = '파견';
        else if (type === 'alba' || type === '알바' || type.includes('알바') || type.includes('사업소득')) type = '알바';
        else {
          // Fallback to workers DB category
          const dbCat = catMap.get(w.phone) || catMap.get(w.name) || '';
          if (dbCat === 'dispatch' || dbCat.includes('파견')) type = '파견';
          else if (dbCat === 'alba' || dbCat.includes('알바') || dbCat.includes('사업소득')) type = '알바';
          else type = '';
        }
        phoneMap.set(w.phone, { phone: w.phone, name: w.name || w.phone, department: w.department || '', type, actuals: [], shifts: [] });
      }
      // Store planned times as shift-like data
      if (w.planned_clock_in) {
        const emp = phoneMap.get(w.phone)!;
        if (!emp.shifts.find((s: any) => s.planned_clock_in === w.planned_clock_in)) {
          emp.shifts.push({ planned_clock_in: w.planned_clock_in, planned_clock_out: w.planned_clock_out || '', days_of_week: '1,2,3,4,5', day_of_week: 1 });
        }
      }
    }

    // Get all actual attendance in one query instead of per-worker
    const allActuals = await dbAll(`
      SELECT sr.phone, sr.date, resp.clock_in_time, resp.clock_out_time,
             sr.planned_clock_in, sr.planned_clock_out
      FROM survey_requests sr
      JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.date >= ? AND sr.date <= ? AND resp.clock_in_time IS NOT NULL
        AND resp.worker_name_ko IS NOT NULL AND resp.worker_name_ko != ''
      ORDER BY sr.date
    `, startDate, endDate) as any[];

    for (const a of allActuals) {
      const emp = phoneMap.get(a.phone);
      if (emp) {
        emp.actuals.push(a);
      }
    }
    for (const [phone, emp] of phoneMap) {
      emp.actual_days = emp.actuals.length;
      emp.id = phone;
    }

    res.json({ employees: Array.from(phoneMap.values()), startDate, endDate });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Settlement (정산) =====

// GET /api/survey/settlement - Calculate settlement for dispatch or alba
router.get('/settlement', async (req: AuthRequest, res: Response) => {
  try {
    const { year_month, type, division } = req.query as Record<string, string>;
    if (!year_month) { res.status(400).json({ error: 'year_month 필요' }); return; }

    // type: 'dispatch' (파견) or 'alba' (알바/사업소득)
    // Get all confirmed records for the month
    const allRecords = await dbAll(
      'SELECT * FROM confirmed_attendance WHERE year_month = ? ORDER BY employee_name, date',
      year_month
    ) as any[];

    // Get workers for category fallback
    // NOTE: 이름 괄호 suffix('수빈(HO THI BICH)')는 다른 사람일 수 있어 절대 병합하지 않음.
    // phone 기준으로만 worker lookup. 이름 기준 lookup은 하지 않음.
    const wCats = await dbAll('SELECT id, phone, category, name_ko FROM workers') as any[];
    const wCatMap = new Map<string, string>();
    for (const wc of wCats) {
      const wp = normalizePhone(wc.phone || '');
      if (wc.category) {
        if (wp) wCatMap.set(wp, wc.category);
        if (wc.phone) wCatMap.set(wc.phone, wc.category);
        if (wc.name_ko) wCatMap.set(wc.name_ko, wc.category);
      }
    }
    // Identity = phone if exists else name (raw, no normalization — 이름 다르면 다른 사람으로 취급)
    const canonicalIdentity = (r: any): string => {
      const normPhone = normalizePhone(r.employee_phone || '');
      return normPhone || r.employee_name || '';
    };

    // Filter: 명시적으로 employee_type 값이 있으면 그대로 사용 (정규직 등 어떤 값이든).
    // 오직 빈 값일 때만 workers.category로 fallback.
    // '정규직'으로 저장된 레코드를 알바/파견으로 자동 재분류하지 않도록.
    const getEffectiveType = (r: any): string => {
      let t = (r.employee_type || '').toString().trim();
      if (!t) {
        const np = normalizePhone(r.employee_phone || '');
        t = wCatMap.get(np) || wCatMap.get(r.employee_phone) ||
            wCatMap.get(r.employee_name) || '';
      }
      if (t.includes('파견')) return '파견';
      if (t.includes('알바') || t.includes('사업소득')) return '알바';
      if (t.includes('정규')) return '정규직';
      return t;
    };

    let records: any[];
    if (type === 'alba') {
      records = allRecords.filter(r => getEffectiveType(r) === '알바');
    } else {
      records = allRecords.filter(r => getEffectiveType(r) === '파견');
    }

    // Filter by division (생산/물류) if specified
    if (division && division !== 'all') {
      // We need worker info - check if there's department/workplace info
      // For now, filter by memo or employee data from survey responses
      // Simple approach: check if employee_name has division info stored
    }

    // Group by canonical worker identity (worker.id if matched, else phone, else name)
    // so that "수빈" + "수빈(HO THI BICH)" (same worker different name spellings) merge.
    const empMap = new Map<string, any>();
    for (const r of records) {
      const identity = canonicalIdentity(r);
      if (!empMap.has(identity)) {
        empMap.set(identity, {
          name: r.employee_name,
          phone: r.employee_phone || '',
          type: getEffectiveType(r),
          work_days: 0,
          regular_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          holiday_hours: 0,
          records: [],
          weekly_data: new Map<string, { days: number; hours: number }>(),
        });
      }
      const emp = empMap.get(identity)!;
      emp.work_days++;
      const regH = parseFloat(r.regular_hours) || 0;
      const otH = parseFloat(r.overtime_hours) || 0;
      const nightH = parseFloat(r.night_hours) || 0;
      const totalH = regH + otH;

      // Check if holiday (공휴일 or 주말)
      const isHoliday = isHolidayOrWeekend(r.date);
      const isPublicHoliday = isKoreanHoliday(r.date);

      emp.regular_hours += regH;
      emp.overtime_hours += otH;
      emp.night_hours += nightH;
      emp.records.push({ ...r, isHoliday, isPublicHoliday });

      // Weekly tracking for 주휴수당 and holiday pay rules
      const d = new Date(r.date + 'T00:00:00+09:00');
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      if (!emp.weekly_data.has(weekKey)) emp.weekly_data.set(weekKey, { days: 0, hours: 0, hasHoliday: false, holidayHours: 0, publicHolidayHours: 0 });
      const w = emp.weekly_data.get(weekKey)!;
      w.days++;
      w.hours += totalH;
      if (isHoliday) { w.hasHoliday = true; w.holidayHours += totalH; }
      if (isPublicHoliday) w.publicHolidayHours += totalH;
    }

    // Get bank info + id_number + category from workers table
    const workers = await dbAll('SELECT phone, bank_name, bank_account, name_ko, id_number, category FROM workers') as any[];
    const workerMap = new Map<string, any>();
    for (const w of workers) {
      workerMap.set(w.phone, w);
      if (w.name_ko) workerMap.set(w.name_ko, w);
    }

    // Calculate settlement per employee
    const results = [];
    for (const [, emp] of empMap) {
      // 주휴수당 qualifying weeks: 15h+ and 5+ days
      let weeklyHolidayWeeks = 0;
      let holidayPayHours = 0; // 휴일수당 시간
      for (const [, w] of emp.weekly_data) {
        if (w.hours >= 15 && w.days >= 5) weeklyHolidayWeeks++;
        // 주 5일 초과 + 휴일 포함 시 → 주말/공휴일 근무 전체가 휴일수당
        if (w.days > 5 && w.hasHoliday) {
          holidayPayHours += w.holidayHours || 0;
        } else {
          // 주 5일 이하: 공휴일만 휴일수당
          holidayPayHours += w.publicHolidayHours || 0;
        }
      }
      const weeklyHolidayHours = weeklyHolidayWeeks * 8;

      // Bank info
      const workerInfo = workerMap.get(emp.phone) || workerMap.get(emp.name) || {};

      results.push({
        name: emp.name,
        phone: emp.phone,
        type: emp.type,
        bank_name: workerInfo.bank_name || '',
        bank_account: workerInfo.bank_account || '',
        id_number: workerInfo.id_number || '',
        work_days: emp.work_days,
        regular_hours: Math.round(emp.regular_hours * 100) / 100,
        overtime_hours: Math.round(emp.overtime_hours * 100) / 100,
        night_hours: Math.round(emp.night_hours * 100) / 100,
        weekly_holiday_weeks: weeklyHolidayWeeks,
        weekly_holiday_hours: weeklyHolidayHours,
        holiday_pay_hours: Math.round(holidayPayHours * 100) / 100,
      });
    }

    res.json({ year_month, type, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
