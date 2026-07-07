"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import {
  getRegularEmployees,
  getRegularContracts,
  sendRegularContract,
  sendRegularLink,
  sendRegularLinkBatch,
} from "@/lib/api";
import { Coffee, Send, Search, ExternalLink, FileSignature, Activity, Loader2, MessageSquare, MapPin } from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Field,
  Modal,
  useToast,
} from "@/components/ui";

// 카페 부서 목록 — regular-workers 의 DEPARTMENTS 와 동기화 필요 시 함께 갱신.
const CAFE_DEPARTMENTS = ["카페(해방촌)", "카페(행궁동)", "카페(경복궁)"] as const;

// 매장별 근무 장소 주소 — 백엔드 send 라우트와 동일 값 유지.
const CAFE_STORE_ADDRESSES: Record<string, string> = {
  "카페(해방촌)": "서울특별시 용산구 신흥로15길 18-12 (널담은공간 해방촌점)",
  "카페(행궁동)": "경기도 수원시 팔달구 정조로886번길 14 1층 (널담은공간 화홍문점)",
  "카페(경복궁)": "서울특별시 종로구 삼청로 24 (널담은공간 경복궁점)",
};

interface Employee {
  id: number;
  name: string;
  phone: string;
  department: string;
  team?: string;
  role?: string;
  hire_date?: string | null;
  is_active?: number;
}

interface ContractSummary {
  status: string;
  contract_start?: string;
  contract_end?: string;
  contract_kind?: string;
  token?: string;
}

// 초기에 무조건 노출하고 싶은 카페 정규직 이름 화이트리스트 —
// 부서가 아직 '카페(...)'로 세팅되지 않은 사람(예: 전서현이 임시로 생산부서로 등록된 경우)도 잡히도록.
const CAFE_NAME_WHITELIST = ["황금빛", "신아름누리", "전서현"];

export default function RegularCafePage() {
  const toast = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractsById, setContractsById] = useState<Record<number, ContractSummary>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Employee | null>(null);

  // Contract form — 카페 정규직 발송용 최소 폼.
  const today = new Date().toLocaleDateString("sv-SE");
  const oneYearLater = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString("sv-SE");
  })();
  const [form, setForm] = useState({
    contract_start: today,
    contract_end: oneYearLater,
    work_start_date: today,
    department: CAFE_DEPARTMENTS[0] as string,
    position_title: "바리스타",
    base_pay: "",
    meal_allowance: "",
    other_allowance: "",
    annual_salary: "",
    pay_day: "10",
  });
  const [sending, setSending] = useState(false);

  // 출퇴근 링크 발송 상태 — 계약과 별개 흐름 (링크: /r?token=<employee.token>)
  const [sendingAttendanceId, setSendingAttendanceId] = useState<number | null>(null);
  const [sendingAttendanceAll, setSendingAttendanceAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 전체 정규직 로드 후 카페 필터. include_resigned=1 로 퇴사자 진단 포함.
      const data = await getRegularEmployees({ include_resigned: "1", limit: "500", page: "1" });
      const list: Employee[] = data.employees || data || [];
      const cafeList = list.filter(
        (e) =>
          (e.department || "").startsWith("카페") ||
          CAFE_NAME_WHITELIST.includes(e.name)
      );
      setEmployees(cafeList);

      // 계약 목록 로드 → employee_id 별 최신 계약 요약.
      try {
        const contracts = await getRegularContracts();
        const map: Record<number, ContractSummary> = {};
        for (const c of (contracts as any[]) || []) {
          const eid = c.employee_id;
          if (!eid) continue;
          if (!map[eid]) {
            map[eid] = {
              status: c.status || "pending",
              contract_start: c.contract_start,
              contract_end: c.contract_end,
              contract_kind: c.contract_kind || "production",
              token: c.token,
            };
          }
        }
        setContractsById(map);
      } catch {
        // 계약 조회 실패해도 근무자 목록은 노출.
      }
    } catch (err: any) {
      toast.error(err?.message || "로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return employees;
    return employees.filter(
      (e) => e.name.includes(s) || (e.phone || "").includes(s)
    );
  }, [employees, search]);

  const openSend = (emp: Employee) => {
    setModal(emp);
    // 카페 부서 자동 선택 (아니면 첫번째 매장).
    const dept = (emp.department || "").startsWith("카페")
      ? emp.department
      : (CAFE_DEPARTMENTS[0] as string);
    setForm((prev) => ({
      ...prev,
      department: dept,
      work_start_date: emp.hire_date || today,
    }));
  };

  // 출퇴근 링크 개별 발송 — /r?token=<employee.token> (계약과 분리된 정규직 영구 링크).
  // SMS 헤더는 [조인앤조인 카페팀 출퇴근] 으로 백엔드에서 분기.
  const handleSendAttendance = async (emp: Employee) => {
    setSendingAttendanceId(emp.id);
    try {
      const res = await sendRegularLink(emp.id, "cafe");
      if (res?.success) {
        toast.success(`${emp.name}에게 출퇴근 링크가 발송되었습니다.`);
      } else {
        toast.error(res?.error || "SMS 발송 실패");
      }
    } catch (err: any) {
      toast.error(err?.message || "SMS 발송 실패");
    } finally {
      setSendingAttendanceId(null);
    }
  };

  // 재직 중인 카페 정규직 전원에게 출퇴근 링크 일괄 발송.
  const handleSendAttendanceAll = async () => {
    const activeIds = filtered.filter((e) => e.is_active !== 0).map((e) => e.id);
    if (activeIds.length === 0) {
      toast.info("발송 대상이 없습니다.");
      return;
    }
    if (
      !window.confirm(
        `재직 중인 카페 정규직 ${activeIds.length}명에게 출퇴근 링크를 발송합니다. 진행할까요?`
      )
    ) {
      return;
    }
    setSendingAttendanceAll(true);
    try {
      const res = await sendRegularLinkBatch(activeIds, "cafe");
      const sent = res?.sent ?? 0;
      const failed = res?.failed ?? 0;
      if (failed === 0) {
        toast.success(`${sent}명에게 출퇴근 링크가 발송되었습니다.`);
      } else {
        toast.info(`발송 ${sent}건 / 실패 ${failed}건`);
      }
    } catch (err: any) {
      toast.error(err?.message || "일괄 발송 실패");
    } finally {
      setSendingAttendanceAll(false);
    }
  };

  const handleSend = async () => {
    if (!modal) return;
    if (!form.base_pay.trim()) {
      toast.info("기본급(월)을 입력해주세요.");
      return;
    }
    if (!form.meal_allowance.trim()) {
      toast.info("식대를 입력해주세요.");
      return;
    }
    setSending(true);
    try {
      const workPlace = CAFE_STORE_ADDRESSES[form.department] || "널담은공간 매장";
      await sendRegularContract(modal.id, {
        contract_start: form.contract_start,
        contract_end: form.contract_end,
        work_start_date: form.work_start_date,
        department: form.department,
        position_title: form.position_title,
        base_pay: form.base_pay,
        meal_allowance: form.meal_allowance,
        other_allowance: form.other_allowance,
        annual_salary: form.annual_salary,
        pay_day: form.pay_day,
        work_place: workPlace,
        contract_kind: "cafe",
      });
      toast.success("카페 정규직 근로계약서가 발송되었습니다.");
      setModal(null);
      load();
    } catch (err: any) {
      toast.error(err?.message || "발송 실패");
    } finally {
      setSending(false);
    }
  };

  const renderContractBadge = (empId: number) => {
    const c = contractsById[empId];
    if (!c) return <Badge tone="warning">미발송</Badge>;
    if (c.status === "signed") {
      const kind = c.contract_kind === "cafe" ? "카페" : "생산";
      return (
        <div className="flex items-center gap-1.5">
          <Badge tone="success">서명완료</Badge>
          <span className="text-[11px] text-[var(--text-4)]">{kind}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <Badge tone="info">발송·대기</Badge>
        {c.contract_kind === "production" && (
          <span
            className="text-[11px] text-[var(--warning-fg)]"
            title="기존 계약이 생산직 문구로 발송됨. 카페 문구로 재발송 필요."
          >
            ⚠ 생산문구
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Coffee size={28} className="text-[var(--brand-400)]" />
            카페팀 근로계약 및 출퇴근
          </span>
        }
        description={
          <>
            카페 정규직(황금빛·신아름누리·전서현) 근로계약을 카페용 조항으로 발송하고, 오늘 출퇴근 상태를 확인합니다.
            <span className="ml-2 text-[var(--text-4)]">총 {filtered.length}명</span>
          </>
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<MessageSquare size={14} />}
              onClick={handleSendAttendanceAll}
              loading={sendingAttendanceAll}
            >
              전원 출퇴근 링크 발송
            </Button>
            <Link href="/regular-live" className="text-[13px] text-[var(--brand-400)] hover:underline inline-flex items-center gap-1">
              <Activity size={14} /> 실시간 현황판
              <ExternalLink size={12} />
            </Link>
            <Link href="/contract-manage" className="text-[13px] text-[var(--brand-400)] hover:underline inline-flex items-center gap-1">
              <FileSignature size={14} /> 계약서 확정 관리
              <ExternalLink size={12} />
            </Link>
          </div>
        }
      />

      {/* 정규직 출퇴근 안내 배너 — 카페 알바(사업소득)와 다르게 계약이 링크에 embed되지 않음 */}
      <div className="mb-4 p-3 rounded-[var(--r-md)] bg-[var(--bg-0)] border border-[var(--border-1)] text-[12px] text-[var(--text-3)]">
        <div className="flex items-start gap-2">
          <MapPin size={14} className="mt-0.5 text-[var(--brand-400)] flex-shrink-0" />
          <div>
            <p>
              <span className="font-medium text-[var(--text-1)]">정규직 출퇴근 링크는 계약서와 별도</span>로 발송됩니다.
              카페 알바(사업소득) 링크와 달리 출퇴근 링크에 근로계약이 포함되지 않으며, 급여계산도 월급·4대보험 기반입니다.
            </p>
            <p className="mt-1 text-[var(--text-4)]">
              링크 형식: <code className="text-[var(--text-2)]">/r?token=&lt;직원영구토큰&gt;</code> (매일 동일 링크 사용)
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="max-w-md">
          <Input
            type="text"
            placeholder="이름 또는 전화번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            iconLeft={<Search size={14} />}
          />
        </div>
      </div>

      <Card padding="none">
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-[var(--text-3)]">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-3)]">
            <p>카페 정규직으로 등록된 근무자가 없습니다.</p>
            <p className="text-[12px] text-[var(--text-4)] mt-1">
              /regular-workers 에서 부서를 &apos;카페(...)&apos; 로 변경하면 이 목록에 노출됩니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--bg-0)] text-[var(--text-3)]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">이름</th>
                  <th className="text-left px-3 py-2 font-medium">전화</th>
                  <th className="text-left px-3 py-2 font-medium">부서</th>
                  <th className="text-left px-3 py-2 font-medium">입사일</th>
                  <th className="text-left px-3 py-2 font-medium">최신 계약</th>
                  <th className="text-left px-3 py-2 font-medium">상태</th>
                  <th className="text-right px-3 py-2 font-medium">액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const isCafeDept = (emp.department || "").startsWith("카페");
                  const isResigned = emp.is_active === 0;
                  return (
                    <tr key={emp.id} className="border-t border-[var(--border-1)]">
                      <td className="px-3 py-2 font-medium text-[var(--text-1)]">
                        {emp.name}
                        {!isCafeDept && (
                          <span
                            className="ml-1 text-[11px] text-[var(--warning-fg)]"
                            title="부서가 카페로 지정되지 않음. 계약 발송은 카페 문구로 자동 처리됩니다."
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular text-[var(--text-2)]">{emp.phone || "-"}</td>
                      <td className="px-3 py-2 text-[var(--text-2)]">
                        {emp.department || <span className="text-[var(--warning-fg)]">미지정</span>}
                      </td>
                      <td className="px-3 py-2 tabular text-[var(--text-2)]">{emp.hire_date || "-"}</td>
                      <td className="px-3 py-2">{renderContractBadge(emp.id)}</td>
                      <td className="px-3 py-2">
                        {isResigned ? (
                          <Badge tone="danger">퇴사</Badge>
                        ) : (
                          <Badge tone="success">재직중</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            leadingIcon={<MessageSquare size={12} />}
                            onClick={() => handleSendAttendance(emp)}
                            disabled={isResigned || sendingAttendanceId !== null}
                            loading={sendingAttendanceId === emp.id}
                            title="출퇴근 링크(/r?token=...) SMS 발송 — 계약과 무관"
                          >
                            출퇴근 링크
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            leadingIcon={<Send size={12} />}
                            onClick={() => openSend(emp)}
                            disabled={isResigned}
                          >
                            카페 계약 발송
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && (
        <Modal
          open={!!modal}
          onClose={() => setModal(null)}
          title={`카페 정규직 근로계약 발송 · ${modal.name}`}
          size="lg"
        >
          <div className="space-y-3">
            <p className="text-[13px] text-[var(--text-3)]">
              카페용 조항(담당업무 = 매장 운영·음료 제조, 근무장소 = 매장 주소)으로 자동 발송됩니다. 생산직 계약서와는 별도 문구입니다.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="계약 시작일">
                <Input
                  type="date"
                  value={form.contract_start}
                  onChange={(e) => {
                    const s = e.target.value;
                    let end = form.contract_end;
                    if (s) {
                      const d = new Date(s);
                      d.setFullYear(d.getFullYear() + 1);
                      d.setDate(d.getDate() - 1);
                      end = d.toLocaleDateString("sv-SE");
                    }
                    setForm({ ...form, contract_start: s, contract_end: end });
                  }}
                />
              </Field>
              <Field label="계약 종료일">
                <Input
                  type="date"
                  value={form.contract_end}
                  onChange={(e) => setForm({ ...form, contract_end: e.target.value })}
                />
              </Field>
            </div>
            <Field label="입사일 (첫 계약 후 변경 X)">
              <Input
                type="date"
                value={form.work_start_date}
                onChange={(e) => setForm({ ...form, work_start_date: e.target.value })}
              />
            </Field>
            <Field label="근무 매장 (자동으로 주소 매핑)">
              <Select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              >
                {CAFE_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-[var(--text-4)] mt-1">
                → {CAFE_STORE_ADDRESSES[form.department] || "-"}
              </p>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="직책">
                <Input
                  type="text"
                  value={form.position_title}
                  onChange={(e) => setForm({ ...form, position_title: e.target.value })}
                />
              </Field>
              <Field label="급여일 (매월)">
                <Input
                  type="text"
                  value={form.pay_day}
                  onChange={(e) => setForm({ ...form, pay_day: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="기본급(월) *">
                <Input
                  type="text"
                  value={form.base_pay}
                  onChange={(e) => {
                    const bp = e.target.value;
                    const bpNum = parseInt(bp.replace(/,/g, "") || "0", 10);
                    const mealNum = parseInt(form.meal_allowance.replace(/,/g, "") || "0", 10);
                    setForm({
                      ...form,
                      base_pay: bp,
                      annual_salary: ((bpNum + mealNum) * 12).toLocaleString(),
                    });
                  }}
                  placeholder="예: 2,300,000"
                />
              </Field>
              <Field label="식대 *">
                <Input
                  type="text"
                  value={form.meal_allowance}
                  onChange={(e) => {
                    const meal = e.target.value;
                    const bpNum = parseInt(form.base_pay.replace(/,/g, "") || "0", 10);
                    const mealNum = parseInt(meal.replace(/,/g, "") || "0", 10);
                    setForm({
                      ...form,
                      meal_allowance: meal,
                      annual_salary: ((bpNum + mealNum) * 12).toLocaleString(),
                    });
                  }}
                  placeholder="예: 200,000"
                />
              </Field>
            </div>
            <Field label="기타수당(선택)">
              <Input
                type="text"
                value={form.other_allowance}
                onChange={(e) => setForm({ ...form, other_allowance: e.target.value })}
                placeholder="0 또는 미입력"
              />
            </Field>
            <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--bg-0)] border border-[var(--border-1)] text-[12px] text-[var(--text-3)]">
              연봉 총액 (기본급+식대 × 12):{" "}
              <span className="font-semibold text-[var(--text-1)]">
                {form.annual_salary ? `${form.annual_salary}원` : "-"}
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={sending}>
                취소
              </Button>
              <Button variant="primary" leadingIcon={<Send size={14} />} onClick={handleSend} loading={sending}>
                카페 계약 발송
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
