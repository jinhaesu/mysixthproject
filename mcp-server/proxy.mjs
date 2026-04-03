#!/usr/bin/env node

/**
 * Local MCP proxy - connects to remote Railway MCP server via SSE
 * and exposes it as stdio transport for Claude Desktop
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const API_URL = process.env.ATTENDANCE_API_URL || "https://mysixthproject-production.up.railway.app";
const API_TOKEN = process.env.ATTENDANCE_API_TOKEN || "";
const API_KEY = process.env.MCP_API_KEY || "joinandjoin-mcp-2026";

async function api(path, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_TOKEN}`, "x-api-key": API_KEY } };
  if (body) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  opts.signal = controller.signal;
  try {
    const res = await fetch(`${API_URL}${path}`, opts);
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

const server = new McpServer({ name: "attendance-system", version: "1.0.0" });

server.tool("search_regular_employees", "정규직 직원 검색", { query: z.string() }, async ({ query }) => {
  const d = await api(`/api/regular/employees?search=${encodeURIComponent(query)}&limit=20&include_resigned=1`);
  const e = d.employees || [];
  return { content: [{ type: "text", text: e.length ? `정규직 ${e.length}명:\n${e.map(x=>`${x.name}|${x.phone}|${x.department} ${x.team}|입사:${x.hire_date||'-'}`).join('\n')}` : `'${query}' 없음` }] };
});

server.tool("search_dispatch_workers", "파견/알바 근무자 검색", { query: z.string() }, async ({ query }) => {
  const d = await api(`/api/workers?search=${encodeURIComponent(query)}&limit=20`);
  const w = d.workers || [];
  return { content: [{ type: "text", text: w.length ? `${w.length}명:\n${w.map(x=>`${x.name_ko}|${x.phone}|${x.category||'-'}|${x.department||'-'}`).join('\n')}` : `'${query}' 없음` }] };
});

server.tool("get_confirmed_list", "월별 확정 리스트", { year_month: z.string().describe("연월 예:2026-04"), type: z.string().optional().describe("regular 또는 dispatch") }, async ({ year_month, type }) => {
  const d = await api(`/api/regular/confirmed-list?year_month=${year_month}${type==='regular'?'&employee_type=정규직':''}`);
  const f = type==='dispatch' ? (d||[]).filter(e=>e.type!=='정규직') : (d||[]);
  if (!f.length) return { content: [{ type: "text", text: `${year_month} 없음` }] };
  let tr=0,to=0,tn=0;
  const l = f.map(e=>{tr+=e.regular_hours;to+=e.overtime_hours;tn+=e.night_hours;return `${e.name}(${e.department||'-'})[${e.type}] ${e.days}일 기본${e.regular_hours.toFixed(1)}h 연장${e.overtime_hours.toFixed(1)}h 야간${e.night_hours.toFixed(1)}h`;});
  return { content: [{ type: "text", text: `${year_month} ${f.length}명 기본${tr.toFixed(1)}h 연장${to.toFixed(1)}h 야간${tn.toFixed(1)}h\n\n${l.join('\n')}` }] };
});

server.tool("get_employee_detail", "직원 일별 출퇴근 상세", { name: z.string(), year_month: z.string() }, async ({ name, year_month }) => {
  const d = await api(`/api/regular/confirmed-list?year_month=${year_month}`);
  const emp = (d||[]).find(e=>e.name===name);
  if (!emp) return { content: [{ type: "text", text: `${name} ${year_month} 없음` }] };
  return { content: [{ type: "text", text: `${emp.name}(${emp.type}) ${emp.days}일\n${(emp.records||[]).map(r=>`${r.date} ${r.confirmed_clock_in}~${r.confirmed_clock_out} 기본${parseFloat(r.regular_hours).toFixed(1)}h 연장${parseFloat(r.overtime_hours).toFixed(1)}h 야간${parseFloat(r.night_hours).toFixed(1)}h`).join('\n')}` }] };
});

server.tool("get_vacation_status", "휴가 잔여/사용 현황", { year: z.string().optional() }, async ({ year }) => {
  const d = await api(`/api/regular/vacation-balances?year=${year||new Date().getFullYear()}`);
  if (!d?.length) return { content: [{ type: "text", text: "없음" }] };
  return { content: [{ type: "text", text: `${d.length}명:\n${d.map(b=>`${b.employee_name}(${b.department||'-'}) 보유${parseFloat(b.total_days).toFixed(1)} 사용${parseFloat(b.used_days).toFixed(1)} 잔여${(parseFloat(b.total_days)-parseFloat(b.used_days)).toFixed(1)}일`).join('\n')}` }] };
});

server.tool("get_vacation_requests", "휴가 신청 목록", { status: z.string().optional().describe("pending/approved/rejected") }, async ({ status }) => {
  const d = await api(`/api/regular/vacations${status?'?status='+status:''}`);
  if (!d?.length) return { content: [{ type: "text", text: "없음" }] };
  return { content: [{ type: "text", text: `${d.length}건:\n${d.map(r=>`#${r.id} ${r.employee_name}|${r.type||'연차'}|${r.start_date}~${r.end_date}(${r.days}일)|${r.status==='approved'?'승인':r.status==='rejected'?'반려':'대기'}`).join('\n')}` }] };
});

server.tool("get_today_attendance", "오늘 출결 현황", { date: z.string().optional() }, async ({ date }) => {
  const d = date || new Date().toLocaleDateString('sv-SE');
  const [reg, srv] = await Promise.all([api(`/api/regular/dashboard?date=${d}`).catch(()=>null), api("/api/survey/stats").catch(()=>null)]);
  let t = `${d} 출결:\n`;
  if (reg?.totals) { const x=reg.totals; t+=`정규직: 전체${x.total}명 출근${x.clocked_in}명 퇴근${x.completed}명 미출근${x.not_clocked_in}명\n`; }
  if (srv) { const b=srv.todayByStatus||{}; t+=`파견/알바: 발송${srv.today||0}명 대기${b.sent||0}명 출근${b.clock_in||0}명 퇴근${b.completed||0}명`; }
  return { content: [{ type: "text", text: t }] };
});

server.tool("get_shift_schedules", "배치 목록 조회", { month: z.number().optional().describe("월 1-12") }, async ({ month }) => {
  const m = month || (new Date().getMonth()+1);
  const shifts = await api("/api/regular/shifts");
  const ms = (shifts||[]).filter(s=>s.month===m);
  if (!ms.length) return { content: [{ type: "text", text: `${m}월 배치 없음` }] };
  const lines = [];
  for (const s of ms) {
    let a=[]; try{a=await api(`/api/regular/shifts/${s.id}/assignments`);}catch{}
    const days = s.days_of_week?s.days_of_week.split(',').map(Number).map(d=>['일','월','화','수','목','금','토'][d]).join('/'):'';
    lines.push(`#${s.id} ${s.name}|${m}월${s.week_number}주차 ${days}|${s.planned_clock_in}~${s.planned_clock_out}|${a.length}명`);
  }
  return { content: [{ type: "text", text: `${m}월 ${ms.length}건:\n${lines.join('\n')}` }] };
});

server.tool("get_monthly_summary", "월별 근태 통계", { year_month: z.string(), type: z.string().describe("regular 또는 dispatch") }, async ({ year_month, type }) => {
  const d = await api(`/api/regular/confirmed-list?year_month=${year_month}`);
  const f = (d||[]).filter(e=>type==='regular'?e.type==='정규직':e.type!=='정규직');
  if (!f.length) return { content: [{ type: "text", text: "없음" }] };
  const t = f.reduce((a,e)=>({w:a.w+1,d:a.d+e.days,r:a.r+e.regular_hours,o:a.o+e.overtime_hours,n:a.n+e.night_hours}),{w:0,d:0,r:0,o:0,n:0});
  const dm={}; f.forEach(e=>{const d=e.department||'?';if(!dm[d])dm[d]={c:0,r:0,o:0,n:0};dm[d].c++;dm[d].r+=e.regular_hours;dm[d].o+=e.overtime_hours;dm[d].n+=e.night_hours;});
  return { content: [{ type: "text", text: `${year_month} ${type==='regular'?'정규직':'파견/알바'}: ${t.w}명 ${t.d}일 기본${t.r.toFixed(1)}h 연장${t.o.toFixed(1)}h 야간${t.n.toFixed(1)}h\n\n부서별:\n${Object.entries(dm).map(([d,v])=>`  ${d}: ${v.c}명 기본${v.r.toFixed(1)}h 연장${v.o.toFixed(1)}h 야간${v.n.toFixed(1)}h`).join('\n')}` }] };
});

server.tool("analyze_schedule", "기간별 배치 분석 리포트 (미배치/휴가 확인)", { start_date: z.string().describe("시작일 YYYY-MM-DD"), end_date: z.string().describe("종료일 YYYY-MM-DD") }, async ({ start_date, end_date }) => {
  const [shifts, empsData, vacs] = await Promise.all([api("/api/regular/shifts"), api("/api/regular/employees?limit=500"), api("/api/regular/vacations?status=approved").catch(()=>[])]);
  const allEmps = (empsData.employees||[]).filter(e=>e.is_active!==0);
  const dn=['일','월','화','수','목','금','토'];
  const rpt=[`📊 분석 (${start_date}~${end_date}) ${allEmps.length}명\n`];
  const sd=new Date(start_date+'T00:00:00+09:00'),ed=new Date(end_date+'T00:00:00+09:00');
  for(let dt=new Date(sd);dt<=ed;dt.setDate(dt.getDate()+1)){
    const ds=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const dow=dt.getDay();if(dow===0||dow===6){rpt.push(`${ds}(${dn[dow]}) 주말`);continue;}
    const m=dt.getMonth()+1,fd=new Date(dt.getFullYear(),dt.getMonth(),1).getDay(),so=(fd+6)%7,wn=Math.ceil((dt.getDate()+so)/7);
    const aids=new Set();
    for(const s of(shifts||[])){if(s.month!==m||s.week_number!==wn)continue;const da=s.days_of_week?s.days_of_week.split(',').map(Number):[s.day_of_week];if(!da.includes(dow))continue;try{(await api(`/api/regular/shifts/${s.id}/assignments`)).forEach(x=>aids.add(x.employee_id));}catch{}}
    const vids=new Set();(vacs||[]).forEach(v=>{if(ds>=v.start_date&&ds<=v.end_date)vids.add(v.employee_id);});
    const un=allEmps.filter(e=>!aids.has(e.id)&&!vids.has(e.id)).length;
    rpt.push(`${ds}(${dn[dow]}) 배치${aids.size} 휴가${vids.size}${un>0?` ⚠️미배치${un}`:' ✅'}`);
  }
  return { content: [{ type: "text", text: rpt.join('\n') }] };
});

server.tool("get_unassigned_employees", "특정 날짜 미배치 인력 확인", { date: z.string().describe("날짜 YYYY-MM-DD") }, async ({ date }) => {
  const d=new Date(date+'T00:00:00+09:00'),dow=d.getDay(),m=d.getMonth()+1;
  const fd=new Date(d.getFullYear(),d.getMonth(),1).getDay(),so=(fd+6)%7,wn=Math.ceil((d.getDate()+so)/7);
  const [shifts,empsData,vacs]=await Promise.all([api("/api/regular/shifts"),api("/api/regular/employees?limit=500"),api("/api/regular/vacations?status=approved").catch(()=>[])]);
  const all=(empsData.employees||[]).filter(e=>e.is_active!==0);
  const aids=new Set();
  for(const s of(shifts||[])){if(s.month!==m||s.week_number!==wn)continue;const da=s.days_of_week?s.days_of_week.split(',').map(Number):[s.day_of_week];if(!da.includes(dow))continue;try{(await api(`/api/regular/shifts/${s.id}/assignments`)).forEach(x=>aids.add(x.employee_id));}catch{}}
  const vids=new Set();(vacs||[]).forEach(v=>{if(date>=v.start_date&&date<=v.end_date)vids.add(v.employee_id);});
  const un=all.filter(e=>!aids.has(e.id)&&!vids.has(e.id));
  const dn=['일','월','화','수','목','금','토'];
  return { content: [{ type: "text", text: `${date}(${dn[dow]}) 총${all.length}명 배치${aids.size} 휴가${vids.size} 미배치${un.length}${un.length>0?'\n\n'+un.map(e=>`  ${e.name}(${e.department} ${e.team})`).join('\n'):'\n전원 배치!'}` }] };
});

// ===== 쓰기 도구 =====
server.tool("create_shift", "새 배치(시프트) 생성", { name: z.string().describe("배치명"), month: z.number().describe("월 1-12"), week_number: z.number().describe("주차 1-5"), days_of_week: z.string().describe("요일 (0=일~6=토, 쉼표구분)"), planned_clock_in: z.string().describe("출근 HH:MM"), planned_clock_out: z.string().describe("퇴근 HH:MM") },
  async ({ name, month, week_number, days_of_week, planned_clock_in, planned_clock_out }) => {
    const r = await api("/api/regular/shifts", "POST", { name, month, week_number, days_of_week, day_of_week:parseInt(days_of_week.split(',')[0]), planned_clock_in, planned_clock_out });
    return { content: [{ type: "text", text: `배치 생성: ${name} (ID:${r.id})` }] };
  }
);

server.tool("assign_employees", "배치에 직원 배정 (이름으로)", { shift_id: z.number().describe("배치 ID"), employee_names: z.string().describe("직원 이름 쉼표구분") },
  async ({ shift_id, employee_names }) => {
    const names=employee_names.split(',').map(n=>n.trim());
    const emps=(await api("/api/regular/employees?limit=500")).employees||[];
    const ids=[],nf=[];
    names.forEach(n=>{const e=emps.find(x=>x.name===n);if(e)ids.push(e.id);else nf.push(n);});
    if(!ids.length) return { content: [{ type: "text", text: `못찾음: ${nf.join(',')}` }] };
    await api(`/api/regular/shifts/${shift_id}/assignments`, "POST", { employee_ids: ids });
    return { content: [{ type: "text", text: `배치#${shift_id}에 ${ids.length}명 배정${nf.length?` (못찾음:${nf.join(',')})`:''}`}]};
  }
);

server.tool("approve_vacation", "휴가 승인", { request_id: z.number(), memo: z.string().optional() }, async ({ request_id, memo }) => {
  await api(`/api/regular/vacations/${request_id}/approve`, "PUT", { admin_memo: memo||"" });
  return { content: [{ type: "text", text: `휴가 #${request_id} 승인` }] };
});

server.tool("reject_vacation", "휴가 반려", { request_id: z.number(), reason: z.string() }, async ({ request_id, reason }) => {
  await api(`/api/regular/vacations/${request_id}/reject`, "PUT", { admin_memo: reason });
  return { content: [{ type: "text", text: `휴가 #${request_id} 반려` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
