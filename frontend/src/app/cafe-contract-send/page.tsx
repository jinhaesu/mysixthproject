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
  const [attSubmitting, setAttSubmitting] = useState(false);

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
  }, [selectedPhone, workers]);

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
    if (!attDate) return toast.warning("날짜를 선택해주세요.");
    if (!attStore) return toast.warning("매장을 선택해주세요.");

    setAttSubmitting(true);
    try {
      const res = await authedFetch("/api/cafe-contract/send-attendance-link", {
        method: "POST",
        body: JSON.stringify({
          phone: attPhone.trim(),
          worker_name: attWorkerName.trim(),
          store_name: attStore,
          date: attDate,
          planned_clock_in: attClockIn || null,
          planned_clock_out: attClockOut || null,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || `발송 실패 (HTTP ${res.status})`);
      toast.success("출퇴근 링크 발송 완료", `${attWorkerName || attPhone} → ${attStore}점`);
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
              <Field label="날짜" required>
                <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
              </Field>

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
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="lg" loading={attSubmitting} onClick={handleSendAttendance}>
                <Send className="w-4 h-4 mr-1" />
                출퇴근 링크 SMS 발송
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
