/**
 * SMS / KakaoTalk message sending service
 * Supports: mock (development), solapi (구 CoolSMS)
 * Solapi REST API를 fetch로 직접 호출 (외부 SDK 미사용)
 * Docs: https://developers.solapi.dev/
 */

import crypto from 'crypto';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'mock';
const SURVEY_BASE_URL = process.env.SURVEY_BASE_URL || 'http://localhost:3000/s';

function buildSurveyUrl(token: string): string {
  return `${SURVEY_BASE_URL}?token=${token}`;
}

function buildMessage(surveyUrl: string, date: string, workplaceName: string): string {
  return `[조인앤조인 출퇴근 기록]\n${date} 근무 설문입니다.\n근무지: ${workplaceName}\n아래 링크를 눌러 출퇴근을 기록해주세요.\n${surveyUrl}`;
}

function buildSolapiAuth(apiKey: string, apiSecret: string): string {
  const dateTime = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', apiSecret)
    .update(dateTime + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${dateTime}, salt=${salt}, signature=${signature}`;
}

async function sendMock(phone: string, message: string): Promise<SendResult> {
  console.log(`[SMS MOCK] To: ${phone}`);
  console.log(`[SMS MOCK] Message:\n${message}`);
  return { success: true, messageId: `mock-${Date.now()}` };
}

async function sendSolapi(phone: string, message: string): Promise<SendResult> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER;

  if (!apiKey || !apiSecret || !senderNumber) {
    return { success: false, error: 'Solapi 인증 정보가 설정되지 않았습니다. SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER를 확인하세요.' };
  }

  try {
    const res = await fetch('https://api.solapi.com/messages/v4/send-many/detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': buildSolapiAuth(apiKey, apiSecret),
      },
      body: JSON.stringify({
        messages: [{
          to: phone.replace(/-/g, ''),
          from: senderNumber.replace(/-/g, ''),
          text: message,
        }],
      }),
    });

    const data = await res.json() as Record<string, any>;
    console.log('[Solapi] Response status:', res.status);
    console.log('[Solapi] Response body:', JSON.stringify(data));

    if (!res.ok) {
      const errMsg = data.errorMessage || data.message || data.errorCode || `Solapi API 오류 (${res.status})`;
      console.error('[Solapi] API error:', errMsg);
      return { success: false, error: errMsg };
    }

    const groupId = data?.groupInfo?.groupId || '';
    const failCount = data?.groupInfo?.count?.sentFailed || 0;

    if (failCount > 0) {
      const failedList = data?.failedMessageList || [];
      const reason = failedList[0]?.reason || failedList[0]?.receipts?.[0]?.message || '발송 실패';
      console.error('[Solapi] Send failed:', JSON.stringify(failedList));
      return { success: false, messageId: groupId, error: reason };
    }

    return { success: true, messageId: groupId };
  } catch (err: any) {
    console.error('[Solapi] Send error:', err.message, err.stack);
    return { success: false, error: err.message || 'Solapi 발송 오류' };
  }
}

async function sendKakaoAlimtalk(_phone: string, _message: string): Promise<SendResult> {
  console.log(`[KAKAO] 카카오 알림톡은 비즈니스 채널 승인 후 사용 가능합니다.`);
  return { success: false, error: '카카오 알림톡은 비즈니스 채널 승인 후 사용 가능합니다. SMS로 발송합니다.' };
}

export async function sendSurveyMessage(
  phone: string,
  token: string,
  date: string,
  workplaceName: string,
  method: 'sms' | 'kakao' = 'sms'
): Promise<SendResult> {
  const surveyUrl = buildSurveyUrl(token);
  const message = buildMessage(surveyUrl, date, workplaceName);

  if (method === 'kakao') {
    const kakaoResult = await sendKakaoAlimtalk(phone, message);
    if (kakaoResult.success) return kakaoResult;
    console.log('[SMS] 카카오 실패, SMS로 대체 발송');
  }

  console.log(`[SMS] Provider: ${SMS_PROVIDER}, To: ${phone}`);
  switch (SMS_PROVIDER) {
    case 'solapi':
      return sendSolapi(phone, message);
    case 'mock':
    default:
      return sendMock(phone, message);
  }
}

export async function sendGeneralSms(phone: string, message: string): Promise<SendResult> {
  console.log(`[SMS] General message to: ${phone}`);
  switch (SMS_PROVIDER) {
    case 'solapi':
      return sendSolapi(phone, message);
    case 'mock':
    default:
      return sendMock(phone, message);
  }
}
