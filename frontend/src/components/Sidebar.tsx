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
  CalendarCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

interface NavItem { href: string; label: string; icon: any; }
interface NavGroup { label: string; icon: any; items: NavItem[]; }

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
      { href: "/confirm-calendar-dispatch", label: "미확정 캘린더 관리", icon: CalendarCheck },
      { href: "/confirmed-list-dispatch", label: "근태 정보 확정 리스트", icon: Table2 },
      { href: "/dashboard?type=dispatch", label: "대시보드", icon: BarChart3 },
      { href: "/upload", label: "엑셀 업로드", icon: UploadCloud },
      { href: "/settlement-dispatch", label: "파견 정산관리", icon: Calculator },
      { href: "/settlement-alba", label: "알바(사업소득) 정산관리", icon: Calculator },
    ],
  },
  {
    label: "정규직 노무비",
    icon: Briefcase,
    items: [
      { href: "/attendance-summary-regular", label: "근태 정보 종합 요약", icon: ClipboardList },
      { href: "/confirm-calendar-regular", label: "미확정 캘린더 관리", icon: CalendarCheck },
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
  { href: "/policy", label: "반영기준", icon: ClipboardList },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const g of groups) {
      if (g.items.some((item) => pathname === item.href)) open.add(g.label);
    }
    if (open.size === 0) groups.forEach((g) => open.add(g.label));
    return open;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const renderItem = (item: NavItem, depth = 0) => {
    const isActive = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          "group relative flex items-center gap-2.5 rounded-[var(--r-md)] text-[var(--fs-body)] font-medium transition-colors",
          depth === 0 ? "px-3 py-2" : "pl-3 pr-3 py-1.5",
          isActive
            ? "text-[var(--text-1)] bg-[var(--bg-2)]"
            : "text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-2)]/60",
        ].join(" ")}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-[var(--brand-400)] to-[var(--brand-600)]"
          />
        )}
        <Icon size={depth === 0 ? 16 : 14} className={isActive ? "text-[var(--brand-400)]" : ""} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="w-64 fixed inset-y-0 z-20 flex flex-col bg-[var(--bg-0)]/95 backdrop-blur-md border-r border-[var(--border-1)]">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-[10px] bg-gradient-to-br from-[var(--brand-400)] to-[var(--brand-700)] flex items-center justify-center shadow-[var(--elev-2)]">
            <Sparkles size={16} className="text-white" />
            <div className="absolute inset-0 rounded-[10px] ring-1 ring-white/10" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-[var(--fs-base)] font-semibold text-[var(--text-1)] tracking-[var(--tracking-tight)] leading-none">근태 관리</h1>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-3)] mt-1">Attendance · Workforce</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 pb-4 space-y-0.5 flex-1 overflow-y-auto">
        {standaloneItems.map((it) => renderItem(it, 0))}

        <div className="h-3" />

        {groups.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = openGroups.has(group.label);
          const hasActive = group.items.some((item) => pathname === item.href);
          return (
            <div key={group.label} className="mt-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className={[
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--r-md)]",
                  "text-[var(--fs-caption)] uppercase tracking-wider font-semibold transition-colors",
                  hasActive
                    ? "text-[var(--text-2)]"
                    : "text-[var(--text-4)] hover:text-[var(--text-2)]",
                ].join(" ")}
              >
                <GroupIcon size={14} />
                <span className="flex-1 text-left text-[11px]">{group.label}</span>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 pl-3 ml-1.5 border-l border-[var(--border-1)]">
                  {group.items.map((item) => renderItem(item, 1))}
                </div>
              )}
            </div>
          );
        })}

        <div className="h-3" />
        <div className="pt-3 mt-1 border-t border-[var(--border-1)] space-y-0.5">
          {bottomItems.map((it) => renderItem(it, 0))}
        </div>
      </nav>

      {/* User */}
      {user && (
        <div className="p-3 border-t border-[var(--border-1)] bg-[var(--bg-1)]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[var(--bg-3)] flex items-center justify-center text-[var(--brand-400)] text-xs font-semibold ring-1 ring-[var(--border-2)]">
              {(user.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[var(--fs-caption)] font-medium text-[var(--text-1)] truncate">{user.email}</p>
              <p className="text-[10px] text-[var(--text-3)]">관리자</p>
            </div>
            <button
              onClick={logout}
              title="로그아웃"
              className="p-1.5 rounded-[var(--r-sm)] text-[var(--text-3)] hover:text-[var(--danger-fg)] hover:bg-[var(--danger-bg)] transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
