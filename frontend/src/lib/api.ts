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

// Org Chart
export async function getOrgChartNodes() {
  return fetchAPI<any[]>('/api/org-chart');
}

export async function createOrgChartNode(data: any) {
  return fetchAPI<any>('/api/org-chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateOrgChartNode(id: number, data: any) {
  return fetchAPI<any>(`/api/org-chart/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteOrgChartNode(id: number) {
  return fetchAPI<any>(`/api/org-chart/${id}`, { method: 'DELETE' });
}

// Workforce Plan
export async function getWorkforcePlans(year: number, month: number) {
  return fetchAPI<any[]>(`/api/workforce-plan?year=${year}&month=${month}`);
}

export async function saveWorkforcePlans(year: number, month: number, plans: any[]) {
  return fetchAPI<any[]>('/api/workforce-plan/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month, plans }),
  });
}

// Workforce Plan Slots (time-block based)
export async function getWorkforcePlanSlots(year: number, month: number) {
  return fetchAPI<any[]>(`/api/workforce-plan/slots?year=${year}&month=${month}`);
}

export async function saveWorkforcePlanSlotsBatch(year: number, month: number, slots: any[]) {
  return fetchAPI<any[]>('/api/workforce-plan/slots/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, month, slots }),
  });
}

export async function deleteWorkforcePlanSlot(id: number) {
  return fetchAPI<any>(`/api/workforce-plan/slots/${id}`, { method: 'DELETE' });
}
