import { Resend } from 'resend';

const REASON_LABEL: Record<string, string> = {
  '11': '개인사정',
  '22': '근로계약기간만료',
  '23': '경영상필요/회사사정',
  '26': '정년퇴직',
  '31': '기타',
  '41': '사망',
};

export interface OffboardingRecord {
  id: number;
  employee_type: string;
  employee_name: string;
  employee_phone: string;
  department: string;
  hire_date: string;
  resign_date: string;
  loss_date: string;
  reason_code: string;
  reason_detail: string;
  severance_final: number;
  annual_leave_pay_final: number;
  retirement_income_tax: number;
}

function employeeTypeLabel(type: string): string {
  if (type === 'regular') return '정규직';
  if (type === 'alba') return '알바';
  return '파견';
}

function buildHtml(record: OffboardingRecord, systemUrl: string): string {
  const typeLabel = employeeTypeLabel(record.employee_type);
  const reasonLabel = REASON_LABEL[record.reason_code] || record.reason_code;

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Apple SD Gothic Neo', '맑은 고딕', sans-serif; color: #1f2937; background: #f9fafb; margin: 0; padding: 20px; }
    .container { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e40af; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; font-size: 14px; opacity: 0.85; }
    .body { padding: 28px 32px; }
    table.info { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    table.info th { background: #eff6ff; color: #1e40af; text-align: left; padding: 8px 12px; font-size: 13px; width: 130px; }
    table.info td { padding: 8px 12px; font-size: 14px; border-bottom: 1px solid #e5e7eb; }
    .section-title { font-size: 15px; font-weight: 700; color: #1e40af; margin: 24px 0 12px; border-left: 4px solid #3b82f6; padding-left: 10px; }
    ol.steps { margin: 0; padding-left: 20px; }
    ol.steps li { padding: 5px 0; font-size: 14px; line-height: 1.6; }
    .warning-box { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin-top: 24px; }
    .warning-box strong { color: #92400e; font-size: 14px; display: block; margin-bottom: 8px; }
    .warning-box ul { margin: 0; padding-left: 18px; }
    .warning-box ul li { font-size: 13px; color: #78350f; padding: 2px 0; }
    .footer { background: #f3f4f6; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
    .btn { display: inline-block; background: #1e40af; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>[퇴사 신고 안내]</h1>
    <p>${record.employee_name}(${typeLabel}) — 퇴직일 ${record.resign_date}</p>
  </div>
  <div class="body">
    <p style="font-size:14px; color:#374151;">아래 직원의 퇴사 처리가 등록되었습니다. 기한 내 4대보험 상실신고 등 필수 절차를 완료해 주세요.</p>

    <div class="section-title">직원 기본정보</div>
    <table class="info">
      <tr><th>이름</th><td>${record.employee_name}</td></tr>
      <tr><th>고용형태</th><td>${typeLabel}</td></tr>
      <tr><th>부서</th><td>${record.department || '-'}</td></tr>
      <tr><th>연락처</th><td>${record.employee_phone || '-'}</td></tr>
      <tr><th>입사일</th><td>${record.hire_date || '-'}</td></tr>
      <tr><th>퇴직일(마지막근무)</th><td>${record.resign_date}</td></tr>
      <tr><th>자격 상실일</th><td>${record.loss_date || '-'}</td></tr>
      <tr><th>상실사유코드</th><td>${record.reason_code} — ${reasonLabel}</td></tr>
      ${record.reason_detail ? `<tr><th>상세사유</th><td>${record.reason_detail}</td></tr>` : ''}
    </table>

    <div class="section-title">퇴사 처리 절차</div>
    <ol class="steps">
      <li><strong>사직서 수령</strong> — 자필 서명 사직서 원본 보관 (3년)</li>
      <li><strong>자산 회수</strong> — 출입증, 유니폼, 사원증 등 회사 자산 반납 확인</li>
      <li><strong>4대보험 상실신고 (퇴직일+1일 기준, 14일 이내)</strong>
        <ul style="margin-top:4px;">
          <li>국민연금 / 건강보험 / 고용보험 / 산재보험 동시 신고</li>
          <li>고용보험: EDI 또는 고용보험 시스템(https://www.ei.go.kr)</li>
        </ul>
      </li>
      <li><strong>퇴직금 산정 및 지급</strong> — 퇴직일로부터 14일 이내 지급 원칙 (근로기준법 제36조)</li>
      <li><strong>연차수당 정산</strong> — 미사용 연차일수 × 일급 산정 후 지급</li>
      <li><strong>퇴직소득 원천세 신고</strong> — 다음 달 10일까지 원천세 신고·납부</li>
    </ol>

    <div class="warning-box">
      <strong>자주 실수하는 항목 주의</strong>
      <ul>
        <li>자격 상실일 = 퇴직일 + 1일 (퇴직일 당일이 아님)</li>
        <li>사유코드 오기입 시 불이익 — 특히 11(개인사정)과 23(경영상필요) 혼동 주의</li>
        <li>퇴직금 지급기한: 14일(당사자 합의 시 연장 가능, 서면 필요)</li>
        <li>프리랜서/일용근로자는 고용보험 상실 구분 확인 필요</li>
      </ul>
    </div>

    <a href="${systemUrl}" class="btn">시스템에서 상세 확인 →</a>
  </div>
  <div class="footer">
    이 메일은 퇴사관리 시스템에서 자동 발송되었습니다. | 조인앤조인
  </div>
</div>
</body>
</html>
  `.trim();
}

export async function sendOffboardingNotification(
  record: OffboardingRecord,
  recipients: string[],
): Promise<{ ok: boolean; mock?: boolean; error?: string; sent_to?: string[] }> {
  if (!recipients || recipients.length === 0) {
    console.log('[offboardingEmail] No recipients configured — skipping send');
    return { ok: true, mock: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const systemUrl = process.env.FRONTEND_URL || 'https://aisystem.nuldam.com';

  if (!apiKey) {
    const typeLabel = employeeTypeLabel(record.employee_type);
    console.log(
      `[offboardingEmail MOCK] Subject: [퇴사 신고 안내] ${record.employee_name}(${typeLabel}) — 퇴직일 ${record.resign_date}`,
    );
    console.log(`[offboardingEmail MOCK] To: ${recipients.join(', ')}`);
    return { ok: true, mock: true, sent_to: recipients };
  }

  try {
    const resend = new Resend(apiKey);
    const typeLabel = employeeTypeLabel(record.employee_type);
    const subject = `[퇴사 신고 안내] ${record.employee_name}(${typeLabel}) — 퇴직일 ${record.resign_date}`;
    const html = buildHtml(record, systemUrl);

    const { error: sendError } = await resend.emails.send({
      from: `퇴사관리시스템 <${fromEmail}>`,
      to: recipients,
      subject,
      html,
    });

    if (sendError) {
      console.error('[offboardingEmail] Resend error:', sendError);
      return { ok: false, error: sendError.message };
    }

    return { ok: true, sent_to: recipients };
  } catch (err: any) {
    console.error('[offboardingEmail] Unexpected error:', err);
    return { ok: false, error: err.message };
  }
}
