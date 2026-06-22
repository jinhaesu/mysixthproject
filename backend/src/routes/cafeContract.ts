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
// GPS 좌표는 0 으로 두고, admin 이 추후 workplace_manage 에서 보정 가능.
async function ensureCafeWorkplace(store: string): Promise<number> {
  const name = `널담은공간 ${store}점`;
  const existing = await dbGet(
    "SELECT id FROM survey_workplaces WHERE name = ? AND is_active = 1",
    name,
  ) as any;
  if (existing) return Number(existing.id);
  const addr = CAFE_STORE_ADDRESSES[store] || '';
  const inserted = await dbRun(
    `INSERT INTO survey_workplaces (name, address, latitude, longitude, radius_meters, is_active)
     VALUES (?, ?, 0, 0, 0, 1)`,
    name,
    addr,
  );
  return Number(inserted.lastInsertRowid);
}

const router = Router();

// 매장 주소 — 발송 시 계약서 본문에 표시. 실제 주소는 관리자 확인 후 보정.
const CAFE_STORE_ADDRESSES: Record<string, string> = {
  '해방촌': '서울특별시 용산구 신흥로 (널담은공간 해방촌점)',
  '행궁동': '경기도 수원시 팔달구 행궁동 (널담은공간 행궁동점)',
  '경복궁': '서울특별시 종로구 (널담은공간 경복궁점)',
};

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
