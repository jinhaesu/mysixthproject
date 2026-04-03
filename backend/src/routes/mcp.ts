import { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { dbAll, dbGet, dbRun } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'attendance-management-secret-key';
const MCP_API_KEY = process.env.MCP_API_KEY || 'joinandjoin-mcp-2026';

function verifyToken(token: string): boolean {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded.type === 'auth';
  } catch { return false; }
}

function createMcpServer() {
  const server = new McpServer({ name: 'attendance-system', version: '1.0.0' });

  // Helper - direct DB access (same process, no HTTP overhead)
  const q = dbAll;
  const q1 = dbGet;

  server.tool('search_regular_employees', '정규직 직원 검색', { query: z.string() }, async ({ query }) => {
    const emps = await q(`SELECT * FROM regular_employees WHERE (name LIKE ? OR phone LIKE ?) AND is_active = 1 ORDER BY name LIMIT 20`, `%${query}%`, `%${query}%`) as any[];
    if (!emps.length) return { content: [{ type: 'text' as const, text: `'${query}' 결과 없음` }] };
    return { content: [{ type: 'text' as const, text: `정규직 ${emps.length}명:\n${emps.map((e: any) => `${e.name} | ${e.phone} | ${e.department} ${e.team} | 입사:${e.hire_date || '-'}`).join('\n')}` }] };
  });

  server.tool('search_dispatch_workers', '파견/알바 근무자 검색', { query: z.string() }, async ({ query }) => {
    const w = await q(`SELECT * FROM workers WHERE (name_ko LIKE ? OR phone LIKE ?) ORDER BY name_ko LIMIT 20`, `%${query}%`, `%${query}%`) as any[];
    if (!w.length) return { content: [{ type: 'text' as const, text: `'${query}' 결과 없음` }] };
    return { content: [{ type: 'text' as const, text: `파견/알바 ${w.length}명:\n${w.map((v: any) => `${v.name_ko} | ${v.phone} | ${v.category || '-'} | ${v.department || '-'}`).join('\n')}` }] };
  });

  server.tool('get_confirmed_list', '월별 확정 리스트', { year_month: z.string(), type: z.string().optional().describe('regular 또는 dispatch') }, async ({ year_month, type }) => {
    let where = 'WHERE year_month = ?';
    const params: any[] = [year_month];
    if (type === 'regular') { where += " AND employee_type = '정규직'"; }
    else if (type === 'dispatch') { where += " AND employee_type != '정규직'"; }

    const records = await q(`SELECT * FROM confirmed_attendance ${where} ORDER BY employee_name, date`, ...params) as any[];
    const empMap = new Map<string, any>();
    for (const r of records) {
      if (!empMap.has(r.employee_name)) empMap.set(r.employee_name, { name: r.employee_name, type: r.employee_type, dept: r.department, days: 0, reg: 0, ot: 0, night: 0, records: [] });
      const e = empMap.get(r.employee_name)!;
      e.days++; e.reg += parseFloat(r.regular_hours) || 0; e.ot += parseFloat(r.overtime_hours) || 0; e.night += parseFloat(r.night_hours) || 0;
      e.records.push(r);
    }
    const emps = Array.from(empMap.values());
    if (!emps.length) return { content: [{ type: 'text' as const, text: `${year_month} 데이터 없음` }] };
    const t = emps.reduce((a, e) => ({ r: a.r + e.reg, o: a.o + e.ot, n: a.n + e.night }), { r: 0, o: 0, n: 0 });
    return { content: [{ type: 'text' as const, text: `${year_month} 확정 (${emps.length}명) 기본${t.r.toFixed(1)}h 연장${t.o.toFixed(1)}h 야간${t.n.toFixed(1)}h\n\n${emps.map(e => `${e.name}(${e.dept || '-'}) [${e.type}] ${e.days}일 기본${e.reg.toFixed(1)}h 연장${e.ot.toFixed(1)}h 야간${e.night.toFixed(1)}h`).join('\n')}` }] };
  });

  server.tool('get_employee_detail', '직원 일별 출퇴근 상세', { name: z.string(), year_month: z.string() }, async ({ name, year_month }) => {
    const recs = await q('SELECT * FROM confirmed_attendance WHERE employee_name = ? AND year_month = ? ORDER BY date', name, year_month) as any[];
    if (!recs.length) return { content: [{ type: 'text' as const, text: `${year_month} ${name} 이력 없음` }] };
    return { content: [{ type: 'text' as const, text: `${name} ${year_month} (${recs.length}일):\n${recs.map((r: any) => `${r.date} | ${r.confirmed_clock_in}~${r.confirmed_clock_out} | 기본${parseFloat(r.regular_hours).toFixed(1)}h 연장${parseFloat(r.overtime_hours).toFixed(1)}h 야간${parseFloat(r.night_hours).toFixed(1)}h`).join('\n')}` }] };
  });

  server.tool('get_vacation_status', '휴가 현황', { year: z.string().optional() }, async ({ year }) => {
    const y = year || String(new Date().getFullYear());
    const data = await q(`SELECT vb.*, re.name as employee_name, re.department FROM regular_vacation_balances vb JOIN regular_employees re ON vb.employee_id = re.id WHERE vb.year = ? ORDER BY re.name`, y) as any[];
    if (!data.length) return { content: [{ type: 'text' as const, text: '데이터 없음' }] };
    return { content: [{ type: 'text' as const, text: `${y}년 휴가 (${data.length}명):\n${data.map((b: any) => `${b.employee_name}(${b.department || '-'}) 보유${parseFloat(b.total_days).toFixed(1)} 사용${parseFloat(b.used_days).toFixed(1)} 잔여${(parseFloat(b.total_days) - parseFloat(b.used_days)).toFixed(1)}일`).join('\n')}` }] };
  });

  server.tool('get_vacation_requests', '휴가 신청 목록', { status: z.string().optional() }, async ({ status }) => {
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { where += ' AND vr.status = ?'; params.push(status); }
    const data = await q(`SELECT vr.*, re.name as employee_name, re.department FROM regular_vacation_requests vr JOIN regular_employees re ON vr.employee_id = re.id ${where} ORDER BY vr.created_at DESC LIMIT 50`, ...params) as any[];
    if (!data.length) return { content: [{ type: 'text' as const, text: '신청 없음' }] };
    return { content: [{ type: 'text' as const, text: `휴가 (${data.length}건):\n${data.map((r: any) => `#${r.id} ${r.employee_name} | ${r.type || '연차'} | ${r.start_date}~${r.end_date}(${r.days}일) | ${r.status === 'approved' ? '승인' : r.status === 'rejected' ? '반려' : '대기'}`).join('\n')}` }] };
  });

  server.tool('get_today_attendance', '오늘 출결 현황', { date: z.string().optional() }, async ({ date }) => {
    const d = date || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const reg = await q1(`SELECT COUNT(*) as total, SUM(CASE WHEN ra.clock_in_time IS NOT NULL AND ra.clock_out_time IS NULL THEN 1 ELSE 0 END) as ci, SUM(CASE WHEN ra.clock_out_time IS NOT NULL THEN 1 ELSE 0 END) as co, SUM(CASE WHEN ra.clock_in_time IS NULL THEN 1 ELSE 0 END) as nc FROM regular_employees re LEFT JOIN regular_attendance ra ON re.id = ra.employee_id AND ra.date = ? WHERE re.is_active = 1`, d) as any;
    const srv = await q1(`SELECT COUNT(*) as total, SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent, SUM(CASE WHEN status='clock_in' THEN 1 ELSE 0 END) as ci, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as co FROM survey_requests WHERE date = ?`, d) as any;
    return { content: [{ type: 'text' as const, text: `${d} 출결:\n정규직: 전체${reg?.total || 0}명 출근${reg?.ci || 0}명 퇴근${reg?.co || 0}명 미출근${reg?.nc || 0}명\n파견/알바: 발송${srv?.total || 0}명 대기${srv?.sent || 0}명 출근${srv?.ci || 0}명 퇴근${srv?.co || 0}명` }] };
  });

  server.tool('get_shift_schedules', '배치 목록', { month: z.number().optional() }, async ({ month }) => {
    const m = month || (new Date().getMonth() + 1);
    const shifts = await q('SELECT * FROM regular_shifts WHERE is_active = 1 AND month = ? ORDER BY week_number', m) as any[];
    if (!shifts.length) return { content: [{ type: 'text' as const, text: `${m}월 배치 없음` }] };
    const lines: string[] = [];
    for (const s of shifts) {
      const assigned = await q('SELECT rsa.*, re.name, re.department FROM regular_shift_assignments rsa JOIN regular_employees re ON rsa.employee_id = re.id WHERE rsa.shift_id = ?', s.id) as any[];
      const days = s.days_of_week ? s.days_of_week.split(',').map(Number).map((d: number) => ['일', '월', '화', '수', '목', '금', '토'][d]).join('/') : '';
      lines.push(`#${s.id} ${s.name} | ${m}월${s.week_number}주차 ${days} | ${s.planned_clock_in}~${s.planned_clock_out} | ${assigned.length}명`);
    }
    return { content: [{ type: 'text' as const, text: `${m}월 배치 (${shifts.length}건):\n${lines.join('\n')}` }] };
  });

  server.tool('approve_vacation', '휴가 승인', { request_id: z.number(), memo: z.string().optional() }, async ({ request_id, memo }) => {
    await dbRun('UPDATE regular_vacation_requests SET status = ?, admin_memo = ?, updated_at = NOW() WHERE id = ?', 'approved', memo || '', request_id);
    return { content: [{ type: 'text' as const, text: `휴가 #${request_id} 승인 완료` }] };
  });

  server.tool('reject_vacation', '휴가 반려', { request_id: z.number(), reason: z.string() }, async ({ request_id, reason }) => {
    await dbRun('UPDATE regular_vacation_requests SET status = ?, admin_memo = ?, updated_at = NOW() WHERE id = ?', 'rejected', reason, request_id);
    return { content: [{ type: 'text' as const, text: `휴가 #${request_id} 반려` }] };
  });

  server.tool('create_shift', '배치 생성', { name: z.string(), month: z.number(), week_number: z.number(), days_of_week: z.string(), planned_clock_in: z.string(), planned_clock_out: z.string() },
    async ({ name, month, week_number, days_of_week, planned_clock_in, planned_clock_out }) => {
      const r = await dbRun('INSERT INTO regular_shifts (name, month, week_number, day_of_week, days_of_week, planned_clock_in, planned_clock_out) VALUES (?,?,?,?,?,?,?)',
        name, month, week_number, parseInt(days_of_week.split(',')[0]), days_of_week, planned_clock_in, planned_clock_out);
      return { content: [{ type: 'text' as const, text: `배치 생성: ${name} (ID:${r.lastInsertRowid})` }] };
    }
  );

  server.tool('assign_employees', '배치에 직원 배정', { shift_id: z.number(), employee_names: z.string() }, async ({ shift_id, employee_names }) => {
    const names = employee_names.split(',').map(n => n.trim());
    const emps = await q('SELECT id, name FROM regular_employees WHERE is_active = 1') as any[];
    let assigned = 0;
    const nf: string[] = [];
    for (const name of names) {
      const emp = emps.find((e: any) => e.name === name);
      if (emp) {
        try { await dbRun('INSERT INTO regular_shift_assignments (shift_id, employee_id) VALUES (?,?)', shift_id, emp.id); assigned++; } catch { /* duplicate */ }
      } else nf.push(name);
    }
    return { content: [{ type: 'text' as const, text: `배치#${shift_id}에 ${assigned}명 배정${nf.length ? ` (못찾음:${nf.join(',')})` : ''}` }] };
  });

  return server;
}

const transports: Record<string, SSEServerTransport> = {};

export function setupMcpRoutes(app: Express) {
  app.get('/mcp/sse', async (req: Request, res: Response) => {
    const key = (req.query.key as string) || req.headers['x-api-key'] as string;
    const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');

    if (key !== MCP_API_KEY && (!token || !verifyToken(token))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const transport = new SSEServerTransport('/mcp/messages', res);
    transports[transport.sessionId] = transport;
    const server = createMcpServer();
    res.on('close', () => { delete transports[transport.sessionId]; });
    await server.connect(transport);
  });

  app.post('/mcp/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (!transport) { res.status(404).json({ error: 'Session not found' }); return; }
    await transport.handlePostMessage(req, res);
  });

  console.log('[MCP] Remote MCP server endpoints registered at /mcp/sse and /mcp/messages');
}
