import type {
  UploadResponse,
  Upload,
  AttendanceRecord,
  StatsData,
  FilterOptions,
  PivotData,
} from '@/types/attendance';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: '요청 처리 중 오류가 발생했습니다.' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Upload
export async function uploadFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  return fetchAPI<UploadResponse>('/api/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function getUploads(): Promise<Upload[]> {
  return fetchAPI<Upload[]>('/api/upload');
}

export async function deleteUpload(id: string): Promise<void> {
  await fetchAPI(`/api/upload/${id}`, { method: 'DELETE' });
}

// Attendance records
export async function getRecords(params: Record<string, string> = {}): Promise<{
  records: AttendanceRecord[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}> {
  const query = new URLSearchParams(params).toString();
  return fetchAPI(`/api/attendance?${query}`);
}

// Stats
export async function getStats(params: Record<string, string> = {}): Promise<StatsData> {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<StatsData>(`/api/attendance/stats?${query}`);
}

// Filters
export async function getFilters(): Promise<FilterOptions> {
  return fetchAPI<FilterOptions>('/api/attendance/filters');
}

// Pivot
export async function getPivotData(params: Record<string, string> = {}): Promise<PivotData> {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<PivotData>(`/api/attendance/pivot?${query}`);
}

// Report
export async function getReportSummary(year: number, month: number) {
  return fetchAPI<any>(`/api/attendance/report/summary?year=${year}&month=${month}`);
}

export async function getReportDaily(year: number, month: number) {
  return fetchAPI<any>(`/api/attendance/report/daily?year=${year}&month=${month}`);
}
