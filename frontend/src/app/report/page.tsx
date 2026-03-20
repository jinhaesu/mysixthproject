"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Users, Clock, CheckCircle, AlertCircle, MapPin, Loader2 } from "lucide-react";

interface Worker {
  id: number;
  phone: string;
  status: string;
  department: string | null;
  workplace_name: string;
  worker_name_ko: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  planned_clock_in: string | null;
  planned_clock_out: string | null;
}

function ReportContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
    fetch(`${API_URL}/api/survey-public/dashboard-report/${date}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [date]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500">데이터를 불러올 수 없습니다.</p>
    </div>
  );

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-600 bg-green-50';
    if (s === 'clock_in') return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };
  const statusLabel = (s: string) => {
    if (s === 'completed') return '퇴근완료';
    if (s === 'clock_in') return '출근중';
    return '미출근';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white px-4 py-5">
        <h1 className="text-lg font-bold">조인앤조인 출퇴근 현황</h1>
        <p className="text-blue-100 text-sm mt-1">{data.date} 기준</p>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{data.totals.total}</p>
            <p className="text-xs text-gray-500 mt-1">전체</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{data.totals.completed}</p>
            <p className="text-xs text-gray-500 mt-1">퇴근완료</p>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{data.totals.clocked_in}</p>
            <p className="text-xs text-gray-500 mt-1">출근중</p>
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{data.totals.not_clocked_in}</p>
            <p className="text-xs text-gray-500 mt-1">미출근</p>
          </div>
        </div>

        {/* Workers by workplace */}
        {data.byWorkplace.map((wp: any) => {
          const wpWorkers = data.workers.filter((w: Worker) => w.workplace_name === wp.workplace_name);
          return (
            <div key={wp.workplace_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-gray-900 text-sm">{wp.workplace_name}</span>
                <span className="text-xs text-gray-500 ml-auto">{wp.total}명</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2 px-3">이름</th>
                      <th className="py-2 px-3">파트</th>
                      <th className="py-2 px-3">출근</th>
                      <th className="py-2 px-3">퇴근</th>
                      <th className="py-2 px-3">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {wpWorkers.map((w: Worker) => (
                      <tr key={w.id}>
                        <td className="py-2 px-3 font-medium text-gray-900">{w.worker_name_ko || w.phone}</td>
                        <td className="py-2 px-3 text-gray-600 text-xs">{w.department || "-"}</td>
                        <td className="py-2 px-3 text-gray-700">
                          {w.clock_in_time ? new Date(w.clock_in_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                          {w.planned_clock_in && <span className="text-xs text-gray-400 ml-1">({w.planned_clock_in})</span>}
                        </td>
                        <td className="py-2 px-3 text-gray-700">
                          {w.clock_out_time ? new Date(w.clock_out_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                          {w.planned_clock_out && <span className="text-xs text-gray-400 ml-1">({w.planned_clock_out})</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColor(w.status)}`}>
                            {statusLabel(w.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <p className="text-center text-xs text-gray-400 mt-6">조인앤조인 근태 관리 시스템</p>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>}>
      <ReportContent />
    </Suspense>
  );
}
