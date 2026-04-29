/**
 * GET /api/contracts/latest   — unified latest contract per employee
 * GET /api/contracts/missing  — employees with no contract
 * GET /api/contracts/history  — full contract history for one employee
 */

import { Router, Response } from 'express';
import { dbGet, dbAll, normalizePhone } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRegularContractsQuery(whereClause: string): string {
  return `
    SELECT
      'regular'                           AS employee_type,
      re.id                               AS employee_id,
      re.name                             AS employee_name,
      re.phone                            AS employee_phone,
      re.department,
      re.team,
      re.hire_date,
      COALESCE(re.resigned_at, '')        AS resigned_at,
      re.is_active,
      c.id                                AS contract_id,
      c.contract_start,
      c.contract_end,
      c.status                            AS contract_status,
      c.created_at                        AS contract_created_at,
      c.signature_data,
      c.position_title,
      c.annual_salary,
      c.base_pay,
      c.meal_allowance,
      c.other_allowance,
      c.work_hours,
      c.department                        AS contract_department,
      NULL::TEXT                          AS worker_type,
      cnt.contract_count
    FROM regular_employees re
    LEFT JOIN LATERAL (
      SELECT * FROM regular_labor_contracts
      WHERE employee_id = re.id
      ORDER BY created_at DESC
      LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS contract_count
      FROM regular_labor_contracts
      WHERE employee_id = re.id
    ) cnt ON true
    ${whereClause}
  `;
}

function buildWorkerContractsQuery(whereClause: string): string {
  return `
    SELECT
      'dispatch'                          AS employee_type,
      w.id                                AS employee_id,
      w.name_ko                           AS employee_name,
      w.phone                             AS employee_phone,
      w.department,
      ''                                  AS team,
      ''                                  AS hire_date,
      ''                                  AS resigned_at,
      1                                   AS is_active,
      c.id                                AS contract_id,
      c.contract_start,
      c.contract_end,
      c.sms_sent                          AS contract_status,
      c.created_at                        AS contract_created_at,
      c.signature_data,
      NULL::TEXT                          AS position_title,
      NULL::TEXT                          AS annual_salary,
      NULL::TEXT                          AS base_pay,
      NULL::TEXT                          AS meal_allowance,
      NULL::TEXT                          AS other_allowance,
      NULL::TEXT                          AS work_hours,
      NULL::TEXT                          AS contract_department,
      w.category                          AS worker_type,
      cnt.contract_count
    FROM workers w
    LEFT JOIN LATERAL (
      SELECT * FROM labor_contracts
      WHERE phone = w.phone
      ORDER BY created_at DESC
      LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS contract_count
      FROM labor_contracts
      WHERE phone = w.phone
    ) cnt ON true
    ${whereClause}
  `;
}

function rowToItem(row: any) {
  const hasContract = row.contract_id != null;
  return {
    employee_type: row.employee_type,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_phone: row.employee_phone,
    department: row.department || '',
    team: row.team || '',
    hire_date: row.hire_date || '',
    resigned_at: row.resigned_at || '',
    is_active: row.is_active,
    contract: hasContract
      ? {
          id: row.contract_id,
          contract_start: row.contract_start,
          contract_end: row.contract_end,
          status: row.contract_status,
          created_at: row.contract_created_at,
          signature_data: row.signature_data || null,
          position_title: row.position_title || null,
          annual_salary: row.annual_salary || null,
          base_pay: row.base_pay || null,
          meal_allowance: row.meal_allowance || null,
          other_allowance: row.other_allowance || null,
          work_hours: row.work_hours || null,
          department: row.contract_department || null,
        }
      : null,
    contract_count: row.contract_count || 0,
  };
}

// ---------------------------------------------------------------------------
// GET /api/contracts/latest
// ---------------------------------------------------------------------------
router.get('/latest', async (req: AuthRequest, res: Response) => {
  try {
    const { type = 'all', search } = req.query as Record<string, string>;

    const searchConditionRegular = search
      ? `WHERE (re.name ILIKE $1 OR re.phone ILIKE $1)`
      : 'WHERE 1=1';
    const searchConditionWorker = search
      ? `WHERE (w.name_ko ILIKE $1 OR w.phone ILIKE $1)`
      : 'WHERE 1=1';
    const searchParam = search ? [`%${search}%`] : [];

    let rows: any[] = [];

    if (type === 'all' || type === 'regular') {
      const regularRows = await dbAll(
        buildRegularContractsQuery(searchConditionRegular) +
          ' ORDER BY re.is_active DESC, re.name',
        ...searchParam,
      );
      rows = rows.concat(regularRows);
    }

    if (type === 'all' || type === 'dispatch' || type === 'alba') {
      const workerRows = await dbAll(
        buildWorkerContractsQuery(searchConditionWorker) +
          ' ORDER BY w.name_ko',
        ...searchParam,
      );
      rows = rows.concat(workerRows);
    }

    const items = rows.map(rowToItem);
    const missingCount = items.filter((i) => i.contract === null).length;

    res.json({ items, total: items.length, missing_count: missingCount });
  } catch (error: any) {
    console.error('GET /api/contracts/latest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contracts/missing
// ---------------------------------------------------------------------------
router.get('/missing', async (req: AuthRequest, res: Response) => {
  try {
    const { type = 'all', search } = req.query as Record<string, string>;

    const searchConditionRegular = search
      ? `WHERE (re.name ILIKE $1 OR re.phone ILIKE $1)`
      : 'WHERE 1=1';
    const searchConditionWorker = search
      ? `WHERE (w.name_ko ILIKE $1 OR w.phone ILIKE $1)`
      : 'WHERE 1=1';
    const searchParam = search ? [`%${search}%`] : [];

    let rows: any[] = [];

    if (type === 'all' || type === 'regular') {
      const regularRows = await dbAll(
        buildRegularContractsQuery(searchConditionRegular) +
          ' ORDER BY re.is_active DESC, re.name',
        ...searchParam,
      );
      rows = rows.concat(regularRows);
    }

    if (type === 'all' || type === 'dispatch' || type === 'alba') {
      const workerRows = await dbAll(
        buildWorkerContractsQuery(searchConditionWorker) +
          ' ORDER BY w.name_ko',
        ...searchParam,
      );
      rows = rows.concat(workerRows);
    }

    const items = rows.map(rowToItem).filter((i) => i.contract === null);

    res.json({ items, total: items.length });
  } catch (error: any) {
    console.error('GET /api/contracts/missing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contracts/history
// ---------------------------------------------------------------------------
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_type, employee_id, phone } = req.query as Record<string, string>;

    if (!employee_type) {
      res.status(400).json({ error: 'employee_type is required' });
      return;
    }

    if (employee_type === 'regular') {
      if (!employee_id) {
        res.status(400).json({ error: 'employee_id is required for regular employees' });
        return;
      }
      const empId = parseInt(employee_id, 10);

      const employee = await dbGet(
        'SELECT id, name, phone, department, team, hire_date, resigned_at, is_active FROM regular_employees WHERE id = ?',
        empId,
      );
      if (!employee) {
        res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
        return;
      }

      const contracts = await dbAll(
        'SELECT * FROM regular_labor_contracts WHERE employee_id = ? ORDER BY created_at DESC',
        empId,
      );

      res.json({ employee, contracts });
    } else {
      // dispatch / alba — match by phone
      const normalizedPhone = phone ? normalizePhone(phone) : null;
      if (!normalizedPhone) {
        res.status(400).json({ error: 'phone is required for dispatch/alba employees' });
        return;
      }

      const worker = await dbGet(
        'SELECT id, name_ko AS name, phone, department, category FROM workers WHERE phone = ?',
        normalizedPhone,
      );
      if (!worker) {
        res.status(404).json({ error: '근무자를 찾을 수 없습니다.' });
        return;
      }

      const contracts = await dbAll(
        'SELECT * FROM labor_contracts WHERE phone = ? ORDER BY created_at DESC',
        normalizedPhone,
      );

      res.json({ employee: worker, contracts });
    }
  } catch (error: any) {
    console.error('GET /api/contracts/history error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
