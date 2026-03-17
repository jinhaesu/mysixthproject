/**
 * SMS / KakaoTalk message sending service
 * Supports: mock (development), solapi (구 CoolSMS)
 * Solapi docs: https://developers.solapi.dev/
 */

import { SolapiMessageService } from 'solapi';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'mock';
const SURVEY_BASE_URL = process.env.SURVEY_BASE_URL || 'http://localhost:3000/s';

// Solapi 클라이언트 (lazy init)
let solapiClient: SolapiMessageService | null = null;

function getSolapiClient(): SolapiMessageService | null {
  if (solapiClient) return solapiClient;

  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;

  if (!apiKey || !apiSecret) return null;

  solapiClient = new SolapiMessageService(apiKey, apiSecret);
  return solapiClient;
}

function buildSurveyUrl(token: string): string {
  return `${SURVEY_BASE_URL}?token=${token}`;
}

function buildMessage(surveyUrl: string, date: string): string {
  return `[조인앤조인 출퇴근 기록]\n${date} 근무 설문입니다.\n아래 링크를 눌러 출퇴근을 기록해주세요.\n${surveyUrl}`;
}

async function sendMock(phone: string, message: string): Promise<SendResult> {
  console.log(`[SMS MOCK] To: ${phone}`);
  console.log(`[SMS MOCK] Message:\n${message}`);
  return { success: true, messageId: `mock-${Date.now()}` };
}

async function sendSolapi(phone: string, message: string): Promise<SendResult> {
  const client = getSolapiClient();
  const senderNumber = process.env.SOLAPI_SENDER_NUMBER;

  if (!client || !senderNumber) {
    return { success: false, error: 'Solapi 인증 정보가 설정되지 않았습니다. SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER를 확인하세요.' };
  }

  try {
    const result = await client.send({
      to: phone.replace(/-/g, ''),
      from: senderNumber.replace(/-/g, ''),
      text: message,
      // Solapi가 글자수 기반으로 SMS/LMS 자동 판별
    });

    const info = result as any;
    const groupId = info?.groupInfo?.groupId || info?.groupId || '';
    const failCount = info?.groupInfo?.count?.sentFailed || 0;

    if (failCount > 0) {
      const failedList = info?.failedMessageList || [];
      const reason = failedList[0]?.reason || '발송 실패';
      return { success: false, messageId: groupId, error: reason };
    }

    return { success: true, messageId: groupId };
  } catch (err: any) {
    console.error('[Solapi] Send error:', err);
    return { success: false, error: err.message || 'Solapi 발송 오류' };
  }
}

async function sendKakaoAlimtalk(phone: string, message: string): Promise<SendResult> {
  // Solapi에서도 카카오 알림톡을 지원하지만, 비즈니스 채널 승인 + 템플릿 등록이 필요
  // 승인 후 client.send({ to, from, text, kakaoOptions: { pfId, templateId } }) 로 발송 가능
  console.log(`[KAKAO] 카카오 알림톡은 비즈니스 채널 승인 후 사용 가능합니다.`);
  return { success: false, error: '카카오 알림톡은 비즈니스 채널 승인 후 사용 가능합니다. SMS로 발송합니다.' };
}

export async function sendSurveyMessage(
  phone: string,
  token: string,
  date: string,
  method: 'sms' | 'kakao' = 'sms'
): Promise<SendResult> {
  const surveyUrl = buildSurveyUrl(token);
  const message = buildMessage(surveyUrl, date);

  if (method === 'kakao') {
    const kakaoResult = await sendKakaoAlimtalk(phone, message);
    if (kakaoResult.success) return kakaoResult;
    console.log('[SMS] 카카오 실패, SMS로 대체 발송');
  }

  switch (SMS_PROVIDER) {
    case 'solapi':
      return sendSolapi(phone, message);
    case 'mock':
    default:
      return sendMock(phone, message);
  }
}
