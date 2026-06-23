import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbRun, dbAll, getKSTDate, normalizePhone, getFrontendUrl, pool } from '../db';
import { AuthRequest } from '../middleware/auth';
import { sendGeneralSms, sendSurveyMessage } from '../services/smsService';

const TOKEN_EXPIRY_HOURS = 24;

// 방어적 스키마 보장 — db.ts initializeDB 가 silent fail 한 경우에도
// 첫 호출 시 컬럼을 보장. 부팅 이후 1회만 실행.
let schemaEnsured = false;
async function ensureCafeSchema(): Promise<void> {
  if (schemaEnsured) return;
  const stmts = [
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS token TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS store_name TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS work_time_start TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS work_time_end TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS work_days TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS hourly_rate INTEGER DEFAULT 0",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS consent_signature_data TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS birth_date TEXT DEFAULT ''",
    "ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS id_number TEXT DEFAULT ''",
  ];
  for (const s of stmts) {
    try { await pool.query(s); } catch (e: any) {
      console.error('[ensureCafeSchema] failed:', s, e.message);
    }
  }
  schemaEnsured = true;
  console.log('[ensureCafeSchema] all cafe columns ensured');
}

// 매장명 → survey_workplaces 행 자동 ensure (없으면 생성).
// 기존 행에 좌표가 0/0 으로 박혀 있으면 정확 좌표로 UPDATE.
async function ensureCafeWorkplace(store: string): Promise<number> {
  const name = `널담은공간 ${store}점`;
  const geo = CAFE_STORE_GEO[store];
  const addr = CAFE_STORE_ADDRESSES[store] || '';
  const existing = await dbGet(
    "SELECT id, latitude, longitude, radius_meters FROM survey_workplaces WHERE name = ? AND is_active = 1",
    name,
  ) as any;
  if (existing) {
    if (geo && (Number(existing.latitude) === 0 || Number(existing.longitude) === 0 || Number(existing.radius_meters) === 0)) {
      await dbRun(
        "UPDATE survey_workplaces SET latitude = ?, longitude = ?, radius_meters = ?, address = ? WHERE id = ?",
        geo.lat,
        geo.lng,
        CAFE_DEFAULT_RADIUS_M,
        addr,
        existing.id,
      );
    }
    return Number(existing.id);
  }
  const inserted = await dbRun(
    `INSERT INTO survey_workplaces (name, address, latitude, longitude, radius_meters, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    name,
    addr,
    geo?.lat ?? 0,
    geo?.lng ?? 0,
    geo ? CAFE_DEFAULT_RADIUS_M : 0,
  );
  return Number(inserted.lastInsertRowid);
}

const router = Router();

// 매장 주소 — 발송 시 계약서 본문에 표시.
// 출처: nuldamspace.com/en/pages/store-information (공식 매장 안내).
const CAFE_STORE_ADDRESSES: Record<string, string> = {
  '해방촌': '서울특별시 용산구 신흥로15길 18-12',
  '행궁동': '경기도 수원시 팔달구 정조로886번길 14 1층 (널담은공간 화홍문점)',
  '경복궁': '서울특별시 종로구 삼청로 24',
};

// 매장 좌표 — Nominatim 으로 도로명 주소 기준 정확값.
const CAFE_STORE_GEO: Record<string, { lat: number; lng: number }> = {
  '해방촌': { lat: 37.5442883, lng: 126.9860645 },
  '행궁동': { lat: 37.2871381, lng: 127.0161432 },
  '경복궁': { lat: 37.5779938, lng: 126.9798259 },
};

// 카페 매장 기본 GPS 반경 — 100m (매장 + 인접 보도).
const CAFE_DEFAULT_RADIUS_M = 100;

const STORE_OPTIONS = ['해방촌', '행궁동', '경복궁'] as const;

// ============================================================================
// Admin: 카페 근로계약 SMS 발송
// POST /api/cafe-contract/send
// body: { phone, worker_name, store_name, work_time_start, work_time_end,
//         work_days, hourly_rate, contract_start, contract_end }
// ============================================================================
router.post('/send', async (req: AuthRequest, res: Response) => {
  try {
    await ensureCafeSchema();
    const {
      phone,
      worker_name,
      store_name,
      work_time_start,
      work_time_end,
      work_days,
      hourly_rate,
      contract_start,
      contract_end,
    } = req.body as {
      phone?: string;
      worker_name?: string;
      store_name?: string;
      work_time_start?: string;
      work_time_end?: string;
      work_days?: string;
      hourly_rate?: number | string;
      contract_start?: string;
      contract_end?: string;
    };

    if (!phone || !worker_name || !store_name) {
      res.status(400).json({ error: '전화번호·이름·매장은 필수입니다.' });
      return;
    }
    if (!STORE_OPTIONS.includes(store_name as any)) {
      res.status(400).json({ error: `매장은 ${STORE_OPTIONS.join('/')} 중 하나여야 합니다.` });
      return;
    }
    if (!work_time_start || !work_time_end) {
      res.status(400).json({ error: '근무 시작/종료 시간은 필수입니다.' });
      return;
    }
    if (!work_days) {
      res.status(400).json({ error: '근무일은 필수입니다.' });
      return;
    }
    const rate = Number(hourly_rate);
    if (!rate || isNaN(rate) || rate < 1000) {
      res.status(400).json({ error: '시급은 1,000원 이상의 숫자여야 합니다.' });
      return;
    }

    const normalized = normalizePhone(phone);
    const today = getKSTDate();
    const cStart = contract_start || today;
    // 계약 종료일 기본값: 1년 후
    const defaultEnd = (() => {
      const y = parseInt(today.slice(0, 4)) + 1;
      return y + today.slice(4);
    })();
    const cEnd = contract_end || defaultEnd;

    const token = crypto.randomBytes(16).toString('hex');

    const result = await dbRun(
      `INSERT INTO labor_contracts (
        phone, worker_name, worker_type, contract_start, contract_end,
        address, signature_data, sms_sent, token, status,
        store_name, work_time_start, work_time_end, work_days, hourly_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      normalized,
      worker_name,
      'cafe_alba',
      cStart,
      cEnd,
      '',
      '',
      0,
      token,
      'pending',
      store_name,
      work_time_start,
      work_time_end,
      work_days,
      rate,
    );

    const url = getFrontendUrl(`/cafe-contract?token=${token}`);
    const message =
      `[조인앤조인 카페팀]\n${worker_name}님, 널담은공간 ${store_name}점 근로계약서입니다.\n` +
      `근무: ${work_days} ${work_time_start}~${work_time_end} / 시급 ${rate.toLocaleString()}원\n` +
      `계약기간: ${cStart} ~ ${cEnd}\n\n` +
      `아래 링크에서 계약서·동의서를 확인하고 서명해주세요.\n${url}`;

    const smsResult = await sendGeneralSms(normalized, message);

    if (smsResult.success) {
      await dbRun('UPDATE labor_contracts SET sms_sent = 1 WHERE id = ?', result.lastInsertRowid);
    }

    res.json({
      success: smsResult.success,
      error: smsResult.error,
      contract_id: result.lastInsertRowid,
      url,
    });
  } catch (error: any) {
    console.error('POST /api/cafe-contract/send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 카페 출퇴근 링크 SMS 발송
// POST /api/cafe-contract/send-attendance-link
// body: { phone, worker_name, store_name, date, planned_clock_in, planned_clock_out }
// 기존 survey_requests 테이블 사용 — 매장은 survey_workplaces 에 자동 ensure.
// ============================================================================
router.post('/send-attendance-link', async (req: AuthRequest, res: Response) => {
  try {
    const {
      phone,
      worker_name,
      store_name,
      date,
      planned_clock_in,
      planned_clock_out,
    } = req.body as {
      phone?: string;
      worker_name?: string;
      store_name?: string;
      date?: string;
      planned_clock_in?: string;
      planned_clock_out?: string;
    };

    if (!phone || !store_name || !date) {
      res.status(400).json({ error: '전화번호·매장·날짜는 필수입니다.' });
      return;
    }
    if (!STORE_OPTIONS.includes(store_name as any)) {
      res.status(400).json({ error: `매장은 ${STORE_OPTIONS.join('/')} 중 하나여야 합니다.` });
      return;
    }

    const normalized = normalizePhone(phone);
    const workplaceId = await ensureCafeWorkplace(store_name);
    const workplaceName = `널담은공간 ${store_name}점`;
    const department = `카페(${store_name})`;

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    const result = await dbRun(
      `INSERT INTO survey_requests
        (token, phone, workplace_id, date, message_type, expires_at, department,
         planned_clock_in, planned_clock_out, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      token,
      normalized,
      workplaceId,
      date,
      'sms',
      expiresAt,
      department,
      planned_clock_in || null,
      planned_clock_out || null,
      'sent',
    );

    await dbRun('INSERT INTO survey_responses (request_id) VALUES (?)', result.lastInsertRowid);

    // 카페팀용 SMS 메시지 — 정규직과 다른 prefix
    const sendResult = await sendSurveyMessage(
      normalized,
      token,
      date,
      workplaceName,
      'sms',
      department,
    );

    if (sendResult.messageId) {
      await dbRun(
        'UPDATE survey_requests SET message_id = ? WHERE id = ?',
        sendResult.messageId,
        result.lastInsertRowid,
      );
    }

    res.json({
      success: sendResult.success,
      error: sendResult.error,
      request_id: result.lastInsertRowid,
      worker_name: worker_name || '',
    });
  } catch (error: any) {
    console.error('POST /api/cafe-contract/send-attendance-link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 카페 직원 목록 (근로계약 체결자 — 출퇴근 발송용)
// GET /api/cafe-contract/workers
// ============================================================================
router.get('/workers', async (_req: AuthRequest, res: Response) => {
  try {
    await ensureCafeSchema();
    const rows = await dbAll(
      `SELECT DISTINCT ON (phone)
              phone, worker_name, store_name, work_time_start, work_time_end,
              hourly_rate, contract_end, status
       FROM labor_contracts
       WHERE worker_type = 'cafe_alba'
       ORDER BY phone, created_at DESC`,
    );
    res.json(rows);
  } catch (error: any) {
    console.error('GET /api/cafe-contract/workers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 카페 출퇴근 발송 이력
// GET /api/cafe-contract/list-attendance
// ============================================================================
router.get('/list-attendance', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT sr.id, sr.phone, sr.date, sr.department, sr.status,
              sr.planned_clock_in, sr.planned_clock_out, sr.created_at,
              sw.name as workplace_name,
              resp.clock_in_time, resp.clock_out_time, resp.worker_name_ko
       FROM survey_requests sr
       LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
       LEFT JOIN survey_responses resp ON resp.request_id = sr.id
       WHERE sw.name LIKE '널담은공간%점'
       ORDER BY sr.created_at DESC
       LIMIT 200`,
    );
    res.json(rows);
  } catch (error: any) {
    console.error('GET /api/cafe-contract/list-attendance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 매장 GPS 반경 임시 변경 (테스트 시 일시적으로 넓히기 위함)
// POST /api/cafe-contract/set-radius
// body: { store: '해방촌'|'행궁동'|'경복궁', radius: number(미터) }
// ============================================================================
router.post('/set-radius', async (req: AuthRequest, res: Response) => {
  try {
    const { store, radius } = req.body as { store?: string; radius?: number | string };
    if (!store || !STORE_OPTIONS.includes(store as any)) {
      res.status(400).json({ error: `매장은 ${STORE_OPTIONS.join('/')} 중 하나여야 합니다.` });
      return;
    }
    const r = Number(radius);
    if (!Number.isFinite(r) || r < 1 || r > 100000) {
      res.status(400).json({ error: '반경은 1~100000 미터 사이여야 합니다.' });
      return;
    }
    const name = `널담은공간 ${store}점`;
    // ensure 가 신규 생성·좌표 보정만 책임지고, UPDATE 는 이름 기준 전체 활성 행에 적용
    await ensureCafeWorkplace(store);
    const beforeRows = await dbAll(
      `SELECT id, name, latitude, longitude, radius_meters, is_active
       FROM survey_workplaces
       WHERE name = ?`,
      name,
    );
    const update = await dbRun(
      `UPDATE survey_workplaces SET radius_meters = ? WHERE name = ? AND is_active = 1`,
      r,
      name,
    );
    const afterRows = await dbAll(
      `SELECT id, name, latitude, longitude, radius_meters, is_active
       FROM survey_workplaces
       WHERE name = ?`,
      name,
    );
    console.log(`[cafe-contract.set-radius] store=${store} radius=${r}m rows=${(update as any)?.rowCount ?? (update as any)?.changes ?? '?'}`);
    res.json({
      success: true,
      store,
      radius_meters: r,
      affected_rows: (update as any)?.rowCount ?? (update as any)?.changes ?? null,
      before: beforeRows,
      after: afterRows,
    });
  } catch (error: any) {
    console.error('POST /api/cafe-contract/set-radius error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 카페 매장 현재 상태 조회 (진단용)
// GET /api/cafe-contract/workplace-status
// ============================================================================
router.get('/workplace-status', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await dbAll(
      `SELECT id, name, address, latitude, longitude, radius_meters, is_active
       FROM survey_workplaces
       WHERE name LIKE '널담은공간%점'
       ORDER BY name, id`,
    );
    res.json({ count: (rows as any[]).length, rows });
  } catch (error: any) {
    console.error('GET /api/cafe-contract/workplace-status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 카페 매장 좌표/반경 보정 (이미 lat=0/lng=0 인 워크플레이스에 정확 좌표 주입)
// POST /api/cafe-contract/sync-workplaces
// ============================================================================
router.post('/sync-workplaces', async (_req: AuthRequest, res: Response) => {
  try {
    const updated: Array<{ store: string; workplace_id: number; lat: number; lng: number }> = [];
    for (const store of STORE_OPTIONS) {
      const id = await ensureCafeWorkplace(store);
      const geo = CAFE_STORE_GEO[store];
      if (geo) updated.push({ store, workplace_id: id, lat: geo.lat, lng: geo.lng });
    }
    res.json({ success: true, updated });
  } catch (error: any) {
    console.error('POST /api/cafe-contract/sync-workplaces error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Admin: 카페 근로계약 발송 이력 목록
// GET /api/cafe-contract/list
// ============================================================================
router.get('/list', async (_req: AuthRequest, res: Response) => {
  try {
    await ensureCafeSchema();
    const rows = await dbAll(
      `SELECT id, phone, worker_name, store_name, work_time_start, work_time_end,
              work_days, hourly_rate, contract_start, contract_end,
              status, sms_sent, created_at
       FROM labor_contracts
       WHERE worker_type = 'cafe_alba'
       ORDER BY created_at DESC
       LIMIT 200`,
    );
    res.json(rows);
  } catch (error: any) {
    console.error('GET /api/cafe-contract/list error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

// ============================================================================
// Public: 직원이 token으로 계약서 조회 / 서명 제출
// 라우터 두 개 분리 — public 은 인증 없이 접근
// ============================================================================
export const publicRouter = Router();

publicRouter.get('/:token', async (req: Request, res: Response) => {
  try {
    await ensureCafeSchema();
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: '유효하지 않은 링크입니다.' });
      return;
    }
    const contract = await dbGet(
      `SELECT id, phone, worker_name, store_name, work_time_start, work_time_end,
              work_days, hourly_rate, contract_start, contract_end,
              status, address, birth_date, id_number,
              signature_data, consent_signature_data
       FROM labor_contracts
       WHERE token = ? AND worker_type = 'cafe_alba'`,
      token,
    ) as any;
    if (!contract) {
      res.status(404).json({ error: '계약서를 찾을 수 없습니다.' });
      return;
    }
    const storeAddress = CAFE_STORE_ADDRESSES[contract.store_name] || '';
    res.json({ ...contract, store_address: storeAddress });
  } catch (error: any) {
    console.error('GET /api/cafe-contract-public/:token error:', error);
    res.status(500).json({ error: error.message });
  }
});

publicRouter.post('/:token/sign', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const {
      address,
      birth_date,
      id_number,
      signature_data,
      consent_signature_data,
    } = req.body as {
      address?: string;
      birth_date?: string;
      id_number?: string;
      signature_data?: string;
      consent_signature_data?: string;
    };

    if (!address || !birth_date || !id_number) {
      res.status(400).json({ error: '주소·생년월일·주민등록번호는 필수입니다.' });
      return;
    }
    if (!signature_data || !consent_signature_data) {
      res.status(400).json({ error: '근로계약서·동의서 서명이 필요합니다.' });
      return;
    }

    const contract = await dbGet(
      `SELECT id, phone, worker_name, store_name, status
       FROM labor_contracts
       WHERE token = ? AND worker_type = 'cafe_alba'`,
      token,
    ) as any;
    if (!contract) {
      res.status(404).json({ error: '계약서를 찾을 수 없습니다.' });
      return;
    }
    if (contract.status === 'signed') {
      res.status(409).json({ error: '이미 서명된 계약서입니다.' });
      return;
    }

    await dbRun(
      `UPDATE labor_contracts
       SET address = ?, birth_date = ?, id_number = ?,
           signature_data = ?, consent_signature_data = ?,
           status = 'signed'
       WHERE token = ?`,
      address.trim(),
      birth_date.trim(),
      id_number.trim(),
      signature_data,
      consent_signature_data,
      token,
    );

    const viewUrl = getFrontendUrl(`/cafe-contract?token=${token}`);
    const msg =
      `[조인앤조인 카페팀]\n${contract.worker_name}님, 널담은공간 ${contract.store_name}점 근로계약서가 체결되었습니다.\n` +
      `계약서 확인: ${viewUrl}`;
    try { await sendGeneralSms(contract.phone, msg); } catch {}

    res.json({ success: true });
  } catch (error: any) {
    console.error('POST /api/cafe-contract-public/:token/sign error:', error);
    res.status(500).json({ error: error.message });
  }
});
