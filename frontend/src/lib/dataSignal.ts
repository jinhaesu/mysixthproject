// Cross-page cache invalidation signal via localStorage.
// 한 페이지에서 데이터가 변경되면 bumpRegularDataVersion() 호출 →
// 다른 페이지들은 load 시점에 getRegularDataVersion()과 마지막 로드 버전 비교해
// 일치하지 않으면 자체 캐시 무효화 후 재조회.

const KEY = 'regular_data_version';

export function bumpRegularDataVersion(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch { /* SSR or quota */ }
}

export function getRegularDataVersion(): string {
  try {
    return localStorage.getItem(KEY) || '0';
  } catch {
    return '0';
  }
}
