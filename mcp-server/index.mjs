#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.ATTENDANCE_API_URL || "https://mysixthproject-production.up.railway.app";
const API_TOKEN = process.env.ATTENDANCE_API_TOKEN || "";

async function api(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

const server = new McpServer({
  name: "attendance-system",
  version: "1.0.0",
});

// ===== 정규직 직원 검색 =====
server.tool(
  "search_regular_employees",
  "정규직 직원을 이름 또는 전화번호로 검색합니다",
  { query: z.string().describe("이름 또는 전화번호") },
  async ({ query }) => {
    const data = await api(`/api/regular/employees?search=${encodeURIComponent(query)}&limit=20&include_resigned=1`);
    const emps = data.employees || [];
    if (emps.length === 0) return { content: [{ type: "text", text: `'${query}' 검색 결과 없음` }] };
    const lines = emps.map(e =>
      `${e.name} | ${e.phone} | ${e.department} ${e.team} | ${e.role} | 입사: ${e.hire_date || '-'} | ${e.is_active ? '활성' : '퇴사'}`
    );
    return { content: [{ type: "text", text: `정규직 검색 결과 (${emps.length}명):\n${lines.join('\n')}` }] };
  }
);

// ===== 파견/알바 근무자 검색 =====
server.tool(
  "search_dispatch_workers",
  "파견/알바 근무자를 이름 또는 전화번호로 검색합니다",
  { query: z.string().describe("이름 또는 전화번호") },
  async ({ query }) => {
    const data = await api(`/api/workers?search=${encodeURIComponent(query)}&limit=20`);
    const workers = data.workers || [];
    if (workers.length === 0) return { content: [{ type: "text", text: `'${query}' 검색 결과 없음` }] };
    const lines = workers.map(w =>
      `${w.name_ko} | ${w.phone} | 구분: ${w.category || '-'} | 부서: ${w.department || '-'} | 마지막출근: ${w.last_clock_in_date || '-'}`
    );
    return { content: [{ type: "text", text: `파견/알바 검색 결과 (${workers.length}명):\n${lines.join('\n')}` }] };
  }
);

// ===== 정규직 근태 확정 리스트 =====
server.tool(
  "get_regular_confirmed",
  "정규직 월별 근태 확정 리스트를 조회합니다",
  { year_month: z.string().describe("연월 (예: 2026-04)") },
  async ({ year_month }) => {
    const data = await api(`/api/regular/confirmed-list?year_month=${year_month}&employee_type=정규직`);
    if (!data || data.length === 0) return { content: [{ type: "text", text: `${year_month} 확정 데이터 없음` }] };
    let totalReg = 0, totalOt = 0, totalNight = 0;
    const lines = data.map(e => {
      totalReg += e.regular_hours; totalOt += e.overtime_hours; totalNight += e.night_hours;
      return `${e.name} (${e.department || '-'}) | ${e.days}일 | 기본 ${e.regular_hours.toFixed(1)}h | 연장 ${e.overtime_hours.toFixed(1)}h | 야간 ${e.night_hours.toFixed(1)}h`;
    });
    const summary = `총 ${data.length}명 | 기본 ${totalReg.toFixed(1)}h | 연장 ${totalOt.toFixed(1)}h | 야간 ${totalNight.toFixed(1)}h`;
    return { content: [{ type: "text", text: `${year_month} 정규직 확정 리스트:\n${summary}\n\n${lines.join('\n')}` }] };
  }
);

// ===== 파견/알바 근태 확정 리스트 =====
server.tool(
  "get_dispatch_confirmed",
  "파견/알바 월별 근태 확정 리스트를 조회합니다",
  { year_month: z.string().describe("연월 (예: 2026-04)") },
  async ({ year_month }) => {
    const data = await api(`/api/regular/confirmed-list?year_month=${year_month}`);
    const filtered = (data || []).filter(e => e.type !== '정규직');
    if (filtered.length === 0) return { content: [{ type: "text", text: `${year_month} 파견/알바 확정 데이터 없음` }] };
    let totalReg = 0, totalOt = 0, totalNight = 0;
    const lines = filtered.map(e => {
      totalReg += e.regular_hours; totalOt += e.overtime_hours; totalNight += e.night_hours;
      return `${e.name} [${e.type || '?'}] | ${e.days}일 | 기본 ${e.regular_hours.toFixed(1)}h | 연장 ${e.overtime_hours.toFixed(1)}h | 야간 ${e.night_hours.toFixed(1)}h`;
    });
    const summary = `총 ${filtered.length}명 | 기본 ${totalReg.toFixed(1)}h | 연장 ${totalOt.toFixed(1)}h | 야간 ${totalNight.toFixed(1)}h`;
    return { content: [{ type: "text", text: `${year_month} 파견/알바 확정 리스트:\n${summary}\n\n${lines.join('\n')}` }] };
  }
);

// ===== 특정 직원 상세 출퇴근 이력 =====
server.tool(
  "get_employee_attendance_detail",
  "특정 직원의 월별 일별 출퇴근 상세 이력을 조회합니다",
  {
    name: z.string().describe("직원 이름"),
    year_month: z.string().describe("연월 (예: 2026-04)"),
  },
  async ({ name, year_month }) => {
    const data = await api(`/api/regular/confirmed-list?year_month=${year_month}`);
    const emp = (data || []).find(e => e.name === name);
    if (!emp) return { content: [{ type: "text", text: `${year_month} ${name}의 확정 이력 없음` }] };
    const header = `${emp.name} (${emp.type || '-'}) | ${emp.days}일 | 기본 ${emp.regular_hours.toFixed(1)}h | 연장 ${emp.overtime_hours.toFixed(1)}h | 야간 ${emp.night_hours.toFixed(1)}h | 휴게 ${emp.break_hours.toFixed(1)}h`;
    const records = (emp.records || []).map(r =>
      `${r.date} | ${r.confirmed_clock_in}~${r.confirmed_clock_out} | 기준:${r.source} | 기본${parseFloat(r.regular_hours).toFixed(1)}h 연장${parseFloat(r.overtime_hours).toFixed(1)}h 야간${parseFloat(r.night_hours).toFixed(1)}h`
    );
    return { content: [{ type: "text", text: `${header}\n\n일별 상세:\n${records.join('\n')}` }] };
  }
);

// ===== 휴가 현황 =====
server.tool(
  "get_vacation_status",
  "정규직 휴가 잔여/사용 현황을 조회합니다",
  { year: z.string().optional().describe("연도 (기본: 올해)") },
  async ({ year }) => {
    const y = year || String(new Date().getFullYear());
    const data = await api(`/api/regular/vacation-balances?year=${y}`);
    if (!data || data.length === 0) return { content: [{ type: "text", text: `${y}년 휴가 데이터 없음` }] };
    const lines = data.map(b =>
      `${b.employee_name} (${b.department || '-'}) | 보유: ${parseFloat(b.total_days).toFixed(1)}일 | 사용: ${parseFloat(b.used_days).toFixed(1)}일 | 잔여: ${(parseFloat(b.total_days) - parseFloat(b.used_days)).toFixed(1)}일`
    );
    return { content: [{ type: "text", text: `${y}년 휴가 현황 (${data.length}명):\n${lines.join('\n')}` }] };
  }
);

// ===== 휴가 신청 목록 =====
server.tool(
  "get_vacation_requests",
  "휴가 신청 목록을 조회합니다 (대기중/승인/반려)",
  { status: z.string().optional().describe("상태 필터: pending, approved, rejected (비우면 전체)") },
  async ({ status }) => {
    const qs = status ? `?status=${status}` : '';
    const data = await api(`/api/regular/vacations${qs}`);
    if (!data || data.length === 0) return { content: [{ type: "text", text: "휴가 신청 없음" }] };
    const lines = data.map(r =>
      `${r.employee_name} | ${r.type || '연차'} | ${r.start_date}~${r.end_date} (${r.days}일) | 상태: ${r.status === 'approved' ? '승인' : r.status === 'rejected' ? '반려' : '대기중'} | 사유: ${r.reason || '-'}`
    );
    return { content: [{ type: "text", text: `휴가 신청 (${data.length}건):\n${lines.join('\n')}` }] };
  }
);

// ===== 오늘 출결 현황 (정규직) =====
server.tool(
  "get_today_regular_attendance",
  "오늘 정규직 실시간 출결 현황을 조회합니다",
  { date: z.string().optional().describe("날짜 (기본: 오늘, 예: 2026-04-03)") },
  async ({ date }) => {
    const d = date || new Date().toLocaleDateString('sv-SE');
    const data = await api(`/api/regular/dashboard?date=${d}`);
    if (!data) return { content: [{ type: "text", text: "데이터 없음" }] };
    const t = data.totals || {};
    const summary = `${d} 정규직 출결 현황:\n전체: ${t.total || 0}명 | 출근: ${t.clocked_in || 0}명 | 퇴근완료: ${t.completed || 0}명 | 미출근: ${t.not_clocked_in || 0}명`;
    const depts = (data.departments || []).map(dept => {
      const emps = dept.teams?.flatMap(t => t.employees) || [];
      const clockedIn = emps.filter(e => e.clock_in_time && !e.clock_out_time).length;
      const completed = emps.filter(e => e.clock_out_time).length;
      const absent = emps.filter(e => !e.clock_in_time).length;
      return `  ${dept.department}: 출근${clockedIn} 퇴근${completed} 미출근${absent}`;
    });
    return { content: [{ type: "text", text: `${summary}\n\n부서별:\n${depts.join('\n')}` }] };
  }
);

// ===== 오늘 출결 현황 (파견/알바) =====
server.tool(
  "get_today_survey_stats",
  "오늘 파견/알바 설문 출퇴근 현황을 조회합니다",
  {},
  async () => {
    const data = await api("/api/survey/stats");
    if (!data) return { content: [{ type: "text", text: "데이터 없음" }] };
    const bs = data.todayByStatus || {};
    return {
      content: [{
        type: "text",
        text: `오늘 파견/알바 출퇴근:\n전체 발송: ${data.today || 0}명\n대기중: ${bs.sent || 0}명\n출근완료: ${bs.clock_in || 0}명\n퇴근완료: ${bs.completed || 0}명`
      }]
    };
  }
);

// ===== 휴가 승인 =====
server.tool(
  "approve_vacation",
  "휴가 신청을 승인합니다",
  {
    request_id: z.number().describe("휴가 신청 ID"),
    memo: z.string().optional().describe("승인 메모"),
  },
  async ({ request_id, memo }) => {
    const result = await api(`/api/regular/vacations/${request_id}/approve`, "PUT", { admin_memo: memo || "" });
    return { content: [{ type: "text", text: result.success ? `휴가 #${request_id} 승인 완료` : "승인 실패" }] };
  }
);

// ===== 근태 요약 통계 =====
server.tool(
  "get_monthly_summary",
  "월별 근태 요약 통계를 조회합니다 (정규직 또는 파견/알바)",
  {
    year_month: z.string().describe("연월 (예: 2026-04)"),
    type: z.string().describe("유형: regular(정규직) 또는 dispatch(파견/알바)"),
  },
  async ({ year_month, type }) => {
    const data = await api(`/api/regular/confirmed-list?year_month=${year_month}`);
    const filtered = (data || []).filter(e =>
      type === 'regular' ? e.type === '정규직' : e.type !== '정규직'
    );
    if (filtered.length === 0) return { content: [{ type: "text", text: `${year_month} 데이터 없음` }] };

    const totals = filtered.reduce((acc, e) => ({
      workers: acc.workers + 1,
      days: acc.days + e.days,
      regular: acc.regular + e.regular_hours,
      overtime: acc.overtime + e.overtime_hours,
      night: acc.night + e.night_hours,
      breakH: acc.breakH + e.break_hours,
    }), { workers: 0, days: 0, regular: 0, overtime: 0, night: 0, breakH: 0 });

    // Department breakdown
    const deptMap = {};
    for (const e of filtered) {
      const d = e.department || '미분류';
      if (!deptMap[d]) deptMap[d] = { count: 0, regular: 0, overtime: 0, night: 0 };
      deptMap[d].count++;
      deptMap[d].regular += e.regular_hours;
      deptMap[d].overtime += e.overtime_hours;
      deptMap[d].night += e.night_hours;
    }
    const deptLines = Object.entries(deptMap).map(([d, v]) =>
      `  ${d}: ${v.count}명 | 기본 ${v.regular.toFixed(1)}h | 연장 ${v.overtime.toFixed(1)}h | 야간 ${v.night.toFixed(1)}h`
    );

    const label = type === 'regular' ? '정규직' : '파견/알바';
    const text = `${year_month} ${label} 근태 요약:
총 ${totals.workers}명 | ${totals.days}일 근무
기본: ${totals.regular.toFixed(1)}h | 연장: ${totals.overtime.toFixed(1)}h | 야간: ${totals.night.toFixed(1)}h
1인 평균: 기본 ${(totals.regular / totals.workers).toFixed(1)}h | 연장 ${(totals.overtime / totals.workers).toFixed(1)}h

부서별:
${deptLines.join('\n')}`;

    return { content: [{ type: "text", text }] };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
