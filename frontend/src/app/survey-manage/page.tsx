"use client";

import { useEffect, useState } from "react";
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

export default function SurveyManagePage() {
  const [tab, setTab] = useState<Tab>("send");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">설문 출퇴근 관리</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
        {[
          { key: "send" as Tab, label: "설문 발송" },
          { key: "responses" as Tab, label: "응답 조회" },
          { key: "workplaces" as Tab, label: "근무지 관리" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-blue-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "send" && <SendTab />}
      {tab === "responses" && <ResponsesTab />}
      {tab === "workplaces" && <WorkplacesTab />}
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

  useEffect(() => {
    getSurveyWorkplaces().then(setWorkplaces).catch(console.error);
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
    setSending(true);
    try {
      await sendSurvey({ phone: phone.trim(), date, workplace_id: workplaceId, message_type: messageType });
      alert("설문이 발송되었습니다.");
      setPhone("");
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

  const statusLabel = (s: string) =>
    ({ sent: "발송완료", clock_in: "출근완료", completed: "퇴근완료", expired: "만료" }[s] || s);

  const statusColor = (s: string) =>
    ({ sent: "bg-blue-100 text-blue-800", clock_in: "bg-yellow-100 text-yellow-800", completed: "bg-green-100 text-green-800", expired: "bg-gray-100 text-gray-600" }[s] || "bg-gray-100");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Single Send */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">개별 발송</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-1234-5678"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">근무일</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">근무지</label>
            <select
              value={workplaceId ?? ""}
              onChange={(e) => setWorkplaceId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">선택하세요</option>
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">발송 방법</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="sms"
                  checked={messageType === "sms"}
                  onChange={(e) => setMessageType(e.target.value)}
                  className="text-blue-600"
                />
                <span className="text-sm">SMS</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="kakao"
                  checked={messageType === "kakao"}
                  onChange={(e) => setMessageType(e.target.value)}
                  className="text-blue-600"
                />
                <span className="text-sm">카카오톡</span>
              </label>
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            발송하기
          </button>
        </div>
      </div>

      {/* Batch Send */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">일괄 발송</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              전화번호 목록 <span className="text-gray-400">(줄바꿈으로 구분)</span>
            </label>
            <textarea
              value={bulkPhones}
              onChange={(e) => setBulkPhones(e.target.value)}
              placeholder={"010-1234-5678\n010-9876-5432\n010-1111-2222"}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <p className="text-sm text-gray-500">
            위의 근무일, 근무지, 발송 방법 설정이 동일하게 적용됩니다.
          </p>

          <button
            onClick={handleBatchSend}
            disabled={sending}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            일괄 발송하기 ({bulkPhones.split("\n").filter((l) => l.trim()).length}건)
          </button>
        </div>
      </div>

      {/* Recent Sends */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">최근 발송 내역</h2>
          <button onClick={loadRecentSends} className="text-gray-500 hover:text-gray-700">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {recentSends.length === 0 ? (
          <p className="text-gray-500 text-sm">발송 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium text-gray-600">전화번호</th>
                  <th className="py-2 pr-4 font-medium text-gray-600">근무일</th>
                  <th className="py-2 pr-4 font-medium text-gray-600">근무지</th>
                  <th className="py-2 pr-4 font-medium text-gray-600">이름</th>
                  <th className="py-2 pr-4 font-medium text-gray-600">출근</th>
                  <th className="py-2 pr-4 font-medium text-gray-600">퇴근</th>
                  <th className="py-2 font-medium text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {recentSends.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {r.phone}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">{r.date}</td>
                    <td className="py-2.5 pr-4">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 pr-4">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 pr-4">
                      {r.clock_in_time ? new Date(r.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2.5 pr-4">
                      {r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
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
  });

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "50" };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.phone) params.phone = filters.phone;
      if (filters.status) params.status = filters.status;

      const data = await getSurveyResponses(params);
      setResponses(data.responses);
      setPagination(data.pagination);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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

  const statusLabel = (s: string) =>
    ({ sent: "발송완료", clock_in: "출근완료", completed: "퇴근완료", expired: "만료" }[s] || s);

  const statusColor = (s: string) =>
    ({ sent: "bg-blue-100 text-blue-800", clock_in: "bg-yellow-100 text-yellow-800", completed: "bg-green-100 text-green-800", expired: "bg-gray-100 text-gray-600" }[s] || "bg-gray-100");

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
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">종료일</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">전화번호</label>
            <input
              type="text"
              value={filters.phone}
              onChange={(e) => setFilters({ ...filters, phone: e.target.value })}
              placeholder="검색..."
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">상태</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">전체</option>
              <option value="sent">발송완료</option>
              <option value="clock_in">출근완료</option>
              <option value="completed">퇴근완료</option>
              <option value="expired">만료</option>
            </select>
          </div>
          <button
            onClick={() => load(1)}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            조회
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          </div>
        ) : responses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">근무일</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">전화번호</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">한글이름</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">영문이름</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">출근시간</th>
                  <th className="py-3 px-4 text-center font-medium text-gray-600">출근GPS</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">퇴근시간</th>
                  <th className="py-3 px-4 text-center font-medium text-gray-600">퇴근GPS</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">근무지</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">은행</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">계좌</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">상태</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5 px-4">{r.date}</td>
                    <td className="py-2.5 px-4">{r.phone}</td>
                    <td className="py-2.5 px-4 font-medium">{r.worker_name_ko || "-"}</td>
                    <td className="py-2.5 px-4">{r.worker_name_en || "-"}</td>
                    <td className="py-2.5 px-4">
                      {r.clock_in_time
                        ? new Date(r.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                        : "-"}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {r.clock_in_time ? (
                        r.clock_in_gps_valid ? (
                          <Check className="w-4 h-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-500 mx-auto" />
                        )
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      {r.clock_out_time
                        ? new Date(r.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
                        : "-"}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {r.clock_out_time ? (
                        r.clock_out_gps_valid ? (
                          <Check className="w-4 h-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-red-500 mx-auto" />
                        )
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2.5 px-4">{r.workplace_name || "-"}</td>
                    <td className="py-2.5 px-4">{r.bank_name || "-"}</td>
                    <td className="py-2.5 px-4 font-mono text-xs">{r.bank_account || "-"}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              총 {pagination.total}건 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}건
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => load(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1.5 text-sm">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => load(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
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
    if (!confirm("이 근무지를 삭제하시겠습니까?")) return;
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
        <h2 className="text-lg font-semibold text-gray-900">등록된 근무지</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          근무지 추가
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editing ? "근무지 수정" : "새 근무지 등록"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                근무지 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 조인앤조인 본사"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">주소</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="예: 서울시 강남구 테헤란로 123"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                위도 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                placeholder="37.5665"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                경도 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                placeholder="126.9780"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">허용 반경 (m)</label>
              <input
                type="number"
                value={form.radius_meters}
                onChange={(e) => setForm({ ...form, radius_meters: e.target.value })}
                placeholder="200"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGetCurrentLocation}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 flex items-center gap-1.5"
              >
                <MapPin className="w-4 h-4" />
                현재 위치 가져오기
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              {editing ? "수정" : "등록"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Workplaces List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          </div>
        ) : workplaces.length === 0 ? (
          <div className="p-8 text-center text-gray-500">등록된 근무지가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3 px-4 text-left font-medium text-gray-600">이름</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">주소</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">위도</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">경도</th>
                <th className="py-3 px-4 text-left font-medium text-gray-600">반경</th>
                <th className="py-3 px-4 text-center font-medium text-gray-600">관리</th>
              </tr>
            </thead>
            <tbody>
              {workplaces.map((w) => (
                <tr key={w.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5 px-4 font-medium">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      {w.name}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-gray-600">{w.address || "-"}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{w.latitude}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{w.longitude}</td>
                  <td className="py-2.5 px-4">{w.radius_meters}m</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleEdit(w)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(w.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
