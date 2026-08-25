/**
 * GET /api/contracts/latest   — unified latest contract per employee
 * GET /api/contracts/missing  — employees with no contract
 * GET /api/contracts/history  — full contract history for one employee
 */

import { Router, Response } from 'express';
import crypto from 'crypto';
import { dbGet, dbAll, dbRun, normalizePhone } from '../db';
import { AuthRequest } from '../middleware/auth';
import { uploadBase64, isStorageEnabled, shouldUseStorage } from '../services/fileStorage';
import {
  logAudit, clientIp, userAgent, sha256, canonicalizeContract, renderSnapshotHtml, contractTable,
  type ContractKind,
} from '../lib/contractAudit';
import { stampInline } from '../lib/tsa';
import { buildRegularCafeContractPage, type StampKey } from '../templates/regular-cafe-contract';

/**
 * legacy 스캔 파일 base64 → Storage 분기.
 * @param table 'regular_labor_contracts' | 'labor_contracts'
 * @param refKey row 식별 키 (insert 전이므로 placeholder)
 */
async function ingestScannedFile(scope: string, refId: number | string, base64: string): Promise<{ data: string; path: string }> {
  if (isStorageEnabled() && shouldUseStorage(base64)) {
    try {
      const { path } = await uploadBase64(`${scope}/${refId}/scanned`, base64);
      return { data: '', path };
    } catch (e: any) {
      console.error(`[Storage] scan upload failed (${scope}/${refId}):`, e.message);
      return { data: base64, path: '' };
    }
  }
  return { data: base64, path: '' };
}

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
      c.position_title,
      c.annual_salary,
      c.base_pay,
      c.meal_allowance,
      c.other_allowance,
      c.work_hours,
      c.department                        AS contract_department,
      c.token                             AS token,
      c.is_legacy_scan,
      c.legacy_filename,
      c.contract_kind                     AS contract_kind,
      NULL::TEXT                          AS worker_type,
      cnt.contract_count
    FROM regular_employees re
    LEFT JOIN LATERAL (
      -- has_* boolean 제거: != '' 체크가 TOAST 디토스팅 유발해 list 쿼리 14초+.
      -- 문서 보기는 detail 엔드포인트에서 별도 조회.
      SELECT id, contract_start, contract_end, sms_sent, created_at, status,
             position_title, annual_salary, base_pay, meal_allowance, other_allowance,
             work_hours, department, token,
             COALESCE(is_legacy_scan, 0) as is_legacy_scan,
             COALESCE(legacy_filename, '') as legacy_filename,
             COALESCE(contract_kind, 'production') AS contract_kind
      FROM regular_labor_contracts
      WHERE employee_id = re.id
      ORDER BY (CASE status WHEN 'signed' THEN 0 ELSE 1 END), created_at DESC
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
      CASE WHEN w.category = '파견' THEN 'dispatch' ELSE 'alba' END AS employee_type,
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
      NULL::TEXT                          AS position_title,
      NULL::TEXT                          AS annual_salary,
      NULL::TEXT                          AS base_pay,
      NULL::TEXT                          AS meal_allowance,
      NULL::TEXT                          AS other_allowance,
      NULL::TEXT                          AS work_hours,
      NULL::TEXT                          AS contract_department,
      NULL::TEXT                          AS token,
      c.is_legacy_scan,
      c.legacy_filename,
      w.category                          AS worker_type,
      cnt.contract_count
    FROM workers w
    LEFT JOIN LATERAL (
      SELECT id, contract_start, contract_end, sms_sent, created_at,
             COALESCE(is_legacy_scan, 0) as is_legacy_scan,
             COALESCE(legacy_filename, '') as legacy_filename
      FROM labor_contracts
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
          // signature/scanned_file 존재 여부는 list 에서 노출 안 함 (TOAST 디토스팅 회피).
          // 필요시 detail 엔드포인트에서 조회.
          signature_data: null,
          has_signature: false,
          has_scanned_file: false,
          position_title: row.position_title || null,
          annual_salary: row.annual_salary || null,
          base_pay: row.base_pay || null,
          meal_allowance: row.meal_allowance || null,
          other_allowance: row.other_allowance || null,
          work_hours: row.work_hours || null,
          department: row.contract_department || null,
          token: row.token || null,
          is_legacy_scan: row.is_legacy_scan ?? 0,
          legacy_filename: row.legacy_filename ?? '',
          scanned_file_data: '',
          contract_kind: row.contract_kind || 'production',
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
      let workerWhere = searchConditionWorker;
      if (type === 'dispatch') workerWhere += " AND w.category = '파견'";
      else if (type === 'alba') workerWhere += " AND w.category <> '파견'";
      const workerRows = await dbAll(
        buildWorkerContractsQuery(workerWhere) +
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
      let workerWhere = searchConditionWorker;
      if (type === 'dispatch') workerWhere += " AND w.category = '파견'";
      else if (type === 'alba') workerWhere += " AND w.category <> '파견'";
      const workerRows = await dbAll(
        buildWorkerContractsQuery(workerWhere) +
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
        `SELECT id, employee_id, phone, worker_name as name, contract_start, contract_end, status, sms_sent,
                token, created_at, updated_at, work_start_date,
                position_title, annual_salary, base_pay, meal_allowance, other_allowance,
                pay_day, work_hours, work_place, department, email, nationality, visa_type, visa_expiry,
                COALESCE(is_legacy_scan, 0) as is_legacy_scan,
                COALESCE(legacy_filename, '') as legacy_filename
         FROM regular_labor_contracts WHERE employee_id = ? ORDER BY created_at DESC`,
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
        `SELECT id, phone, worker_name as name, contract_start, contract_end, sms_sent, created_at,
                COALESCE(is_legacy_scan, 0) as is_legacy_scan,
                COALESCE(legacy_filename, '') as legacy_filename
         FROM labor_contracts WHERE phone = ? ORDER BY created_at DESC`,
        normalizedPhone,
      );

      res.json({ employee: worker, contracts });
    }
  } catch (error: any) {
    console.error('GET /api/contracts/history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/contracts/upload-legacy
// 시스템 도입 전 종이 또는 외부 양식으로 작성된 기존 계약서를 첨부 보관
// ---------------------------------------------------------------------------
router.post('/upload-legacy', async (req: AuthRequest, res: Response) => {
  try {
    const {
      employee_type,
      employee_id,
      phone,
      filename,
      file_data,
      contract_start,
      contract_end,
      work_start_date,
      // notes: not stored in current schema (kept for forward compatibility)
    } = (req.body || {}) as {
      employee_type?: 'regular' | 'dispatch' | 'alba';
      employee_id?: number;
      phone?: string;
      filename?: string;
      file_data?: string;
      contract_start?: string;
      contract_end?: string;
      work_start_date?: string;
      notes?: string;
    };

    if (employee_type !== 'regular' && employee_type !== 'dispatch' && employee_type !== 'alba') {
      res.status(400).json({ error: "employee_type은 'regular', 'alba', 'dispatch' 중 하나여야 합니다." });
      return;
    }
    if (!filename || typeof filename !== 'string') {
      res.status(400).json({ error: 'filename이 필요합니다.' });
      return;
    }
    if (!file_data || typeof file_data !== 'string' || !file_data.startsWith('data:')) {
      res.status(400).json({ error: 'file_data는 Base64 data URL 형식이어야 합니다.' });
      return;
    }
    // Reject > 10MB Base64 string length
    if (file_data.length > 10 * 1024 * 1024) {
      res.status(413).json({ error: '파일이 너무 큽니다. 10MB 이하로 첨부해주세요.' });
      return;
    }

    const cStart = contract_start || '';
    const cEnd = contract_end || '';
    const wStart = work_start_date || cStart || '';

    if (employee_type === 'regular') {
      if (!employee_id || isNaN(Number(employee_id))) {
        res.status(400).json({ error: '정규직의 경우 employee_id가 필요합니다.' });
        return;
      }
      const empId = Number(employee_id);
      const employee = await dbGet(
        'SELECT id, name, phone FROM regular_employees WHERE id = ?',
        empId,
      );
      if (!employee) {
        res.status(404).json({ error: '직원을 찾을 수 없습니다.' });
        return;
      }

      const token = crypto.randomBytes(16).toString('hex');

      // INSERT 없이 row id 부터 확보 → Storage path 결정 후 INSERT.
      // sequence advance 로 id 만 받기:
      const idRow = await dbGet("SELECT nextval(pg_get_serial_sequence('regular_labor_contracts', 'id')) AS id") as any;
      const newId = Number(idRow.id);
      const blob = await ingestScannedFile('contracts', newId, file_data);

      await dbRun(
        `INSERT INTO regular_labor_contracts (
          id, employee_id, phone, worker_name, contract_start, contract_end,
          address, signature_data, token, status, sms_sent,
          work_start_date, is_legacy_scan, legacy_filename, scanned_file_data, scanned_file_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId,
        empId,
        employee.phone,
        employee.name,
        cStart,
        cEnd,
        '',
        '',
        token,
        'signed',
        0,
        wStart,
        1,
        filename,
        blob.data,
        blob.path,
      );

      res.json({ ok: true, contract_id: newId });
      return;
    }

    // dispatch / alba
    if (!phone) {
      res.status(400).json({ error: '파견·알바의 경우 phone이 필요합니다.' });
      return;
    }
    const normalized = normalizePhone(phone);
    const worker = await dbGet(
      'SELECT id, name_ko, category, phone FROM workers WHERE phone = ?',
      normalized,
    );
    if (!worker) {
      res.status(404).json({ error: '근무자를 찾을 수 없습니다.' });
      return;
    }

    // labor_contracts (알바·파견) 는 데이터량 적음 — 우선 base64 유지. 필요 시 별도 마이그레이션.
    const result = await dbRun(
      `INSERT INTO labor_contracts (
        phone, worker_name, worker_type, contract_start, contract_end,
        address, signature_data, sms_sent,
        is_legacy_scan, legacy_filename, scanned_file_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      normalized,
      worker.name_ko || '',
      worker.category || 'alba',
      cStart,
      cEnd,
      '',
      '',
      0,
      1,
      filename,
      file_data,
    );

    res.json({ ok: true, contract_id: result.lastInsertRowid });
  } catch (error: any) {
    console.error('POST /api/contracts/upload-legacy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/contracts/:id/employer-sign?kind=alba|cafe (also accepted in body)
// 알바·카페 labor_contracts row 에 대한 사용자(회사) 서명.
// ---------------------------------------------------------------------------
router.post('/:id/employer-sign', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (!id) { res.status(400).json({ error: '유효하지 않은 id 입니다.' }); return; }

    const { signature_data, signer_name, kind } = req.body as {
      signature_data?: string; signer_name?: string; kind?: string;
    };
    const resolvedKind = kind || (req.query.kind as string) || '';
    if (resolvedKind !== 'alba' && resolvedKind !== 'cafe') {
      res.status(400).json({ error: "kind 는 'alba' 또는 'cafe' 여야 합니다." });
      return;
    }
    if (!signature_data || !signer_name) {
      res.status(400).json({ error: '서명 이미지와 서명자 이름은 필수입니다.' });
      return;
    }

    const contract = await dbGet('SELECT id, status, worker_name, document_version FROM labor_contracts WHERE id = ?', id) as any;
    if (!contract) { res.status(404).json({ error: '계약서를 찾을 수 없습니다.' }); return; }
    if (contract.status !== 'signed') {
      res.status(400).json({ error: '근로자가 먼저 서명해야 사용자 서명이 가능합니다.' });
      return;
    }

    const ip = clientIp(req);
    const ua = userAgent(req);
    const email = req.user?.email || '';

    await dbRun(
      `UPDATE labor_contracts
       SET employer_signed_at = NOW(), employer_signed_ip = ?, employer_signed_ua = ?,
           employer_signed_by_email = ?, employer_signed_name = ?, employer_signature_data = ?
       WHERE id = ?`,
      ip, ua, email, signer_name, signature_data, id,
    );

    const freshContract = await dbGet('SELECT * FROM labor_contracts WHERE id = ?', id) as any;
    const contractHash = sha256(canonicalizeContract(freshContract));
    const contractSnapshot = renderSnapshotHtml(freshContract, resolvedKind as ContractKind);
    await dbRun(
      'UPDATE labor_contracts SET document_hash = ?, document_snapshot_html = ? WHERE id = ?',
      contractHash, contractSnapshot, id,
    );
    await logAudit({
      kind: resolvedKind as ContractKind, contractId: id, event: 'employer_signed', actorType: 'employer',
      actorEmail: email, actorName: signer_name, clientIp: ip, userAgent: ua,
      documentHash: contractHash, documentVersion: freshContract.document_version,
    });
    await stampInline(resolvedKind as ContractKind, id, contractHash);

    res.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/contracts/:id/employer-sign error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contracts/audit/:kind/:id
// 계약서 요약(대용량 blob 제외) + 감사로그 이벤트 목록.
// ---------------------------------------------------------------------------
router.get('/audit/:kind/:id', async (req: AuthRequest, res: Response) => {
  try {
    const kindParam = req.params.kind as string;
    if (kindParam !== 'regular' && kindParam !== 'alba' && kindParam !== 'cafe') {
      res.status(400).json({ error: "kind 는 'regular'|'alba'|'cafe' 중 하나여야 합니다." });
      return;
    }
    const kind = kindParam as ContractKind;
    const id = parseInt(req.params.id as string, 10);
    if (!id) { res.status(400).json({ error: '유효하지 않은 id 입니다.' }); return; }

    const table = contractTable(kind);
    const extraWhere = kind === 'cafe' ? " AND worker_type = 'cafe_alba'"
      : kind === 'alba' ? " AND worker_type = 'alba'"
      : '';
    const row = await dbGet(`SELECT * FROM ${table} WHERE id = ?${extraWhere}`, id) as any;
    if (!row) { res.status(404).json({ error: '계약서를 찾을 수 없습니다.' }); return; }

    // 대용량 blob 컬럼 제외 — hash/version/tsa 등 감사 관련 필드는 그대로 유지.
    const BLOB_FIELDS = new Set([
      'signature_data', 'consent_signature_data', 'employer_signature_data',
      'document_snapshot_html', 'scanned_file_data', 'bank_slip_data', 'foreign_id_card_data',
    ]);
    const contract: Record<string, any> = { has_document_snapshot: !!row.document_snapshot_html };
    for (const [k, v] of Object.entries(row)) {
      if (BLOB_FIELDS.has(k)) continue;
      contract[k] = v;
    }

    const events = await dbAll(
      `SELECT * FROM contract_audit_logs WHERE contract_kind = ? AND contract_id = ? ORDER BY created_at DESC`,
      kind, id,
    );

    res.json({ contract, events });
  } catch (error: any) {
    console.error('GET /api/contracts/audit/:kind/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/contracts/audit/:kind/:id/snapshot.html
// 서명 시점 스냅샷 HTML(document_snapshot_html) 원문 반환. 다운로드 이벤트 감사기록.
// ---------------------------------------------------------------------------
router.get('/audit/:kind/:id/snapshot.html', async (req: AuthRequest, res: Response) => {
  try {
    const kindParam = req.params.kind as string;
    if (kindParam !== 'regular' && kindParam !== 'alba' && kindParam !== 'cafe') {
      res.status(400).json({ error: "kind 는 'regular'|'alba'|'cafe' 중 하나여야 합니다." });
      return;
    }
    const kind = kindParam as ContractKind;
    const id = parseInt(req.params.id as string, 10);
    if (!id) { res.status(400).json({ error: '유효하지 않은 id 입니다.' }); return; }

    let html: string | null = null;
    let docVersion: number | null = null;

    if (kind === 'regular') {
      // 정규직 카페 계약서: buildRegularCafeContractPage 로 실시간 정식 서식 렌더 (서명 이미지 포함, view 모드).
      const row = await dbGet(
        `SELECT id, employee_id, phone, worker_name, contract_start, contract_end, status,
                COALESCE(contract_kind, 'production') as contract_kind,
                COALESCE(job_description, '') as job_description,
                COALESCE(work_start_date, contract_start) as work_start_date,
                annual_salary, base_pay, meal_allowance, other_allowance,
                COALESCE(pay_day, '10') as pay_day,
                COALESCE(other_allowance_detail, '') as other_allowance_detail,
                COALESCE(monthly_work_hours, '') as monthly_work_hours,
                COALESCE(monthly_total, '') as monthly_total,
                COALESCE(salary_end_date, '') as salary_end_date,
                COALESCE(rulebook_url, '') as rulebook_url,
                COALESCE(company_stamp_url, '') as company_stamp_url,
                COALESCE(signatures, '{}'::jsonb) as signatures,
                document_version, address, birth_date
         FROM regular_labor_contracts WHERE id = ?`, id) as any;
      if (!row) { res.status(404).json({ error: '계약서를 찾을 수 없습니다.' }); return; }
      if (row.contract_kind !== 'cafe') {
        res.status(400).json({ error: '이 계약서 종류는 아직 PDF 출력을 지원하지 않습니다.' });
        return;
      }

      const admin = {
        contract_start_date: row.contract_start || '',
        job_description: row.job_description || '',
        contract_date: row.contract_start || '',
        annual_salary: row.annual_salary || '',
        base_salary: row.base_pay || '',
        meal_allowance: row.meal_allowance || '',
        other_allowance: row.other_allowance || '',
        other_allowance_detail: row.other_allowance_detail || '',
        monthly_work_hours: row.monthly_work_hours || '',
        monthly_total: row.monthly_total || '',
        salary_start_date: row.contract_start || '',
        salary_end_date: row.salary_end_date || '',
        rulebook_url: row.rulebook_url || process.env.RULEBOOK_URL || '/rulebook',
        pay_day: row.pay_day || '10',
        work_start_date: row.work_start_date || row.contract_start || '',
      };
      const employee = {
        employee_name: row.worker_name || '',
        employee_address: row.address || '',
        employee_phone: row.phone || '',
        employee_birthday: row.birth_date || '',
      };
      const signatures = (row.signatures || {}) as Partial<Record<StampKey, string>>;
      const companyStampUrl = row.company_stamp_url || process.env.COMPANY_STAMP_URL || '';
      html = buildRegularCafeContractPage(
        admin, employee, signatures, companyStampUrl, 'view', row.status, row.worker_name,
      );
      docVersion = row.document_version ?? null;
    } else {
      // 알바/카페: 정식 서식 재렌더 미구현 → 기존 스냅샷 fallback
      const table = contractTable(kind);
      const extraWhere = kind === 'cafe' ? " AND worker_type = 'cafe_alba'" : " AND worker_type = 'alba'";
      const row = await dbGet(
        `SELECT id, document_snapshot_html, document_version FROM ${table} WHERE id = ?${extraWhere}`,
        id,
      ) as any;
      if (!row) { res.status(404).json({ error: '계약서를 찾을 수 없습니다.' }); return; }
      if (!row.document_snapshot_html) {
        res.status(404).json({ error: '서명 스냅샷이 아직 생성되지 않았습니다. (서명 완료 후 생성됩니다)' });
        return;
      }
      html = row.document_snapshot_html;
      docVersion = row.document_version ?? null;
    }

    await logAudit({
      kind, contractId: id, event: 'downloaded',
      actorType: 'employer',
      actorEmail: req.user?.email || '',
      clientIp: clientIp(req), userAgent: userAgent(req),
      documentVersion: docVersion,
      metadata: { target: 'snapshot_html' },
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(html);
  } catch (error: any) {
    console.error('GET /api/contracts/audit/:kind/:id/snapshot.html error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
