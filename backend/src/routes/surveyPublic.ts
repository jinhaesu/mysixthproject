import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { isWithinRadius, calculateDistance } from '../services/gpsService';

const router = Router();

// GET /api/survey-public/:token - Get survey state (public, no auth)
router.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  const request = await dbGet(`
    SELECT sr.*, sw.name as workplace_name, sw.address as workplace_address,
           sw.latitude, sw.longitude, sw.radius_meters
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.token = ?
  `, token) as any;

  if (!request) {
    res.status(404).json({ error: '유효하지 않은 설문 링크입니다.' });
    return;
  }

  // Check expiration
  if (new Date(request.expires_at) < new Date()) {
    await dbRun('UPDATE survey_requests SET status = ? WHERE id = ?', 'expired', request.id);
    res.status(410).json({ error: '설문 링크가 만료되었습니다.' });
    return;
  }

  const response = await dbGet('SELECT * FROM survey_responses WHERE request_id = ?', request.id) as any;

  // Look up worker profile for pre-fill
  const worker = await dbGet('SELECT * FROM workers WHERE phone = ?', request.phone);

  res.json({
    status: request.status,
    date: request.date,
    department: request.department || '',
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
    worker: worker ? {
      name_ko: worker.name_ko,
      name_en: worker.name_en,
      bank_name: worker.bank_name,
      bank_account: worker.bank_account,
      emergency_contact: worker.emergency_contact,
    } : null,
  });
});

// POST /api/survey-public/:token/clock-in - Submit clock-in
router.post('/:token/clock-in', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { latitude, longitude, worker_name_ko, worker_name_en, bank_name, bank_account, id_number, emergency_contact, memo, gender, birth_year, agreement_accepted, agreement_accepted_at, agency, overtime_willing } = req.body;

  if (!worker_name_ko || !worker_name_en || !bank_name || !bank_account || !id_number || !emergency_contact || !gender || !birth_year || !agreement_accepted) {
    res.status(400).json({ error: '모든 필수 항목을 입력해주세요.' });
    return;
  }

  const request = await dbGet(`
    SELECT sr.*, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters, sw.name as workplace_name
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.token = ?
  `, token) as any;

  if (!request) {
    res.status(404).json({ error: '유효하지 않은 설문 링크입니다.' });
    return;
  }

  if (new Date(request.expires_at) < new Date()) {
    await dbRun('UPDATE survey_requests SET status = ? WHERE id = ?', 'expired', request.id);
    res.status(410).json({ error: '설문 링크가 만료되었습니다.' });
    return;
  }

  if (request.status !== 'sent') {
    res.status(400).json({ error: '이미 출근이 기록되었습니다.' });
    return;
  }

  // GPS 필수 검증: 근무지가 지정된 경우 반드시 범위 내에 있어야 함
  if (request.wp_lat != null) {
    if (latitude == null || longitude == null) {
      res.status(400).json({ error: 'GPS 위치를 확인할 수 없습니다. 위치 권한을 허용해주세요.' });
      return;
    }
    const withinRange = isWithinRadius(latitude, longitude, request.wp_lat, request.wp_lng, request.radius_meters);
    const dist = Math.round(calculateDistance(latitude, longitude, request.wp_lat, request.wp_lng));
    if (!withinRange) {
      res.status(400).json({ error: `근무지 범위를 벗어났습니다. 현재 ${dist}m 거리에 있습니다. (허용: ${request.radius_meters}m 이내)` });
      return;
    }
  }

  const gpsValid = 1;
  const distance = (latitude != null && longitude != null && request.wp_lat != null)
    ? Math.round(calculateDistance(latitude, longitude, request.wp_lat, request.wp_lng))
    : null;

  const clockInTime = new Date().toISOString();

  const existing = await dbGet('SELECT id FROM survey_responses WHERE request_id = ?', request.id) as any;

  if (existing) {
    await dbRun(`
      UPDATE survey_responses SET
        clock_in_time = ?, clock_in_lat = ?, clock_in_lng = ?, clock_in_gps_valid = ?,
        worker_name_ko = ?, worker_name_en = ?, bank_name = ?, bank_account = ?,
        id_number = ?, emergency_contact = ?, memo = ?,
        gender = ?, birth_year = ?, agreement_accepted = ?, agreement_accepted_at = ?,
        agency = ?, overtime_willing = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE request_id = ?
    `,
      clockInTime, latitude || null, longitude || null, gpsValid,
      worker_name_ko, worker_name_en, bank_name || '', bank_account || '',
      id_number || '', emergency_contact || '', memo || '',
      gender || '', birth_year || null, agreement_accepted ? 1 : 0, agreement_accepted_at || null,
      agency || '', overtime_willing || '',
      request.id
    );
  } else {
    await dbRun(`
      INSERT INTO survey_responses (request_id, clock_in_time, clock_in_lat, clock_in_lng, clock_in_gps_valid,
        worker_name_ko, worker_name_en, bank_name, bank_account, id_number, emergency_contact, memo,
        gender, birth_year, agreement_accepted, agreement_accepted_at, agency, overtime_willing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      request.id, clockInTime, latitude || null, longitude || null, gpsValid,
      worker_name_ko, worker_name_en, bank_name || '', bank_account || '',
      id_number || '', emergency_contact || '', memo || '',
      gender || '', birth_year || null, agreement_accepted ? 1 : 0, agreement_accepted_at || null,
      agency || '', overtime_willing || ''
    );
  }

  await dbRun('UPDATE survey_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 'clock_in', request.id);

  // Auto-upsert worker profile
  try {
    const existingWorker = await dbGet('SELECT id FROM workers WHERE phone = ?', request.phone);
    if (!existingWorker) {
      await dbRun(`
        INSERT INTO workers (phone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, gender, birth_year, agency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, request.phone, worker_name_ko, worker_name_en || '', bank_name || '', bank_account || '', id_number || '', emergency_contact || '', gender || '', birth_year || null, agency || '');
    } else {
      await dbRun(`
        UPDATE workers SET
          name_ko = COALESCE(NULLIF(?, ''), name_ko),
          name_en = COALESCE(NULLIF(?, ''), name_en),
          bank_name = COALESCE(NULLIF(?, ''), bank_name),
          bank_account = COALESCE(NULLIF(?, ''), bank_account),
          id_number = COALESCE(NULLIF(?, ''), id_number),
          emergency_contact = COALESCE(NULLIF(?, ''), emergency_contact),
          gender = COALESCE(NULLIF(?, ''), gender),
          birth_year = COALESCE(?, birth_year),
          agency = COALESCE(NULLIF(?, ''), agency),
          updated_at = CURRENT_TIMESTAMP
        WHERE phone = ?
      `, worker_name_ko, worker_name_en || '', bank_name || '', bank_account || '', id_number || '', emergency_contact || '', gender || '', birth_year || null, agency || '', request.phone);
    }
  } catch (err) {
    console.error('[Worker] Auto-upsert failed:', err);
  }

  res.json({
    success: true,
    clock_in_time: clockInTime,
    gps_valid: true,
    distance,
  });
});

// POST /api/survey-public/:token/clock-out - Submit clock-out
router.post('/:token/clock-out', async (req: Request, res: Response) => {
  const { token } = req.params;
  const { latitude, longitude } = req.body;

  const request = await dbGet(`
    SELECT sr.*, sw.latitude as wp_lat, sw.longitude as wp_lng, sw.radius_meters, sw.name as workplace_name
    FROM survey_requests sr
    LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
    WHERE sr.token = ?
  `, token) as any;

  if (!request) {
    res.status(404).json({ error: '유효하지 않은 설문 링크입니다.' });
    return;
  }

  if (new Date(request.expires_at) < new Date()) {
    await dbRun('UPDATE survey_requests SET status = ? WHERE id = ?', 'expired', request.id);
    res.status(410).json({ error: '설문 링크가 만료되었습니다.' });
    return;
  }

  if (request.status !== 'clock_in') {
    res.status(400).json({ error: '먼저 출근을 기록해주세요.' });
    return;
  }

  // GPS 필수 검증: 근무지가 지정된 경우 반드시 범위 내에 있어야 함
  if (request.wp_lat != null) {
    if (latitude == null || longitude == null) {
      res.status(400).json({ error: 'GPS 위치를 확인할 수 없습니다. 위치 권한을 허용해주세요.' });
      return;
    }
    const withinRange = isWithinRadius(latitude, longitude, request.wp_lat, request.wp_lng, request.radius_meters);
    const dist = Math.round(calculateDistance(latitude, longitude, request.wp_lat, request.wp_lng));
    if (!withinRange) {
      res.status(400).json({ error: `근무지 범위를 벗어났습니다. 현재 ${dist}m 거리에 있습니다. (허용: ${request.radius_meters}m 이내)` });
      return;
    }
  }

  const gpsValid = 1;
  const distance = (latitude != null && longitude != null && request.wp_lat != null)
    ? Math.round(calculateDistance(latitude, longitude, request.wp_lat, request.wp_lng))
    : null;

  const clockOutTime = new Date().toISOString();

  // 퇴근 기록 먼저 저장
  await dbRun(`
    UPDATE survey_responses SET
      clock_out_time = ?, clock_out_lat = ?, clock_out_lng = ?, clock_out_gps_valid = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE request_id = ?
  `, clockOutTime, latitude || null, longitude || null, gpsValid, request.id);

  // attendance_records 생성 시도 (실패해도 퇴근 기록은 유지)
  const response = await dbGet('SELECT * FROM survey_responses WHERE request_id = ?', request.id) as any;
  if (response && response.clock_in_time) {
    try {
      const clockIn = new Date(response.clock_in_time);
      const clockOut = new Date(clockOutTime);
      const totalMs = clockOut.getTime() - clockIn.getTime();
      const totalHours = Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
      const breakTime = totalHours >= 8 ? 1 : totalHours >= 4 ? 0.5 : 0;
      const regularHours = Math.min(Math.max(totalHours - breakTime, 0), 8);
      const overtimeHours = Math.max(totalHours - breakTime - 8, 0);

      const clockInStr = clockIn.toTimeString().slice(0, 5);
      const clockOutStr = clockOut.toTimeString().slice(0, 5);

      // uploads 테이블에 survey 용 레코드 생성 (FK 충족)
      const uploadId = `survey-${request.date}`;
      const existingUpload = await dbGet('SELECT id FROM uploads WHERE id = ?', uploadId);
      if (!existingUpload) {
        await dbRun('INSERT INTO uploads (id, filename, original_filename, record_count) VALUES (?, ?, ?, 0)',
          uploadId, 'survey', `설문 출퇴근 ${request.date}`);
      }

      await dbRun(`
        INSERT INTO attendance_records (upload_id, date, name, clock_in, clock_out, category, department, workplace, total_hours, regular_hours, overtime_hours, break_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, uploadId, request.date, response.worker_name_ko, clockInStr, clockOutStr, '파견', '', request.workplace_name || '', totalHours, regularHours, overtimeHours, breakTime);

      // record_count 업데이트
      await dbRun('UPDATE uploads SET record_count = record_count + 1 WHERE id = ?', uploadId);
    } catch (err) {
      console.error('[Survey] attendance_records 생성 실패:', err);
    }
  }

  // 모든 처리 성공 후 상태 변경
  await dbRun('UPDATE survey_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 'completed', request.id);

  res.json({
    success: true,
    clock_out_time: clockOutTime,
    gps_valid: true,
    distance,
  });
});

// GET /api/survey-public/dashboard-report/:date - Public dashboard view (no auth)
router.get('/dashboard-report/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;

    const byWorkplace = await dbAll(`
      SELECT sw.id as workplace_id, sw.name as workplace_name,
        COUNT(*) as total,
        SUM(CASE WHEN sr.status = 'sent' THEN 1 ELSE 0 END) as not_clocked_in,
        SUM(CASE WHEN sr.status = 'clock_in' THEN 1 ELSE 0 END) as clocked_in,
        SUM(CASE WHEN sr.status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.date = ?
      GROUP BY sw.id, sw.name
      ORDER BY sw.name
    `, date);

    const workers = await dbAll(`
      SELECT sr.id, sr.phone, sr.status, sr.department,
             sw.name as workplace_name,
             resp.worker_name_ko, resp.clock_in_time, resp.clock_out_time,
             sr.planned_clock_in, sr.planned_clock_out
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      LEFT JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE sr.date = ?
      ORDER BY sw.name, sr.department, sr.status, resp.worker_name_ko
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

export default router;
