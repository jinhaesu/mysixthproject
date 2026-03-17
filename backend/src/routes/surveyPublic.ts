import { Router, Request, Response } from 'express';
import db from '../db';
import { isWithinRadius, calculateDistance } from '../services/gpsService';

const router = Router();

// GET /api/survey-public/:token - Get survey state (public, no auth)
router.get('/:token', (req: Request, res: Response) => {
  const { token } = req.params;

  const request = db.prepare(`
    SELECT sr.*, sw.name as workplace_name, sw.address as workplace_address,
           sw.latitude, sw.longitude, sw.radius_meters
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.token = ?
  `).get(token) as any;

  if (!request) {
    res.status(404).json({ error: '유효하지 않은 설문 링크입니다.' });
    return;
  }

  // Check expiration
  if (new Date(request.expires_at) < new Date()) {
    db.prepare('UPDATE survey_requests SET status = ? WHERE id = ?').run('expired', request.id);
    res.status(410).json({ error: '설문 링크가 만료되었습니다.' });
    return;
  }

  const response = db.prepare('SELECT * FROM survey_responses WHERE request_id = ?').get(request.id) as any;

  res.json({
    status: request.status,
    date: request.date,
    workplace: request.workplace_id ? {
      name: request.workplace_name,
      address: request.workplace_address,
      latitude: request.latitude,
      longitude: request.longitude,
      radius_meters: request.radius_meters,
    } : null,
    response: response ? {
      clock_in_time: response.clock_in_time,
      clock_out_time: response.clock_out_time,
      worker_name_ko: response.worker_name_ko,
      worker_name_en: response.worker_name_en,
    } : null,
  });
});

// POST /api/survey-public/:token/clock-in - Submit clock-in
router.post('/:token/clock-in', (req: Request, res: Response) => {
  const { token } = req.params;
  const { latitude, longitude, worker_name_ko, worker_name_en, bank_name, bank_account, id_number, emergency_contact, memo } = req.body;

  if (!worker_name_ko || !worker_name_en) {
    res.status(400).json({ error: '한글 이름과 영문 이름을 모두 입력해주세요.' });
    return;
  }

  const request = db.prepare(`
    SELECT sr.*, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.token = ?
  `).get(token) as any;

  if (!request) {
    res.status(404).json({ error: '유효하지 않은 설문 링크입니다.' });
    return;
  }

  if (new Date(request.expires_at) < new Date()) {
    db.prepare('UPDATE survey_requests SET status = ? WHERE id = ?').run('expired', request.id);
    res.status(410).json({ error: '설문 링크가 만료되었습니다.' });
    return;
  }

  if (request.status !== 'sent') {
    res.status(400).json({ error: '이미 출근이 기록되었습니다.' });
    return;
  }

  // GPS validation
  let gpsValid = 0;
  let distance = null;
  if (latitude != null && longitude != null && request.wp_lat != null) {
    gpsValid = isWithinRadius(latitude, longitude, request.wp_lat, request.wp_lng, request.radius_meters) ? 1 : 0;
    distance = Math.round(calculateDistance(latitude, longitude, request.wp_lat, request.wp_lng));
  }

  const clockInTime = new Date().toISOString();

  // Check if response row already exists
  const existing = db.prepare('SELECT id FROM survey_responses WHERE request_id = ?').get(request.id) as any;

  if (existing) {
    db.prepare(`
      UPDATE survey_responses SET
        clock_in_time = ?, clock_in_lat = ?, clock_in_lng = ?, clock_in_gps_valid = ?,
        worker_name_ko = ?, worker_name_en = ?, bank_name = ?, bank_account = ?,
        id_number = ?, emergency_contact = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE request_id = ?
    `).run(
      clockInTime, latitude || null, longitude || null, gpsValid,
      worker_name_ko, worker_name_en, bank_name || '', bank_account || '',
      id_number || '', emergency_contact || '', memo || '', request.id
    );
  } else {
    db.prepare(`
      INSERT INTO survey_responses (request_id, clock_in_time, clock_in_lat, clock_in_lng, clock_in_gps_valid,
        worker_name_ko, worker_name_en, bank_name, bank_account, id_number, emergency_contact, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id, clockInTime, latitude || null, longitude || null, gpsValid,
      worker_name_ko, worker_name_en, bank_name || '', bank_account || '',
      id_number || '', emergency_contact || '', memo || ''
    );
  }

  db.prepare('UPDATE survey_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('clock_in', request.id);

  res.json({
    success: true,
    clock_in_time: clockInTime,
    gps_valid: gpsValid === 1,
    distance,
  });
});

// POST /api/survey-public/:token/clock-out - Submit clock-out
router.post('/:token/clock-out', (req: Request, res: Response) => {
  const { token } = req.params;
  const { latitude, longitude } = req.body;

  const request = db.prepare(`
    SELECT sr.*, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.token = ?
  `).get(token) as any;

  if (!request) {
    res.status(404).json({ error: '유효하지 않은 설문 링크입니다.' });
    return;
  }

  if (new Date(request.expires_at) < new Date()) {
    db.prepare('UPDATE survey_requests SET status = ? WHERE id = ?').run('expired', request.id);
    res.status(410).json({ error: '설문 링크가 만료되었습니다.' });
    return;
  }

  if (request.status !== 'clock_in') {
    res.status(400).json({ error: '먼저 출근을 기록해주세요.' });
    return;
  }

  // GPS validation
  let gpsValid = 0;
  let distance = null;
  if (latitude != null && longitude != null && request.wp_lat != null) {
    gpsValid = isWithinRadius(latitude, longitude, request.wp_lat, request.wp_lng, request.radius_meters) ? 1 : 0;
    distance = Math.round(calculateDistance(latitude, longitude, request.wp_lat, request.wp_lng));
  }

  const clockOutTime = new Date().toISOString();

  db.prepare(`
    UPDATE survey_responses SET
      clock_out_time = ?, clock_out_lat = ?, clock_out_lng = ?, clock_out_gps_valid = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE request_id = ?
  `).run(clockOutTime, latitude || null, longitude || null, gpsValid, request.id);

  db.prepare('UPDATE survey_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('completed', request.id);

  // Auto-create attendance_record from completed survey
  const response = db.prepare('SELECT * FROM survey_responses WHERE request_id = ?').get(request.id) as any;
  if (response && response.clock_in_time && response.clock_out_time) {
    const clockIn = new Date(response.clock_in_time);
    const clockOut = new Date(clockOutTime);
    const totalMs = clockOut.getTime() - clockIn.getTime();
    const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
    const breakTime = totalHours >= 8 ? 1 : totalHours >= 4 ? 0.5 : 0;
    const regularHours = Math.min(Math.max(totalHours - breakTime, 0), 8);
    const overtimeHours = Math.max(totalHours - breakTime - 8, 0);

    const clockInStr = clockIn.toTimeString().slice(0, 5);
    const clockOutStr = clockOut.toTimeString().slice(0, 5);

    db.prepare(`
      INSERT INTO attendance_records (upload_id, date, name, clock_in, clock_out, category, department, workplace, total_hours, regular_hours, overtime_hours, break_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `survey-${request.date}`,
      request.date,
      response.worker_name_ko,
      clockInStr,
      clockOutStr,
      '파견',
      '',
      '',
      totalHours,
      regularHours,
      overtimeHours,
      breakTime
    );
  }

  res.json({
    success: true,
    clock_out_time: clockOutTime,
    gps_valid: gpsValid === 1,
    distance,
  });
});

export default router;
