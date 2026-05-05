/**
 * 관리자 비밀번호 검증 helper.
 * - 15초 timeout (fetch hang 방어)
 * - 401 자동 로그아웃 (만료된 JWT 토큰)
 * - PasswordGate / SessionPasswordGate / 기타 inline verifyPassword 모두 이 함수 사용
 */
export async function verifyAdminPassword(pw: string): Promise<boolean> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/regular/verify-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: pw }),
        signal: controller.signal,
      }
    );
    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
      return false;
    }
    const body = await res.json().catch(() => ({}));
    return !!body.verified;
  } finally {
    clearTimeout(timeoutId);
  }
}
