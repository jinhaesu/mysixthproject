/**
 * insuranceExport.ts — 4대보험 신고용 CSV 생성
 *
 * NOTE: 4INSURE 정확한 양식은 한국 사회보험포털 기준 — 컬럼 순서·필수항목 확인 후 추가 보정 필요.
 *       참고: https://www.4insure.or.kr
 *
 * CSV는 UTF-8 BOM 포함 (Excel 자동 인식용).
 * xlsx는 백엔드에 설치되지 않으므로 CSV 형식으로 출력한다.
 */

// ---------------------------------------------------------------------------
// CSV escape helper
// ---------------------------------------------------------------------------
function csvEscape(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? '' : String(val);
  // Wrap in double quotes if contains comma, double-quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvEscape).join(',');
}

// UTF-8 BOM prefix for Excel compatibility
const BOM = '﻿';

// ---------------------------------------------------------------------------
// Onboarding record shape (subset used for CSV — matches regular_employees row)
// ---------------------------------------------------------------------------
export interface OnboardingRecord {
  id: number;
  name: string;
  id_number?: string;
  hire_date?: string;
  monthly_salary?: number;
  job_code?: string;
  weekly_work_hours?: number;
  nationality?: string;
  visa_type?: string;
  visa_expiry?: string;
  phone?: string;
  address?: string;
  email?: string;
  business_registration_no?: string;
  // Insurance participation flags (default Y)
  pension_yn?: string;
  health_yn?: string;
  employment_yn?: string;
  accident_yn?: string;
}

// ---------------------------------------------------------------------------
// Offboarding record shape (subset used for CSV — matches employee_offboardings row)
// ---------------------------------------------------------------------------
export interface OffboardingRecord {
  id: number;
  employee_name: string;
  employee_phone?: string;
  id_number?: string;        // pulled from employee snapshot if available
  loss_date?: string;
  reason_code?: string;
  severance_final?: number;
  annual_leave_pay_final?: number;
  retirement_income_tax?: number;
  severance_paid?: number;
  notes?: string;
  business_registration_no?: string;
}

// ---------------------------------------------------------------------------
// 취득신고용 CSV (onboarding)
// ---------------------------------------------------------------------------
const ONBOARDING_HEADERS = [
  '사업장관리번호',
  '성명',
  '주민등록번호',
  '자격취득일',
  '보수월액',
  '직종코드',
  '소정근로시간(주)',
  '국민연금가입',
  '건강보험가입',
  '고용보험가입',
  '산재보험가입',
  '외국인구분',
  '비자종류',
  '비자만료일',
  '연락처',
  '주소',
  '이메일',
];

export function buildOnboardingCSV(records: OnboardingRecord[]): string {
  const lines: string[] = [csvRow(ONBOARDING_HEADERS)];

  for (const r of records) {
    const isForeign = r.nationality === 'FOREIGN' ? 'Y' : 'N';
    lines.push(
      csvRow([
        r.business_registration_no ?? '',
        r.name,
        r.id_number ?? '',
        r.hire_date ?? '',
        r.monthly_salary ?? 0,
        r.job_code ?? '',
        r.weekly_work_hours ?? 40,
        r.pension_yn ?? 'Y',
        r.health_yn ?? 'Y',
        r.employment_yn ?? 'Y',
        r.accident_yn ?? 'Y',
        isForeign,
        r.visa_type ?? '',
        r.visa_expiry ?? '',
        r.phone ?? '',
        r.address ?? '',
        r.email ?? '',
      ]),
    );
  }

  return BOM + lines.join('\r\n');
}

// ---------------------------------------------------------------------------
// 상실신고용 CSV (offboarding)
// ---------------------------------------------------------------------------
const OFFBOARDING_HEADERS = [
  '사업장관리번호',
  '성명',
  '주민등록번호',
  '자격상실일',
  '자격상실사유코드',
  '보수월액',
  '국민연금상실',
  '건강보험상실',
  '고용보험상실',
  '산재보험상실',
  '퇴직금지급여부',
  '비고',
];

export function buildOffboardingCSV(records: OffboardingRecord[]): string {
  const lines: string[] = [csvRow(OFFBOARDING_HEADERS)];

  for (const r of records) {
    const severancePaid = r.severance_paid ? 'Y' : 'N';
    lines.push(
      csvRow([
        r.business_registration_no ?? '',
        r.employee_name,
        r.id_number ?? '',
        r.loss_date ?? '',
        r.reason_code ?? '',
        r.severance_final ?? 0,
        'Y',
        'Y',
        'Y',
        'Y',
        severancePaid,
        r.notes ?? '',
      ]),
    );
  }

  return BOM + lines.join('\r\n');
}
