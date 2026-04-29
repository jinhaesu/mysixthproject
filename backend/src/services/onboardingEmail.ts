import { Resend } from 'resend';
import { getFrontendUrl } from '../db';

export interface OnboardingRecord {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  id_number: string;
  birth_date: string;
  department: string;
  team: string;
  role: string;
  hire_date: string;
  nationality: string;
  visa_type: string;
  visa_expiry: string;
  employment_type: string;
  monthly_salary: number;
  non_taxable_meal: number;
  non_taxable_vehicle: number;
  job_code: string;
  weekly_work_hours: number;
  business_registration_no: string;
  bank_name: string;
  bank_account: string;
  bank_slip_data: string;
  foreign_id_card_data: string;
  family_register_data: string;
  resident_register_data: string;
  signed_contract_url: string;
}

function nationalityLabel(nationality: string): string {
  if (nationality === 'KR') return '내국인';
  if (nationality === 'FOREIGN') return '외국인';
  return nationality || '-';
}

function employmentTypeLabel(type: string): string {
  if (type === 'regular') return '정규직';
  if (type === 'contract') return '계약직';
  if (type === 'daily') return '일용직';
  return type || '-';
}

function maskIdNumber(id: string): string {
  if (!id) return '-';
  // Show first 6 digits masked as ******-*******
  return '******-*******';
}

function formatNumber(n: number): string {
  if (!n) return '0';
  return n.toLocaleString('ko-KR');
}

function buildHtml(record: OnboardingRecord, systemUrl: string): string {
  const nat = nationalityLabel(record.nationality);
  const empTypeKo = employmentTypeLabel(record.employment_type);
  const isForeign = record.nationality === 'FOREIGN';

  const attachmentRows = `
    <tr><th>통장사본</th><td>${record.bank_slip_data ? '시스템에 첨부됨' : '미첨부'}</td></tr>
    <tr><th>주민등록등본</th><td>${record.resident_register_data ? '시스템에 첨부됨' : '미첨부'}</td></tr>
    <tr><th>가족관계증명서</th><td>${record.family_register_data ? '시스템에 첨부됨' : '미첨부'}</td></tr>
    ${isForeign ? `<tr><th>외국인등록증</th><td>${record.foreign_id_card_data ? '시스템에 첨부됨' : '미첨부'}</td></tr>` : ''}
    ${isForeign ? `<tr><th>비자 정보</th><td>${record.visa_type || '-'} (만료: ${record.visa_expiry || '-'})</td></tr>` : ''}
  `;

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Apple SD Gothic Neo', '맑은 고딕', sans-serif; color: #1f2937; background: #f9fafb; margin: 0; padding: 20px; }
    .container { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #065f46; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; font-size: 14px; opacity: 0.85; }
    .body { padding: 28px 32px; }
    table.info { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    table.info th { background: #ecfdf5; color: #065f46; text-align: left; padding: 8px 12px; font-size: 13px; width: 140px; }
    table.info td { padding: 8px 12px; font-size: 14px; border-bottom: 1px solid #e5e7eb; }
    .section-title { font-size: 15px; font-weight: 700; color: #065f46; margin: 24px 0 12px; border-left: 4px solid #10b981; padding-left: 10px; }
    .info-box { background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 16px 20px; margin-top: 24px; }
    .info-box strong { color: #065f46; font-size: 14px; display: block; margin-bottom: 8px; }
    .info-box ol { margin: 0; padding-left: 18px; }
    .info-box ol li { font-size: 13px; color: #064e3b; padding: 3px 0; line-height: 1.6; }
    .warning-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin-top: 16px; }
    .warning-box strong { color: #92400e; font-size: 14px; display: block; margin-bottom: 8px; }
    .warning-box ul { margin: 0; padding-left: 18px; }
    .warning-box ul li { font-size: 13px; color: #78350f; padding: 2px 0; }
    .footer { background: #f3f4f6; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    .btn { display: inline-block; background: #065f46; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>[입사자 취득신고 안내]</h1>
    <p>${record.name}(${nat}) — 입사일 ${record.hire_date || '-'}</p>
  </div>
  <div class="body">
    <p style="font-size:14px; color:#374151;">아래 직원의 입사가 등록되었습니다. 기한 내 4대보험 취득신고 등 필수 절차를 완료해 주세요.</p>

    <div class="section-title">기본 정보</div>
    <table class="info">
      <tr><th>이름</th><td>${record.name}</td></tr>
      <tr><th>주민번호</th><td>${maskIdNumber(record.id_number)}</td></tr>
      <tr><th>생년월일</th><td>${record.birth_date || '-'}</td></tr>
      <tr><th>주소</th><td>${record.address || '-'}</td></tr>
      <tr><th>연락처</th><td>${record.phone || '-'}</td></tr>
      <tr><th>이메일</th><td>${record.email || '-'}</td></tr>
      <tr><th>국적</th><td>${nat}</td></tr>
    </table>

    <div class="section-title">근로 정보</div>
    <table class="info">
      <tr><th>부서</th><td>${record.department || '-'}</td></tr>
      <tr><th>팀</th><td>${record.team || '-'}</td></tr>
      <tr><th>직책</th><td>${record.role || '-'}</td></tr>
      <tr><th>고용형태</th><td>${empTypeKo}</td></tr>
      <tr><th>입사일</th><td>${record.hire_date || '-'}</td></tr>
      <tr><th>직종코드</th><td>${record.job_code || '-'}</td></tr>
      <tr><th>소정근로시간(주)</th><td>${record.weekly_work_hours || 40}시간</td></tr>
      <tr><th>사업장관리번호</th><td>${record.business_registration_no || '-'}</td></tr>
    </table>

    <div class="section-title">급여 정보</div>
    <table class="info">
      <tr><th>보수월액(월급여)</th><td>${formatNumber(record.monthly_salary)}원</td></tr>
      <tr><th>비과세 식대</th><td>${formatNumber(record.non_taxable_meal)}원</td></tr>
      <tr><th>비과세 차량유지비</th><td>${formatNumber(record.non_taxable_vehicle)}원</td></tr>
    </table>

    <div class="section-title">계좌 정보</div>
    <table class="info">
      <tr><th>은행명</th><td>${record.bank_name || '-'}</td></tr>
      <tr><th>계좌번호</th><td>${record.bank_account || '-'}</td></tr>
    </table>

    <div class="section-title">첨부 서류</div>
    <table class="info">
      ${attachmentRows}
    </table>

    <div class="info-box">
      <strong>4대보험 취득신고 절차</strong>
      <ol>
        <li><strong>신고 기한</strong> — 입사일로부터 14일 이내</li>
        <li><strong>신고 대상</strong> — 국민연금 / 건강보험 / 고용보험 / 산재보험 동시 신고</li>
        <li><strong>사업장관리번호로 신고</strong> — ${record.business_registration_no || '(사업장관리번호 확인 필요)'}</li>
        <li><strong>신고 방법</strong> — EDI(전자신고) 또는 4대사회보험 포털 (https://www.4insure.or.kr)</li>
        <li><strong>취득일 = 입사일</strong> — 실제 근무 첫날 기준</li>
      </ol>
    </div>

    <div class="warning-box">
      <strong>자주 실수하는 항목 주의</strong>
      <ul>
        <li>보수월액 오입력 — 월급여 + 정기상여금/12 등 산입 범위 확인 필요</li>
        <li>직종코드 미입력 — 직종코드는 반드시 기재 (공란 시 반려)</li>
        ${isForeign ? '<li>외국인 비자종류 누락 — 체류자격(비자) 정확히 입력 필수</li>' : ''}
        <li>입사일 ≠ 취득일 혼동 — 통상 동일하나 실제 근무일 기준 확인</li>
        <li>소정근로시간 오기입 — 주 소정근로시간 정확히 확인 (단시간 여부)</li>
      </ul>
    </div>

    <a href="${systemUrl}" class="btn">시스템에서 상세 확인 →</a>
  </div>
  <div class="footer">
    이 메일은 입사자관리 시스템에서 자동 발송되었습니다. | 조인앤조인
  </div>
</div>
</body>
</html>
  `.trim();
}

export async function sendOnboardingNotification(
  record: OnboardingRecord,
  recipients: string[],
): Promise<{ ok: boolean; mock?: boolean; error?: string; sent_to?: string[] }> {
  if (!recipients || recipients.length === 0) {
    console.log('[onboardingEmail] No recipients configured — skipping send');
    return { ok: true, mock: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const systemUrl = getFrontendUrl('/onboarding');

  if (!apiKey) {
    const nat = nationalityLabel(record.nationality);
    console.log(
      `[onboardingEmail MOCK] Subject: [입사자 취득신고 안내] ${record.name}(${nat}) — 입사일 ${record.hire_date}`,
    );
    console.log(`[onboardingEmail MOCK] To: ${recipients.join(', ')}`);
    return { ok: true, mock: true, sent_to: recipients };
  }

  try {
    const resend = new Resend(apiKey);
    const nat = nationalityLabel(record.nationality);
    const subject = `[입사자 취득신고 안내] ${record.name}(${nat}) — 입사일 ${record.hire_date}`;
    const html = buildHtml(record, systemUrl);

    const { error: sendError } = await resend.emails.send({
      from: `입사자관리시스템 <${fromEmail}>`,
      to: recipients,
      subject,
      html,
    });

    if (sendError) {
      console.error('[onboardingEmail] Resend error:', sendError);
      return { ok: false, error: sendError.message };
    }

    return { ok: true, sent_to: recipients };
  } catch (err: any) {
    console.error('[onboardingEmail] Unexpected error:', err);
    return { ok: false, error: err.message };
  }
}
