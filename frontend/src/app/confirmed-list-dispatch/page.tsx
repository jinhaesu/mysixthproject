"use client";

import React, { useState, useCallback, useEffect } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import { Table2, Loader2, Edit3, Trash2 } from "lucide-react";
import { getConfirmedList, updateConfirmedRecord, deleteConfirmedRecord, updateConfirmedRecordType, getWorkers } from "@/lib/api";

const fmt = new Intl.NumberFormat('ko-KR');

const HOLIDAYS: Record<number, string[]> = {
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-05-05','2026-05-24','2026-06-06','2026-08-15','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
};
function isHolidayOrWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return (HOLIDAYS[d.getFullYear()] || []).includes(dateStr);
}
// 출근: 30분 올림, 퇴근: 30분 내림
const ceil30Min = (min: number) => Math.ceil(min / 30) * 30;
const floor30Min = (min: number) => Math.floor(min / 30) * 30;

function calcFromTimes(clockIn: string, clockOut: string, date: string) {
  if (!clockIn || !clockOut) return { regular: 0, overtime: 0, night: 0, breakH: 0 };
  const [h1, m1] = clockIn.split(':').map(Number);
  const [h2, m2] = clockOut.split(':').map(Number);
  if (isNaN(h1) || isNaN(h2)) return { regular: 0, overtime: 0, night: 0, breakH: 0 };
  const startMin = ceil30Min(h1 * 60 + (m1 || 0));
  let endMin = floor30Min(h2 * 60 + (m2 || 0));
  if (endMin <= startMin) endMin += 1440; // 야간조 자정 넘김
  const totalMin = endMin - startMin;
  const totalH = totalMin / 60;
  let breakH = 0;
  if (totalH >= 8) breakH = 1;
  else if (totalH >= 4) breakH = 0.5;
  const workH = Math.max(totalH - breakH, 0);
  let nightMin = 0;
  for (let min = startMin; min < endMin; min++) {
    const h = Math.floor(min / 60) % 24;
    if (h >= 22 || h < 6) nightMin++;
  }
  const nightH = Math.round(nightMin / 60 * 10) / 10;
  const dayWork = Math.max(workH - nightH, 0); // 야간 분리
  if (isHolidayOrWeekend(date)) return { regular: 0, overtime: Math.round(dayWork * 10) / 10, night: nightH, breakH };
  return { regular: Math.round(Math.min(dayWork, 8) * 10) / 10, overtime: Math.round(Math.max(dayWork - 8, 0) * 10) / 10, night: nightH, breakH };
}

// 캐시 제거 — 매번 신규 조회로 stale 데이터 이슈 원천 차단
const normalizePhone = (p: string | null | undefined) => (p || '').replace(/[-\s]/g, '').trim();
// NOTE: 이름 괄호 suffix('수빈(HO THI BICH)')는 별개 사람일 수 있어 절대 병합하지 않음.

export default function ConfirmedListDispatchPage() {
  const [yearMonth, setYearMonth] = usePersistedState("cld_yearMonth", (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })());
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [nameSearch, setNameSearch] = usePersistedState("cld_nameSearch", "");
  const [deptFilter, setDeptFilter] = usePersistedState("cld_deptFilter", "");
  const [typeFilter, setTypeFilter] = usePersistedState("cld_typeFilter", "");
  // workers.category lookup maps (phone/name → category), built client-side.
  // Makes classification independent of backend deploy state.
  const [catMap, setCatMap] = useState<Map<string, string>>(new Map());
  const [wIdByPhone, setWIdByPhone] = useState<Map<string, number>>(new Map());
  const [wIdByName, setWIdByName] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch workers AND confirmed records in parallel
      const [workersResp, d] = await Promise.all([
        getWorkers({ limit: '10000' }).catch(() => ({ workers: [] })),
        getConfirmedList(yearMonth, ''),
      ]);
      // Build lookup maps (phone 우선, name은 정확 일치만 — 괄호 suffix 정규화 금지)
      const cm = new Map<string, string>();
      const pm = new Map<string, number>();
      const nm = new Map<string, number>();
      const workersList = (workersResp as any).workers || (workersResp as any) || [];
      for (const w of workersList) {
        const np = normalizePhone(w.phone || '');
        if (w.category) {
          if (np) cm.set(np, w.category);
          if (w.phone) cm.set(w.phone, w.category);
          if (w.name_ko) cm.set(w.name_ko, w.category);
        }
        if (w.id) {
          if (np) pm.set(np, w.id);
          if (w.name_ko) nm.set(w.name_ko, w.id);
        }
      }
      setCatMap(cm);
      setWIdByPhone(pm);
      setWIdByName(nm);
      const filtered = (d || []).filter((e: any) => e.type !== '정규직');
      setData(filtered);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, [yearMonth]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!editingId) return;
    try { await updateConfirmedRecord(editingId, editForm); setEditingId(null); load(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#F7F8F8] flex items-center gap-2">
          <Table2 className="w-6 h-6 text-[#7070FF]" />
          사업소득(알바)/파견 근태 정보 확정 리스트
        </h1>
        <p className="text-sm text-[#8A8F98] mt-1">확정된 근태 정보를 확인하고 최종 수정합니다.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">연월</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">부서</label>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]">
            <option value="">전체</option>
            <option value="물류">물류</option>
            <option value="생산2층">생산2층</option>
            <option value="생산3층">생산3층</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">분류</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 border border-[#23252A] rounded-lg text-sm bg-[#0F1011]">
            <option value="">전체</option>
            <option value="파견">파견</option>
            <option value="알바">사업소득(알바)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#8A8F98] mb-1">이름 검색</label>
          <input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)} placeholder="이름"
            className="px-3 py-2 border border-[#23252A] rounded-lg text-sm w-28" />
        </div>
        <button onClick={() => load()} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">조회</button>
      </div>

      {loading ? (
        <div className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin text-[#7070FF] mx-auto" /></div>
      ) : data.length === 0 ? (
        <div className="bg-[#0F1011] rounded-xl border py-16 text-center text-sm text-[#62666D]">확정된 데이터가 없습니다.</div>
      ) : (() => {
        // 레코드 단위 분류: 이 페이지가 source of truth.
        // 로직 = settlement endpoint의 getEffectiveType과 동일:
        //   1. employee_type이 '파견'/'알바'/'사업소득'이면 그대로 사용
        //   2. 비어있거나 기타값이면 workers.category fallback (phone/name lookup)
        const passesFilters = (e: any) =>
          (!nameSearch || (e.name || '').includes(nameSearch)) &&
          (!deptFilter || (e.department || '').includes(deptFilter));
        const normType = (t: string | null | undefined): string => {
          const s = (t || '').toString();
          if (!s) return '';
          if (s.includes('파견')) return '파견';
          if (s.includes('알바') || s.includes('사업소득')) return '알바';
          if (s.includes('정규')) return '정규직';
          return '';
        };
        const computeEffType = (r: any): string => {
          // 명시값 우선: employee_type이 비어있지 않으면 그 값을 사용 (정규직 등 포함)
          // workers.category가 '알바'여도 레코드의 '정규직'을 덮지 않음
          const raw = (r.employee_type || '').toString().trim();
          if (raw) {
            return normType(raw) || '?';
          }
          // 빈 값일 때만 workers.category fallback
          const np = normalizePhone(r.employee_phone || '');
          const cat = catMap.get(np) || catMap.get(r.employee_phone) ||
                      catMap.get(r.employee_name) || '';
          return normType(cat) || '?';
        };
        // Identity: 이름 기준 (다른 이름이면 다른 사람으로 취급 — 수빈 vs 수빈(HO THI BICH) 분리)
        const canonicalId = (r: any): string => {
          const name = r.employee_name || '';
          if (name) return `n:${name}`;
          const np = normalizePhone(r.employee_phone || '');
          return np ? `p:${np}` : '';
        };
        const isTypeMatch = (t: string) => !typeFilter || t === typeFilter;

        // 필터 통과 레코드만 대상으로 사람 단위 재집계 (employee key = phone|type)
        type Bucket = { name: string; phone: string; type: string; department: string;
          days: number; regular_hours: number; overtime_hours: number; night_hours: number;
          break_hours: number; holiday_days: number; records: any[]; };
        const bucketMap = new Map<string, Bucket>();
        const totals = { regular: 0, overtime: 0, night: 0,
          regByType: {} as Record<string, number>,
          otByType: {} as Record<string, number>,
          ntByType: {} as Record<string, number> };

        // 중복 방지용 id set
        const seenRecordIds = new Set<any>();
        for (const e of data) {
          if (!passesFilters(e)) continue;
          for (const r of (e.records || [])) {
            if (r.id != null && seenRecordIds.has(r.id)) continue;
            if (r.id != null) seenRecordIds.add(r.id);
            // 클라이언트 단독 분류 (backend effective_type 무시)
            const t = computeEffType(r);
            // 진단용: 레코드에 effective_type 복사해서 상세 뷰가 읽을 수 있게
            (r as any).__computed_type = t;
            if (t === '정규직') continue;
            const reg = parseFloat(r.regular_hours) || 0;
            const ot = parseFloat(r.overtime_hours) || 0;
            const nt = parseFloat(r.night_hours) || 0;
            const br = parseFloat(r.break_hours) || 0;
            const k = t === '파견' ? 'dispatch' : t === '알바' ? 'alba' : 'other';
            totals.regByType[k] = (totals.regByType[k] || 0) + reg;
            totals.otByType[k] = (totals.otByType[k] || 0) + ot;
            totals.ntByType[k] = (totals.ntByType[k] || 0) + nt;
            if (!isTypeMatch(t)) continue;
            totals.regular += reg;
            totals.overtime += ot;
            totals.night += nt;
            // canonical identity 기준으로 사람 단위 병합
            const key = `${canonicalId({ employee_phone: r.employee_phone ?? e.phone, employee_name: r.employee_name ?? e.name })}|${t}`;
            if (!bucketMap.has(key)) {
              bucketMap.set(key, {
                name: r.employee_name || e.name,
                phone: r.employee_phone || e.phone,
                type: t,
                department: e.department || '',
                days: 0, regular_hours: 0, overtime_hours: 0, night_hours: 0,
                break_hours: 0, holiday_days: 0, records: [],
              });
            }
            const b = bucketMap.get(key)!;
            b.days++;
            b.regular_hours += reg;
            b.overtime_hours += ot;
            b.night_hours += nt;
            b.break_hours += br;
            b.holiday_days += r.holiday_work ? 1 : 0;
            b.records.push(r);
          }
        }
        const filtered = Array.from(bucketMap.values());
        return (
        <>
          {/* Stats Board - filter 적용 시 해당 분류만 표시 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-[#0F1011] rounded-xl border border-[#23252A] p-4 text-center">
              <p className="text-2xl font-bold text-[#F7F8F8]">{filtered.length}</p>
              <p className="text-xs text-[#8A8F98] mt-1">근무자 {typeFilter ? `(${typeFilter})` : '(전체)'}</p>
            </div>
            <div className="bg-[#0F1011] rounded-xl border border-[#5E6AD2]/30 p-4 text-center">
              <p className="text-2xl font-bold text-[#828FFF]">{totals.regular.toFixed(1)}</p>
              <p className="text-xs text-[#8A8F98] mt-1">기본시간(h)</p>
              <p className="text-[10px] text-[#62666D] mt-0.5">파견 {(totals.regByType.dispatch || 0).toFixed(1)} / 알바 {(totals.regByType.alba || 0).toFixed(1)}</p>
            </div>
            <div className="bg-[#0F1011] rounded-xl border border-[#F0BF00]/30 p-4 text-center">
              <p className="text-2xl font-bold text-[#F0BF00]">{totals.overtime.toFixed(1)}</p>
              <p className="text-xs text-[#8A8F98] mt-1">연장시간(h)</p>
              <p className="text-[10px] text-[#62666D] mt-0.5">파견 {(totals.otByType.dispatch || 0).toFixed(1)} / 알바 {(totals.otByType.alba || 0).toFixed(1)}</p>
            </div>
            <div className="bg-[#0F1011] rounded-xl border border-[#5E6AD2]/30 p-4 text-center">
              <p className="text-2xl font-bold text-[#828FFF]">{totals.night.toFixed(1)}</p>
              <p className="text-xs text-[#8A8F98] mt-1">야간시간(h)</p>
              <p className="text-[10px] text-[#62666D] mt-0.5">파견 {(totals.ntByType.dispatch || 0).toFixed(1)} / 알바 {(totals.ntByType.alba || 0).toFixed(1)}</p>
            </div>
          </div>

          {/* Summary Table */}
          <div className="bg-[#0F1011] rounded-xl border border-[#23252A] overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#08090A] text-left">
                  <th className="py-2 px-4 font-medium text-[#8A8F98]">이름</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98]">연락처</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">근무일</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">기본(h)</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">연장(h)</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">야간(h)</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">휴게(h)</th>
                  <th className="py-2 px-4 font-medium text-[#8A8F98] text-right">휴일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp: any) => {
                  const rowKey = `${emp.name}|${emp.type}`;
                  const isExpanded = expandedEmp === rowKey;
                  return (
                    <React.Fragment key={rowKey}>
                      <tr className={`hover:bg-[#141516]/5 cursor-pointer border-b border-[#23252A] ${isExpanded ? 'bg-[#5E6AD2]/10' : ''}`} onClick={() => setExpandedEmp(isExpanded ? null : rowKey)}>
                        <td className="py-2.5 px-4 font-medium text-[#F7F8F8]">
                          {emp.name}
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${emp.type === '파견' ? 'bg-[#4EA7FC]/10 text-[#828FFF]' : emp.type === '알바' ? 'bg-[#FC7840]/10 text-[#FC7840]' : 'bg-[#141516] text-[#8A8F98]'}`}>{emp.type || '?'}</span>
                          {emp.department && <span className="ml-1 text-[10px] text-[#8A8F98]">{emp.department}</span>}
                        </td>
                        <td className="py-2.5 px-4 text-[#8A8F98]">{emp.phone}</td>
                        <td className="py-2.5 px-4 text-right">{emp.days}</td>
                        <td className="py-2.5 px-4 text-right text-[#828FFF]">{emp.regular_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-[#F0BF00]">{emp.overtime_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-[#828FFF]">{emp.night_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-[#8A8F98]">{emp.break_hours.toFixed(1)}</td>
                        <td className="py-2.5 px-4 text-right text-[#EB5757]">{emp.holiday_days}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <div className="bg-[#5E6AD2]/10 border-b border-[#5E6AD2]/30">
                              <div className="px-4 py-2 bg-[#5E6AD2]/10 border-b border-[#5E6AD2]/30 flex items-center justify-between">
                                <span className="text-xs font-semibold text-[#828FFF]">{emp.name} 일별 상세</span>
                                <span className="text-[10px] text-[#7070FF]">타입 뱃지 클릭 → 드롭다운에서 변경 가능</span>
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-[#08090A]/80 text-left">
                                    <th className="py-1.5 px-3">날짜</th>
                                    <th className="py-1.5 px-3">타입</th>
                                    <th className="py-1.5 px-3">출근</th>
                                    <th className="py-1.5 px-3">퇴근</th>
                                    <th className="py-1.5 px-3">기준</th>
                                    <th className="py-1.5 px-3 text-right">기본</th>
                                    <th className="py-1.5 px-3 text-right">연장</th>
                                    <th className="py-1.5 px-3 text-right">야간</th>
                                    <th className="py-1.5 px-3 text-right">휴게</th>
                                    <th className="py-1.5 px-3">관리</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#23252A]">
                                  {(emp.records || []).map((r: any) => {
                                    const rawType = r.employee_type || '';
                                    const effType = (r as any).__computed_type || r.effective_type || '(미분류)';
                                    const typeColor = rawType === '파견' ? 'bg-[#4EA7FC]/10 text-[#828FFF] border-[#5E6AD2]/30'
                                      : (rawType === '알바' || rawType === '사업소득') ? 'bg-[#FC7840]/10 text-[#FC7840] border-[#FC7840]/30'
                                      : rawType === '정규직' ? 'bg-[#5E6AD2]/10 text-[#828FFF] border-[#5E6AD2]/30'
                                      : 'bg-[#EB5757]/10 text-[#EB5757] border-[#EB5757]/30';
                                    return (
                                    <tr key={r.id} className="hover:bg-[#141516]/60">
                                      <td className="py-1.5 px-3">{r.date}</td>
                                      <td className="py-1.5 px-3">
                                        <select
                                          value={rawType}
                                          onChange={async (e) => {
                                            const newType = e.target.value;
                                            try {
                                              await updateConfirmedRecordType(r.id, newType);
                                              load();
                                            } catch (err: any) { alert(err.message || '타입 변경 실패'); }
                                          }}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${typeColor} cursor-pointer`}
                                          title={`raw: ${rawType || '(빈값)'} | effective: ${effType}`}
                                        >
                                          <option value="">(빈값)</option>
                                          <option value="파견">파견</option>
                                          <option value="알바">알바</option>
                                          <option value="사업소득">사업소득</option>
                                          <option value="정규직">정규직</option>
                                        </select>
                                        <span className="ml-1 text-[9px] text-[#8A8F98]">→{effType}</span>
                                      </td>
                                      <td className="py-1.5 px-3">{editingId === r.id ? <input type="time" value={editForm.confirmed_clock_in} onChange={e => {
                                        const ci = e.target.value; const calc = calcFromTimes(ci, editForm.confirmed_clock_out, r.date);
                                        setEditForm({...editForm, confirmed_clock_in: ci, regular_hours: calc.regular, overtime_hours: calc.overtime, night_hours: calc.night, break_hours: calc.breakH});
                                      }} className="w-20 px-1 py-0.5 border rounded text-xs" /> : r.confirmed_clock_in}</td>
                                      <td className="py-1.5 px-3">{editingId === r.id ? <input type="time" value={editForm.confirmed_clock_out} onChange={e => {
                                        const co = e.target.value; const calc = calcFromTimes(editForm.confirmed_clock_in, co, r.date);
                                        setEditForm({...editForm, confirmed_clock_out: co, regular_hours: calc.regular, overtime_hours: calc.overtime, night_hours: calc.night, break_hours: calc.breakH});
                                      }} className="w-20 px-1 py-0.5 border rounded text-xs" /> : r.confirmed_clock_out}</td>
                                      <td className="py-1.5 px-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.source === 'actual' ? 'bg-[#27A644]/10 text-[#27A644]' : 'bg-[#4EA7FC]/10 text-[#828FFF]'}`}>{r.source === 'actual' ? '실제' : '계획'}</span></td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-[#828FFF] font-medium">{editForm.regular_hours}</span> : parseFloat(r.regular_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-[#F0BF00] font-medium">{editForm.overtime_hours}</span> : parseFloat(r.overtime_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-[#828FFF] font-medium">{editForm.night_hours}</span> : parseFloat(r.night_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3 text-right">{editingId === r.id ? <span className="text-xs text-[#8A8F98]">{editForm.break_hours}</span> : parseFloat(r.break_hours).toFixed(1)}</td>
                                      <td className="py-1.5 px-3">
                                        {editingId === r.id ? (
                                          <div className="flex gap-1">
                                            <button onClick={handleSave} className="px-1.5 py-0.5 bg-[#5E6AD2] text-white rounded text-[10px]">저장</button>
                                            <button onClick={() => setEditingId(null)} className="px-1.5 py-0.5 bg-[#141516] rounded text-[10px]">취소</button>
                                          </div>
                                        ) : (
                                          <div className="flex gap-1">
                                            <button onClick={() => { setEditingId(r.id); setEditForm({ confirmed_clock_in: r.confirmed_clock_in, confirmed_clock_out: r.confirmed_clock_out, regular_hours: parseFloat(r.regular_hours), overtime_hours: parseFloat(r.overtime_hours), night_hours: parseFloat(r.night_hours), break_hours: parseFloat(r.break_hours) }); }}
                                              className="p-1 text-[#7070FF] hover:bg-[#4EA7FC]/10 rounded"><Edit3 className="w-3 h-3" /></button>
                                            <button onClick={async () => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteConfirmedRecord(r.id); load(); } catch (e: any) { alert(e.message); } }}
                                              className="p-1 text-[#EB5757] hover:bg-[#EB5757]/10 rounded"><Trash2 className="w-3 h-3" /></button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        );
      })()}
    </div>
  );
}
