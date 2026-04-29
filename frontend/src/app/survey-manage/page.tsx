"use client";

import { useEffect, useState, useCallback } from "react";
import { usePersistedState } from "@/lib/usePersistedState";
import {
  getSurveyWorkplaces,
  createSurveyWorkplace,
  updateSurveyWorkplace,
  deleteSurveyWorkplace,
  sendSurvey,
  sendSurveyBatch,
  getSurveyResponses,
  getSurveyRequests,
  exportSurveyExcel,
  getSurveyStats,
  resendSurvey,
  updateSurveyResponseTime,
  batchEditResponseTime,
  batchDeleteResponses,
  triggerReminders,
  getSafetyNotices,
  createSafetyNotice,
  updateSafetyNotice,
  deleteSafetyNotice,
  sendSafetyNotice,
  runScheduler,
  getWorkers,
  updateWorker,
  deleteWorker,
} from "@/lib/api";
import {
  Send,
  Download,
  Plus,
  Trash2,
  Edit3,
  MapPin,
  Check,
  X,
  Phone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  MessageSquare,
  Users,
  ClipboardList,
  Building2,
  Bell,
  ShieldAlert,
  Contact,
} from "lucide-react";

import { PageHeader, Badge, Button, Card, Input, Select, Textarea, Field, SkeletonCard, EmptyState, Tabs, CenterSpinner, useToast } from "@/components/ui";

type Tab = "send" | "responses" | "workplaces" | "safety" | "workers";

interface Workplace {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

function formatPlannedTime(time: string | null): string {
  if (!time) return "-";
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h < 12 ? "오전" : "오후";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type StatusTone = "brand" | "info" | "warning" | "success" | "neutral";
const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  scheduled: { label: "예약됨",   tone: "brand" },
  sent:      { label: "발송완료", tone: "info" },
  clock_in:  { label: "출근완료", tone: "warning" },
  completed: { label: "퇴근완료", tone: "success" },
  expired:   { label: "만료",     tone: "neutral" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, tone: "neutral" as StatusTone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export default function SurveyManagePage() {
  const toast = useToast();
  const [tab, setTab] = usePersistedState<Tab>("sm_tab", "send");

  const tabs: { key: Tab; label: string; icon: typeof Send }[] = [
    { key: "send", label: "설문 발송", icon: MessageSquare },
    { key: "responses", label: "응답 조회", icon: ClipboardList },
    { key: "workplaces", label: "근무지 관리", icon: Building2 },
    { key: "safety", label: "안전위생 안내", icon: ShieldAlert },
    { key: "workers", label: "직원 관리", icon: Contact },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="설문 출퇴근 관리"
        description="단기 근무자에게 설문을 발송하고, 출퇴근 기록을 관리합니다."
      />

      {/* Tabs */}
      <div className="border-b border-[var(--border-1)] mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 pb-3 text-[var(--fs-body)] font-medium border-b-2 transition-colors ${
                  active
                    ? "border-[var(--brand-500)] text-[var(--brand-400)]"
                    : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)] hover:border-[var(--border-2)]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-w-0">
        {tab === "send" && <SendTab />}
        {tab === "responses" && <ResponsesTab />}
        {tab === "workplaces" && <WorkplacesTab />}
        {tab === "safety" && <SafetyTab />}
        {tab === "workers" && <WorkersTab />}
      </div>
    </div>
  );
}

// ===== Send Tab =====
function SendTab() {
  const toast = useToast();
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'));
  const [workplaceId, setWorkplaceId] = useState<number | null>(null);
  const [messageType, setMessageType] = useState("sms");
  const [sending, setSending] = useState(false);
  const [bulkPhones, setBulkPhones] = useState("");
  const [recentSends, setRecentSends] = useState<any[]>([]);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [department, setDepartment] = useState("");
  const [recentSearch, setRecentSearch] = useState("");
  const [recentDateStart, setRecentDateStart] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [recentDateEnd, setRecentDateEnd] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [recentDeptFilter, setRecentDeptFilter] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [statsDeptFilter, setStatsDeptFilter] = useState("");
  const [reminderHours, setReminderHours] = useState(2);
  const [reminding, setReminding] = useState(false);
  const [reminderResult, setReminderResult] = useState<any>(null);
  const [plannedClockIn, setPlannedClockIn] = useState("");
  const [plannedClockOut, setPlannedClockOut] = useState("");
  const [scheduleType, setScheduleType] = useState<'immediate' | 'single' | 'range'>('immediate');
  const [scheduledAt, setScheduledAt] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });
  const [rangeStart, setRangeStart] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [rangeDailyTime, setRangeDailyTime] = useState("08:00");

  useEffect(() => {
    getSurveyWorkplaces().then(setWorkplaces).catch(console.error);
    getSurveyStats().then(setStats).catch(console.error);
    loadRecentSends();
  }, []);

  useEffect(() => {
    getSurveyStats(statsDeptFilter || undefined).then(setStats).catch(console.error);
  }, [statsDeptFilter]);

  const loadRecentSends = async () => {
    try {
      const params: Record<string, string> = { limit: "200" };
      if (recentDateStart) params.startDate = recentDateStart;
      if (recentDateEnd) params.endDate = recentDateEnd;
      if (recentDeptFilter) params.department = recentDeptFilter;
      if (recentSearch) params.search = recentSearch;
      const data = await getSurveyRequests(params);
      setRecentSends(data);
    } catch {}
  };

  const handleSend = async () => {
    if (!phone.trim()) { toast.info("전화번호를 입력해주세요."); return; };
    if (workplaceId === null) { toast.info("근무지를 선택해주세요."); return; };
    if (!department) { toast.info("배정 파트를 선택해주세요."); return; };
    if (!plannedClockIn || !plannedClockOut) { toast.info("계획 출퇴근 시간을 입력해주세요."); return; };
    setSending(true);
    try {
      const schedParams: any = {};
      if (scheduleType === 'single') {
        schedParams.scheduled_at = new Date(scheduledAt).toISOString();
      } else if (scheduleType === 'range') {
        schedParams.schedule_range = { start_date: rangeStart, end_date: rangeEnd, daily_time: rangeDailyTime };
      }
      const result = await sendSurvey({ phone: phone.trim(), date, workplace_id: workplaceId, message_type: messageType, department, planned_clock_in: plannedClockIn || undefined, planned_clock_out: plannedClockOut || undefined, ...schedParams });
      if (result.scheduled_range) {
        toast.success(`${result.count}일간 기간 예약 완료`);
        setPhone("");
      } else if (result.scheduled) {
        toast.success("설문이 예약되었습니다.");
        setPhone("");
      } else if (result.message && !result.message.success) {
        toast.error(`발송 실패: ${result.message.error || '알 수 없는 오류'}`);
      } else {
        toast.success("설문이 발송되었습니다.");
        setPhone("");
      }
      loadRecentSends();
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  const handleBatchSend = async () => {
    const phones = bulkPhones.split("\n").map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) { toast.info("전화번호를 입력해주세요."); return; };
    if (workplaceId === null) { toast.info("근무지를 선택해주세요."); return; };
    if (!department) { toast.info("배정 파트를 선택해주세요."); return; };
    if (!plannedClockIn || !plannedClockOut) { toast.info("계획 출퇴근 시간을 입력해주세요."); return; };
    setSending(true);
    try {
      const schedParams: any = {};
      if (scheduleType === 'single') {
        schedParams.scheduled_at = new Date(scheduledAt).toISOString();
      } else if (scheduleType === 'range') {
        schedParams.schedule_range = { start_date: rangeStart, end_date: rangeEnd, daily_time: rangeDailyTime };
      }
      const result = await sendSurveyBatch({ phones, date, workplace_id: workplaceId, message_type: messageType, department, planned_clock_in: plannedClockIn || undefined, planned_clock_out: plannedClockOut || undefined, ...schedParams });
      if (result.scheduled_range) {
        toast.success(`${result.count}건 기간 예약 완료`);
      } else {
        toast.success(result.scheduled ? `${result.total}건 예약 완료` : `${result.total}건 발송 완료`);
      }
      setBulkPhones("");
      loadRecentSends();
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  const handleRemind = async () => {
    setReminding(true);
    try {
      const result = await triggerReminders(date, reminderHours);
      setReminderResult(result);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setReminding(false);
    }
  };

  const bulkCount = bulkPhones.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[var(--fs-caption)] font-medium text-[var(--text-3)]">파트별 현황:</span>
            <Select
              value={statsDeptFilter}
              onChange={(e) => setStatsDeptFilter(e.target.value)}
              inputSize="sm"
              className="w-28"
            >
              <option value="">전체</option>
              <option value="물류">물류</option>
              <option value="생산2층">생산2층</option>
              <option value="생산3층">생산3층</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card padding="md" className="hover-lift text-center fade-in">
              <p className="text-2xl font-bold text-[var(--text-1)] tabular">{stats.today || 0}</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">오늘 발송</p>
            </Card>
            <Card padding="md" className="hover-lift text-center fade-in" style={{ borderColor: "var(--brand-500)" }}>
              <p className="text-2xl font-bold text-[var(--brand-400)] tabular">{stats.todayByStatus?.sent || 0}</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">대기중</p>
            </Card>
            <Card padding="md" className="hover-lift text-center fade-in" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
              <p className="text-2xl font-bold text-[var(--warning-fg)] tabular">{stats.todayByStatus?.clock_in || 0}</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">출근완료</p>
            </Card>
            <Card padding="md" className="hover-lift text-center fade-in" style={{ background: "var(--success-bg)", borderColor: "var(--success-border)" }}>
              <p className="text-2xl font-bold text-[var(--success-fg)] tabular">{stats.todayByStatus?.completed || 0}</p>
              <p className="text-[var(--fs-caption)] text-[var(--text-3)] mt-1">퇴근완료</p>
            </Card>
          </div>
        </div>
      )}

      {/* Send Form Card */}
      <Card padding="none" className="overflow-hidden fade-in">
        {/* Common Settings */}
        <div className="p-5 border-b border-[var(--border-1)]">
          <h2 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] mb-4">발송 설정</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="근무일">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                inputSize="md"
              />
            </Field>
            <Field label="근무지" required>
              <Select
                value={workplaceId ?? ""}
                onChange={(e) => setWorkplaceId(e.target.value ? parseInt(e.target.value) : null)}
                inputSize="md"
              >
                <option value="">근무지를 선택하세요 (필수)</option>
                {workplaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </Select>
            </Field>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">배정 파트 <span className="text-[var(--danger-fg)]">*</span></label>
              <Select value={department} onChange={(e) => setDepartment(e.target.value)} inputSize="md">
                <option value="">파트 선택 (필수)</option>
                <option value="물류">물류</option>
                <option value="생산2층">생산2층</option>
                <option value="생산3층">생산3층</option>
                <option value="카페(해방촌)">카페(해방촌)</option>
                <option value="카페(행궁동)">카페(행궁동)</option>
                <option value="카페(경복궁)">카페(경복궁)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">계획 출근시간 <span className="text-[var(--danger-fg)]">*</span></label>
              <Input type="time" value={plannedClockIn}
                onChange={(e) => setPlannedClockIn(e.target.value)}
                inputSize="md" className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">계획 퇴근시간 <span className="text-[var(--danger-fg)]">*</span></label>
              <Input type="time" value={plannedClockOut}
                onChange={(e) => setPlannedClockOut(e.target.value)}
                inputSize="md" className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">발송 방법</label>
              <div className="flex gap-4 pt-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="sms"
                    checked={messageType === "sms"}
                    onChange={(e) => setMessageType(e.target.value)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-[var(--text-2)]">문자(SMS)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="kakao"
                    checked={messageType === "kakao"}
                    onChange={(e) => setMessageType(e.target.value)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-[var(--text-2)]">카카오톡</span>
                </label>
              </div>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-[var(--border-1)] mt-2">
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="schedType" value="immediate" checked={scheduleType === 'immediate'}
                  onChange={() => setScheduleType('immediate')} className="accent-blue-600" />
                <span className="text-sm text-[var(--text-2)]">즉시 발송</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="schedType" value="single" checked={scheduleType === 'single'}
                  onChange={() => setScheduleType('single')} className="accent-blue-600" />
                <span className="text-sm text-[var(--text-2)]">예약 발송</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="schedType" value="range" checked={scheduleType === 'range'}
                  onChange={() => setScheduleType('range')} className="accent-blue-600" />
                <span className="text-sm text-[var(--text-2)]">기간 예약</span>
              </label>
            </div>

            {scheduleType === 'single' && (
              <div className="flex items-center gap-2">
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                  inputSize="sm" />
              </div>
            )}

            {scheduleType === 'range' && (
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
                  inputSize="sm" />
                <span className="text-[var(--text-4)]">~</span>
                <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}
                  inputSize="sm" />
                <Input type="time" value={rangeDailyTime} onChange={(e) => setRangeDailyTime(e.target.value)}
                  inputSize="sm" />
                <span className="text-xs text-[var(--text-3)]">매일 발송</span>
              </div>
            )}

          </div>
        </div>

        {/* Mode Toggle + Input */}
        <div className="p-5">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("single")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "single"
                  ? "bg-[var(--brand-500)] text-white"
                  : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
              }`}
            >
              개별 발송
            </button>
            <button
              onClick={() => setMode("batch")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "batch"
                  ? "bg-[var(--brand-500)] text-white"
                  : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
              }`}
            >
              일괄 발송
            </button>
          </div>

          {mode === "single" ? (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">전화번호</label>
                <Input type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  inputSize="md" className="w-full"
                />
              </div>
              <Button
                variant="primary" size="md"
                onClick={handleSend}
                disabled={sending || !phone.trim()}
                loading={sending}
                leadingIcon={<Send className="w-4 h-4" />}
              >
                발송
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
                  전화번호 목록 <span className="text-[var(--text-4)]">(줄바꿈으로 구분)</span>
                </label>
                <Textarea value={bulkPhones}
                  onChange={(e) => setBulkPhones(e.target.value)}
                  placeholder={"010-1234-5678\n010-9876-5432\n010-1111-2222"}
                  rows={5}
                  className="w-full font-mono"
                />
              </div>
              <Button
                variant="primary" size="md"
                onClick={handleBatchSend}
                disabled={sending || bulkCount === 0}
                loading={sending}
                leadingIcon={<Send className="w-4 h-4" />}
              >
                {bulkCount}건 일괄 발송
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Recent Sends */}
      <Card padding="none" className="overflow-hidden fade-in">
        <div className="px-5 py-4 border-b border-[var(--border-1)] space-y-3">
          <h2 className="text-base font-semibold text-[var(--text-1)]">발송 내역</h2>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-[10px] text-[var(--text-3)] mb-0.5">시작일</label>
              <Input type="date" value={recentDateStart} onChange={e => setRecentDateStart(e.target.value)} inputSize="sm" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-3)] mb-0.5">종료일</label>
              <Input type="date" value={recentDateEnd} onChange={e => setRecentDateEnd(e.target.value)} inputSize="sm" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-3)] mb-0.5">부서</label>
              <Select value={recentDeptFilter} onChange={e => setRecentDeptFilter(e.target.value)} inputSize="sm">
                <option value="">전체</option>
                <option value="물류">물류</option>
                <option value="생산2층">생산2층</option>
                <option value="생산3층">생산3층</option>
                <option value="카페(해방촌)">카페(해방촌)</option>
                <option value="카페(행궁동)">카페(행궁동)</option>
                <option value="카페(경복궁)">카페(경복궁)</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-3)] mb-0.5">검색</label>
              <Input type="text" value={recentSearch} onChange={e => setRecentSearch(e.target.value)} placeholder="이름/번호" inputSize="sm" className="w-24" />
            </div>
            <Button variant="primary" size="xs" onClick={loadRecentSends}>조회</Button>
          </div>
        </div>

        {recentSends.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users className="w-10 h-10 text-[var(--text-4)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-3)]">발송 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-canvas)] text-left">
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">전화번호</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">근무일</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">근무지</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">배정파트</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">이름</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">출근</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">퇴근</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">상태</th>
                  <th className="py-2.5 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {recentSends.map((r: any) => (
                  <tr key={r.id} className="hover:bg-[var(--bg-2)]">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-[var(--text-2)]">
                        <Phone className="w-3.5 h-3.5 text-[var(--text-4)] shrink-0" />
                        {r.phone}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">{r.date}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)]">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)]">{r.department || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[var(--text-1)]">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">
                      {r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">
                      {r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex gap-1">
                        {(r.status === 'sent' || r.status === 'expired') && (
                          <button
                            onClick={async () => {
                              try {
                                await resendSurvey(r.id);
                                toast.success('재발송 완료');
                                loadRecentSends();
                                getSurveyStats().then(setStats);
                              } catch (err: any) { toast.error(err.message || "오류가 발생했습니다."); }
                            }}
                            className="px-2 py-1 text-xs font-medium text-[var(--brand-400)] bg-[var(--info-fg)]/10 rounded hover:bg-[var(--info-fg)]/15"
                          >
                            재발송
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm('삭제하시겠습니까?')) return;
                            try {
                              const token = localStorage.getItem('token');
                              await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/survey/requests/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                              loadRecentSends();
                              getSurveyStats().then(setStats);
                            } catch (err: any) { toast.error(err.message || "오류가 발생했습니다."); }
                          }}
                          className="px-2 py-1 text-xs font-medium text-[var(--danger-fg)] bg-[var(--danger-fg)]/10 rounded hover:bg-[var(--danger-fg)]/15"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Reminder Section */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-1)]">
          <h2 className="text-base font-semibold text-[var(--text-1)]">미출근자 리마인더</h2>
          <p className="text-xs text-[var(--text-3)] mt-0.5">설문 발송 후 출근하지 않은 근무자에게 리마인드 문자를 발송합니다.</p>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1">기준 시간 (시간)</label>
              <Input type="number" value={reminderHours}
                onChange={(e) => setReminderHours(Number(e.target.value))}
                min={1}
                max={24}
                className="w-20 px-3 py-2 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleRemind}
                disabled={reminding}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:bg-[#28282C] transition-colors flex items-center gap-2"
              >
                {reminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                리마인더 발송
              </button>
            </div>
          </div>
          {reminderResult && (
            <div className="mt-3 p-3 bg-[var(--warning-fg)]/10 border border-[var(--warning-fg)]/30 rounded-lg text-sm text-[var(--warning-fg)]">
              미출근 {reminderResult.total_pending}명 중 {reminderResult.reminders_sent}명에게 리마인더를 발송했습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Responses Tab =====
function ResponsesTab() {
  const toast = useToast();
  const [responses, setResponses] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    phone: "",
    name: "",
    status: "",
    workplace: "",
  });
  const [workplaces, setWorkplaces] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editAgency, setEditAgency] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editBirthYear, setEditBirthYear] = useState("");
  const [editOvertimeWilling, setEditOvertimeWilling] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchTimeType, setBatchTimeType] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [batchTimeValue, setBatchTimeValue] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });

  const handleTimeSave = async () => {
    if (editingId === null) return;
    try {
      await updateSurveyResponseTime(editingId, {
        clock_in_time: editClockIn || undefined,
        clock_out_time: editClockOut || undefined,
        agency: editAgency || undefined,
        gender: editGender || undefined,
        birth_year: editBirthYear ? parseInt(editBirthYear) : undefined,
        overtime_willing: editOvertimeWilling || undefined,
      } as any);
      setEditingId(null);
      load(pagination.page);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "50" };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.phone) params.phone = filters.phone;
      if (filters.name) params.name = filters.name;
      if (filters.status) params.status = filters.status;
      if (filters.workplace) params.workplace = filters.workplace;

      const data = await getSurveyResponses(params);
      setResponses(data.responses);
      setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
    getSurveyWorkplaces().then(setWorkplaces).catch(console.error);
  }, []);

  const handleExport = async () => {
    try {
      const params: Record<string, string> = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.phone) params.phone = filters.phone;
      if (filters.status) params.status = filters.status;

      const blob = await exportSurveyExcel(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `설문응답_${new Date().toLocaleDateString('sv-SE')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">시작일</label>
            <Input type="date" value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              inputSize="sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">종료일</label>
            <Input type="date" value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              inputSize="sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">전화번호</label>
            <Input type="text" value={filters.phone}
              onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
              placeholder="검색..."
              className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">이름</label>
            <Input type="text" value={filters.name}
              onChange={(e) => setFilters({ ...filters, name: e.target.value })}
              placeholder="이름 검색..."
              className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">상태</label>
            <Select value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm bg-[var(--bg-1)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체</option>
              <option value="sent">발송완료</option>
              <option value="clock_in">출근완료</option>
              <option value="completed">퇴근완료</option>
              <option value="expired">만료</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">근무지</label>
            <Select value={filters.workplace}
              onChange={(e) => setFilters({ ...filters, workplace: e.target.value })}
              className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm bg-[var(--bg-1)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체</option>
              {workplaces.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </Select>
          </div>
          <button
            onClick={() => load(1)}
            className="px-4 py-1.5 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)] transition-colors"
          >
            조회
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-1.5 bg-[var(--success-fg)] text-white rounded-lg text-sm font-medium hover:bg-[var(--success-fg)]/90 transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-[var(--info-fg)]/10 border border-[var(--brand-500)]/30 rounded-[var(--r-lg)] p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-[var(--brand-400)]">{selectedIds.length}건 선택</span>
          <Select value={batchTimeType} onChange={(e) => setBatchTimeType(e.target.value as 'clock_in' | 'clock_out')}
            className="px-2 py-1.5 border border-blue-300 rounded-lg text-xs bg-[var(--bg-1)] focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="clock_in">출근시간</option>
            <option value="clock_out">퇴근시간</option>
          </Select>
          <Input type="datetime-local" value={batchTimeValue} onChange={(e) => setBatchTimeValue(e.target.value)}
            className="px-2 py-1.5 border border-blue-300 rounded text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button onClick={async () => {
            if (!batchTimeValue) { toast.info("시간을 입력해주세요."); return; };
            try {
              await batchEditResponseTime(selectedIds,
                batchTimeType === 'clock_in'
                  ? { clock_in_time: batchTimeValue }
                  : { clock_out_time: batchTimeValue }
              );
              setSelectedIds([]);
              load(pagination.page);
            } catch (err: any) { toast.error(err.message || "오류가 발생했습니다."); }
          }} className="px-3 py-1.5 bg-[var(--brand-500)] text-white rounded-lg text-xs font-medium hover:bg-[var(--brand-400)]">
            일괄 수정
          </button>
          <button onClick={async () => {
            if (!confirm(`${selectedIds.length}건을 삭제하시겠습니까?`)) return;
            try {
              await batchDeleteResponses(selectedIds);
              setSelectedIds([]);
              load(pagination.page);
            } catch (err: any) { toast.error(err.message || "오류가 발생했습니다."); }
          }} className="px-3 py-1.5 bg-[var(--danger-fg)] text-white rounded-lg text-xs font-medium hover:bg-[#F07070]">
            일괄 삭제
          </button>
          <button onClick={() => setSelectedIds([])}
            className="px-3 py-1.5 text-[var(--text-3)] bg-[var(--bg-2)] rounded-lg text-xs font-medium hover:bg-[var(--bg-2)]/7">
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <CenterSpinner />
            <p className="mt-2 text-sm text-[var(--text-3)]">불러오는 중...</p>
          </div>
        ) : responses.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="w-10 h-10 text-[var(--text-4)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-3)]">데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-canvas)] text-left">
                  <th className="py-3 px-3 w-10">
                    <input type="checkbox"
                      checked={selectedIds.length === responses.length && responses.length > 0}
                      onChange={(e) => setSelectedIds(e.target.checked ? responses.map((r: any) => r.id) : [])}
                      className="accent-blue-600" />
                  </th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">근무일</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">유형</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">전화번호</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">한글이름</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">영문이름</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">출근시간</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap text-center">출근GPS</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">퇴근시간</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap text-center">퇴근GPS</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">계획출근</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">계획퇴근</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">근무지</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">파트</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">성별</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">출생연도</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">연결업체</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">잔업희망</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">은행</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">계좌</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">상태</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {responses.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-[var(--bg-2)]">
                    <td className="py-2.5 px-3">
                      <input type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, r.id] : selectedIds.filter(x => x !== r.id))}
                        className="accent-blue-600" />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">{r.date}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        r.worker_type === 'alba' ? 'bg-[var(--warning-fg)]/10 text-[var(--warning-fg)] border border-[var(--warning-fg)]/30' :
                        r.worker_type === 'dispatch' ? 'bg-[var(--info-fg)]/10 text-[var(--brand-400)] border border-[var(--brand-500)]/30' :
                        'bg-[var(--bg-canvas)] text-[var(--text-3)]'
                      }`}>
                        {r.worker_type === 'alba' ? '알바' : r.worker_type === 'dispatch' ? '파견' : '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">{r.phone}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-[var(--text-1)]">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">{r.worker_name_en || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">
                      {editingId === r.id ? (
                        <Input type="datetime-local" value={editClockIn}
                          onChange={(e) => setEditClockIn(e.target.value)}
                          className="px-2 py-1 border border-blue-300 rounded text-xs w-40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        r.clock_in_time
                          ? new Date(r.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                          : "-"
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {r.clock_in_time ? (
                        r.clock_in_gps_valid ? (
                          <Check className="w-4 h-4 text-[var(--success-fg)] mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-[var(--text-4)]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-2)]">
                      {editingId === r.id ? (
                        <Input type="datetime-local" value={editClockOut}
                          onChange={(e) => setEditClockOut(e.target.value)}
                          className="px-2 py-1 border border-blue-300 rounded text-xs w-40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        r.clock_out_time
                          ? new Date(r.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                          : "-"
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {r.clock_out_time ? (
                        r.clock_out_gps_valid ? (
                          <Check className="w-4 h-4 text-[var(--success-fg)] mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-[var(--text-4)]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] text-xs">{formatPlannedTime(r.planned_clock_in)}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] text-xs">{formatPlannedTime(r.planned_clock_out)}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)]">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] text-xs">{r.department || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] text-xs">
                      {editingId === r.id ? <Select value={editGender} onChange={e => setEditGender(e.target.value)} className="px-1 py-0.5 border rounded text-xs"><option value="">-</option><option value="male">남</option><option value="female">여</option></Select> : (r.gender === 'male' ? '남' : r.gender === 'female' ? '여' : r.gender || "-")}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] text-xs">
                      {editingId === r.id ? <Input type="text" value={editBirthYear} onChange={e => setEditBirthYear(e.target.value)} className="w-14 px-1 py-0.5 border rounded text-xs" /> : (r.birth_year || "-")}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)] text-xs">
                      {editingId === r.id ? <Input type="text" value={editAgency} onChange={e => setEditAgency(e.target.value)} className="w-20 px-1 py-0.5 border rounded text-xs" /> : (r.agency || "-")}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {editingId === r.id ? (
                        <Select value={editOvertimeWilling} onChange={e => setEditOvertimeWilling(e.target.value)} className="px-1 py-0.5 border rounded text-xs"><option value="">-</option><option value="가능">가능</option><option value="불가">불가</option></Select>
                      ) : r.overtime_willing ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.overtime_willing === '가능' ? 'bg-[var(--success-fg)]/10 text-[var(--success-fg)]' : 'bg-[var(--bg-canvas)] text-[var(--text-3)]'}`}>
                          {r.overtime_willing}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-[var(--text-3)]">{r.bank_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-xs text-[var(--text-3)]">{r.bank_account || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {editingId === r.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={handleTimeSave}
                            className="px-2 py-1 text-xs font-medium text-white bg-[var(--brand-500)] rounded hover:bg-[var(--brand-400)]"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-xs font-medium text-[var(--text-3)] bg-[var(--bg-2)] rounded hover:bg-[var(--bg-2)]/7"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditClockIn(r.clock_in_time ? new Date(r.clock_in_time).toISOString().slice(0, 16) : "");
                            setEditClockOut(r.clock_out_time ? new Date(r.clock_out_time).toISOString().slice(0, 16) : "");
                            setEditAgency(r.agency || "");
                            setEditGender(r.gender || "");
                            setEditBirthYear(r.birth_year ? String(r.birth_year) : "");
                            setEditOvertimeWilling(r.overtime_willing || "");
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-[var(--brand-400)] bg-[var(--info-fg)]/10 rounded-md hover:bg-[var(--info-fg)]/15 transition-colors"
                        >
                          수정
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-1)] bg-[var(--bg-canvas)]/50">
            <p className="text-sm text-[var(--text-3)]">
              총 <span className="font-medium">{pagination.total}</span>건 중{" "}
              {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}건
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => load(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded hover:bg-[var(--bg-2)]/7 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm font-medium text-[var(--text-2)]">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => load(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded hover:bg-[var(--bg-2)]/7 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Workplaces Tab =====
function WorkplacesTab() {
  const toast = useToast();
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Workplace | null>(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
    radius_meters: "200",
  });

  const load = async () => {
    try {
      const data = await getSurveyWorkplaces();
      setWorkplaces(data);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ name: "", address: "", latitude: "", longitude: "", radius_meters: "200" });
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (w: Workplace) => {
    setEditing(w);
    setForm({
      name: w.name,
      address: w.address,
      latitude: String(w.latitude),
      longitude: String(w.longitude),
      radius_meters: String(w.radius_meters),
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.latitude || !form.longitude) {
      { toast.info("이름, 위도, 경도는 필수입니다."); return; };
    }

    const payload = {
      name: form.name,
      address: form.address,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius_meters: parseInt(form.radius_meters) || 200,
    };

    try {
      if (editing) {
        await updateSurveyWorkplace(editing.id, payload);
      } else {
        await createSurveyWorkplace(payload);
      }
      resetForm();
      load();
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSurveyWorkplace(id);
      load();
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) { toast.info("GPS를 사용할 수 없습니다."); return; };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({
          ...form,
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        });
      },
      () => toast.error("위치를 가져올 수 없습니다."),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-1)]">등록된 근무지</h2>
          <p className="text-xs text-[var(--text-3)] mt-0.5">GPS 기반 출퇴근 위치 검증에 사용됩니다.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)] transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          근무지 추가
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--brand-500)]/30 p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.2)]">
          <h3 className="font-semibold text-[var(--text-1)] mb-4">
            {editing ? "근무지 수정" : "새 근무지 등록"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
                근무지 이름 <span className="text-[var(--danger-fg)]">*</span>
              </label>
              <Input type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 조인앤조인 본사"
                inputSize="md" className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">주소</label>
              <Input type="text" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="예: 서울시 강남구 테헤란로 123"
                inputSize="md" className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
                위도 <span className="text-[var(--danger-fg)]">*</span>
              </label>
              <Input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="37.5665"
                inputSize="md" className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
                경도 <span className="text-[var(--danger-fg)]">*</span>
              </label>
              <Input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="126.9780"
                inputSize="md" className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">허용 반경 (m)</label>
              <Input type="number" value={form.radius_meters}
                onChange={(e) => setForm({ ...form, radius_meters: e.target.value })}
                placeholder="200"
                inputSize="md" className="w-full"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGetCurrentLocation}
                className="px-4 py-2 bg-[var(--bg-2)] text-[var(--text-2)] rounded-lg text-sm hover:bg-[var(--bg-2)]/7 transition-colors flex items-center gap-1.5"
              >
                <MapPin className="w-4 h-4" />
                현재 위치 가져오기
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-4 border-t border-[var(--border-1)]">
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)] transition-colors"
            >
              {editing ? "수정 완료" : "등록하기"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-[var(--text-3)] rounded-lg text-sm hover:bg-[var(--bg-2)]/5 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Workplaces List */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <CenterSpinner />
          </div>
        ) : workplaces.length === 0 ? (
          <div className="py-16 text-center">
            <MapPin className="w-10 h-10 text-[var(--text-4)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-3)]">등록된 근무지가 없습니다.</p>
            <p className="text-xs text-[var(--text-4)] mt-1">위의 &quot;근무지 추가&quot; 버튼을 눌러 등록해주세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-canvas)] text-left">
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">이름</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">주소</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">좌표</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap">반경</th>
                  <th className="py-3 px-4 font-medium text-[var(--text-3)] whitespace-nowrap text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {workplaces.map((w) => (
                  <tr key={w.id} className="hover:bg-[var(--bg-2)]">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-[var(--info-fg)]/10 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin className="w-3.5 h-3.5 text-[var(--brand-400)]" />
                        </div>
                        <span className="font-medium text-[var(--text-1)]">{w.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-3)]">{w.address || "-"}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-[var(--text-3)]">
                        {w.latitude.toFixed(4)}, {w.longitude.toFixed(4)}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 bg-[var(--bg-2)] rounded text-xs font-medium text-[var(--text-2)]">
                        {w.radius_meters}m
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(w)}
                          className="p-1.5 text-[var(--text-4)] hover:text-[var(--brand-400)] hover:bg-[var(--info-fg)]/10 rounded-md transition-colors"
                          title="수정"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="p-1.5 text-[var(--text-4)] hover:text-[var(--danger-fg)] hover:bg-[var(--danger-fg)]/10 rounded-md transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Safety Notices Tab =====
function SafetyTab() {
  const toast = useToast();
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sendDate, setSendDate] = useState(() => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  });
  const [selectedNotice, setSelectedNotice] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [sendMode, setSendMode] = useState<"survey" | "direct">("direct");
  const [directPhones, setDirectPhones] = useState("");
  const [scheduleType, setScheduleType] = useState<'immediate' | 'single' | 'range'>('immediate');
  const [scheduledAt, setScheduledAt] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });
  const [rangeStart, setRangeStart] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [rangeDailyTime, setRangeDailyTime] = useState("08:00");

  const load = async () => {
    try {
      const data = await getSafetyNotices();
      setNotices(data);
      if (data.length > 0 && !selectedNotice) setSelectedNotice(data[0].id);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) { toast.info("제목과 내용을 입력해주세요."); return; };
    try {
      if (editing) {
        await updateSafetyNotice(editing.id, { title, content });
      } else {
        await createSafetyNotice({ title, content });
      }
      setShowForm(false);
      setEditing(null);
      setTitle("");
      setContent("");
      load();
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSafetyNotice(id);
      load();
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  const handleSend = async () => {
    if (!selectedNotice) { toast.info("안내문을 선택해주세요."); return; };
    if (sendMode === "direct") {
      const phones = directPhones.split("\n").map(p => p.trim()).filter(Boolean);
      if (phones.length === 0) { toast.info("전화번호를 입력해주세요."); return; };
    }
    if (sendMode === "survey" && !sendDate) { toast.info("근무일을 선택해주세요."); return; };
    setSending(true);
    setSendResult(null);
    try {
      const phones = sendMode === "direct"
        ? directPhones.split("\n").map(p => p.trim()).filter(Boolean)
        : undefined;
      const schedAt = scheduleType === 'single' ? new Date(scheduledAt).toISOString() : undefined;
      const schedRange = scheduleType === 'range' ? { start_date: rangeStart, end_date: rangeEnd, daily_time: rangeDailyTime } : undefined;
      const result = await sendSafetyNotice(
        sendDate, selectedNotice, phones,
        schedAt, schedRange
      );
      setSendResult(result);
      if (sendMode === "direct" && (result.sent > 0 || result.scheduled_range)) setDirectPhones("");
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Send Section */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-1)]">
          <h2 className="text-base font-semibold text-[var(--text-1)]">안전위생 안내 발송</h2>
          <p className="text-xs text-[var(--text-3)] mt-0.5">근무 전날 근무자에게 안전/위생 안내 문자를 발송합니다.</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSendMode("direct")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sendMode === "direct" ? "bg-[var(--success-fg)] text-white" : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
              }`}
            >
              연락처 직접 입력
            </button>
            <button
              onClick={() => setSendMode("survey")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sendMode === "survey" ? "bg-[var(--success-fg)] text-white" : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
              }`}
            >
              설문 대상자 자동
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sendMode === "survey" && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">근무일 (설문 대상 조회)</label>
                <Input type="date" value={sendDate}
                  onChange={(e) => setSendDate(e.target.value)}
                  inputSize="md" className="w-full"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">안내문 선택</label>
              <Select value={selectedNotice ?? ""}
                onChange={(e) => setSelectedNotice(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-[var(--border-1)] rounded-lg text-sm bg-[var(--bg-1)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택하세요</option>
                {notices.map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </Select>
            </div>
          </div>

          {/* Direct phone input */}
          {sendMode === "direct" && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
                전화번호 <span className="text-[var(--text-4)]">(줄바꿈으로 구분, 여러 명 가능)</span>
              </label>
              <Textarea value={directPhones}
                onChange={(e) => setDirectPhones(e.target.value)}
                placeholder={"010-1234-5678\n010-9876-5432"}
                rows={4}
                className="w-full px-3 py-2 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
              />
              <p className="text-xs text-[var(--text-4)] mt-1">
                {directPhones.split("\n").filter(l => l.trim()).length}명 입력됨
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-[var(--border-1)] mt-2">
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="safetySchedType" value="immediate" checked={scheduleType === 'immediate'}
                  onChange={() => setScheduleType('immediate')} className="accent-green-600" />
                <span className="text-sm text-[var(--text-2)]">즉시 발송</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="safetySchedType" value="single" checked={scheduleType === 'single'}
                  onChange={() => setScheduleType('single')} className="accent-green-600" />
                <span className="text-sm text-[var(--text-2)]">예약 발송</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="safetySchedType" value="range" checked={scheduleType === 'range'}
                  onChange={() => setScheduleType('range')} className="accent-green-600" />
                <span className="text-sm text-[var(--text-2)]">기간 예약</span>
              </label>
            </div>

            {scheduleType === 'single' && (
              <div className="flex items-center gap-2">
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                  className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            )}

            {scheduleType === 'range' && (
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)}
                  className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <span className="text-[var(--text-4)]">~</span>
                <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)}
                  className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <Input type="time" value={rangeDailyTime} onChange={(e) => setRangeDailyTime(e.target.value)}
                  className="px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <span className="text-xs text-[var(--text-3)]">매일 발송</span>
              </div>
            )}

          </div>

          <button
            onClick={handleSend}
            disabled={sending || !selectedNotice}
            className="px-5 py-2 bg-[var(--success-fg)] text-white rounded-lg text-sm font-medium hover:bg-[var(--success-fg)]/90 disabled:bg-[#28282C] transition-colors flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {scheduleType !== 'immediate' ? '예약 발송' : '안내 발송'}
          </button>
          {sendResult && (
            <div className={`p-3 rounded-lg text-sm ${
              sendResult.scheduled || sendResult.scheduled_range
                ? 'bg-[var(--brand-500)]/10 border border-[var(--brand-500)]/30 text-[var(--brand-400)]'
                : sendResult.sent > 0 ? 'bg-[var(--success-fg)]/10 border border-[var(--success-fg)]/30 text-[var(--success-fg)]' : 'bg-[var(--warning-fg)]/10 border border-[var(--warning-fg)]/30 text-[var(--warning-fg)]'
            }`}>
              {sendResult.scheduled_range
                ? sendResult.message
                : sendResult.scheduled
                ? `${sendResult.total}건이 ${sendResult.scheduled_at}에 예약되었습니다.`
                : <>총 {sendResult.total}명 중 {sendResult.sent}명에게 안전위생 안내를 발송했습니다.
                  {sendResult.failed > 0 && ` (실패: ${sendResult.failed}명)`}</>
              }
            </div>
          )}
        </div>
      </div>

      {/* Preview selected notice */}
      {selectedNotice && notices.find(n => n.id === selectedNotice) && (
        <div className="bg-[var(--bg-canvas)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-2)] mb-2">발송 미리보기</h3>
          <pre className="whitespace-pre-wrap text-sm text-[var(--text-3)] bg-[var(--bg-1)] rounded-lg p-4 border border-[var(--border-1)] font-sans">
            {notices.find(n => n.id === selectedNotice)?.content}
          </pre>
        </div>
      )}

      {/* Templates Management */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-1)]">
          <h2 className="text-base font-semibold text-[var(--text-1)]">안내문 템플릿</h2>
          <button
            onClick={() => { setShowForm(true); setEditing(null); setTitle(""); setContent(""); }}
            className="px-4 py-2 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)] transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            새 안내문
          </button>
        </div>

        {showForm && (
          <div className="p-5 border-b border-[var(--border-1)] bg-[var(--info-fg)]/10/30">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-3)] mb-1">제목</label>
                <Input type="text" value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 위생관리 안내"
                  inputSize="md" className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-3)] mb-1">내용 (문자 발송 내용)</label>
                <Textarea value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  placeholder="근무자에게 발송될 문자 내용을 입력하세요."
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} className="px-5 py-2 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)]">
                  {editing ? "수정 완료" : "등록"}
                </button>
                <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-[var(--text-3)] rounded-lg text-sm hover:bg-[var(--bg-2)]/5">
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center">
            <CenterSpinner />
          </div>
        ) : notices.length === 0 ? (
          <div className="py-10 text-center">
            <ShieldAlert className="w-10 h-10 text-[var(--text-4)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-3)]">등록된 안내문이 없습니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-1)]">
            {notices.map((n) => (
              <div key={n.id} className="px-5 py-4 hover:bg-[var(--bg-2)]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-[var(--text-1)]">{n.title}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditing(n); setTitle(n.title); setContent(n.content); setShowForm(true); }}
                      className="p-1.5 text-[var(--text-4)] hover:text-[var(--brand-400)] hover:bg-[var(--info-fg)]/10 rounded-md"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 text-[var(--text-4)] hover:text-[var(--danger-fg)] hover:bg-[var(--danger-fg)]/10 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-[var(--text-3)] line-clamp-3 font-sans">{n.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Workers Tab =====
function WorkersTab() {
  const toast = useToast();
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [editingWorker, setEditingWorker] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name_ko: "", name_en: "", phone: "", bank_name: "", bank_account: "", emergency_contact: "", category: "", department: "", memo: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const data = await getWorkers({ page: String(p), limit: "50", search });
      setWorkers(data.workers);
      setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, []);

  const handleSearch = () => { setPage(1); load(1); };

  const startEdit = (w: any) => {
    setEditingWorker(w);
    setEditForm({
      name_ko: w.name_ko || "",
      name_en: w.name_en || "",
      phone: w.phone || "",
      bank_name: w.bank_name || "",
      bank_account: w.bank_account || "",
      emergency_contact: w.emergency_contact || "",
      category: w.category || "",
      department: w.department || "",
      memo: w.memo || "",
    });
  };

  const handleSave = async () => {
    if (!editingWorker) return;
    setSaving(true);
    try {
      await updateWorker(editingWorker.id, editForm);
      setEditingWorker(null);
      load(pagination.page);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`${name} 직원을 삭제하시겠습니까?`)) return;
    try {
      await deleteWorker(id);
      load(pagination.page);
    } catch (err: any) {
      toast.error(err.message || "오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-[var(--text-3)] mb-1">검색 (이름/연락처)</label>
            <Input type="text" value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="이름 또는 연락처로 검색"
              className="w-full px-3 py-1.5 border border-[var(--border-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={handleSearch} className="px-4 py-1.5 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)]">
            검색
          </button>
        </div>
      </div>

      {/* Worker List */}
      <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] border border-[var(--border-1)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-1)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-1)]">등록 직원 목록 ({pagination.total}명)</h3>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <CenterSpinner />
          </div>
        ) : workers.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--text-4)]">등록된 직원이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-canvas)] text-left">
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">이름</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">영문이름</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">연락처</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">은행</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">계좌번호</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">비상연락처</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">구분</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)]">부서</th>
                  <th className="py-2 px-4 font-medium text-[var(--text-3)] text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {workers.map((w: any) => (
                  <tr key={w.id} className="hover:bg-[var(--bg-2)]/5">
                    <td className="py-2.5 px-4 font-medium text-[var(--text-1)]">{w.name_ko}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.name_en}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.phone}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.bank_name}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.bank_account}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.emergency_contact}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.category}</td>
                    <td className="py-2.5 px-4 text-[var(--text-3)]">{w.department}</td>
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => startEdit(w)} className="p-1.5 text-[var(--brand-400)] hover:bg-[var(--info-fg)]/10 rounded" title="수정">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(w.id, w.name_ko)} className="p-1.5 text-[var(--danger-fg)] hover:bg-[var(--danger-fg)]/10 rounded" title="삭제">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border-1)] flex items-center justify-between">
            <p className="text-xs text-[var(--text-3)]">총 {pagination.total}명 중 {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)}</p>
            <div className="flex gap-1">
              <button disabled={pagination.page <= 1} onClick={() => { setPage(pagination.page - 1); load(pagination.page - 1); }} className="px-2 py-1 text-xs border rounded disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => { setPage(pagination.page + 1); load(pagination.page + 1); }} className="px-2 py-1 text-xs border rounded disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingWorker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-1)] rounded-[var(--r-lg)] shadow-[0px_7px_32px_rgba(0,0,0,0.35)] max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-[var(--text-1)]">직원 정보 수정</h3>

            {[
              { label: "이름", key: "name_ko" },
              { label: "영문이름", key: "name_en" },
              { label: "연락처", key: "phone" },
              { label: "은행", key: "bank_name" },
              { label: "계좌번호", key: "bank_account" },
              { label: "비상연락처", key: "emergency_contact" },
              { label: "구분", key: "category" },
              { label: "부서", key: "department" },
              { label: "메모", key: "memo" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1">{f.label}</label>
                <Input type="text" value={(editForm as any)[f.key]}
                  onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  inputSize="md" className="w-full"
                />
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingWorker(null)} className="flex-1 py-2 border border-[var(--border-1)] rounded-lg text-sm font-medium text-[var(--text-2)] hover:bg-[var(--bg-2)]/5">
                취소
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-[var(--brand-500)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-400)] disabled:bg-[#28282C] flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
