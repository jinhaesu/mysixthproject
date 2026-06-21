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
} from "@/components/ui";
import { Send } from "lucide-react";

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

export default function CafeContractSendPage() {
  const toast = useToast();
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

  const [list, setList] = useState<CafeContract[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const loadList = async () => {
    setLoadingList(true);
    try {
      const res = await authedFetch("/api/cafe-contract/list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setList(data);
    } catch (e: any) {
      toast.error("이력 조회 실패", e.message);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))));
  };

  const handleSend = async () => {
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
      if (!res.ok || !body.success) {
        throw new Error(body.error || `발송 실패 (HTTP ${res.status})`);
      }
      toast.success("SMS 발송 완료", `${workerName} (${phone}) → ${store}점`);
      setPhone("");
      setWorkerName("");
      loadList();
    } catch (e: any) {
      toast.error("발송 실패", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="카페팀"
        title="근로계약 SMS 발송"
        description="널담은공간 3개 매장 알바 근로자에게 자동 근로계약서 문자 웹링크를 발송합니다."
      />

      <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
        <SectionHeader eyebrow="발송" title="발송 정보" />
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
                <option key={s} value={s}>널담은공간 {s}점</option>
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
          <Button variant="primary" size="lg" loading={submitting} onClick={handleSend}>
            <Send className="w-4 h-4 mr-1" />
            SMS 발송
          </Button>
        </div>
      </Card>

      <Card padding="md" tone="default" className="shadow-[var(--elev-1)]">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader eyebrow="이력" title="발송 이력 (최근 200건)" />
          <Button size="sm" variant="ghost" onClick={loadList} loading={loadingList}>
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
              {list.length === 0 ? (
                <TR>
                  <TD colSpan={10} className="text-center text-[var(--text-3)] py-6">
                    {loadingList ? "불러오는 중…" : "발송 이력이 없습니다."}
                  </TD>
                </TR>
              ) : (
                list.map((r) => (
                  <TR key={r.id}>
                    <TD>{r.created_at?.slice(0, 16).replace("T", " ")}</TD>
                    <TD>{r.worker_name}</TD>
                    <TD>{r.phone}</TD>
                    <TD>{r.store_name}</TD>
                    <TD className="tabular">{r.work_time_start} ~ {r.work_time_end}</TD>
                    <TD>{r.work_days}</TD>
                    <TD className="tabular">{(r.hourly_rate || 0).toLocaleString()}</TD>
                    <TD className="tabular">{r.contract_start} ~ {r.contract_end}</TD>
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
    </div>
  );
}
