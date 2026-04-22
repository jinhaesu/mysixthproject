import { Router, Response } from 'express';
import { dbAll } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Day-of-week label map (0=Sun ... 6=Sat → Korean short names)
const DOW_LABELS: Record<number, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
};

/**
 * GET /api/dashboard/home-stats?year_month=2026-04
 *
 * Returns aggregated KPI and breakdown data for the home dashboard.
 * All data is sourced from confirmed_attendance and regular_vacation_requests tables.
 */
router.get('/home-stats', async (req: AuthRequest, res: Response) => {
  try {
    const { year_month } = req.query as Record<string, string>;

    if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
      res.status(400).json({ error: 'year_month 파라미터가 필요합니다. (형식: YYYY-MM)' });
      return;
    }

    // ── 1. KPI & by_department ──────────────────────────────────────────────
    const rawByTypeDept = await dbAll(
      `SELECT employee_type, department,
         COUNT(DISTINCT employee_name) AS workers,
         COUNT(*)                      AS work_days,
         SUM(regular_hours::numeric)   AS regular_hours,
         SUM(overtime_hours::numeric)  AS overtime_hours,
         SUM(night_hours::numeric)     AS night_hours,
         SUM(CASE WHEN holiday_work = 1
               THEN regular_hours::numeric + overtime_hours::numeric
               ELSE 0 END)             AS holiday_hours
       FROM confirmed_attendance
       WHERE year_month = ?
       GROUP BY employee_type, department`,
      year_month
    );

    // KPI rollup
    let totalWorkerSet = new Set<string>();
    let totalWorkDays = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;
    let totalNightHours = 0;

    // Fetch distinct workers for accurate total_workers count
    const distinctWorkers = await dbAll(
      `SELECT DISTINCT employee_name
       FROM confirmed_attendance
       WHERE year_month = ?`,
      year_month
    );
    totalWorkerSet = new Set(distinctWorkers.map((r: any) => r.employee_name));

    for (const row of rawByTypeDept) {
      totalWorkDays    += Number(row.work_days    ?? 0);
      totalRegularHours  += Number(row.regular_hours  ?? 0);
      totalOvertimeHours += Number(row.overtime_hours ?? 0);
      totalNightHours    += Number(row.night_hours    ?? 0);
    }

    const totalHours        = totalRegularHours + totalOvertimeHours + totalNightHours;
    const totalWorkersCount = totalWorkerSet.size;
    const avgHoursPerWorker = totalWorkersCount > 0
      ? Math.round((totalHours / totalWorkersCount) * 10) / 10
      : 0;
    const overtimeRatio = totalHours > 0
      ? Math.round((totalOvertimeHours / totalHours) * 1000) / 10
      : 0;

    // ── 2. Vacation days from regular_vacation_requests ────────────────────
    // Build date range for the given year_month (first day ~ last day)
    const [ymYear, ymMonth] = year_month.split('-').map(Number);
    const firstDay = `${year_month}-01`;
    const lastDayNum = new Date(ymYear, ymMonth, 0).getDate();
    const lastDay = `${year_month}-${String(lastDayNum).padStart(2, '0')}`;

    const vacationRows = await dbAll(
      `SELECT rvr.type, rvr.days
       FROM regular_vacation_requests rvr
       WHERE rvr.status = 'approved'
         AND rvr.start_date <= ?
         AND rvr.end_date   >= ?`,
      lastDay,
      firstDay
    );

    const vacationDays = vacationRows.reduce((sum: number, r: any) => sum + Number(r.days ?? 0), 0);

    // ── 3. by_department aggregation ──────────────────────────────────────
    const deptMap: Record<string, {
      department: string;
      workerSet: Set<string>;
      regular_hours: number;
      overtime_hours: number;
      night_hours: number;
      holiday_hours: number;
    }> = {};

    const rawByDept = await dbAll(
      `SELECT department,
         employee_name,
         SUM(regular_hours::numeric)  AS regular_hours,
         SUM(overtime_hours::numeric) AS overtime_hours,
         SUM(night_hours::numeric)    AS night_hours,
         SUM(CASE WHEN holiday_work = 1
               THEN regular_hours::numeric + overtime_hours::numeric
               ELSE 0 END)            AS holiday_hours
       FROM confirmed_attendance
       WHERE year_month = ?
       GROUP BY department, employee_name`,
      year_month
    );

    for (const row of rawByDept) {
      const dept = row.department || '(미지정)';
      if (!deptMap[dept]) {
        deptMap[dept] = {
          department: dept,
          workerSet: new Set(),
          regular_hours: 0,
          overtime_hours: 0,
          night_hours: 0,
          holiday_hours: 0,
        };
      }
      deptMap[dept].workerSet.add(row.employee_name);
      deptMap[dept].regular_hours  += Number(row.regular_hours  ?? 0);
      deptMap[dept].overtime_hours += Number(row.overtime_hours ?? 0);
      deptMap[dept].night_hours    += Number(row.night_hours    ?? 0);
      deptMap[dept].holiday_hours  += Number(row.holiday_hours  ?? 0);
    }

    const byDepartment = Object.values(deptMap).map(d => ({
      department:     d.department,
      workers:        d.workerSet.size,
      regular_hours:  Math.round(d.regular_hours  * 10) / 10,
      overtime_hours: Math.round(d.overtime_hours * 10) / 10,
      night_hours:    Math.round(d.night_hours    * 10) / 10,
      holiday_hours:  Math.round(d.holiday_hours  * 10) / 10,
    }));

    // ── 4. by_type aggregation ─────────────────────────────────────────────
    const typeMap: Record<string, { type: string; workerSet: Set<string>; hours: number }> = {};

    const rawByType = await dbAll(
      `SELECT employee_type,
         employee_name,
         SUM(regular_hours::numeric + overtime_hours::numeric + night_hours::numeric) AS hours
       FROM confirmed_attendance
       WHERE year_month = ?
       GROUP BY employee_type, employee_name`,
      year_month
    );

    for (const row of rawByType) {
      const t = row.employee_type || '(미지정)';
      if (!typeMap[t]) {
        typeMap[t] = { type: t, workerSet: new Set(), hours: 0 };
      }
      typeMap[t].workerSet.add(row.employee_name);
      typeMap[t].hours += Number(row.hours ?? 0);
    }

    const byType = Object.values(typeMap).map(t => ({
      type:    t.type,
      workers: t.workerSet.size,
      hours:   Math.round(t.hours * 10) / 10,
    }));

    // ── 5. daily ──────────────────────────────────────────────────────────
    const dailyRaw = await dbAll(
      `SELECT date,
         COUNT(DISTINCT employee_name) AS workers,
         SUM(regular_hours::numeric)   AS regular_hours,
         SUM(overtime_hours::numeric)  AS overtime_hours,
         SUM(night_hours::numeric)     AS night_hours
       FROM confirmed_attendance
       WHERE year_month = ?
       GROUP BY date
       ORDER BY date`,
      year_month
    );

    const daily = dailyRaw.map((r: any) => ({
      date:           r.date,
      workers:        Number(r.workers),
      regular_hours:  Math.round(Number(r.regular_hours  ?? 0) * 10) / 10,
      overtime_hours: Math.round(Number(r.overtime_hours ?? 0) * 10) / 10,
      night_hours:    Math.round(Number(r.night_hours    ?? 0) * 10) / 10,
    }));

    // ── 6. by_dept_daily ──────────────────────────────────────────────────
    const byDeptDailyRaw = await dbAll(
      `SELECT date, department,
         COUNT(DISTINCT employee_name)                                      AS workers,
         SUM(regular_hours::numeric + overtime_hours::numeric + night_hours::numeric) AS hours
       FROM confirmed_attendance
       WHERE year_month = ?
       GROUP BY date, department
       ORDER BY date, department`,
      year_month
    );

    const byDeptDaily = byDeptDailyRaw.map((r: any) => ({
      date:       r.date,
      department: r.department || '(미지정)',
      workers:    Number(r.workers),
      hours:      Math.round(Number(r.hours ?? 0) * 10) / 10,
    }));

    // ── 7. vacation_summary ─────────────────────────────────────────────
    // Count vacation from confirmed_attendance (source='vacation') for the whole month
    // + regular_vacation_requests approved within the month
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayKST = nowKST.toISOString().slice(0, 10);
    const summaryDate = todayKST >= firstDay && todayKST <= lastDay ? todayKST : lastDay;

    // Today's working count
    const workingOnDate = await dbAll(
      `SELECT DISTINCT employee_name
       FROM confirmed_attendance
       WHERE year_month = ? AND date = ?`,
      year_month,
      summaryDate
    );

    // Vacation from confirmed_attendance (source='vacation') for today
    const vacFromConfirmed = await dbAll(
      `SELECT DISTINCT employee_name, memo
       FROM confirmed_attendance
       WHERE year_month = ? AND date = ? AND source = 'vacation'`,
      year_month,
      summaryDate
    );

    // Vacation from regular_vacation_requests for today
    const vacFromRequests = await dbAll(
      `SELECT rvr.type, re.name AS employee_name
       FROM regular_vacation_requests rvr
       JOIN regular_employees re ON re.id = rvr.employee_id
       WHERE rvr.status = 'approved'
         AND rvr.start_date <= ?
         AND rvr.end_date   >= ?`,
      summaryDate,
      summaryDate
    );

    // Merge both sources (deduplicate by name)
    const vacNames = new Set<string>();
    let vacationCount = 0;
    let halfDayCount  = 0;

    for (const v of vacFromConfirmed) {
      if (vacNames.has(v.employee_name)) continue;
      vacNames.add(v.employee_name);
      if ((v.memo || '').includes('반차')) halfDayCount++;
      else vacationCount++;
    }
    for (const v of vacFromRequests) {
      if (vacNames.has(v.employee_name)) continue;
      vacNames.add(v.employee_name);
      if ((v.type || '').includes('반차')) halfDayCount++;
      else vacationCount++;
    }

    // Working = people who have confirmed attendance today and are NOT on full vacation
    const workingCount = workingOnDate.filter((w: any) => !vacNames.has(w.employee_name) || halfDayCount > 0).length;

    const vacationSummary = {
      working:  workingCount,
      vacation: vacationCount,
      half_day: halfDayCount,
    };

    // ── 8. dow_avg (day-of-week averages derived from daily data) ─────────
    const dowAcc: Record<number, { total_hours: number; total_workers: number; count: number }> = {};

    for (const d of daily) {
      const dateObj = new Date(d.date + 'T00:00:00');
      const dow = dateObj.getDay(); // 0=Sun ... 6=Sat
      if (!dowAcc[dow]) {
        dowAcc[dow] = { total_hours: 0, total_workers: 0, count: 0 };
      }
      dowAcc[dow].total_hours   += d.regular_hours + d.overtime_hours + d.night_hours;
      dowAcc[dow].total_workers += d.workers;
      dowAcc[dow].count         += 1;
    }

    // Output Mon → Sun order (1..6, 0)
    const dowOrder = [1, 2, 3, 4, 5, 6, 0];
    const dowAvg = dowOrder
      .filter(dow => dowAcc[dow])
      .map(dow => {
        const acc = dowAcc[dow];
        return {
          dow:         DOW_LABELS[dow],
          avg_hours:   Math.round((acc.total_hours   / acc.count) * 10) / 10,
          avg_workers: Math.round((acc.total_workers / acc.count) * 10) / 10,
        };
      });

    // ── Response ──────────────────────────────────────────────────────────
    res.json({
      year_month,
      kpi: {
        total_workers:       totalWorkersCount,
        total_work_days:     totalWorkDays,
        total_hours:         Math.round(totalHours * 10) / 10,
        avg_hours_per_worker: avgHoursPerWorker,
        overtime_ratio:      overtimeRatio,
        vacation_days:       Math.round(vacationDays * 10) / 10,
      },
      by_department: byDepartment,
      by_type:       byType,
      daily,
      by_dept_daily: byDeptDaily,
      vacation_summary: vacationSummary,
      dow_avg:       dowAvg,
    });
  } catch (error: any) {
    console.error('GET /api/dashboard/home-stats error:', error);
    res.status(500).json({ error: `대시보드 데이터 조회 중 오류: ${error.message || error}` });
  }
});

export default router;
