#!/usr/bin/env node
/**
 * Lightweight MCP proxy → Railway API
 * Token-optimized: short responses, summary-first
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const URL = process.env.ATTENDANCE_API_URL || "https://mysixthproject-production.up.railway.app";
const TK = process.env.ATTENDANCE_API_TOKEN || "";

async function a(path, method="GET", body=null) {
  const o = { method, headers: {"Content-Type":"application/json",Authorization:`Bearer ${TK}`}, signal: AbortSignal.timeout(30000) };
  if (body) o.body = JSON.stringify(body);
  const r = await fetch(`${URL}${path}`, o);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

const s = new McpServer({ name:"attendance-system", version:"1.0.0" });
const t = (text) => ({ content:[{type:"text",text}] });

s.tool("search_employees","직원 검색",{query:z.string(),limit:z.number().optional()},async({query,limit})=>{
  const l=limit||10;
  const [reg,disp]=await Promise.all([a(`/api/regular/employees?search=${encodeURIComponent(query)}&limit=${l}`),a(`/api/workers?search=${encodeURIComponent(query)}&limit=${l}`)]);
  const r=(reg.employees||[]).map(e=>`#${e.id} ${e.name}|${e.phone}|${e.department||''}`);
  const d=(disp.workers||[]).map(w=>`${w.name_ko}|${w.phone}|${w.category||''}`);
  return t(`${r.length?'[정규직]\n'+r.join('\n'):''}${r.length&&d.length?'\n':''}${d.length?'[파견/알바]\n'+d.join('\n'):''}${!r.length&&!d.length?`'${query}' 없음`:''}`);
});

s.tool("get_confirmed_summary","월별 확정 요약",{year_month:z.string(),type:z.string().optional()},async({year_month,type})=>{
  const d=await a(`/api/regular/confirmed-list?year_month=${year_month}${type==='regular'?'&employee_type=정규직':''}`);
  const f=type==='dispatch'?(d||[]).filter(e=>e.type!=='정규직'):(d||[]);
  if(!f.length)return t(`${year_month} 없음`);
  const dm={};let tw=0,tr=0,to=0,tn=0;
  f.forEach(e=>{const d=e.department||'?';if(!dm[d])dm[d]={c:0,r:0,o:0,n:0};dm[d].c++;dm[d].r+=e.regular_hours;dm[d].o+=e.overtime_hours;dm[d].n+=e.night_hours;tw++;tr+=e.regular_hours;to+=e.overtime_hours;tn+=e.night_hours;});
  return t(`${year_month} ${tw}명 기본${tr.toFixed(0)}h 연장${to.toFixed(0)}h 야간${tn.toFixed(0)}h\n${Object.entries(dm).map(([d,v])=>`${d}:${v.c}명 기${v.r.toFixed(0)}h 연${v.o.toFixed(0)}h 야${v.n.toFixed(0)}h`).join('\n')}`);
});

s.tool("get_employee_detail","직원 일별 상세",{name:z.string(),year_month:z.string()},async({name,year_month})=>{
  const d=await a(`/api/regular/confirmed-list?year_month=${year_month}`);
  const e=(d||[]).find(x=>x.name===name);
  if(!e)return t(`${name} ${year_month} 없음`);
  return t(`${e.name} ${e.days}일:\n${(e.records||[]).map(r=>`${r.date} ${r.confirmed_clock_in}~${r.confirmed_clock_out} 기${(+r.regular_hours).toFixed(1)} 연${(+r.overtime_hours).toFixed(1)} 야${(+r.night_hours).toFixed(1)}${r.source==='vacation'?' 휴가':''}`).join('\n')}`);
});

s.tool("get_vacation_status","휴가 현황",{year:z.string().optional()},async({year})=>{
  const d=await a(`/api/regular/vacation-balances?year=${year||new Date().getFullYear()}`);
  if(!d?.length)return t('없음');
  return t(`${d.length}명(보유/사용/잔여):\n${d.map(b=>`${b.employee_name} ${(+b.total_days).toFixed(1)}/${(+b.used_days).toFixed(1)}/${(+b.total_days-+b.used_days).toFixed(1)}`).join('\n')}`);
});

s.tool("get_vacation_requests","휴가 신청",{status:z.string().optional()},async({status})=>{
  const d=await a(`/api/regular/vacations${status?'?status='+status:''}`);
  if(!d?.length)return t('없음');
  return t(d.map(r=>`#${r.id} ${r.employee_name} ${r.type||'연차'} ${r.start_date}~${r.end_date}(${r.days}일) ${r.status==='approved'?'✅':r.status==='rejected'?'❌':'⏳'}`).join('\n'));
});

s.tool("get_today_attendance","오늘 출결",{date:z.string().optional()},async({date})=>{
  const d=date||new Date().toLocaleDateString('sv-SE');
  const [reg,srv]=await Promise.all([a(`/api/regular/dashboard?date=${d}`).catch(()=>null),a("/api/survey/stats").catch(()=>null)]);
  let r=`${d} `;
  if(reg?.totals){const x=reg.totals;r+=`정규:${x.total}(출근${x.clocked_in}퇴근${x.completed}미출근${x.not_clocked_in}) `;}
  if(srv){const b=srv.todayByStatus||{};r+=`파견:${srv.today||0}(대기${b.sent||0}출근${b.clock_in||0}퇴근${b.completed||0})`;}
  return t(r);
});

s.tool("get_shift_schedules","배치 목록",{month:z.number().optional()},async({month})=>{
  const m=month||(new Date().getMonth()+1);
  const shifts=await a("/api/regular/shifts");
  const ms=(shifts||[]).filter(x=>x.month===m);
  if(!ms.length)return t(`${m}월 없음`);
  return t(`${m}월 ${ms.length}건:\n${ms.map(x=>`#${x.id} ${x.name} ${x.week_number}주 ${x.planned_clock_in}~${x.planned_clock_out} ${x.assignment_count||0}명`).join('\n')}`);
});

s.tool("analyze_schedule","배치 분석",{start_date:z.string(),end_date:z.string()},async({start_date,end_date})=>{
  const [shifts,ed,vacs]=await Promise.all([a("/api/regular/shifts"),a("/api/regular/employees?limit=500"),a("/api/regular/vacations?status=approved").catch(()=>[])]);
  const all=(ed.employees||[]).filter(e=>e.is_active!==0);
  const dn=['일','월','화','수','목','금','토'];
  const rpt=[`${start_date}~${end_date} ${all.length}명`];
  for(let dt=new Date(start_date+'T00:00:00+09:00');dt<=new Date(end_date+'T00:00:00+09:00');dt.setDate(dt.getDate()+1)){
    const ds=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const dow=dt.getDay();if(dow===0||dow===6)continue;
    const m=dt.getMonth()+1,fd=new Date(dt.getFullYear(),dt.getMonth(),1).getDay(),so=(fd+6)%7,wn=Math.ceil((dt.getDate()+so)/7);
    const aids=new Set();
    for(const x of(shifts||[])){if(x.month!==m||x.week_number!==wn)continue;const da=x.days_of_week?x.days_of_week.split(',').map(Number):[x.day_of_week];if(!da.includes(dow))continue;try{(await a(`/api/regular/shifts/${x.id}/assignments`)).forEach(y=>aids.add(y.employee_id));}catch{}}
    let vc=0;(vacs||[]).forEach(v=>{if(ds>=v.start_date&&ds<=v.end_date)vc++;});
    const un=all.length-aids.size-vc;
    rpt.push(`${ds.slice(5)}(${dn[dow]}) 배치${aids.size} 휴가${vc}${un>0?` ⚠${un}`:' ✅'}`);
  }
  return t(rpt.join('\n'));
});

s.tool("get_unassigned","미배치 인력",{date:z.string()},async({date})=>{
  const d=new Date(date+'T00:00:00+09:00'),dow=d.getDay(),m=d.getMonth()+1;
  const fd=new Date(d.getFullYear(),d.getMonth(),1).getDay(),so=(fd+6)%7,wn=Math.ceil((d.getDate()+so)/7);
  const [shifts,ed,vacs]=await Promise.all([a("/api/regular/shifts"),a("/api/regular/employees?limit=500"),a("/api/regular/vacations?status=approved").catch(()=>[])]);
  const all=(ed.employees||[]).filter(e=>e.is_active!==0);
  const aids=new Set();
  for(const x of(shifts||[])){if(x.month!==m||x.week_number!==wn)continue;const da=x.days_of_week?x.days_of_week.split(',').map(Number):[x.day_of_week];if(!da.includes(dow))continue;try{(await a(`/api/regular/shifts/${x.id}/assignments`)).forEach(y=>aids.add(y.employee_id));}catch{}}
  const vids=new Set();(vacs||[]).forEach(v=>{if(date>=v.start_date&&date<=v.end_date)vids.add(v.employee_id);});
  const un=all.filter(e=>!aids.has(e.id)&&!vids.has(e.id));
  return t(`${date} 배치${aids.size} 휴가${vids.size} 미배치${un.length}${un.length?'\n'+un.map(e=>`${e.name}(${e.department||''})`).join(','):''}`);
});

s.tool("create_shift","배치 생성",{name:z.string(),month:z.number(),week_number:z.number(),days_of_week:z.string().describe("0=일~6=토"),planned_clock_in:z.string(),planned_clock_out:z.string()},
  async({name,month,week_number,days_of_week,planned_clock_in,planned_clock_out})=>{
    const r=await a("/api/regular/shifts","POST",{name,month,week_number,days_of_week,day_of_week:parseInt(days_of_week.split(',')[0]),planned_clock_in,planned_clock_out});
    return t(`생성: ${name} ID:${r.id}`);
  });

s.tool("assign_employees","직원 배정",{shift_id:z.number(),employee_names:z.string().describe("쉼표구분")},async({shift_id,employee_names})=>{
  const names=employee_names.split(',').map(n=>n.trim());
  const emps=(await a("/api/regular/employees?limit=500")).employees||[];
  const ids=[],nf=[];
  names.forEach(n=>{const e=emps.find(x=>x.name===n);if(e)ids.push(e.id);else nf.push(n);});
  if(!ids.length)return t(`못찾음:${nf.join(',')}`);
  await a(`/api/regular/shifts/${shift_id}/assignments`,"POST",{employee_ids:ids});
  return t(`#${shift_id}에 ${ids.length}명 배정${nf.length?' 못찾음:'+nf.join(','):''}`);
});

// ===== 비밀번호 필요 도구 =====
async function verifyPw(pw) {
  try { const r = await a("/api/regular/verify-password","POST",{password:pw}); return r.verified; } catch { return false; }
}

s.tool("get_settlement","파견/알바 정산 (비밀번호 필요)",{year_month:z.string(),type:z.string().optional().describe("dispatch/alba"),password:z.string().describe("접근 비밀번호")},async({year_month,type,password})=>{
  if(!await verifyPw(password))return t("❌ 비밀번호 불일치");
  const d=await a(`/api/regular/confirmed-list?year_month=${year_month}`);
  const f=(d||[]).filter(e=>e.type!=='정규직').filter(e=>!type||(type==='alba'?e.type==='알바':e.type==='파견'));
  if(!f.length)return t(`${year_month} 없음`);
  return t(`${f.length}명:\n${f.map(e=>`${e.name}[${e.type}] ${e.days}일 기${e.regular_hours.toFixed(1)}h 연${e.overtime_hours.toFixed(1)}h 야${e.night_hours.toFixed(1)}h`).join('\n')}`);
});

s.tool("get_salary_settings","기본급 설정 조회 (비밀번호 필요)",{password:z.string().describe("접근 비밀번호")},async({password})=>{
  if(!await verifyPw(password))return t("❌ 비밀번호 불일치");
  const d=await a("/api/regular/salary-settings");
  if(!d?.length)return t("없음");
  return t(`${d.length}명:\n${d.map(x=>`${x.name}(${x.department||'-'}) 기본${x.base_pay||0} 식대${x.meal_allowance||0}`).join('\n')}`);
});

s.tool("get_payroll_calc","급여 계산 조회 (비밀번호 필요)",{year_month:z.string(),password:z.string().describe("접근 비밀번호")},async({year_month,password})=>{
  if(!await verifyPw(password))return t("❌ 비밀번호 불일치");
  const d=await a(`/api/regular/payroll-calc?year_month=${year_month}`);
  if(!d?.results?.length)return t(`${year_month} 없음`);
  return t(`${year_month} ${d.results.length}명:\n${d.results.map(r=>`${r.name} ${r.work_days}일 기본급${r.base_pay||0} 연장${r.overtime_hours?.toFixed(1)||0}h`).join('\n')}`);
});

s.tool("update_salary","기본급 수정 (비밀번호 필요)",{employee_name:z.string(),base_pay:z.number().optional(),meal_allowance:z.number().optional(),password:z.string().describe("접근 비밀번호")},async({employee_name,base_pay,meal_allowance,password})=>{
  if(!await verifyPw(password))return t("❌ 비밀번호 불일치");
  const emps=(await a("/api/regular/employees?limit=500")).employees||[];
  const emp=emps.find(e=>e.name===employee_name);
  if(!emp)return t(`${employee_name} 없음`);
  const body={};if(base_pay!==undefined)body.base_pay=base_pay;if(meal_allowance!==undefined)body.meal_allowance=meal_allowance;
  await a(`/api/regular/salary-settings/${emp.id}`,"PUT",body);
  return t(`${employee_name} 급여 수정 완료`);
});

s.tool("approve_vacation","휴가 승인",{request_id:z.number(),memo:z.string().optional()},async({request_id,memo})=>{
  await a(`/api/regular/vacations/${request_id}/approve`,"PUT",{admin_memo:memo||""});return t(`#${request_id} 승인`);
});

s.tool("reject_vacation","휴가 반려",{request_id:z.number(),reason:z.string()},async({request_id,reason})=>{
  await a(`/api/regular/vacations/${request_id}/reject`,"PUT",{admin_memo:reason});return t(`#${request_id} 반려`);
});

await s.connect(new StdioServerTransport());
