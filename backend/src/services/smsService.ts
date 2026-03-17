/**
 * SMS / KakaoTalk message sending service
 * Supports: mock (development), coolsms, kakao
 */

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

function buildMessage(surveyUrl: string, date: string): string {
  return `[조인앤조인 출퇴근 기록]\n${date} 근무 설문입니다.\n아래 링크를 눌러 출퇴근을 기록해주세요.\n${surveyUrl}`;
}

async function sendMock(phone: string, message: string): Promise<SendResult> {
  console.log(`[SMS MOCK] To: ${phone}`);
  console.log(`[SMS MOCK] Message: ${message}`);
  return { success: true, messageId: `mock-${Date.now()}` };
}

async function sendCoolSMS(phone: string, message: string): Promise<SendResult> {
  const apiKey = process.env.SMS_API_KEY;
  const apiSecret = process.env.SMS_API_SECRET;
  const senderNumber = process.env.SMS_SENDER_NUMBER;

  if (!apiKey || !apiSecret || !senderNumber) {
    return { success: false, error: 'CoolSMS credentials not configured' };
  }

  try {
    const res = await fetch('https://api.coolsms.co.kr/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `HMAC-SHA256 apiKey=${apiKey}, date=${new Date().toISOString()}, salt=${Date.now()}, signature=`,
      },
      body: JSON.stringify({
        message: {
          to: phone.replace(/-/g, ''),
          from: senderNumber.replace(/-/g, ''),
          text: message,
          type: message.length > 90 ? 'LMS' : 'SMS',
        },
      }),
    });

    const data = await res.json() as Record<string, any>;
    if (res.ok) {
      return { success: true, messageId: data.groupId || data.messageId };
    }
    return { success: false, error: data.errorMessage || 'CoolSMS API error' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function sendKakaoAlimtalk(phone: string, message: string): Promise<SendResult> {
  // Kakao Alimtalk requires business channel approval and template registration
  // This is a placeholder for the Kakao Notification API integration
  const apiKey = process.env.KAKAO_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'Kakao API key not configured' };
  }

  // TODO: Implement Kakao Alimtalk API when business channel is approved
  console.log(`[KAKAO] Would send to ${phone}: ${message}`);
  return { success: false, error: 'Kakao Alimtalk not yet implemented. Use SMS instead.' };
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
    // Try Kakao first, fall back to SMS
    const kakaoResult = await sendKakaoAlimtalk(phone, message);
    if (kakaoResult.success) return kakaoResult;
    console.log('[SMS] Kakao failed, falling back to SMS');
  }

  switch (SMS_PROVIDER) {
    case 'coolsms':
      return sendCoolSMS(phone, message);
    case 'mock':
    default:
      return sendMock(phone, message);
  }
}
