// 한국 공휴일 (backend/src/db.ts KOREAN_HOLIDAYS 와 동일하게 유지)
export const KOREAN_HOLIDAYS: Record<number, string[]> = {
  2025: ['2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-03-01','2025-05-01','2025-05-05','2025-05-06','2025-06-06','2025-08-15','2025-10-03','2025-10-05','2025-10-06','2025-10-07','2025-10-09','2025-12-25'],
  2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-03-02','2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06','2026-07-17','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26','2026-10-03','2026-10-05','2026-10-09','2026-12-25'],
  2027: ['2027-01-01','2027-02-05','2027-02-06','2027-02-07','2027-03-01','2027-05-01','2027-05-05','2027-05-13','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-10-14','2027-10-15','2027-10-16','2027-12-25'],
};

/** YYYY-MM-DD 가 토·일 또는 공휴일인지 (브라우저 TZ 무관) */
export function isHolidayOrWeekend(dateStr: string): boolean {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  if (dow === 0 || dow === 6) return true;
  return (KOREAN_HOLIDAYS[+m[1]] || []).includes(dateStr.slice(0, 10));
}

/** 범위(양끝 포함)의 YYYY-MM-DD 목록 (브라우저 TZ 무관) */
export function eachDateInRange(start: string, end: string): string[] {
  const s = String(start || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const e = String(end || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!s || !e) return [];
  const out: string[] = [];
  const endT = Date.UTC(+e[1], +e[2] - 1, +e[3]);
  for (let t = Date.UTC(+s[1], +s[2] - 1, +s[3]); t <= endT && out.length < 400; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * 휴가 기간 중 연차로 인정·차감되는 날짜 = 소정근로일(월~금, 공휴일 제외).
 * 주말·공휴일은 휴가 기간 안에 있어도 연차 일수/유급 8h 에 포함하지 않는다.
 */
export function leaveWorkdays(start: string, end: string): string[] {
  return eachDateInRange(start, end).filter(d => !isHolidayOrWeekend(d));
}
