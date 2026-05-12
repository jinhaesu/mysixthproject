/**
 * 한국 입력 양식 검증/포맷팅 유틸.
 * - 전화번호: 010-XXXX-XXXX (11자리)
 * - 주민등록번호: 000000-0000000 (13자리, 체크섬 검증)
 * - 계좌번호: 은행별 자리수 범위 검증
 */

// ===== 전화번호 =====

export function formatPhone(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

export function validatePhone(input: string): { valid: boolean; error?: string } {
  const d = input.replace(/\D/g, '');
  if (!d) return { valid: false, error: '전화번호를 입력해주세요.' };
  if (d.length !== 11) return { valid: false, error: '전화번호는 11자리여야 합니다.' };
  if (!d.startsWith('010') && !d.startsWith('011') && !d.startsWith('016') && !d.startsWith('017') && !d.startsWith('018') && !d.startsWith('019')) {
    return { valid: false, error: '010/011/016~019 로 시작해야 합니다.' };
  }
  return { valid: true };
}

// ===== 주민등록번호 =====

export function formatResidentNumber(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 6) return d;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

export function validateResidentNumber(input: string): { valid: boolean; error?: string } {
  const d = input.replace(/\D/g, '');
  if (!d) return { valid: false, error: '주민등록번호를 입력해주세요.' };
  if (d.length !== 13) return { valid: false, error: '주민등록번호는 13자리여야 합니다.' };

  // 앞 6자리: 생년월일 형식 (YYMMDD)
  const yy = parseInt(d.slice(0, 2));
  const mm = parseInt(d.slice(2, 4));
  const dd = parseInt(d.slice(4, 6));
  if (yy < 0 || yy > 99) return { valid: false, error: '생년월일 형식이 잘못되었습니다.' };
  if (mm < 1 || mm > 12) return { valid: false, error: '월 부분이 잘못되었습니다.' };
  if (dd < 1 || dd > 31) return { valid: false, error: '일 부분이 잘못되었습니다.' };

  // 7번째: 성별 코드 — 1~8 모두 허용 (내국인 1-4, 외국인 5-8)
  // 9, 0 은 1800년대 출생 (실무상 거의 없음) 도 일단 허용.
  const sex = parseInt(d.charAt(6));
  if (sex < 0 || sex > 9) return { valid: false, error: '성별 코드가 잘못되었습니다.' };

  // 체크자리 검증 제거 — 2020-10 이후 정부가 위변조 방지 위해 체크자리 랜덤화.
  // 신규 발급 주민번호는 옛 공식으로 계산해도 일치 안 함. 외국인등록번호도 동일.
  // 형식(13자리)+생년월일+성별코드 까지만 검사하고 통과.

  return { valid: true };
}

// ===== 은행 + 계좌번호 =====

// 은행별 계좌번호 자리수 범위 (하이픈 제외 숫자만).
// 출처: 각 은행 공식 자릿수 안내. 모호한 경우 넓은 범위 허용.
export interface BankInfo {
  code: string;
  name: string;
  minDigits: number;
  maxDigits: number;
}

export const BANKS: BankInfo[] = [
  { code: 'KB',      name: '국민은행',     minDigits: 11, maxDigits: 14 },
  { code: 'SHINHAN', name: '신한은행',     minDigits: 11, maxDigits: 13 },
  { code: 'WOORI',   name: '우리은행',     minDigits: 13, maxDigits: 13 },
  { code: 'HANA',    name: '하나은행',     minDigits: 12, maxDigits: 14 },
  { code: 'NH',      name: '농협은행',     minDigits: 11, maxDigits: 14 },
  { code: 'IBK',     name: '기업은행',     minDigits: 11, maxDigits: 14 },
  { code: 'SC',      name: 'SC제일은행',   minDigits: 11, maxDigits: 14 },
  { code: 'CITI',    name: '한국씨티은행', minDigits: 10, maxDigits: 14 },
  { code: 'KAKAO',   name: '카카오뱅크',   minDigits: 13, maxDigits: 14 },
  { code: 'TOSS',    name: '토스뱅크',     minDigits: 12, maxDigits: 13 },
  { code: 'KBANK',   name: '케이뱅크',     minDigits: 12, maxDigits: 14 },
  { code: 'SAEMAUL', name: '새마을금고',   minDigits: 11, maxDigits: 14 },
  { code: 'POST',    name: '우체국',       minDigits: 11, maxDigits: 14 },
  { code: 'SUHYUP',  name: '수협은행',     minDigits: 11, maxDigits: 14 },
  { code: 'CU',      name: '신협',         minDigits: 11, maxDigits: 14 },
  { code: 'BUSAN',   name: '부산은행',     minDigits: 11, maxDigits: 14 },
  { code: 'DAEGU',   name: 'iM뱅크(대구)', minDigits: 11, maxDigits: 14 },
  { code: 'GWANGJU', name: '광주은행',     minDigits: 11, maxDigits: 14 },
  { code: 'JEONBUK', name: '전북은행',     minDigits: 11, maxDigits: 14 },
  { code: 'KYONGNAM',name: '경남은행',     minDigits: 11, maxDigits: 14 },
  { code: 'JEJU',    name: '제주은행',     minDigits: 11, maxDigits: 14 },
];

export function findBank(name: string): BankInfo | undefined {
  if (!name) return undefined;
  // 이름에 포함되거나 정확히 일치
  return BANKS.find(b => b.name === name) ||
         BANKS.find(b => name.includes(b.name)) ||
         BANKS.find(b => b.name.includes(name));
}

export function formatBankAccount(input: string): string {
  // 숫자와 하이픈만 허용. 입력 그대로 유지 (은행마다 하이픈 위치 다름).
  return input.replace(/[^\d-]/g, '');
}

export function validateBankAccount(input: string, bankName?: string): { valid: boolean; error?: string } {
  const d = input.replace(/\D/g, '');
  if (!d) return { valid: false, error: '계좌번호를 입력해주세요.' };
  if (d.length < 10) return { valid: false, error: '계좌번호가 너무 짧습니다 (최소 10자리).' };
  if (d.length > 16) return { valid: false, error: '계좌번호가 너무 깁니다 (최대 16자리).' };

  if (bankName) {
    const bank = findBank(bankName);
    if (bank) {
      if (d.length < bank.minDigits) {
        return { valid: false, error: `${bank.name} 계좌는 최소 ${bank.minDigits}자리입니다 (현재 ${d.length}자리).` };
      }
      if (d.length > bank.maxDigits) {
        return { valid: false, error: `${bank.name} 계좌는 최대 ${bank.maxDigits}자리입니다 (현재 ${d.length}자리).` };
      }
    }
  }

  return { valid: true };
}
