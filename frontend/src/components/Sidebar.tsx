"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  UploadCloud,
  BarChart3,
  Table2,
  ClipboardList,
  Database,
  Home,
  LogOut,
  Network,
  Users,
  MessageSquare,
  Activity,
  Calculator,
  Contact,
  ChevronDown,
  ChevronRight,
  Briefcase,
  UserCheck,
  Shield,
  HardHat,
  Lock,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

const standaloneItems: NavItem[] = [
  { href: "/", label: "홈", icon: Home },
];

const groups: NavGroup[] = [
  {
    label: "사업소득(알바)/파견 관리",
    icon: UserCheck,
    items: [
      { href: "/attendance-live", label: "실시간 현황판", icon: Activity },
      { href: "/survey-manage", label: "설문 출퇴근", icon: MessageSquare },
      { href: "/workers", label: "근무자 DB", icon: Contact },
      { href: "/weekly-holiday", label: "주휴수당 관리", icon: Shield },
    ],
  },
  {
    label: "현장 정규직 관리",
    icon: HardHat,
    items: [
      { href: "/regular-live", label: "실시간 현황판", icon: Activity },
      { href: "/regular-manage", label: "설문 출퇴근", icon: MessageSquare },
      { href: "/regular-workers", label: "근무자 DB", icon: Contact },
    ],
  },
  {
    label: "사업소득(알바)/파견 노무비",
    icon: Briefcase,
    items: [
      { href: "/attendance-summary-dispatch", label: "근태 정보 종합 요약", icon: ClipboardList },
      { href: "/confirmed-list-dispatch", label: "근태 정보 확정 리스트", icon: Table2 },
      { href: "/dashboard?type=dispatch", label: "대시보드", icon: BarChart3 },
      { href: "/upload", label: "엑셀 업로드", icon: UploadCloud },
    ],
  },
  {
    label: "정규직 노무비",
    icon: Briefcase,
    items: [
      { href: "/attendance-summary-regular", label: "근태 정보 종합 요약", icon: ClipboardList },
      { href: "/confirmed-list-regular", label: "근태 정보 확정 리스트", icon: Table2 },
      { href: "/dashboard?type=regular", label: "대시보드", icon: BarChart3 },
      { href: "/upload-regular", label: "엑셀 업로드", icon: UploadCloud },
      { href: "/salary-manage", label: "기본급 관리", icon: Calculator },
      { href: "/payroll-calc", label: "급여 계산", icon: Calculator },
    ],
  },
];

const bottomItems: NavItem[] = [
  { href: "/org-chart", label: "조직도", icon: Network },
  { href: "/manage", label: "데이터 관리", icon: Database },
  { href: "/password-manage", label: "비밀번호 관리", icon: Lock },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // Auto-open group containing current page
    const open = new Set<string>();
    for (const g of groups) {
      if (g.items.some((item) => pathname === item.href)) {
        open.add(g.label);
      }
    }
    // Default: open all groups
    if (open.size === 0) {
      groups.forEach((g) => open.add(g.label));
    }
    return open;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const renderItem = (item: NavItem) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-blue-50 text-blue-700"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        <Icon size={18} />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 fixed h-full z-10 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">근태 관리 시스템</h1>
        <p className="text-sm text-gray-500 mt-1">Attendance Manager</p>
      </div>
      <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
        {/* Standalone top items */}
        {standaloneItems.map(renderItem)}

        {/* Grouped items */}
        {groups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = openGroups.has(group.label);
          const hasActive = group.items.some(
            (item) => pathname === item.href
          );
          return (
            <div key={group.label} className="mt-2">
              <button
                onClick={() => toggleGroup(group.label)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  hasActive
                    ? "text-blue-700"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <GroupIcon size={18} />
                <span className="flex-1 text-left">{group.label}</span>
                {isOpen ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
              {isOpen && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-2">
                  {group.items.map(renderItem)}
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom standalone items */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          {bottomItems.map(renderItem)}
        </div>
      </nav>
      {user && (
        <div className="p-4 border-t border-gray-200">
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.email}
            </p>
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
