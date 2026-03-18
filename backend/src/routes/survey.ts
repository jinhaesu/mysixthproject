import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendSurveyMessage } from '../services/smsService';

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

// ===== Survey Send =====

// POST /api/survey/send - Send survey to a single phone
router.post('/send', async (req: AuthRequest, res: Response) => {
  const { phone, date, workplace_id, message_type } = req.body;

  if (!phone || !date || !workplace_id) {
    res.status(400).json({ error: '전화번호, 날짜, 근무지는 필수입니다.' });
    return;
  }

  const workplace = await dbGet('SELECT name FROM survey_workplaces WHERE id = ? AND is_active = 1', workplace_id) as any;
  if (!workplace) {
    res.status(400).json({ error: '유효하지 않은 근무지입니다.' });
    return;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  // Create survey request
  const result = await dbRun(`
    INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, token, phone, workplace_id, date, message_type || 'sms', expiresAt);

  // Create empty response row
  await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', result.lastInsertRowid);

  // Send SMS/KakaoTalk
  const sendResult = await sendSurveyMessage(phone, token, date, workplace.name, message_type || 'sms');

  if (sendResult.messageId) {
    await dbRun('UPDATE survey_requests SET message_id = ? WHERE id = ?', sendResult.messageId, result.lastInsertRowid);
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
  });
});

// POST /api/survey/send-batch - Send to multiple phones
router.post('/send-batch', async (req: AuthRequest, res: Response) => {
  const { phones, date, workplace_id, message_type } = req.body;

  if (!phones || !Array.isArray(phones) || phones.length === 0 || !date || !workplace_id) {
    res.status(400).json({ error: '전화번호 목록, 날짜, 근무지는 필수입니다.' });
    return;
  }

  const workplace = await dbGet('SELECT name FROM survey_workplaces WHERE id = ? AND is_active = 1', workplace_id) as any;
  if (!workplace) {
    res.status(400).json({ error: '유효하지 않은 근무지입니다.' });
    return;
  }

  const results = [];

  for (const phone of phones) {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) continue;

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const result = await dbRun(`
      INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, token, trimmedPhone, workplace_id, date, message_type || 'sms', expiresAt);

    await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', result.lastInsertRowid);

    const sendResult = await sendSurveyMessage(trimmedPhone, token, date, workplace.name, message_type || 'sms');

    if (sendResult.messageId) {
      await dbRun('UPDATE survey_requests SET message_id = ? WHERE id = ?', sendResult.messageId, result.lastInsertRowid);
    }

    results.push({ phone: trimmedPhone, success: sendResult.success, error: sendResult.error });
  }

  res.json({ total: results.length, results });
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
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const total = await dbGet('SELECT COUNT(*) as count FROM survey_requests');
    const todayCount = await dbGet('SELECT COUNT(*) as count FROM survey_requests WHERE date = ?', today);
    const byStatus = await dbAll(`
      SELECT status, COUNT(*) as count
      FROM survey_requests
      GROUP BY status
    `);
    const todayByStatus = await dbAll(`
      SELECT status, COUNT(*) as count
      FROM survey_requests
      WHERE date = ?
      GROUP BY status
    `, today);

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
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

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
      SELECT sr.id, sr.phone, sr.status, sr.workplace_id,
             sw.name as workplace_name,
             resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time
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
    const targetDate = date || new Date().toISOString().slice(0, 10);

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
  const { startDate, endDate, phone, status, workplace, page = '1', limit = '50' } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) { where += ' AND sr.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND sr.date <= ?'; params.push(endDate); }
  if (phone) { where += ' AND sr.phone LIKE ?'; params.push(`%${phone}%`); }
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
           sw.name as workplace_name, sw.address as workplace_address
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
           sw.name as "근무지"
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
  res.setHeader('Content-Disposition', `attachment; filename=survey_responses_${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.send(buf);
});

// GET /api/survey/requests - List sent requests (for recent sends view)
router.get('/requests', async (req: AuthRequest, res: Response) => {
  const { date, limit = '20' } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (date) { where += ' AND sr.date = ?'; params.push(date); }

  const rows = await dbAll(`
    SELECT sr.*, sw.name as workplace_name,
           resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    ${where}
    ORDER BY sr.created_at DESC
    LIMIT ?
  `, ...params, parseInt(limit));

  res.json(rows);
});

// PATCH /api/survey/responses/:id/time - Admin edit clock-in/out times
router.patch('/responses/:id/time', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { clock_in_time, clock_out_time } = req.body;

    // Get the survey request by id
    const request = await dbGet(`
      SELECT sr.id, sr.date, sr.status, resp.id as resp_id, resp.clock_in_time, resp.clock_out_time,
             resp.worker_name_ko
      FROM survey_requests sr
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.id = ?
    `, id);

    if (!request || !request.resp_id) {
      res.status(404).json({ error: '응답을 찾을 수 없습니다.' });
      return;
    }

    // Update times
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

    // Also update the corresponding attendance_record if it exists
    if (clock_in_time !== undefined || clock_out_time !== undefined) {
      const uploadId = 'survey-' + request.date;

      // Get updated response
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

        // Try to update existing attendance record
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

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
