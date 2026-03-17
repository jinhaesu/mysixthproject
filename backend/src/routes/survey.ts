import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import db from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendSurveyMessage } from '../services/smsService';

const router = Router();

const TOKEN_EXPIRY_HOURS = parseInt(process.env.SURVEY_TOKEN_EXPIRY_HOURS || '48', 10);

// ===== Workplace CRUD =====

// GET /api/survey/workplaces
router.get('/workplaces', (_req: AuthRequest, res: Response) => {
  const workplaces = db.prepare('SELECT * FROM survey_workplaces WHERE is_active = 1 ORDER BY name').all();
  res.json(workplaces);
});

// POST /api/survey/workplaces
router.post('/workplaces', (req: AuthRequest, res: Response) => {
  const { name, address, latitude, longitude, radius_meters } = req.body;

  if (!name || latitude == null || longitude == null) {
    res.status(400).json({ error: '근무지 이름, 위도, 경도는 필수입니다.' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO survey_workplaces (name, address, latitude, longitude, radius_meters)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, address || '', latitude, longitude, radius_meters || 200);

  const created = db.prepare('SELECT * FROM survey_workplaces WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/survey/workplaces/:id
router.put('/workplaces/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, address, latitude, longitude, radius_meters } = req.body;

  db.prepare(`
    UPDATE survey_workplaces SET name = ?, address = ?, latitude = ?, longitude = ?, radius_meters = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, address || '', latitude, longitude, radius_meters || 200, id);

  const updated = db.prepare('SELECT * FROM survey_workplaces WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/survey/workplaces/:id (soft delete)
router.delete('/workplaces/:id', (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  db.prepare('UPDATE survey_workplaces SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  res.json({ success: true });
});

// ===== Survey Send =====

// POST /api/survey/send - Send survey to a single phone
router.post('/send', async (req: AuthRequest, res: Response) => {
  const { phone, date, workplace_id, message_type } = req.body;

  if (!phone || !date) {
    res.status(400).json({ error: '전화번호와 날짜는 필수입니다.' });
    return;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

  // Create survey request
  const result = db.prepare(`
    INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, phone, workplace_id || null, date, message_type || 'sms', expiresAt);

  // Create empty response row
  db.prepare('INSERT INTO survey_responses (request_id) VALUES (?)').run(result.lastInsertRowid);

  // Send SMS/KakaoTalk
  const sendResult = await sendSurveyMessage(phone, token, date, message_type || 'sms');

  if (sendResult.messageId) {
    db.prepare('UPDATE survey_requests SET message_id = ? WHERE id = ?')
      .run(sendResult.messageId, result.lastInsertRowid);
  }

  const created = db.prepare(`
    SELECT sr.*, sw.name as workplace_name
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({
    request: created,
    message: sendResult,
  });
});

// POST /api/survey/send-batch - Send to multiple phones
router.post('/send-batch', async (req: AuthRequest, res: Response) => {
  const { phones, date, workplace_id, message_type } = req.body;

  if (!phones || !Array.isArray(phones) || phones.length === 0 || !date) {
    res.status(400).json({ error: '전화번호 목록과 날짜는 필수입니다.' });
    return;
  }

  const results = [];

  for (const phone of phones) {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) continue;

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const result = db.prepare(`
      INSERT INTO survey_requests (token, phone, workplace_id, date, message_type, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, trimmedPhone, workplace_id || null, date, message_type || 'sms', expiresAt);

    db.prepare('INSERT INTO survey_responses (request_id) VALUES (?)').run(result.lastInsertRowid);

    const sendResult = await sendSurveyMessage(trimmedPhone, token, date, message_type || 'sms');

    if (sendResult.messageId) {
      db.prepare('UPDATE survey_requests SET message_id = ? WHERE id = ?')
        .run(sendResult.messageId, result.lastInsertRowid);
    }

    results.push({ phone: trimmedPhone, success: sendResult.success, error: sendResult.error });
  }

  res.json({ total: results.length, results });
});

// ===== Survey Responses Query =====

// GET /api/survey/responses
router.get('/responses', (req: AuthRequest, res: Response) => {
  const { startDate, endDate, phone, status, page = '1', limit = '50' } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) { where += ' AND sr.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND sr.date <= ?'; params.push(endDate); }
  if (phone) { where += ' AND sr.phone LIKE ?'; params.push(`%${phone}%`); }
  if (status) { where += ' AND sr.status = ?'; params.push(status); }

  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM survey_requests sr
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    ${where}
  `).get(...params) as any;

  const total = countResult.total;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 500);
  const offset = (pageNum - 1) * limitNum;

  const rows = db.prepare(`
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
  `).all(...params, limitNum, offset);

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
router.get('/responses/export', (req: AuthRequest, res: Response) => {
  const { startDate, endDate, phone, status } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (startDate) { where += ' AND sr.date >= ?'; params.push(startDate); }
  if (endDate) { where += ' AND sr.date <= ?'; params.push(endDate); }
  if (phone) { where += ' AND sr.phone LIKE ?'; params.push(`%${phone}%`); }
  if (status) { where += ' AND sr.status = ?'; params.push(status); }

  const rows = db.prepare(`
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
  `).all(...params) as any[];

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
router.get('/requests', (req: AuthRequest, res: Response) => {
  const { date, limit = '20' } = req.query as Record<string, string>;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (date) { where += ' AND sr.date = ?'; params.push(date); }

  const rows = db.prepare(`
    SELECT sr.*, sw.name as workplace_name,
           resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    LEFT JOIN survey_responses resp ON sr.id = resp.request_id
    ${where}
    ORDER BY sr.created_at DESC
    LIMIT ?
  `).all(...params, parseInt(limit));

  res.json(rows);
});

export default router;
