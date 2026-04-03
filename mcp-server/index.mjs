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

// ===== 시프트 배치 조회 =====
server.tool(
  "get_shift_schedules",
  "계획 출퇴근 배치 목록과 배정 인원을 조회합니다",
  { month: z.number().optional().describe("월 (1-12, 기본: 이번 달)") },
  async ({ month }) => {
    const m = month || (new Date().getMonth() + 1);
    const shifts = await api("/api/regular/shifts");
    const monthShifts = (shifts || []).filter(s => s.month === m);
    if (monthShifts.length === 0) return { content: [{ type: "text", text: `${m}월 배치 없음` }] };

    const lines = [];
    for (const s of monthShifts) {
      let assigned = [];
      try { assigned = await api(`/api/regular/shifts/${s.id}/assignments`); } catch {}
      const daysStr = s.days_of_week ? s.days_of_week.split(',').map(Number).map(d => ['일','월','화','수','목','금','토'][d]).join('/') : '';
      const empNames = (assigned || []).map(a => `${a.name}(${a.department || ''})`).join(', ');
      lines.push(`${s.name} | ${m}월 ${s.week_number}주차 ${daysStr} | ${s.planned_clock_in}~${s.planned_clock_out} | ${assigned.length}명: ${empNames || '미배정'}`);
    }
    return { content: [{ type: "text", text: `${m}월 배치 (${monthShifts.length}건):\n${lines.join('\n')}` }] };
  }
);

// ===== 미배치 인력 확인 =====
server.tool(
  "get_unassigned_employees",
  "특정 날짜에 배치되지 않은 인력을 확인합니다",
  { date: z.string().describe("날짜 (예: 2026-04-07)") },
  async ({ date }) => {
    const d = new Date(date + 'T00:00:00+09:00');
    const month = d.getMonth() + 1;
    const dow = d.getDay();
    const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const so = (firstDow + 6) % 7;
    const weekNum = Math.ceil((d.getDate() + so) / 7);

    const [shifts, empsData] = await Promise.all([
      api("/api/regular/shifts"),
      api("/api/regular/employees?limit=500&include_resigned=0"),
    ]);
    const allEmps = empsData.employees || [];
    const monthShifts = (shifts || []).filter(s => s.month === month);

    const assignedIds = new Set();
    for (const s of monthShifts) {
      if (s.week_number !== weekNum) continue;
      const daysArr = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week];
      if (!daysArr.includes(dow)) continue;
      try {
        const assigned = await api(`/api/regular/shifts/${s.id}/assignments`);
        (assigned || []).forEach(a => assignedIds.add(a.employee_id));
      } catch {}
    }

    // Check vacations
    let vacIds = new Set();
    try {
      const vacs = await api("/api/regular/vacations?status=approved");
      for (const v of (vacs || [])) {
        if (date >= v.start_date && date <= v.end_date) vacIds.add(v.employee_id);
      }
    } catch {}

    const unassigned = allEmps.filter(e => e.is_active !== 0 && !assignedIds.has(e.id) && !vacIds.has(e.id));
    const onVac = allEmps.filter(e => vacIds.has(e.id));

    const dayName = ['일','월','화','수','목','금','토'][dow];
    let text = `${date} (${dayName}) 인력 현황:\n총 ${allEmps.filter(e=>e.is_active!==0).length}명 | 배치 ${assignedIds.size}명 | 휴가 ${onVac.length}명 | 미배치 ${unassigned.length}명`;

    if (onVac.length > 0) text += `\n\n휴가자:\n${onVac.map(e => `  ${e.name} (${e.department})`).join('\n')}`;
    if (unassigned.length > 0) text += `\n\n미배치:\n${unassigned.map(e => `  ${e.name} (${e.department} ${e.team})`).join('\n')}`;
    else text += `\n\n전원 배치 완료!`;

    return { content: [{ type: "text", text }] };
  }
);

// ===== 배치 분석 및 제안 =====
server.tool(
  "analyze_schedule",
  "향후 1~2주 배치 계획을 분석하고 휴가/미배치를 종합하여 리포트를 생성합니다",
  {
    start_date: z.string().describe("분석 시작일 (예: 2026-04-07)"),
    end_date: z.string().describe("분석 종료일 (예: 2026-04-18)"),
  },
  async ({ start_date, end_date }) => {
    const [shifts, empsData, vacs, balances] = await Promise.all([
      api("/api/regular/shifts"),
      api("/api/regular/employees?limit=500&include_resigned=0"),
      api("/api/regular/vacations?status=approved").catch(() => []),
      api(`/api/regular/vacation-balances?year=${start_date.slice(0, 4)}`).catch(() => []),
    ]);
    const allEmps = (empsData.employees || []).filter(e => e.is_active !== 0);

    const dayNames = ['일','월','화','수','목','금','토'];
    const report = [];
    const dailyStats = [];
    const empWorkDays = {};

    // Iterate each day
    const sd = new Date(start_date + 'T00:00:00+09:00');
    const ed = new Date(end_date + 'T00:00:00+09:00');
    for (let dt = new Date(sd); dt <= ed; dt.setDate(dt.getDate() + 1)) {
      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      const dow = dt.getDay();
      const month = dt.getMonth() + 1;
      const firstDow = new Date(dt.getFullYear(), dt.getMonth(), 1).getDay();
      const so = (firstDow + 6) % 7;
      const weekNum = Math.ceil((dt.getDate() + so) / 7);

      if (dow === 0 || dow === 6) {
        dailyStats.push({ date: dateStr, dow, assigned: 0, vacation: 0, unassigned: 0, weekend: true });
        continue;
      }

      const assignedIds = new Set();
      const shiftDetails = [];
      for (const s of (shifts || [])) {
        if (s.month !== month || s.week_number !== weekNum) continue;
        const daysArr = s.days_of_week ? s.days_of_week.split(',').map(Number) : [s.day_of_week];
        if (!daysArr.includes(dow)) continue;
        let assigned = [];
        try { assigned = await api(`/api/regular/shifts/${s.id}/assignments`); } catch {}
        assigned.forEach(a => { assignedIds.add(a.employee_id); empWorkDays[a.name] = (empWorkDays[a.name] || 0) + 1; });
        shiftDetails.push({ name: s.name, time: `${s.planned_clock_in}~${s.planned_clock_out}`, count: assigned.length });
      }

      const vacIds = new Set();
      for (const v of (vacs || [])) {
        if (dateStr >= v.start_date && dateStr <= v.end_date) vacIds.add(v.employee_id);
      }

      const unassigned = allEmps.filter(e => !assignedIds.has(e.id) && !vacIds.has(e.id)).length;
      dailyStats.push({ date: dateStr, dow, assigned: assignedIds.size, vacation: vacIds.size, unassigned, weekend: false, shifts: shiftDetails });
    }

    // Build report
    report.push(`📊 배치 분석 리포트 (${start_date} ~ ${end_date})`);
    report.push(`총 직원: ${allEmps.length}명\n`);

    report.push("=== 일별 현황 ===");
    for (const ds of dailyStats) {
      if (ds.weekend) { report.push(`${ds.date} (${dayNames[ds.dow]}) 주말`); continue; }
      const shiftInfo = ds.shifts?.map(s => `${s.name}(${s.count}명)`).join(', ') || '배치없음';
      const warn = ds.unassigned > 0 ? ` ⚠️ 미배치 ${ds.unassigned}명` : ' ✅';
      report.push(`${ds.date} (${dayNames[ds.dow]}) | 배치 ${ds.assigned}명 | 휴가 ${ds.vacation}명${warn} | ${shiftInfo}`);
    }

    // Workload analysis
    report.push("\n=== 근무 일수 분포 ===");
    const workDayEntries = Object.entries(empWorkDays).sort((a, b) => b[1] - a[1]);
    const avgDays = workDayEntries.length > 0 ? workDayEntries.reduce((s, [,d]) => s + d, 0) / workDayEntries.length : 0;
    report.push(`평균 ${avgDays.toFixed(1)}일`);
    const overworked = workDayEntries.filter(([,d]) => d > avgDays + 2);
    const underworked = workDayEntries.filter(([,d]) => d < avgDays - 2);
    if (overworked.length > 0) report.push(`과다 근무: ${overworked.map(([n,d]) => `${n}(${d}일)`).join(', ')}`);
    if (underworked.length > 0) report.push(`적은 근무: ${underworked.map(([n,d]) => `${n}(${d}일)`).join(', ')}`);

    // Vacation warnings
    report.push("\n=== 휴가 정보 ===");
    const upcomingVacs = (vacs || []).filter(v => v.end_date >= start_date && v.start_date <= end_date);
    if (upcomingVacs.length > 0) {
      for (const v of upcomingVacs) {
        report.push(`${v.employee_name}: ${v.type || '연차'} ${v.start_date}~${v.end_date} (${v.days}일)`);
      }
    } else {
      report.push("해당 기간 승인된 휴가 없음");
    }

    // Remaining vacation balance warnings
    report.push("\n=== 잔여 휴가 알림 ===");
    const lowBalance = (balances || []).filter(b => parseFloat(b.total_days) - parseFloat(b.used_days) <= 2 && parseFloat(b.total_days) > 0);
    if (lowBalance.length > 0) {
      for (const b of lowBalance) {
        report.push(`⚠️ ${b.employee_name}: 잔여 ${(parseFloat(b.total_days) - parseFloat(b.used_days)).toFixed(1)}일`);
      }
    } else {
      report.push("잔여 2일 이하 직원 없음");
    }

    return { content: [{ type: "text", text: report.join('\n') }] };
  }
);

// ===== 배치 생성 =====
server.tool(
  "create_shift",
  "새 배치(시프트)를 생성합니다",
  {
    name: z.string().describe("배치명 (예: A조 오전 4월2주차)"),
    month: z.number().describe("월 (1-12)"),
    week_number: z.number().describe("주차 (1-5)"),
    days_of_week: z.string().describe("요일 (쉼표구분, 0=일 1=월 2=화 3=수 4=목 5=금 6=토, 예: 1,2,3,4,5)"),
    planned_clock_in: z.string().describe("계획 출근 시간 (예: 08:00)"),
    planned_clock_out: z.string().describe("계획 퇴근 시간 (예: 17:00)"),
  },
  async ({ name, month, week_number, days_of_week, planned_clock_in, planned_clock_out }) => {
    const result = await api("/api/regular/shifts", "POST", {
      name, month, week_number, days_of_week,
      day_of_week: parseInt(days_of_week.split(',')[0]),
      planned_clock_in, planned_clock_out,
    });
    return { content: [{ type: "text", text: `배치 생성 완료: ${name} (ID: ${result.id})` }] };
  }
);

// ===== 배치에 직원 배정 =====
server.tool(
  "assign_employees_to_shift",
  "배치(시프트)에 직원을 배정합니다",
  {
    shift_id: z.number().describe("배치 ID"),
    employee_names: z.string().describe("배정할 직원 이름들 (쉼표 구분, 예: 김단니,박서현,이하윤)"),
  },
  async ({ shift_id, employee_names }) => {
    const names = employee_names.split(',').map(n => n.trim());
    const empsData = await api("/api/regular/employees?limit=500");
    const allEmps = empsData.employees || [];
    const ids = [];
    const notFound = [];
    for (const name of names) {
      const emp = allEmps.find(e => e.name === name);
      if (emp) ids.push(emp.id);
      else notFound.push(name);
    }
    if (ids.length === 0) return { content: [{ type: "text", text: `배정할 직원을 찾지 못했습니다: ${notFound.join(', ')}` }] };
    await api(`/api/regular/shifts/${shift_id}/assignments`, "POST", { employee_ids: ids });
    let text = `배치 #${shift_id}에 ${ids.length}명 배정 완료`;
    if (notFound.length > 0) text += `\n찾지 못한 직원: ${notFound.join(', ')}`;
    return { content: [{ type: "text", text }] };
  }
);

// ===== 근태 확정 =====
server.tool(
  "confirm_attendance",
  "근태 데이터를 확정합니다",
  {
    records: z.string().describe("확정할 레코드 JSON 배열 (예: [{employee_type:'정규직', employee_name:'김단니', date:'2026-04-03', confirmed_clock_in:'09:00', confirmed_clock_out:'18:00', source:'planned', regular_hours:8, overtime_hours:0, night_hours:0, break_hours:1, year_month:'2026-04'}])"),
  },
  async ({ records }) => {
    const parsed = JSON.parse(records);
    const result = await api("/api/regular/attendance-confirm", "POST", { records: parsed });
    return { content: [{ type: "text", text: `${result.confirmed}건 확정 완료` }] };
  }
);

// ===== 휴가 반려 =====
server.tool(
  "reject_vacation",
  "휴가 신청을 반려합니다",
  {
    request_id: z.number().describe("휴가 신청 ID"),
    reason: z.string().describe("반려 사유"),
  },
  async ({ request_id, reason }) => {
    const result = await api(`/api/regular/vacations/${request_id}/reject`, "PUT", { admin_memo: reason });
    return { content: [{ type: "text", text: result.success ? `휴가 #${request_id} 반려 완료` : "반려 실패" }] };
  }
);

// ===== 직원 정보 수정 =====
server.tool(
  "update_employee",
  "정규직 직원 정보를 수정합니다",
  {
    employee_id: z.number().describe("직원 ID"),
    department: z.string().optional().describe("부서"),
    team: z.string().optional().describe("조"),
    role: z.string().optional().describe("직책"),
  },
  async ({ employee_id, department, team, role }) => {
    const body = {};
    if (department) body.department = department;
    if (team) body.team = team;
    if (role) body.role = role;
    await api(`/api/regular/employees/${employee_id}`, "PUT", body);
    return { content: [{ type: "text", text: `직원 #${employee_id} 정보 수정 완료` }] };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
