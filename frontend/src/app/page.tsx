"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UploadCloud, BarChart3, Table2, ClipboardList } from "lucide-react";
import { getFilters, getUploads } from "@/lib/api";

export default function HomePage() {
  const [stats, setStats] = useState({ uploads: 0, records: 0, names: 0, dateRange: "" });

  useEffect(() => {
    async function load() {
      try {
        const [uploads, filters] = await Promise.all([getUploads(), getFilters()]);
        const totalRecords = uploads.reduce((sum, u) => sum + u.record_count, 0);
        const dateRange =
          filters.dateRange.minDate && filters.dateRange.maxDate
            ? `${filters.dateRange.minDate} ~ ${filters.dateRange.maxDate}`
            : "데이터 없음";
        setStats({
          uploads: uploads.length,
          records: totalRecords,
          names: filters.names.length,
          dateRange,
        });
      } catch {
        // Server might not be running
      }
    }
    load();
  }, []);

  const cards = [
    {
      href: "/upload",
      icon: UploadCloud,
      title: "엑셀 업로드",
      desc: "근태 엑셀 파일을 업로드하고 AI 분석 결과를 확인합니다.",
      color: "blue",
    },
    {
      href: "/dashboard",
      icon: BarChart3,
      title: "대시보드",
      desc: "근로자별, 부서별, 구분별, 근무지별, 날짜별 그래프를 확인합니다.",
      color: "green",
    },
    {
      href: "/pivot",
      icon: Table2,
      title: "피벗 테이블",
      desc: "조건별로 데이터를 교차분석하고 표로 확인합니다.",
      color: "purple",
    },
    {
      href: "/records",
      icon: ClipboardList,
      title: "기록 조회",
      desc: "전체 근태 기록을 필터링하여 조회합니다.",
      color: "orange",
    },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-[#4EA7FC]/10 text-[#7070FF] group-hover:bg-[#4EA7FC]/15",
    green: "bg-[#27A644]/10 text-[#27A644] group-hover:bg-[#27A644]/15",
    purple: "bg-[#5E6AD2]/10 text-[#7070FF] group-hover:bg-[#5E6AD2]/15",
    orange: "bg-[#FC7840]/10 text-[#FC7840] group-hover:bg-[#FC7840]/15",
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#F7F8F8] mb-2">근태 관리 시스템</h2>
      <p className="text-[#8A8F98] mb-8">엑셀 파일을 업로드하여 근태 데이터를 분석하고 관리합니다.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#0F1011] rounded-xl p-5 border border-[#23252A]">
          <p className="text-sm text-[#8A8F98]">업로드 횟수</p>
          <p className="text-2xl font-bold text-[#F7F8F8] mt-1">{stats.uploads}</p>
        </div>
        <div className="bg-[#0F1011] rounded-xl p-5 border border-[#23252A]">
          <p className="text-sm text-[#8A8F98]">총 기록 수</p>
          <p className="text-2xl font-bold text-[#F7F8F8] mt-1">{stats.records.toLocaleString()}</p>
        </div>
        <div className="bg-[#0F1011] rounded-xl p-5 border border-[#23252A]">
          <p className="text-sm text-[#8A8F98]">등록 인원</p>
          <p className="text-2xl font-bold text-[#F7F8F8] mt-1">{stats.names}</p>
        </div>
        <div className="bg-[#0F1011] rounded-xl p-5 border border-[#23252A]">
          <p className="text-sm text-[#8A8F98]">데이터 기간</p>
          <p className="text-lg font-bold text-[#F7F8F8] mt-1">{stats.dateRange}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group bg-[#0F1011] rounded-xl p-6 border border-[#23252A] hover:border-[#23252A] hover:shadow-[0px_3px_12px_rgba(0,0,0,0.2)] transition-all"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${colorMap[card.color]}`}>
                <Icon size={24} />
              </div>
              <h3 className="text-lg font-semibold text-[#F7F8F8] mb-2">{card.title}</h3>
              <p className="text-sm text-[#8A8F98]">{card.desc}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
