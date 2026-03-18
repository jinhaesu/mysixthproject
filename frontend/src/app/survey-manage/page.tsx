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
} from "lucide-react";

type Tab = "send" | "responses" | "workplaces";

interface Workplace {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
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
  const [stats, setStats] = useState<any>(null);

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
      const result = await sendSurvey({ phone: phone.trim(), date, workplace_id: workplaceId, message_type: messageType });
      if (result.message && !result.message.success) {
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
      const result = await sendSurveyBatch({ phones, date, workplace_id: workplaceId, message_type: messageType });
      alert(`${result.total}건 발송 완료`);
      setBulkPhones("");
      loadRecentSends();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
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
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">근무일</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">전화번호</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">한글이름</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">영문이름</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">출근시간</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap text-center">출근GPS</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">퇴근시간</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap text-center">퇴근GPS</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">근무지</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">은행</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">계좌</th>
                  <th className="py-3 px-4 font-medium text-gray-600 whitespace-nowrap">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {responses.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.date}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.phone}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-gray-900">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">{r.worker_name_en || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-700">
                      {r.clock_in_time
                        ? new Date(r.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                        : "-"}
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
                      {r.clock_out_time
                        ? new Date(r.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                        : "-"}
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
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-gray-600">{r.bank_name || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-xs text-gray-600">{r.bank_account || "-"}</td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusBadge status={r.status} />
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
