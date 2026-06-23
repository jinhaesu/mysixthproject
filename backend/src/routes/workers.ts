import { Router, Response } from 'express';
import { dbGet, dbAll, dbRun, getKSTDate, normalizePhone, pool } from '../db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// 방어적 스키마 보장 — db.ts initializeDB 의 ALTER TABLE 이 silent fail 한
// 경우에도 라우트 첫 호출 시 컬럼 보장. 부팅 이후 1회만 실행.
let workersSchemaEnsured = false;
async function ensureWorkersSchema(): Promise<void> {
  if (workersSchemaEnsured) return;
  const stmts = [
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS division TEXT DEFAULT ''",
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''",
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS birth_year INTEGER",
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT ''",
    "ALTER TABLE workers ADD COLUMN IF NOT EXISTS hourly_rate INTEGER DEFAULT 0",
  ];
  for (const s of stmts) {
    try { await pool.query(s); } catch (e: any) {
      console.error('[ensureWorkersSchema] failed:', s, e?.message);
    }
  }
  workersSchemaEnsured = true;
  console.log('[ensureWorkersSchema] all worker columns ensured');
}

// GET /api/workers/lite — 경량 (subquery 없음, 정산 페이지 등 대량 로드용)
router.get('/lite', async (_req: AuthRequest, res: Response) => {
  try {
    await ensureWorkersSchema();
    const workers = await dbAll(`
      SELECT id, phone, name_ko, name_en, bank_name, bank_account, id_number,
             category, division, department, workplace,
             COALESCE(hourly_rate, 0) as hourly_rate
      FROM workers ORDER BY name_ko ASC
    `);
    res.json({ workers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/workers - List with search/pagination (LATERAL joins for speed)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureWorkersSchema();
    const { search, category, division, page = '1', limit = '50' } = req.query as Record<string, string>;

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
    if (division) {
      where += ' AND division = ?';
      params.push(division);
    }

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 500);
    const offset = (pageNum - 1) * limitNum;

    const today = getKSTDate();
    // 단순화: last_clock_in_date 제거 (survey_responses 스캔이 너무 무거워 timeout).
    // 필요하면 /api/workers/:id/last-clockin 별도 lazy endpoint 로 분리 가능.
    const workers = await dbAll(`
      SELECT w.*,
             c.contract_id, c.contract_start, c.contract_end
      FROM workers w
      LEFT JOIN LATERAL (
        SELECT id as contract_id, contract_start, contract_end
        FROM labor_contracts
        WHERE phone = w.phone AND contract_end >= '${today}'
        ORDER BY created_at DESC LIMIT 1
      ) c ON true
      ${where}
      ORDER BY w.name_ko ASC
      LIMIT ? OFFSET ?
    `, ...params, limitNum, offset);

    // limit 이 충분히 크면 COUNT 생략 (pagination 의미 없음)
    let total = (workers as any[]).length;
    let totalPages = 1;
    if (limitNum < 200) {
      const countResult = await dbGet(`SELECT COUNT(*) as total FROM workers ${where}`, ...params);
      total = countResult.total;
      totalPages = Math.ceil(total / limitNum);
    } else if ((workers as any[]).length === limitNum) {
      // 가득 찼으면 추가 페이지 있을 수도 — 보수적으로 추정
      total = limitNum;
    }

    res.json({
      workers,
      pagination: { total, page: pageNum, limit: limitNum, totalPages },
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
    await ensureWorkersSchema();
    const { phone: rawPhone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, category, division, department, workplace, memo } = req.body;
    const phone = normalizePhone(rawPhone);
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
      INSERT INTO workers (phone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, category, division, department, workplace, memo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, phone, name_ko || '', name_en || '', bank_name || '', bank_account || '', id_number || '', emergency_contact || '', category || '', division || '', department || '', workplace || '', memo || '');

    const created = await dbGet('SELECT * FROM workers WHERE id = ?', result.lastInsertRowid);
    res.status(201).json(created);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/workers/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureWorkersSchema();
    const { id } = req.params;
    const { phone: rawPhone, name_ko, name_en, bank_name, bank_account, id_number, emergency_contact, category, division, department, workplace, memo } = req.body;
    const phone = normalizePhone(rawPhone);

    await dbRun(`
      UPDATE workers SET phone = ?, name_ko = ?, name_en = ?, bank_name = ?, bank_account = ?,
        id_number = ?, emergency_contact = ?, category = ?, division = ?, department = ?, workplace = ?, memo = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, phone, name_ko || '', name_en || '', bank_name || '', bank_account || '', id_number || '', emergency_contact || '', category || '', division || '', department || '', workplace || '', memo || '', id);

    const updated = await dbGet('SELECT * FROM workers WHERE id = ?', id);
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/workers/:id/hourly-rate — 시급만 부분 update
router.put('/:id/hourly-rate', async (req: AuthRequest, res: Response) => {
  try {
    const rate = parseInt(req.body?.hourly_rate, 10) || 0;
    await dbRun('UPDATE workers SET hourly_rate = ?, updated_at = NOW() WHERE id = ?', rate, req.params.id);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// POST /api/workers/bulk-hourly-rate?category=알바|파견 — 카테고리별 일괄 시급
router.post('/bulk-hourly-rate', async (req: AuthRequest, res: Response) => {
  try {
    const rate = parseInt(req.body?.hourly_rate, 10) || 0;
    const category = (req.body?.category || '').trim();
    if (rate <= 0) { res.status(400).json({ error: 'hourly_rate 필수' }); return; }
    if (!category) { res.status(400).json({ error: 'category 필수' }); return; }
    // category 는 '알바' 또는 '파견' — DB 의 category 칼럼은 '사업소득 파견에서 물류' 같은 형태일 수 있음.
    // 따라서 부분 일치 (LIKE) 로 매칭.
    const like = `%${category}%`;
    const r = await dbRun('UPDATE workers SET hourly_rate = ?, updated_at = NOW() WHERE category LIKE ?', rate, like);
    res.json({ success: true, updated: r.changes });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
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

// POST /api/workers/backfill-department - 빈 department 를 가장 최근 survey_requests.department 로 채움
// body 옵션: { force: boolean }  force=true 면 비어있지 않은 행도 최신 발송 부서로 덮어쓰기
router.post('/backfill-department', async (req: AuthRequest, res: Response) => {
  try {
    const force = !!(req.body || {}).force;
    const targets = await dbAll(
      force
        ? `SELECT id, phone, name_ko FROM workers`
        : `SELECT id, phone, name_ko FROM workers WHERE department IS NULL OR department = ''`,
    ) as any[];

    let updated = 0;
    const notFound: string[] = [];

    for (const w of targets) {
      const phoneNorm = (w.phone || '').replace(/-/g, '');
      const latest = await dbGet(
        `SELECT department
         FROM survey_requests
         WHERE REPLACE(phone, '-', '') = ?
           AND department IS NOT NULL AND department != ''
         ORDER BY COALESCE(scheduled_at, created_at) DESC
         LIMIT 1`,
        phoneNorm,
      ) as any;

      if (latest?.department) {
        await dbRun(
          'UPDATE workers SET department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          latest.department,
          w.id,
        );
        updated++;
      } else {
        notFound.push(w.name_ko || w.phone);
      }
    }

    res.json({
      success: true,
      mode: force ? 'force' : 'empty-only',
      candidates: targets.length,
      updated,
      not_found_count: notFound.length,
      not_found_sample: notFound.slice(0, 20),
    });
  } catch (error: any) {
    console.error('POST /api/workers/backfill-department error:', error);
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
