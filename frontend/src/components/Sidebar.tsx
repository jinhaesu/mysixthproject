"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UploadCloud,
  BarChart3,
  Table2,
  ClipboardList,
  Database,
  Home,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

const navItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/upload", label: "엑셀 업로드", icon: UploadCloud },
  { href: "/dashboard", label: "대시보드", icon: BarChart3 },
  { href: "/pivot", label: "피벗 테이블", icon: Table2 },
  { href: "/records", label: "기록 조회", icon: ClipboardList },
  { href: "/manage", label: "데이터 관리", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 fixed h-full z-10 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">근태 관리 시스템</h1>
        <p className="text-sm text-gray-500 mt-1">Attendance Manager</p>
      </div>
      <nav className="p-4 space-y-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      {user && (
        <div className="p-4 border-t border-gray-200">
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <LogOut size={20} />
            로그아웃
          </button>
        </div>
      )}
    </aside>
  );
}
