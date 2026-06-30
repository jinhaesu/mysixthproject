"use client";

import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Select,
  SectionHeader,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  useToast,
  Badge,
  Tabs,
} from "@/components/ui";
import { Send, FileSignature, Clock } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STORES = ["해방촌", "행궁동", "경복궁"];

// 매장별 휴게시간 관행 기본값(분). 절대적이지 않으며 시프트별 수동 조정 가능.
// 행궁동(수원점)은 0분 관행이나, 4시간 이상 근무에는 법정 30분 의무 → 발송 폼에서 경고/자동보정.
const STORE_BREAK_DEFAULT: Record<string, 0 | 30 | 60> = {
  해방촌: 60,
  경복궁: 30,
  행궁동: 0,
};

// 근로기준법 제54조: 4h 이상 30분, 8h 이상 60분 의무.
// 0.01 톨러런스로 분 단위 부동소수점 오차 흡수.
function legalMinBreak(workMinutes: number): 0 | 30 | 60 {
  if (workMinutes >= 8 * 60 - 1) return 60;
  if (workMinutes >= 4 * 60 - 1) return 30;
  return 0;
}

// 'HH:MM' ~ 'HH:MM' → 분 단위 (자정 넘김 미지원, 카페 영업시간 가정)
function minutesBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

interface CafeContract {
  id: number;
  phone: string;
  worker_name: string;
  store_name: string;
  work_time_start: string;
  work_time_end: string;
  work_days: string;
  hourly_rate: number;
  contract_start: string;
  contract_end: string;
  status: string;
  sms_sent: number;
  created_at: string;
}

interface CafeWorker {
  phone: string;
  worker_name: string;
  store_name: string;
  work_time_start: string;
  work_time_end: string;
  hourly_rate: number;
  contract_end: string;
  status: string;
}

interface AttendanceLog {
  id: number;
  phone: string;
  date: string;
  department: string;
  status: string;
  planned_clock_in: string | null;
  planned_clock_out: string | null;
  created_at: string;
  workplace_name: string;
  clock_in_time: string | null;
  clock_out_time: string | null;
  worker_name_ko: string | null;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function plusYear(date: string): string {
  if (!date || date.length < 10) return "";
  const y = parseInt(date.slice(0, 4)) + 1;
  return `${y}${date.slice(4)}`;
}

async function authedFetch(path: string, init?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init?.body) headers["Content-Type"] = "application/json";
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

type TabId = "contract" | "attendance";

export default function CafeContractSendPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("contract");

  // ===== 근로계약 발송 폼 =====
  const [phone, setPhone] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [store, setStore] = useState("해방촌");
  const [workTimeStart, setWorkTimeStart] = useState("10:00");
  const [workTimeEnd, setWorkTimeEnd] = useState("19:00");
  const [days, setDays] = useState<string[]>(["월", "화", "수", "목", "금"]);
  const [hourlyRate, setHourlyRate] = useState<number>(11000);
  const [contractStart, setContractStart] = useState(today());
  const [contractEnd, setContractEnd] = useState(plusYear(today()));
  const [submitting, setSubmitting] = useState(false);

  const [contractList, setContractList] = useState<CafeContract[]>([]);
  const [loadingContractList, setLoadingContractList] = useState(false);

  // ===== 출퇴근 링크 발송 폼 =====
  const [workers, setWorkers] = useState<CafeWorker[]>([]);
  const [selectedPhone, setSelectedPhone] = useState("");
  const [attDate, setAttDate] = useState(today());
  const [attStore, setAttStore] = useState("해방촌");
  const [attClockIn, setAttClockIn] = useState("");
  const [attClockOut, setAttClockOut] = useState("");
  const [attPhone, setAttPhone] = useState("");
  const [attWorkerName, setAttWorkerName] = useState("");
  const [attBreakMinutes, setAttBreakMinutes] = useState<0 | 30 | 60>(60); // 기본 해방촌(60)
  const [attBreakTouched, setAttBreakTouched] = useState(false); // 사용자가 명시 선택했는지
  const [attSubmitting, setAttSubmitting] = useState(false);

  // 주간 반복 발송 모드
  const [attSendMode, setAttSendMode] = useState<"single" | "weekly">("single");
  const [attWeekStart, setAttWeekStart] = useState(() => {
    const d = new Date();
    const dow = d.getDay();
    const daysUntilMon = (1 - dow + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMon);
    return d.toLocaleDateString("sv-SE");
  });
  const [attWeekdays, setAttWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [attWeeklyTime, setAttWeeklyTime] = useState("09:00");
  const [attWeeklyRepeat, setAttWeeklyRepeat] = useState(1);
  const ATT_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
  const toggleAttWeekday = (n: number) => {
    setAttWeekdays((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  };

  const [attendanceList, setAttendanceList] = useState<AttendanceLog[]>([]);
  const [loadingAttList, setLoadingAttList] = useState(false);

  const loadContractList = async () => {
    setLoadingContractList(true);
    try {
      const res = await authedFetch("/api/cafe-contract/list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setContractList(await res.json());
    } catch (e: any) {
      toast.error("이력 조회 실패", e.message);
    } finally {
      setLoadingContractList(false);
    }
  };

  const loadWorkers = async () => {
    try {
      const res = await authedFetch("/api/cafe-contract/workers");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWorkers(await res.json());
    } catch (e: any) {
      toast.error("직원 목록 조회 실패", e.message);
    }
  };

  const loadAttendanceList = async () => {
    setLoadingAttList(true);
    try {
      const res = await authedFetch("/api/cafe-contract/list-attendance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAttendanceList(await res.json());
    } catch (e: any) {
      toast.error("출퇴근 이력 조회 실패", e.message);
    } finally {
      setLoadingAttList(false);
    }
  };

  useEffect(() => {
    loadContractList();
    loadWorkers();
    loadAttendanceList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 선택된 직원이 바뀌면 폼 자동 채우기
  useEffect(() => {
    if (!selectedPhone) return;
    const w = workers.find((x) => x.phone === selectedPhone);
    if (!w) return;
    setAttPhone(w.phone);
    setAttWorkerName(w.worker_name);
    setAttStore(w.store_name);
    setAttClockIn(w.work_time_start);
    setAttClockOut(w.work_time_end);
    setAttBreakTouched(false); // 직원 바뀌면 매장 기본값 다시 적용
  }, [selectedPhone, workers]);

  // 매장 변경 시 휴게 기본값 자동 (사용자가 명시 선택 전까지만)
  useEffect(() => {
    if (attBreakTouched) return;
    const def = STORE_BREAK_DEFAULT[attStore];
    if (def !== undefined) setAttBreakMinutes(def);
  }, [attStore, attBreakTouched]);

  // 계획 출퇴근 기반 법정 의무 휴게시간 계산
  const attWorkMinutes = minutesBetween(attClockIn, attClockOut);
  const attLegalMin = legalMinBreak(attWorkMinutes);
  const attBreakViolation = attWorkMinutes > 0 && attBreakMinutes < attLegalMin;

  const toggleDay = (d: string) => {
    setDays((prev) =>
      prev.includes(d)
        ? prev.filter((x) => x !== d)
        : [...prev, d].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b)),
    );
  };

  const handleSendContract = async () => {
    if (!phone.trim()) return toast.warning("전화번호를 입력해주세요.");
    if (!workerName.trim()) return toast.warning("이름을 입력해주세요.");
    if (days.length === 0) return toast.warning("근무일을 선택해주세요.");
    if (!hourlyRate || hourlyRate < 1000)
      return toast.warning("시급을 1,000원 이상으로 입력해주세요.");

    setSubmitting(true);
    try {
      const res = await authedFetch("/api/cafe-contract/send", {
        method: "POST",
        body: JSON.stringify({
          phone: phone.trim(),
          worker_name: workerName.trim(),
          store_name: store,
          work_time_start: workTimeStart,
          work_time_end: workTimeEnd,
          work_days: days.join("·"),
          hourly_rate: hourlyRate,
          contract_start: contractStart,
          contract_end: contractEnd,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `발송 실패 (HTTP ${res.status})`);
      toast.success("SMS 발송 완료", `${workerName} (${phone}) → ${store}점`);
      setPhone("");
      setWorkerName("");
      loadContractList();
      loadWorkers();
    } catch (e: any) {
      toast.error("발송 실패", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendAttendance = async () => {
    if (!attPhone.trim()) return toast.warning("전화번호를 입력해주세요.");
    if (!attStore) return toast.warning("매장을 선택해주세요.");
    if (attSendMode === "single" && !attDate) return toast.warning("날짜를 선택해주세요.");
    if (attSendMode === "weekly" && attWeekdays.length === 0) return toast.warning("주간 발송: 최소 한 요일은 선택해주세요.");

    // 근로기준법 휴게 의무 미달 시 발송 직전 한 번 더 명시 확인
    if (attBreakViolation) {
      const ok = window.confirm(
        `⚠ 근로기준법 위반 경고\n\n` +
          `계획 근무 ${Math.floor(attWorkMinutes / 60)}시간 ${attWorkMinutes % 60}분 → 법정 최소 휴게 ${attLegalMin}분.\n` +
          `현재 ${attBreakMinutes}분은 부족합니다.\n\n` +
          `그래도 이대로 발송하시겠습니까?`,
      );
      if (!ok) return;
    }

    setAttSubmitting(true);
    try {
      const payload: any = {
        phone: attPhone.trim(),
        worker_name: attWorkerName.trim(),
        store_name: attStore,
        planned_clock_in: attClockIn || null,
        planned_clock_out: attClockOut || null,
        break_minutes: attBreakMinutes,
      };
      if (attSendMode === "weekly") {
        payload.week_schedule = {
          start_date: attWeekStart,
          weekdays: attWeekdays,
          daily_time: attWeeklyTime,
          repeat_weeks: attWeeklyRepeat,
        };
      } else {
        payload.date = attDate;
      }
      const res = await authedFetch("/api/cafe-contract/send-attendance-link", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `발송 실패 (HTTP ${res.status})`);
      if (body.scheduled_weekly) {
        toast.success(
          "주간 반복 예약 완료",
          `${attWorkerName || attPhone} → ${attStore}점, ${body.count}회 (${attWeeklyRepeat}주 × ${attWeekdays.length}일) 자동 발송`,
        );
      } else {
        toast.success("출퇴근 링크 발송 완료", `${attWorkerName || attPhone} → ${attStore}점`);
      }
      loadAttendanceList();
    } catch (e: any) {
      toast.error("발송 실패", e.message);
    } finally {
      setAttSubmitting(false);
    }
  };

  const tabs = [
    { id: "contract" as const, label: "근로계약 SMS 발송", icon: <FileSignature className="w-4 h-4" /> },
    { id: "attendance" as const, label: "출퇴근 링크 발송", icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="카페팀"
        title="카페팀 근로계약 및 출퇴근"
        description="널담은공간 3개 매장(해방촌·행궁동·경복궁) 알바 근로자의 근로계약·출퇴근 SMS를 통합 관리합니다."
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} variant="underline" />

      {tab === "contract" && (
        <>
          <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
            <SectionHeader eyebrow="1단계" title="근로계약 SMS 발송" />
            <p className="text-[12px] text-[var(--text-3)] mb-3 mt-1">
              직원에게 시급·매장·근무시간·근무일이 명시된 단시간 근로계약서 링크를 SMS로 발송합니다.
              직원이 링크에서 서명하면 자동으로 계약이 체결됩니다.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <Field label="이름" required>
                <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="예: 김카페" />
              </Field>
              <Field label="전화번호" required hint="010-0000-0000 또는 01000000000">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-3487-6451" />
              </Field>

              <Field label="매장" required>
                <Select value={store} onChange={(e) => setStore(e.target.value)}>
                  {STORES.map((s) => (
                    <option key={s} value={s}>
                      널담은공간 {s}점
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="시급(원)" required>
                <Input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(parseInt(e.target.value) || 0)}
                  inputMode="numeric"
                  min={1000}
                  step={100}
                />
              </Field>

              <Field label="근무 시작 시간" required>
                <Input type="time" value={workTimeStart} onChange={(e) => setWorkTimeStart(e.target.value)} />
              </Field>
              <Field label="근무 종료 시간" required>
                <Input type="time" value={workTimeEnd} onChange={(e) => setWorkTimeEnd(e.target.value)} />
              </Field>

              <Field label="근무일" required hint="복수 선택 가능 (휴게시간 1시간 포함)">
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((d) => {
                    const active = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={[
                          "px-3 py-1.5 rounded-[var(--r-md)] text-[12.5px] font-medium border transition-colors",
                          active
                            ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]"
                            : "bg-[var(--bg-2)] text-[var(--text-2)] border-[var(--border-2)] hover:bg-[var(--bg-3)]",
                        ].join(" ")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="계약기간">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
                  <Input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
                </div>
              </Field>
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="lg" loading={submitting} onClick={handleSendContract}>
                <Send className="w-4 h-4 mr-1" />
                근로계약 SMS 발송
              </Button>
            </div>
          </Card>

          <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader eyebrow="이력" title="근로계약 발송 이력 (최근 200건)" />
              <Button size="sm" variant="ghost" onClick={loadContractList} loading={loadingContractList}>
                새로고침
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>발송일시</TH>
                    <TH>이름</TH>
                    <TH>전화번호</TH>
                    <TH>매장</TH>
                    <TH>근무시간</TH>
                    <TH>근무일</TH>
                    <TH>시급</TH>
                    <TH>계약기간</TH>
                    <TH>SMS</TH>
                    <TH>서명</TH>
                  </TR>
                </THead>
                <TBody>
                  {contractList.length === 0 ? (
                    <TR>
                      <TD colSpan={10} className="text-center text-[var(--text-3)] py-6">
                        {loadingContractList ? "불러오는 중…" : "발송 이력이 없습니다."}
                      </TD>
                    </TR>
                  ) : (
                    contractList.map((r) => (
                      <TR key={r.id}>
                        <TD>{r.created_at?.slice(0, 16).replace("T", " ")}</TD>
                        <TD>{r.worker_name}</TD>
                        <TD>{r.phone}</TD>
                        <TD>{r.store_name}</TD>
                        <TD className="tabular">
                          {r.work_time_start} ~ {r.work_time_end}
                        </TD>
                        <TD>{r.work_days}</TD>
                        <TD className="tabular">{(r.hourly_rate || 0).toLocaleString()}</TD>
                        <TD className="tabular">
                          {r.contract_start} ~ {r.contract_end}
                        </TD>
                        <TD>
                          <Badge tone={r.sms_sent ? "success" : "danger"}>
                            {r.sms_sent ? "발송됨" : "실패"}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge tone={r.status === "signed" ? "success" : "warning"}>
                            {r.status === "signed" ? "서명완료" : "대기중"}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {tab === "attendance" && (
        <>
          <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
            <SectionHeader eyebrow="2단계" title="출퇴근 링크 발송" />
            <p className="text-[12px] text-[var(--text-3)] mb-3 mt-1">
              근로계약을 체결한 카페팀 직원에게 출퇴근 기록용 SMS 링크를 발송합니다.
              직원이 매장에 도착해 링크를 누르면 출근, 퇴근 시 다시 눌러 퇴근이 기록됩니다.
            </p>
            {/* 발송 모드 토글 */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setAttSendMode("single")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  attSendMode === "single"
                    ? "bg-[var(--brand-500)] text-white"
                    : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
                }`}
              >
                단발 발송 (1일)
              </button>
              <button
                type="button"
                onClick={() => setAttSendMode("weekly")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  attSendMode === "weekly"
                    ? "bg-[var(--brand-500)] text-white"
                    : "bg-[var(--bg-2)] text-[var(--text-3)] hover:bg-[var(--bg-2)]/7"
                }`}
              >
                주간 반복 (예약)
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="기존 직원 선택" hint="아래 필드가 자동 채워집니다. 신규 직원은 직접 입력.">
                <Select value={selectedPhone} onChange={(e) => setSelectedPhone(e.target.value)}>
                  <option value="">직접 입력</option>
                  {workers.map((w) => (
                    <option key={w.phone} value={w.phone}>
                      {w.worker_name} ({w.phone}) — {w.store_name}점
                    </option>
                  ))}
                </Select>
              </Field>
              {attSendMode === "single" && (
                <Field label="날짜" required>
                  <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
                </Field>
              )}
              {attSendMode === "weekly" && (
                <Field label="발송 시각" required>
                  <Input type="time" value={attWeeklyTime} onChange={(e) => setAttWeeklyTime(e.target.value)} />
                </Field>
              )}

              <Field label="이름">
                <Input value={attWorkerName} onChange={(e) => setAttWorkerName(e.target.value)} placeholder="예: 김카페" />
              </Field>
              <Field label="전화번호" required>
                <Input value={attPhone} onChange={(e) => setAttPhone(e.target.value)} placeholder="010-3487-6451" />
              </Field>

              <Field label="매장" required>
                <Select value={attStore} onChange={(e) => setAttStore(e.target.value)}>
                  {STORES.map((s) => (
                    <option key={s} value={s}>
                      널담은공간 {s}점
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="계획 출근">
                  <Input type="time" value={attClockIn} onChange={(e) => setAttClockIn(e.target.value)} />
                </Field>
                <Field label="계획 퇴근">
                  <Input type="time" value={attClockOut} onChange={(e) => setAttClockOut(e.target.value)} />
                </Field>
              </div>

              <Field
                label="휴게시간"
                hint={`매장 기본값: ${attStore} = ${STORE_BREAK_DEFAULT[attStore] ?? 0}분. 법정 의무: 근무 4h이상 30분 / 8h이상 60분.`}
              >
                <div className="flex gap-2">
                  {([0, 30, 60] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setAttBreakMinutes(m); setAttBreakTouched(true); }}
                      className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
                        attBreakMinutes === m
                          ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]"
                          : "bg-[var(--bg-1)] text-[var(--text-3)] border-[var(--border-1)] hover:bg-[var(--bg-2)]"
                      }`}
                    >
                      {m === 0 ? "없음" : m === 30 ? "30분" : "1시간"}
                    </button>
                  ))}
                </div>
                {attBreakViolation && (
                  <div className="mt-2 p-2 rounded-md bg-[var(--warning-fg)]/10 border border-[var(--warning-fg)]/30 text-xs text-[var(--warning-fg)] flex items-start gap-2">
                    <span className="font-semibold">⚠ 근로기준법 위반 가능</span>
                    <span>
                      계획 근무 {Math.floor(attWorkMinutes / 60)}시간 {attWorkMinutes % 60}분 → 법정 최소 휴게 {attLegalMin}분.
                      현재 {attBreakMinutes}분은 부족합니다.
                    </span>
                    <button
                      type="button"
                      onClick={() => { setAttBreakMinutes(attLegalMin); setAttBreakTouched(true); }}
                      className="ml-auto px-2 py-0.5 rounded bg-[var(--warning-fg)] text-white whitespace-nowrap"
                    >
                      {attLegalMin}분으로 자동 보정
                    </button>
                  </div>
                )}
              </Field>
            </div>

            {attSendMode === "weekly" && (
              <div className="mt-4 p-3 rounded-lg bg-[var(--bg-2)]/40 border border-[var(--border-1)] space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-3)] min-w-[60px]">시작일</span>
                  <Input type="date" value={attWeekStart} onChange={(e) => setAttWeekStart(e.target.value)} />
                  <span className="text-xs text-[var(--text-3)] ml-3">반복</span>
                  <Select
                    value={attWeeklyRepeat}
                    onChange={(e) => setAttWeeklyRepeat(Number(e.target.value))}
                    className="px-2 py-1 border border-[var(--border-1)] rounded-md text-sm bg-[var(--bg-1)]"
                  >
                    <option value={1}>1주</option>
                    <option value={2}>2주</option>
                    <option value={4}>4주</option>
                    <option value={8}>8주</option>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-3)] min-w-[60px]">요일</span>
                  {ATT_WEEKDAY_LABELS.map((label, idx) => {
                    const n = idx + 1;
                    const selected = attWeekdays.includes(n);
                    const isWeekend = n >= 6;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => toggleAttWeekday(n)}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors border ${
                          selected
                            ? "bg-[var(--brand-500)] text-white border-[var(--brand-500)]"
                            : `bg-[var(--bg-1)] ${isWeekend ? "text-[var(--warning-fg)]" : "text-[var(--text-3)]"} border-[var(--border-1)] hover:bg-[var(--bg-2)]`
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setAttWeekdays([1, 2, 3, 4, 5])}
                    className="ml-2 px-2 py-1 text-xs text-[var(--text-3)] underline hover:text-[var(--text-1)]"
                  >
                    평일
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttWeekdays([1, 2, 3, 4, 5, 6, 7])}
                    className="px-2 py-1 text-xs text-[var(--text-3)] underline hover:text-[var(--text-1)]"
                  >
                    매일
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttWeekdays([6, 7])}
                    className="px-2 py-1 text-xs text-[var(--text-3)] underline hover:text-[var(--text-1)]"
                  >
                    토일
                  </button>
                </div>
                <p className="text-xs text-[var(--text-4)]">
                  → 총{" "}
                  <span className="text-[var(--brand-400)] font-medium">
                    {attWeekdays.length * attWeeklyRepeat}회
                  </span>{" "}
                  자동 발송 (각 발송 시점에 새 토큰 생성)
                </p>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="lg" loading={attSubmitting} onClick={handleSendAttendance}>
                <Send className="w-4 h-4 mr-1" />
                {attSendMode === "weekly" ? "주간 반복 예약" : "출퇴근 링크 SMS 발송"}
              </Button>
            </div>
          </Card>

          <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
            <div className="flex items-center justify-between mb-3">
              <SectionHeader eyebrow="이력" title="출퇴근 발송 이력 (최근 200건)" />
              <Button size="sm" variant="ghost" onClick={loadAttendanceList} loading={loadingAttList}>
                새로고침
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>발송일시</TH>
                    <TH>이름</TH>
                    <TH>전화번호</TH>
                    <TH>매장</TH>
                    <TH>근무일</TH>
                    <TH>계획 시간</TH>
                    <TH>실제 출근</TH>
                    <TH>실제 퇴근</TH>
                    <TH>상태</TH>
                  </TR>
                </THead>
                <TBody>
                  {attendanceList.length === 0 ? (
                    <TR>
                      <TD colSpan={9} className="text-center text-[var(--text-3)] py-6">
                        {loadingAttList ? "불러오는 중…" : "발송 이력이 없습니다."}
                      </TD>
                    </TR>
                  ) : (
                    attendanceList.map((r) => (
                      <TR key={r.id}>
                        <TD>{r.created_at?.slice(0, 16).replace("T", " ")}</TD>
                        <TD>{r.worker_name_ko || "-"}</TD>
                        <TD>{r.phone}</TD>
                        <TD>{r.workplace_name}</TD>
                        <TD className="tabular">{r.date}</TD>
                        <TD className="tabular">
                          {r.planned_clock_in || "-"} ~ {r.planned_clock_out || "-"}
                        </TD>
                        <TD className="tabular">{r.clock_in_time?.slice(11, 16) || "-"}</TD>
                        <TD className="tabular">{r.clock_out_time?.slice(11, 16) || "-"}</TD>
                        <TD>
                          <Badge
                            tone={
                              r.status === "completed"
                                ? "success"
                                : r.status === "clock_in"
                                ? "info"
                                : r.status === "sent"
                                ? "warning"
                                : "neutral"
                            }
                          >
                            {r.status === "completed"
                              ? "퇴근완료"
                              : r.status === "clock_in"
                              ? "근무중"
                              : r.status === "sent"
                              ? "발송됨"
                              : r.status}
                          </Badge>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
