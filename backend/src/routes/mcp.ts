import { Express, Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { dbAll, dbGet, dbRun } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'attendance-management-secret-key';
const MCP_API_KEY = process.env.MCP_API_KEY || 'joinandjoin-mcp-2026';

function verifyToken(token: string): boolean {
  try { return (jwt.verify(token, JWT_SECRET) as any).type === 'auth'; } catch { return false; }
}

function createMcpServer() {
  const server = new McpServer({ name: 'attendance-system', version: '1.0.0' });
  const q = dbAll, q1 = dbGet;

  // ===== 검색 (간결 응답) =====
  server.tool('search_employees', '직원 검색 (정규직+파견 통합)', { query: z.string(), limit: z.number().optional() }, async ({ query, limit }) => {
    const lim = limit || 10;
    const reg = await q(`SELECT id,name,phone,department,team,hire_date FROM regular_employees WHERE (name LIKE ? OR phone LIKE ?) AND is_active=1 LIMIT ?`, `%${query}%`, `%${query}%`, lim) as any[];
    const disp = await q(`SELECT id,name_ko,phone,category,department FROM workers WHERE (name_ko LIKE ? OR phone LIKE ?) LIMIT ?`, `%${query}%`, `%${query}%`, lim) as any[];
    const lines: string[] = [];
    if (reg.length) lines.push(`[정규직 ${reg.length}명]`, ...reg.map((e: any) => `#${e.id} ${e.name}|${e.phone}|${e.department||''}${e.team||''}`));
    if (disp.length) lines.push(`[파견/알바 ${disp.length}명]`, ...disp.map((w: any) => `#${w.id} ${w.name_ko}|${w.phone}|${w.category||''}|${w.department||''}`));
    return { content: [{ type: 'text' as const, text: lines.length ? lines.join('\n') : `'${query}' 없음` }] };
  });

  // ===== 확정 리스트 요약 (개인별 상세 제외 - 토큰 절약) =====
  server.tool('get_confirmed_summary', '월별 확정 리스트 요약 (부서별 집계)', { year_month: z.string(), type: z.string().optional().describe('regular/dispatch/all') }, async ({ year_month, type }) => {
    let where = 'WHERE year_month=?'; const p: any[] = [year_month];
    if (type === 'regular') where += " AND employee_type='정규직'";
    else if (type === 'dispatch') where += " AND employee_type!='정규직'";
    const recs = await q(`SELECT employee_name,employee_type,department,SUM(regular_hours) as r,SUM(overtime_hours) as o,SUM(night_hours) as n,COUNT(*) as days FROM confirmed_attendance ${where} GROUP BY employee_name,employee_type,department ORDER BY department,employee_name`, ...p) as any[];
    if (!recs.length) return { content: [{ type: 'text' as const, text: `${year_month} 없음` }] };
    // 부서별 집계
    const dm: Record<string, { c: number; r: number; o: number; n: number; d: number }> = {};
    let tw = 0, tr = 0, to = 0, tn = 0, td = 0;
    for (const e of recs) { const d = e.department || '?'; if (!dm[d]) dm[d] = { c: 0, r: 0, o: 0, n: 0, d: 0 }; dm[d].c++; dm[d].r += +e.r; dm[d].o += +e.o; dm[d].n += +e.n; dm[d].d += +e.days; tw++; tr += +e.r; to += +e.o; tn += +e.n; td += +e.days; }
    const dept = Object.entries(dm).map(([d, v]) => `${d}: ${v.c}명 ${v.d}일 기본${v.r.toFixed(0)}h 연장${v.o.toFixed(0)}h 야간${v.n.toFixed(0)}h`);
    return { content: [{ type: 'text' as const, text: `${year_month} 합계: ${tw}명 ${td}일 기본${tr.toFixed(0)}h 연장${to.toFixed(0)}h 야간${tn.toFixed(0)}h\n\n${dept.join('\n')}\n\n(상세: get_employee_detail 사용)` }] };
  });

  // ===== 개인 상세 (필요할 때만 호출) =====
  server.tool('get_employee_detail', '특정 직원 월별 일별 상세', { name: z.string(), year_month: z.string() }, async ({ name, year_month }) => {
    const recs = await q('SELECT date,confirmed_clock_in as ci,confirmed_clock_out as co,regular_hours as r,overtime_hours as o,night_hours as n,source,memo FROM confirmed_attendance WHERE employee_name=? AND year_month=? ORDER BY date', name, year_month) as any[];
    if (!recs.length) return { content: [{ type: 'text' as const, text: `${name} ${year_month} 없음` }] };
    return { content: [{ type: 'text' as const, text: `${name} ${year_month} ${recs.length}일:\n${recs.map((r: any) => `${r.date} ${r.ci}~${r.co} 기${(+r.r).toFixed(1)} 연${(+r.o).toFixed(1)} 야${(+r.n).toFixed(1)}${r.source==='vacation'?' 휴가':''}`).join('\n')}` }] };
  });

  // ===== 휴가 (간결) =====
  server.tool('get_vacation_status', '휴가 잔여 현황', { year: z.string().optional() }, async ({ year }) => {
    const y = year || String(new Date().getFullYear());
    const d = await q(`SELECT re.name,re.department,vb.total_days as t,vb.used_days as u FROM regular_vacation_balances vb JOIN regular_employees re ON vb.employee_id=re.id WHERE vb.year=? ORDER BY re.name`, y) as any[];
    if (!d.length) return { content: [{ type: 'text' as const, text: '없음' }] };
    return { content: [{ type: 'text' as const, text: `${y}년 ${d.length}명:\n${d.map((b: any) => `${b.name}(${b.department||'-'}) ${(+b.t).toFixed(1)}/${(+b.u).toFixed(1)}/${(+b.t - +b.u).toFixed(1)}일`).join('\n')}\n(보유/사용/잔여)` }] };
  });

  server.tool('get_vacation_requests', '휴가 신청 목록', { status: z.string().optional().describe('pending/approved/rejected') }, async ({ status }) => {
    const w = status ? `AND vr.status='${status}'` : '';
    const d = await q(`SELECT vr.id,re.name,vr.type,vr.start_date as s,vr.end_date as e,vr.days,vr.status FROM regular_vacation_requests vr JOIN regular_employees re ON vr.employee_id=re.id WHERE 1=1 ${w} ORDER BY vr.created_at DESC LIMIT 20`) as any[];
    if (!d.length) return { content: [{ type: 'text' as const, text: '없음' }] };
    return { content: [{ type: 'text' as const, text: `${d.length}건:\n${d.map((r: any) => `#${r.id} ${r.name} ${r.type||'연차'} ${r.s}~${r.e}(${r.days}일) ${r.status==='approved'?'✅승인':r.status==='rejected'?'❌반려':'⏳대기'}`).join('\n')}` }] };
  });

  // ===== 오늘 출결 =====
  server.tool('get_today_attendance', '오늘 출결 현황', { date: z.string().optional() }, async ({ date }) => {
    const d = date || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const reg = await q1(`SELECT COUNT(*) as t,SUM(CASE WHEN ra.clock_in_time IS NOT NULL AND ra.clock_out_time IS NULL THEN 1 ELSE 0 END) as ci,SUM(CASE WHEN ra.clock_out_time IS NOT NULL THEN 1 ELSE 0 END) as co,SUM(CASE WHEN ra.clock_in_time IS NULL THEN 1 ELSE 0 END) as nc FROM regular_employees re LEFT JOIN regular_attendance ra ON re.id=ra.employee_id AND ra.date=? WHERE re.is_active=1`, d) as any;
    const srv = await q1(`SELECT COUNT(*) as t,SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as s,SUM(CASE WHEN status='clock_in' THEN 1 ELSE 0 END) as ci,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as co FROM survey_requests WHERE date=?`, d) as any;
    return { content: [{ type: 'text' as const, text: `${d}\n정규직: ${reg?.t||0}명(출근${reg?.ci||0} 퇴근${reg?.co||0} 미출근${reg?.nc||0})\n파견: ${srv?.t||0}명(대기${srv?.s||0} 출근${srv?.ci||0} 퇴근${srv?.co||0})` }] };
  });

  // ===== 배치 =====
  server.tool('get_shift_schedules', '배치 목록', { month: z.number().optional() }, async ({ month }) => {
    const m = month || (new Date().getMonth() + 1);
    const shifts = await q('SELECT s.*,(SELECT COUNT(*) FROM regular_shift_assignments WHERE shift_id=s.id) as cnt FROM regular_shifts s WHERE s.is_active=1 AND s.month=? ORDER BY s.week_number', m) as any[];
    if (!shifts.length) return { content: [{ type: 'text' as const, text: `${m}월 없음` }] };
    return { content: [{ type: 'text' as const, text: `${m}월 ${shifts.length}건:\n${shifts.map((s: any) => `#${s.id} ${s.name} ${s.week_number}주 ${s.planned_clock_in}~${s.planned_clock_out} ${s.cnt}명`).join('\n')}` }] };
  });

  server.tool('analyze_schedule', '배치 분석 (기간별 미배치/휴가)', { start_date: z.string(), end_date: z.string() }, async ({ start_date, end_date }) => {
    const shifts = await q('SELECT * FROM regular_shifts WHERE is_active=1') as any[];
    const allEmps = await q('SELECT id FROM regular_employees WHERE is_active=1') as any[];
    const vacs = await q("SELECT employee_id,start_date,end_date FROM regular_vacation_requests WHERE status='approved'") as any[];
    const dn = ['일', '월', '화', '수', '목', '금', '토'];
    const rpt: string[] = [`${start_date}~${end_date} (${allEmps.length}명)`];
    for (let dt = new Date(start_date + 'T00:00:00+09:00'); dt <= new Date(end_date + 'T00:00:00+09:00'); dt.setDate(dt.getDate() + 1)) {
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const dow = dt.getDay(); if (dow === 0 || dow === 6) continue;
      const m = dt.getMonth() + 1, fd = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay(), so = (fd + 6) % 7, wn = Math.ceil((dt.getDate() + so) / 7);
      const aids = new Set<number>();
      for (const s of shifts) { if (s.month !== m || s.week_number !== wn) continue; const da = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week]; if (!da.includes(dow)) continue; (await q('SELECT employee_id FROM regular_shift_assignments WHERE shift_id=?', s.id) as any[]).forEach((x: any) => aids.add(x.employee_id)); }
      let vc = 0; vacs.forEach((v: any) => { if (ds >= v.start_date && ds <= v.end_date) vc++; });
      const un = allEmps.length - aids.size - vc;
      rpt.push(`${ds.slice(5)}(${dn[dow]}) 배치${aids.size} 휴가${vc}${un > 0 ? ` ⚠${un}미배치` : ' ✅'}`);
    }
    return { content: [{ type: 'text' as const, text: rpt.join('\n') }] };
  });

  server.tool('get_unassigned', '특정 날짜 미배치 인력', { date: z.string() }, async ({ date }) => {
    const d = new Date(date + 'T00:00:00+09:00'), dow = d.getDay(), m = d.getMonth() + 1;
    const fd = new Date(d.getFullYear(), d.getMonth(), 1).getDay(), so = (fd + 6) % 7, wn = Math.ceil((d.getDate() + so) / 7);
    const shifts = await q('SELECT * FROM regular_shifts WHERE is_active=1 AND month=?', m) as any[];
    const all = await q('SELECT id,name,department,team FROM regular_employees WHERE is_active=1') as any[];
    const aids = new Set<number>();
    for (const s of shifts) { if (s.week_number !== wn) continue; const da = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week]; if (!da.includes(dow)) continue; (await q('SELECT employee_id FROM regular_shift_assignments WHERE shift_id=?', s.id) as any[]).forEach((x: any) => aids.add(x.employee_id)); }
    const vids = new Set<number>(); (await q("SELECT employee_id,start_date,end_date FROM regular_vacation_requests WHERE status='approved'") as any[]).forEach((v: any) => { if (date >= v.start_date && date <= v.end_date) vids.add(v.employee_id); });
    const un = all.filter((e: any) => !aids.has(e.id) && !vids.has(e.id));
    return { content: [{ type: 'text' as const, text: `${date} 배치${aids.size} 휴가${vids.size} 미배치${un.length}${un.length > 0 ? '\n' + un.map((e: any) => `${e.name}(${e.department||''})`).join(', ') : ''}` }] };
  });

  // ===== 쓰기 =====
  server.tool('create_shift', '배치 생성', { name: z.string(), month: z.number(), week_number: z.number(), days_of_week: z.string().describe('0=일~6=토 쉼표구분'), planned_clock_in: z.string(), planned_clock_out: z.string() },
    async ({ name, month, week_number, days_of_week, planned_clock_in, planned_clock_out }) => {
      const r = await dbRun('INSERT INTO regular_shifts (name,month,week_number,day_of_week,days_of_week,planned_clock_in,planned_clock_out) VALUES(?,?,?,?,?,?,?)', name, month, week_number, parseInt(days_of_week.split(',')[0]), days_of_week, planned_clock_in, planned_clock_out);
      return { content: [{ type: 'text' as const, text: `생성: ${name} ID:${r.lastInsertRowid}` }] };
    });

  server.tool('assign_employees', '배치에 직원 배정', { shift_id: z.number(), employee_names: z.string().describe('쉼표구분') }, async ({ shift_id, employee_names }) => {
    const names = employee_names.split(',').map(n => n.trim());
    const emps = await q('SELECT id,name FROM regular_employees WHERE is_active=1') as any[];
    let ok = 0; const nf: string[] = [];
    for (const n of names) { const e = emps.find((x: any) => x.name === n); if (e) { try { await dbRun('INSERT INTO regular_shift_assignments(shift_id,employee_id) VALUES(?,?)', shift_id, e.id); ok++; } catch {} } else nf.push(n); }
    return { content: [{ type: 'text' as const, text: `#${shift_id}에 ${ok}명 배정${nf.length ? ` 못찾음:${nf.join(',')}` : ''}` }] };
  });

  server.tool('approve_vacation', '휴가 승인', { request_id: z.number(), memo: z.string().optional() }, async ({ request_id, memo }) => {
    await dbRun("UPDATE regular_vacation_requests SET status='approved',admin_memo=?,updated_at=NOW() WHERE id=?", memo || '', request_id);
    return { content: [{ type: 'text' as const, text: `#${request_id} 승인` }] };
  });

  server.tool('reject_vacation', '휴가 반려', { request_id: z.number(), reason: z.string() }, async ({ request_id, reason }) => {
    await dbRun("UPDATE regular_vacation_requests SET status='rejected',admin_memo=?,updated_at=NOW() WHERE id=?", reason, request_id);
    return { content: [{ type: 'text' as const, text: `#${request_id} 반려` }] };
  });

  return server;
}

const transports: Record<string, SSEServerTransport> = {};

export function setupMcpRoutes(app: Express) {
  app.get('/mcp/sse', async (req: Request, res: Response) => {
    const key = (req.query.key as string) || req.headers['x-api-key'] as string;
    const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '');
    if (key !== MCP_API_KEY && (!token || !verifyToken(token))) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const transport = new SSEServerTransport('/mcp/messages', res);
    transports[transport.sessionId] = transport;
    const server = createMcpServer();
    res.on('close', () => { delete transports[transport.sessionId]; });
    await server.connect(transport);
  });

  app.post('/mcp/messages', async (req: Request, res: Response) => {
    const sid = req.query.sessionId as string;
    if (!transports[sid]) { res.status(404).json({ error: 'Session not found' }); return; }
    await transports[sid].handlePostMessage(req, res);
  });

  console.log('[MCP] Endpoints: /mcp/sse, /mcp/messages');
}
