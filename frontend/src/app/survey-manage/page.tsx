"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";

type Tab = "send" | "responses" | "workplaces" | "safety";

interface Workplace {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "예약됨", cls: "bg-purple-50 text-purple-700 border border-purple-200" },
  sent: { label: "발송완료", cls: "bg-blue-50 text-blue-700 border border-blue-200" },
  clock_in: { label: "출근완료", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
  completed: { label: "퇴근완료", cls: "bg-green-50 text-green-700 border border-green-200" },
  expired: { label: "만료", cls: "bg-gray-50 text-gray-500 border border-gray-200" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, cls: "bg-gray-50 text-gray-600" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function SurveyManagePage() {
  const [tab, setTab] = useState<Tab>("send");

  const tabs: { key: Tab; label: string; icon: typeof Send }[] = [
    { key: "send", label: "설문 발송", icon: MessageSquare },
    { key: "responses", label: "응답 조회", icon: ClipboardList },
    { key: "workplaces", label: "근무지 관리", icon: Building2 },
    { key: "safety", label: "안전위생 안내", icon: ShieldAlert },
  ];

  return (
    <div className="min-w-0">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">설문 출퇴근 관리</h1>
        <p className="text-sm text-gray-500 mt-1">
          단기 근무자에게 설문을 발송하고, 출퇴근 기록을 관리합니다.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
      </div>
    </div>
  );
}

// ===== Send Tab =====
function SendTab() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [workplaceId, setWorkplaceId] = useState<number | null>(null);
  const [messageType, setMessageType] = useState("sms");
  const [sending, setSending] = useState(false);
  const [bulkPhones, setBulkPhones] = useState("");
  const [recentSends, setRecentSends] = useState<any[]>([]);
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [department, setDepartment] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [reminderHours, setReminderHours] = useState(2);
  const [reminding, setReminding] = useState(false);
  const [reminderResult, setReminderResult] = useState<any>(null);
  const [plannedClockIn, setPlannedClockIn] = useState("");
  const [plannedClockOut, setPlannedClockOut] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });
  const [isScheduled, setIsScheduled] = useState(false);

  useEffect(() => {
    getSurveyWorkplaces().then(setWorkplaces).catch(console.error);
    getSurveyStats().then(setStats).catch(console.error);
    loadRecentSends();
  }, []);

  const loadRecentSends = async () => {
    try {
      const data = await getSurveyRequests({ limit: "20" });
      setRecentSends(data);
    } catch {}
  };

  const handleSend = async () => {
    if (!phone.trim()) return alert("전화번호를 입력해주세요.");
    if (workplaceId === null) return alert("근무지를 선택해주세요.");
    setSending(true);
    try {
      const result = await sendSurvey({ phone: phone.trim(), date, workplace_id: workplaceId, message_type: messageType, department, planned_clock_in: plannedClockIn || undefined, planned_clock_out: plannedClockOut || undefined, scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : undefined });
      if (result.scheduled) {
        alert("설문이 예약되었습니다.");
        setPhone("");
      } else if (result.message && !result.message.success) {
        alert(`발송 실패: ${result.message.error || '알 수 없는 오류'}`);
      } else {
        alert("설문이 발송되었습니다.");
        setPhone("");
      }
      loadRecentSends();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleBatchSend = async () => {
    const phones = bulkPhones.split("\n").map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) return alert("전화번호를 입력해주세요.");
    if (workplaceId === null) return alert("근무지를 선택해주세요.");
    setSending(true);
    try {
      const result = await sendSurveyBatch({ phones, date, workplace_id: workplaceId, message_type: messageType, department, planned_clock_in: plannedClockIn || undefined, planned_clock_out: plannedClockOut || undefined, scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : undefined });
      alert(result.scheduled ? `${result.total}건 예약 완료` : `${result.total}건 발송 완료`);
      setBulkPhones("");
      loadRecentSends();
    } catch (err: any) {
      alert(err.message);
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
      alert(err.message);
    } finally {
      setReminding(false);
    }
  };

  const bulkCount = bulkPhones.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.today || 0}</p>
            <p className="text-xs text-gray-500 mt-1">오늘 발송</p>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.todayByStatus?.sent || 0}</p>
            <p className="text-xs text-gray-500 mt-1">대기중</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.todayByStatus?.clock_in || 0}</p>
            <p className="text-xs text-gray-500 mt-1">출근완료</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.todayByStatus?.completed || 0}</p>
            <p className="text-xs text-gray-500 mt-1">퇴근완료</p>
          </div>
        </div>
      )}

      {/* Send Form Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Common Settings */}
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-4">발송 설정</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">근무일</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">근무지 <span className="text-red-500">*</span></label>
              <select
                value={workplaceId ?? ""}
                onChange={(e) => setWorkplaceId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">근무지를 선택하세요 (필수)</option>
                {workplaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">배정 파트</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">파트 선택 (선택사항)</option>
                <option value="생산팀">생산팀</option>
                <option value="물류팀">물류팀</option>
                <option value="포장팀">포장팀</option>
                <option value="품질관리팀">품질관리팀</option>
                <option value="기타">기타</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">계획 출근시간</label>
              <input
                type="time"
                value={plannedClockIn}
                onChange={(e) => setPlannedClockIn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">계획 퇴근시간</label>
              <input
                type="time"
                value={plannedClockOut}
                onChange={(e) => setPlannedClockOut(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">발송 방법</label>
              <div className="flex gap-4 pt-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="sms"
                    checked={messageType === "sms"}
                    onChange={(e) => setMessageType(e.target.value)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">문자(SMS)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="kakao"
                    checked={messageType === "kakao"}
                    onChange={(e) => setMessageType(e.target.value)}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-gray-700">카카오톡</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} className="accent-blue-600" />
              <span className="text-sm text-gray-700">예약 발송</span>
            </label>
            {isScheduled && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            {isScheduled && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const result = await runScheduler();
                    alert(`설문 ${result.surveys.sent}건, 안내문 ${result.messages.sent}건 발송 완료`);
                    loadRecentSends();
                  } catch (err: any) { alert(err.message); }
                }}
                className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors"
              >
                예약 대기 즉시 발송
              </button>
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
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              개별 발송
            </button>
            <button
              onClick={() => setMode("batch")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === "batch"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              일괄 발송
            </button>
          </div>

          {mode === "single" ? (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">전화번호</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !phone.trim()}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                발송
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  전화번호 목록 <span className="text-gray-400">(줄바꿈으로 구분)</span>
                </label>
                <textarea
                  value={bulkPhones}
                  onChange={(e) => setBulkPhones(e.target.value)}
                  placeholder={"010-1234-5678\n010-9876-5432\n010-1111-2222"}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>
              <button
                onClick={handleBatchSend}
                disabled={sending || bulkCount === 0}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {bulkCount}건 일괄 발송
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recent Sends */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">최근 발송 내역</h2>
          <button
            onClick={loadRecentSends}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {recentSends.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">발송 내역이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">전화번호</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">근무일</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">근무지</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">이름</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">출근</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">퇴근</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">상태</th>
                  <th className="py-2.5 px-4 font-medium text-gray-600 whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentSends.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-gray-700">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {r.phone}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.date}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-gray-900">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                      {r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                      {r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {(r.status === 'sent' || r.status === 'expired') && (
                        <button
                          onClick={async () => {
                            try {
                              await resendSurvey(r.id);
                              alert('재발송 완료');
                              loadRecentSends();
                              getSurveyStats().then(setStats);
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          재발송
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reminder Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">미출근자 리마인더</h2>
          <p className="text-xs text-gray-500 mt-0.5">설문 발송 후 출근하지 않은 근무자에게 리마인드 문자를 발송합니다.</p>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">기준 시간 (시간)</label>
              <input
                type="number"
                value={reminderHours}
                onChange={(e) => setReminderHours(Number(e.target.value))}
                min={1}
                max={24}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleRemind}
                disabled={reminding}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:bg-gray-300 transition-colors flex items-center gap-2"
              >
                {reminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                리마인더 발송
              </button>
            </div>
          </div>
          {reminderResult && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
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
  const [responses, setResponses] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    phone: "",
    status: "",
    workplace: "",
  });
  const [workplaces, setWorkplaces] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
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
      });
      setEditingId(null);
      load(pagination.page);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "50" };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.phone) params.phone = filters.phone;
      if (filters.status) params.status = filters.status;
      if (filters.workplace) params.workplace = filters.workplace;

      const data = await getSurveyResponses(params);
      setResponses(data.responses);
      setPagination(data.pagination);
    } catch (err: any) {
      alert(err.message);
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
      a.download = `설문응답_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">시작일</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">전화번호</label>
            <input
              type="text"
              value={filters.phone}
              onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
              placeholder="검색..."
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체</option>
              <option value="sent">발송완료</option>
              <option value="clock_in">출근완료</option>
              <option value="completed">퇴근완료</option>
              <option value="expired">만료</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">근무지</label>
            <select
              value={filters.workplace}
              onChange={(e) => setFilters({ ...filters, workplace: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체</option>
              {workplaces.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => load(1)}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            조회
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-700">{selectedIds.length}건 선택</span>
          <select value={batchTimeType} onChange={(e) => setBatchTimeType(e.target.value as 'clock_in' | 'clock_out')}
            className="px-2 py-1.5 border border-blue-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="clock_in">출근시간</option>
            <option value="clock_out">퇴근시간</option>
          </select>
          <input type="datetime-local" value={batchTimeValue} onChange={(e) => setBatchTimeValue(e.target.value)}
            className="px-2 py-1.5 border border-blue-300 rounded text-xs w-44 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button onClick={async () => {
            if (!batchTimeValue) return alert("시간을 입력해주세요.");
            try {
              await batchEditResponseTime(selectedIds,
                batchTimeType === 'clock_in'
                  ? { clock_in_time: batchTimeValue }
                  : { clock_out_time: batchTimeValue }
              );
              setSelectedIds([]);
              load(pagination.page);
            } catch (err: any) { alert(err.message); }
          }} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
            일괄 수정
          </button>
          <button onClick={async () => {
            if (!confirm(`${selectedIds.length}건을 삭제하시겠습니까?`)) return;
            try {
              await batchDeleteResponses(selectedIds);
              setSelectedIds([]);
              load(pagination.page);
            } catch (err: any) { alert(err.message); }
          }} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">
            일괄 삭제
          </button>
          <button onClick={() => setSelectedIds([])}
            className="px-3 py-1.5 text-gray-600 bg-gray-100 rounded-lg text-xs font-medium hover:bg-gray-200">
            선택 해제
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">불러오는 중...</p>
          </div>
        ) : responses.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-3 px-3 w-10">
                    <input type="checkbox"
                      checked={selectedIds.length === responses.length && responses.length > 0}
                      onChange={(e) => setSelectedIds(e.target.checked ? responses.map((r: any) => r.id) : [])}
                      className="accent-blue-600" />
                  </th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">근무일</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">전화번호</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">한글이름</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">영문이름</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">출근시간</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap text-center">출근GPS</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">퇴근시간</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap text-center">퇴근GPS</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">계획출근</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">계획퇴근</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">근무지</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">파트</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">성별</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">출생연도</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">연결업체</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">잔업희망</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">은행</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">계좌</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">상태</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {responses.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="py-2.5 px-3">
                      <input type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={(e) => setSelectedIds(e.target.checked ? [...selectedIds, r.id] : selectedIds.filter(x => x !== r.id))}
                        className="accent-blue-600" />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.date}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.phone}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-gray-900">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.worker_name_en || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                      {editingId === r.id ? (
                        <input
                          type="datetime-local"
                          value={editClockIn}
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
                          <Check className="w-4 h-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                      {editingId === r.id ? (
                        <input
                          type="datetime-local"
                          value={editClockOut}
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
                          <Check className="w-4 h-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 mx-auto" />
                        )
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-500 text-xs">{r.planned_clock_in || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-500 text-xs">{r.planned_clock_out || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600 text-xs">{r.department || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600 text-xs">{r.gender || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600 text-xs">{r.birth_year || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600 text-xs">{r.agency || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {r.overtime_willing ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.overtime_willing === '가능' ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                          {r.overtime_willing}
                        </span>
                      ) : "-"}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">{r.bank_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-xs text-gray-600">{r.bank_account || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {editingId === r.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={handleTimeSave}
                            className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                          >
                            저장
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
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
                          }}
                          className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                        >
                          시간수정
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
            <p className="text-sm text-gray-600">
              총 <span className="font-medium">{pagination.total}</span>건 중{" "}
              {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}건
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => load(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm font-medium text-gray-700">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => load(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
      alert(err.message);
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
      return alert("이름, 위도, 경도는 필수입니다.");
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
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSurveyWorkplace(id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return alert("GPS를 사용할 수 없습니다.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({
          ...form,
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        });
      },
      () => alert("위치를 가져올 수 없습니다."),
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">등록된 근무지</h2>
          <p className="text-xs text-gray-500 mt-0.5">GPS 기반 출퇴근 위치 검증에 사용됩니다.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          근무지 추가
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editing ? "근무지 수정" : "새 근무지 등록"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                근무지 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 조인앤조인 본사"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">주소</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="예: 서울시 강남구 테헤란로 123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                위도 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="37.5665"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                경도 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="126.9780"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">허용 반경 (m)</label>
              <input
                type="number"
                value={form.radius_meters}
                onChange={(e) => setForm({ ...form, radius_meters: e.target.value })}
                placeholder="200"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGetCurrentLocation}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-1.5"
              >
                <MapPin className="w-4 h-4" />
                현재 위치 가져오기
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {editing ? "수정 완료" : "등록하기"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Workplaces List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          </div>
        ) : workplaces.length === 0 ? (
          <div className="py-16 text-center">
            <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">등록된 근무지가 없습니다.</p>
            <p className="text-xs text-gray-400 mt-1">위의 &quot;근무지 추가&quot; 버튼을 눌러 등록해주세요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">이름</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">주소</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">좌표</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">반경</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {workplaces.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <span className="font-medium text-gray-900">{w.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{w.address || "-"}</td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-gray-500">
                        {w.latitude.toFixed(4)}, {w.longitude.toFixed(4)}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-700">
                        {w.radius_meters}m
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleEdit(w)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="수정"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}T${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });

  const load = async () => {
    try {
      const data = await getSafetyNotices();
      setNotices(data);
      if (data.length > 0 && !selectedNotice) setSelectedNotice(data[0].id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return alert("제목과 내용을 입력해주세요.");
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
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSafetyNotice(id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSend = async () => {
    if (!selectedNotice) return alert("안내문을 선택해주세요.");
    if (sendMode === "direct") {
      const phones = directPhones.split("\n").map(p => p.trim()).filter(Boolean);
      if (phones.length === 0) return alert("전화번호를 입력해주세요.");
    }
    if (sendMode === "survey" && !sendDate) return alert("근무일을 선택해주세요.");
    setSending(true);
    setSendResult(null);
    try {
      const phones = sendMode === "direct"
        ? directPhones.split("\n").map(p => p.trim()).filter(Boolean)
        : undefined;
      const result = await sendSafetyNotice(
        sendDate, selectedNotice, phones,
        isScheduled ? new Date(scheduledAt).toISOString() : undefined
      );
      setSendResult(result);
      if (sendMode === "direct" && result.sent > 0) setDirectPhones("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Send Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">안전위생 안내 발송</h2>
          <p className="text-xs text-gray-500 mt-0.5">근무 전날 근무자에게 안전/위생 안내 문자를 발송합니다.</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSendMode("direct")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sendMode === "direct" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              연락처 직접 입력
            </button>
            <button
              onClick={() => setSendMode("survey")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                sendMode === "survey" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              설문 대상자 자동
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sendMode === "survey" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">근무일 (설문 대상 조회)</label>
                <input
                  type="date"
                  value={sendDate}
                  onChange={(e) => setSendDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">안내문 선택</label>
              <select
                value={selectedNotice ?? ""}
                onChange={(e) => setSelectedNotice(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택하세요</option>
                {notices.map((n) => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Direct phone input */}
          {sendMode === "direct" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                전화번호 <span className="text-gray-400">(줄바꿈으로 구분, 여러 명 가능)</span>
              </label>
              <textarea
                value={directPhones}
                onChange={(e) => setDirectPhones(e.target.value)}
                placeholder={"010-1234-5678\n010-9876-5432"}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                {directPhones.split("\n").filter(l => l.trim()).length}명 입력됨
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} className="accent-green-600" />
              <span className="text-sm text-gray-700">예약 발송</span>
            </label>
            {isScheduled && (
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !selectedNotice}
            className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isScheduled ? '예약 발송' : '안내 발송'}
          </button>
          {sendResult && (
            <div className={`p-3 rounded-lg text-sm ${
              sendResult.scheduled
                ? 'bg-purple-50 border border-purple-200 text-purple-700'
                : sendResult.sent > 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
            }`}>
              {sendResult.scheduled
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
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">발송 미리보기</h3>
          <pre className="whitespace-pre-wrap text-sm text-gray-600 bg-white rounded-lg p-4 border border-gray-200 font-sans">
            {notices.find(n => n.id === selectedNotice)?.content}
          </pre>
        </div>
      )}

      {/* Templates Management */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">안내문 템플릿</h2>
          <button
            onClick={() => { setShowForm(true); setEditing(null); setTitle(""); setContent(""); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            새 안내문
          </button>
        </div>

        {showForm && (
          <div className="p-5 border-b border-gray-200 bg-blue-50/30">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 위생관리 안내"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">내용 (문자 발송 내용)</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={10}
                  placeholder="근무자에게 발송될 문자 내용을 입력하세요."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  {editing ? "수정 완료" : "등록"}
                </button>
                <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 text-gray-600 rounded-lg text-sm hover:bg-gray-100">
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          </div>
        ) : notices.length === 0 ? (
          <div className="py-10 text-center">
            <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">등록된 안내문이 없습니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notices.map((n) => (
              <div key={n.id} className="px-5 py-4 hover:bg-gray-50/50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">{n.title}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditing(n); setTitle(n.title); setContent(n.content); setShowForm(true); }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-xs text-gray-500 line-clamp-3 font-sans">{n.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
