// 주간 반복 발송 스케줄 펼침 헬퍼.
// ISO weekday: Mon=1 .. Sun=7
export function isoDow(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

export type WeekSchedule = {
  start_date: string;          // YYYY-MM-DD
  weekdays: number[];          // [1..7] (월=1, 일=7)
  daily_time: string;          // 'HH:MM'
  repeat_weeks?: number;       // 1~8 (기본 1)
};

// week_schedule 을 (dateStr, schedTime) 슬롯 배열로 펼침.
// 잘못된 입력은 빈 배열 반환.
export function expandWeekSchedule(ws: WeekSchedule): Array<{ dateStr: string; schedTime: string }> {
  const repeat = Math.max(1, Math.min(8, Number(ws.repeat_weeks) || 1));
  const weekdays = Array.isArray(ws.weekdays)
    ? ws.weekdays.map(Number).filter((n) => n >= 1 && n <= 7)
    : [];
  if (weekdays.length === 0) return [];
  const start = new Date(ws.start_date);
  if (Number.isNaN(start.getTime())) return [];
  const out: Array<{ dateStr: string; schedTime: string }> = [];
  const totalDays = 7 * repeat;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (!weekdays.includes(isoDow(d))) continue;
    const dateStr = d.toISOString().slice(0, 10);
    const schedTime = new Date(`${dateStr}T${ws.daily_time}`).toISOString();
    out.push({ dateStr, schedTime });
  }
  return out;
}
