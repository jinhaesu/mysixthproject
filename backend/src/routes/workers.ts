import { Router, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/workers - List with search/pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { search, category, page = '1', limit = '50' } = req.query as Record<string, string>;

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (search) {
      where += ' AND (name_ko LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      where += ' AND category = ?';
      params.push(category);
    }

    const countResult = await dbGet(`SELECT COUNT(*) as total FROM workers ${where}`, ...params);
    const total = countResult.total;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 500);
    const offset = (pageNum - 1) * limitNum;

    const today = getKSTDate();
    const workers = await dbAll(`
      SELECT w.*,
        (SELECT lc.id FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_id,
        (SELECT lc.contract_start FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_start,
        (SELECT lc.contract_end FROM labor_contracts lc WHERE lc.phone = w.phone AND lc.contract_end >= '${today}' ORDER BY lc.created_at DESC LIMIT 1) as contract_end,
        (SELECT MAX(sr.date) FROM survey_requests sr JOIN survey_responses resp ON sr.id = resp.request_id WHERE sr.phone = w.phone AND resp.clock_in_time IS NOT NULL) as last_clock_in_date
      FROM workers w ${where} ORDER BY last_clock_in_date DESC NULLS LAST, w.name_ko ASC LIMIT ? OFFSET ?
    `, ...params, limitNum, offset);

    res.json({
      workers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workers/by-phone/:phone
router.get('/by-phone/:phone', async (req: AuthRequest, res: Response) => {
  try {
    const worker = await dbGet('SELECT * FROM workers WHERE phone = ?', req.params.phone);
    if (!worker) {
      res.status(404).json({ error: '근무자를 찾을 수 없습니다.' });
      return;
    }
    res.json(worker);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workers
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { phone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, category, department, workplace, memo } = req.body;
    if (!phone) {
      res.status(400).json({ error: '전화번호는 필수입니다.' });
      return;
    }

    const existing = await dbGet('SELECT id FROM workers WHERE phone = ?', phone);
    if (existing) {
      res.status(409).json({ error: '이미 등록된 전화번호입니다.' });
      return;
    }

    const result = await dbRun(`
      INSERT INTO workers (phone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, category, department, workplace, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, phone, name_ko || '', name_en || '', bank_name || '', bank_account || '', id_number || '', emergency_contact || '', category || '', department || '', workplace || '', memo || '');

    const created = await dbGet('SELECT * FROM workers WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/workers/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { phone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, category, department, workplace, memo } = req.body;

    await dbRun(`
      UPDATE workers SET phone = ?, name_ko = ?, name_en = ?, bank_name = ?, bank_account = ?,
        id_number = ?, emergency_contact = ?, category = ?, department = ?, workplace = ?, memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, phone, name_ko || '', name_en || '', bank_name || '', bank_account || '', id_number || '', emergency_contact || '', category || '', department || '', workplace || '', memo || '', id);

    const updated = await dbGet('SELECT * FROM workers WHERE id = ?', id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/workers/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Get phone before deleting to also remove labor contracts
    const worker = await dbGet('SELECT phone FROM workers WHERE id = ?', req.params.id) as any;
    await dbRun('DELETE FROM workers WHERE id = ?', req.params.id);
    if (worker?.phone) {
      await dbRun('DELETE FROM labor_contracts WHERE phone = ?', worker.phone);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workers/import - Bulk import from survey_responses
router.post('/import', async (_req: AuthRequest, res: Response) => {
  try {
    const responses = await dbAll(`
      SELECT DISTINCT sr.phone, resp.worker_name_ko, resp.worker_name_en,
             resp.bank_name, resp.bank_account, resp.id_number, resp.emergency_contact
      FROM survey_requests sr
      JOIN survey_responses resp ON sr.id = resp.request_id
      WHERE resp.worker_name_ko IS NOT NULL AND resp.worker_name_ko != ''
    `);

    let imported = 0;
    for (const r of responses) {
      const existing = await dbGet('SELECT id FROM workers WHERE phone = ?', r.phone);
      if (!existing) {
        await dbRun(`
          INSERT INTO workers (phone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, r.phone, r.worker_name_ko, r.worker_name_en || '', r.bank_name || '', r.bank_account || '', r.id_number || '', r.emergency_contact || '');
        imported++;
      }
    }

    res.json({ success: true, total_found: responses.length, imported });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/workers/backfill-category - Fill empty category from survey_responses
router.post('/backfill-category', async (req: AuthRequest, res: Response) => {
  try {
    const { default_category } = req.body || {};
    const emptyWorkers = await dbAll("SELECT id, phone, name_ko FROM workers WHERE category IS NULL OR category = ''") as any[];
    let updated = 0;
    let defaulted = 0;
    const notFound: string[] = [];

    for (const w of emptyWorkers) {
      // Try survey_responses.worker_type first (normalize phone: strip dashes)
      const phoneNorm = (w.phone || '').replace(/-/g, '');
      const resp = await dbGet(`
        SELECT resp.worker_type
        FROM survey_responses resp
        JOIN survey_requests sr ON resp.request_id = sr.id
        WHERE REPLACE(sr.phone, '-', '') = ? AND resp.worker_type IS NOT NULL AND resp.worker_type != ''
        ORDER BY resp.created_at DESC LIMIT 1
      `, phoneNorm) as any;

      let category = '';
      if (resp?.worker_type) {
        category = resp.worker_type === 'dispatch' ? '파견' : resp.worker_type === 'alba' ? '알바' : resp.worker_type.includes('파견') ? '파견' : resp.worker_type.includes('알바') ? '알바' : resp.worker_type;
      }

      // worker_type 데이터가 없으면 빈칸 유지 (추정값 넣지 않음)

      if (category) {
        await dbRun('UPDATE workers SET category = ? WHERE id = ?', category, w.id);
        updated++;
      } else {
        notFound.push(w.name_ko || w.phone);
      }
    }

    res.json({ success: true, total_empty: emptyWorkers.length, updated, defaulted, not_found: notFound.slice(0, 20) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
