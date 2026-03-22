import { Router, Request, Response } from 'express';
import { dbGet, dbAll, dbRun } from '../db';
import { isWithinRadius, calculateDistance } from '../services/gpsService';

const router = Router();

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

    const today = new Date().toISOString().slice(0, 10);
    const attendance = await dbGet('SELECT * FROM regular_attendance WHERE employee_id = ? AND date = ?', employee.id, today) as any;

    // Get today's notices
    const notices = await dbAll('SELECT * FROM regular_notices WHERE date = ? AND is_active = 1 ORDER BY id', today);

    // Get org settings for employee's department
    const orgChart = await dbAll('SELECT * FROM regular_org_settings WHERE department = ? ORDER BY sort_order, team', employee.department);

    // Determine status
    let status = 'ready'; // ready, clocked_in, completed
    if (attendance?.clock_out_time) status = 'completed';
    else if (attendance?.clock_in_time) status = 'clocked_in';

    res.json({
      status,
      employee: {
        name: employee.name,
        department: employee.department,
        team: employee.team,
        role: employee.role,
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
      notices,
      orgChart,
      date: today,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/regular-public/:token/clock-in
router.post('/:token/clock-in', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { latitude, longitude, agreement_accepted, agreement_accepted_at } = req.body;

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

    const today = new Date().toISOString().slice(0, 10);
    const clockInTime = new Date().toISOString();

    // Check if already clocked in today (UNIQUE constraint on employee_id + date)
    const existing = await dbGet('SELECT id FROM regular_attendance WHERE employee_id = ? AND date = ?', employee.id, today) as any;
    if (existing) {
      res.status(400).json({ error: '이미 출근이 기록되었습니다.' });
      return;
    }

    await dbRun(`
      INSERT INTO regular_attendance (employee_id, date, clock_in_time, clock_in_lat, clock_in_lng, gps_valid, agreement_accepted, agreement_accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, employee.id, today, clockInTime, latitude || null, longitude || null, gpsValid, agreement_accepted ? 1 : 0, agreement_accepted_at || null);

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

    const today = new Date().toISOString().slice(0, 10);
    const clockOutTime = new Date().toISOString();

    // Must have clocked in first
    const attendance = await dbGet('SELECT * FROM regular_attendance WHERE employee_id = ? AND date = ?', employee.id, today) as any;
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

export default router;
