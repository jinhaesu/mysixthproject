import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { dbGet, dbAll, dbRun } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/payroll/settings
router.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await dbAll('SELECT * FROM payroll_settings ORDER BY category');
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/payroll/settings - Upsert settings array
router.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { settings } = req.body;
    if (!Array.isArray(settings)) {
      res.status(400).json({ error: '설정 데이터가 필요합니다.' });
      return;
    }

    for (const s of settings) {
      if (!s.category) continue;
      const existing = await dbGet('SELECT id FROM payroll_settings WHERE category = ?', s.category);
      if (existing) {
        await dbRun(`
          UPDATE payroll_settings SET hourly_rate = ?, overtime_multiplier = ?, night_multiplier = ?,
            weekly_holiday_enabled = ?, memo = ?, updated_at = CURRENT_TIMESTAMP
          WHERE category = ?
        `, s.hourly_rate || 0, s.overtime_multiplier ?? 1.5, s.night_multiplier ?? 0.5,
          s.weekly_holiday_enabled ?? 1, s.memo || '', s.category);
      } else {
        await dbRun(`
          INSERT INTO payroll_settings (category, hourly_rate, overtime_multiplier, night_multiplier, weekly_holiday_enabled, memo)
          VALUES (?, ?, ?, ?, ?, ?)
        `, s.category, s.hourly_rate || 0, s.overtime_multiplier ?? 1.5, s.night_multiplier ?? 0.5,
          s.weekly_holiday_enabled ?? 1, s.memo || '');
      }
    }

    const updated = await dbAll('SELECT * FROM payroll_settings ORDER BY category');
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/payroll/calculate?year=&month=
router.get('/calculate', async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }

    const y = Number(year);
    const m = Number(month);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get attendance records for the month
    const records = await dbAll(`
      SELECT name, category, date, regular_hours, overtime_hours,
             COALESCE(night_hours, 0) as night_hours, total_hours, break_time
      FROM attendance_records
      WHERE date >= ? AND date <= ?
      ORDER BY name, date
    `, startDate, endDate);

    // Get payroll settings
    const settingsArr = await dbAll('SELECT * FROM payroll_settings');
    const settings: Record<string, any> = {};
    for (const s of settingsArr) {
      settings[s.category] = s;
    }

    // Group by worker
    const workerMap = new Map<string, any>();
    for (const r of records) {
      const key = r.name;
      if (!workerMap.has(key)) {
        workerMap.set(key, {
          name: r.name,
          category: r.category || '',
          work_days: 0,
          regular_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          total_hours: 0,
          dates: new Set<string>(),
        });
      }
      const w = workerMap.get(key)!;
      w.regular_hours += Number(r.regular_hours) || 0;
      w.overtime_hours += Number(r.overtime_hours) || 0;
      w.night_hours += Number(r.night_hours) || 0;
      w.total_hours += Number(r.total_hours) || 0;
      w.dates.add(r.date);
      if (!w.category && r.category) w.category = r.category;
    }

    // Calculate weekly holiday (주휴수당) - 5+ days in a week = 8 hours bonus
    // Simple: count weeks where worker worked 5+ days
    function getWeekKey(dateStr: string): string {
      const d = new Date(dateStr + 'T12:00:00Z');
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setUTCDate(monday.getUTCDate() + diff);
      return monday.toISOString().slice(0, 10);
    }

    // Calculate pay for each worker
    const results = [];
    for (const [, w] of workerMap) {
      w.work_days = w.dates.size;
      const s = settings[w.category] || { hourly_rate: 0, overtime_multiplier: 1.5, night_multiplier: 0.5, weekly_holiday_enabled: 1 };
      const rate = Number(s.hourly_rate) || 0;

      const basePay = Math.round(w.regular_hours * rate);
      const overtimePay = Math.round(w.overtime_hours * rate * (Number(s.overtime_multiplier) || 1.5));
      const nightPay = Math.round(w.night_hours * rate * (Number(s.night_multiplier) || 0.5));

      // Weekly holiday hours
      let weeklyHolidayHours = 0;
      if (s.weekly_holiday_enabled) {
        const weekDays = new Map<string, Set<string>>();
        for (const d of w.dates) {
          const wk = getWeekKey(d);
          if (!weekDays.has(wk)) weekDays.set(wk, new Set());
          weekDays.get(wk)!.add(d);
        }
        for (const [wk, days] of weekDays) {
          if (days.size >= 5 && wk >= startDate && wk <= endDate) {
            weeklyHolidayHours += 8;
          }
        }
      }
      const weeklyHolidayPay = Math.round(weeklyHolidayHours * rate);

      const totalPay = basePay + overtimePay + nightPay + weeklyHolidayPay;

      results.push({
        name: w.name,
        category: w.category,
        work_days: w.work_days,
        regular_hours: Math.round(w.regular_hours * 10) / 10,
        overtime_hours: Math.round(w.overtime_hours * 10) / 10,
        night_hours: Math.round(w.night_hours * 10) / 10,
        hourly_rate: rate,
        base_pay: basePay,
        overtime_pay: overtimePay,
        night_pay: nightPay,
        weekly_holiday_hours: weeklyHolidayHours,
        weekly_holiday_pay: weeklyHolidayPay,
        total_pay: totalPay,
      });
    }

    results.sort((a, b) => b.total_pay - a.total_pay);

    const grandTotal = {
      workers: results.length,
      base_pay: results.reduce((s, r) => s + r.base_pay, 0),
      overtime_pay: results.reduce((s, r) => s + r.overtime_pay, 0),
      night_pay: results.reduce((s, r) => s + r.night_pay, 0),
      weekly_holiday_pay: results.reduce((s, r) => s + r.weekly_holiday_pay, 0),
      total_pay: results.reduce((s, r) => s + r.total_pay, 0),
    };

    res.json({ year: y, month: m, results, grandTotal });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/payroll/export?year=&month= - Excel export
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      res.status(400).json({ error: 'year와 month 파라미터가 필요합니다.' });
      return;
    }

    const y = Number(year);
    const m = Number(month);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const records = await dbAll(`
      SELECT name as "이름", category as "구분",
        COUNT(DISTINCT date) as "근무일수",
        ROUND(CAST(SUM(regular_hours) AS NUMERIC), 1) as "정규시간",
        ROUND(CAST(SUM(overtime_hours) AS NUMERIC), 1) as "연장시간",
        ROUND(CAST(SUM(COALESCE(night_hours, 0)) AS NUMERIC), 1) as "야간시간",
        ROUND(CAST(SUM(total_hours) AS NUMERIC), 1) as "총시간"
      FROM attendance_records
      WHERE date >= ? AND date <= ?
      GROUP BY name, category
      ORDER BY name
    `, startDate, endDate);

    const ws = XLSX.utils.json_to_sheet(records);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '급여계산');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_${y}-${String(m).padStart(2, '0')}.xlsx`);
    res.send(buf);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
