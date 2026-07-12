import { dbRun } from '../db';

/**
 * P6 — 겸직 안전·보건관리자 활동시간 자동 로깅 헬퍼.
 *
 * 이벤트 발생 시 manager_activity_hours 에 INSERT 를 시도하며, 어떤 이유로
 * 실패해도(테이블 부재·타입 미스매치 등) 원 트랜잭션 흐름을 중단시키지 않는다.
 * 원 API 호출은 이미 성공한 뒤 호출되기 때문에 로깅 실패는 warning 만 남긴다.
 *
 * 활동 유형별 표준 시간 (P6 스펙):
 *  - safety_daily_inspection  : 60 분
 *  - safety_committee         : 120 분
 *  - training_delivery        : 180 분  (교육 콘텐츠 등록·개정 시 활용)
 *  - risk_assessment          : 360 분
 *  - hazard_processing        : 15 분
 */
export interface LogManagerHoursArgs {
  managerId?: number | null;
  managerName?: string | null;
  activityType:
    | 'safety_daily_inspection'
    | 'safety_committee'
    | 'training_delivery'
    | 'risk_assessment'
    | 'hazard_processing'
    | 'manual';
  minutes: number;
  occurredAt?: Date | string | null;
  sourceType?: string;
  sourceId?: number | null;
  notes?: string;
}

// 대표이사·시스템 계정은 관리자 시간에 포함시키지 않는다.
const EXCLUDED_MANAGER_EMAILS = new Set<string>([
  'lion9080@gmail.com',
  'lion9080@joinandjoin.com',
]);

export async function logManagerHours(args: LogManagerHoursArgs): Promise<void> {
  const rawName = (args.managerName || '').trim();
  const id = args.managerId ?? 0;
  if (!rawName && !id) return; // 익명 이벤트는 스킵
  if (rawName && EXCLUDED_MANAGER_EMAILS.has(rawName.toLowerCase())) return;

  const minutes = Math.max(1, Math.round(Number(args.minutes) || 0));
  if (!minutes) return;

  let occurred: string;
  if (args.occurredAt instanceof Date) {
    occurred = args.occurredAt.toISOString();
  } else if (typeof args.occurredAt === 'string' && args.occurredAt) {
    occurred = args.occurredAt;
  } else {
    occurred = new Date().toISOString();
  }

  try {
    await dbRun(
      `INSERT INTO manager_activity_hours
         (manager_id, manager_name, activity_type, minutes, occurred_at, source_type, source_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      rawName,
      args.activityType,
      minutes,
      occurred,
      args.sourceType || '',
      args.sourceId ?? null,
      args.notes || ''
    );
  } catch (e: any) {
    console.warn('[managerHours] log failed (non-fatal):', e?.message || e);
  }
}

/** activity_type → 한국어 라벨 (프론트에도 동일하게 노출) */
export const ACTIVITY_LABEL: Record<string, string> = {
  safety_daily_inspection: '일일 순회점검',
  safety_committee: '산업안전보건위원회',
  training_delivery: '교육 실시',
  risk_assessment: '위험성평가',
  hazard_processing: '아차사고·위험요인 처리',
  manual: '기타(수동 입력)',
};

/** activity_type → 표준 분 값 (수동 입력 시 UI 프리셋) */
export const ACTIVITY_DEFAULT_MINUTES: Record<string, number> = {
  safety_daily_inspection: 60,
  safety_committee: 120,
  training_delivery: 180,
  risk_assessment: 360,
  hazard_processing: 15,
  manual: 30,
};
