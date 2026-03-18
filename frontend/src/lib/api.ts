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
export async function getOrgChartStats() {
  return fetchAPI<any>('/api/org-chart/stats');
}

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

export async function getWorkforcePlanComparison(year: number, month: number) {
  return fetchAPI<any>(`/api/workforce-plan/comparison?year=${year}&month=${month}`);
}

// ===== Survey =====

// Workplaces
export async function getSurveyWorkplaces() {
  return fetchAPI<any[]>('/api/survey/workplaces');
}

export async function createSurveyWorkplace(data: { name: string; address: string; latitude: number; longitude: number; radius_meters: number }) {
  return fetchAPI<any>('/api/survey/workplaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateSurveyWorkplace(id: number, data: any) {
  return fetchAPI<any>(`/api/survey/workplaces/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteSurveyWorkplace(id: number) {
  return fetchAPI<any>(`/api/survey/workplaces/${id}`, { method: 'DELETE' });
}

// Send survey
export async function sendSurvey(data: { phone: string; date: string; workplace_id: number | null; message_type: string }) {
  return fetchAPI<any>('/api/survey/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function sendSurveyBatch(data: { phones: string[]; date: string; workplace_id: number | null; message_type: string }) {
  return fetchAPI<any>('/api/survey/send-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Survey stats & resend
export async function getSurveyStats() {
  return fetchAPI<any>('/api/survey/stats');
}

export async function resendSurvey(id: number) {
  return fetchAPI<any>(`/api/survey/resend/${id}`, { method: 'POST' });
}

// Survey responses
export async function getSurveyResponses(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/survey/responses?${query}`);
}

export async function getSurveyRequests(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any[]>(`/api/survey/requests?${query}`);
}

export async function exportSurveyExcel(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}/api/survey/responses/export?${query}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('엑셀 다운로드 실패');
  return res.blob();
}

export async function updateSurveyResponseTime(id: number, data: { clock_in_time?: string; clock_out_time?: string }) {
  return fetchAPI<any>(`/api/survey/responses/${id}/time`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Public survey API (no auth)
export async function fetchSurveyPublic(token: string) {
  const res = await fetch(`${API_URL}/api/survey-public/${token}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '설문을 불러올 수 없습니다.' }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function submitClockIn(token: string, data: any) {
  const res = await fetch(`${API_URL}/api/survey-public/${token}/clock-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '출근 기록 실패' }));
    throw new Error(err.error);
  }
  return res.json();
}

// ===== Attendance Live Dashboard =====
export async function getAttendanceLiveDashboard(date: string) {
  return fetchAPI<any>(`/api/survey/dashboard?date=${date}`);
}

// ===== Workers =====
export async function getWorkers(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/workers?${query}`);
}

export async function getWorkerByPhone(phone: string) {
  return fetchAPI<any>(`/api/workers/by-phone/${encodeURIComponent(phone)}`);
}

export async function createWorker(data: any) {
  return fetchAPI<any>('/api/workers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateWorker(id: number, data: any) {
  return fetchAPI<any>(`/api/workers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteWorker(id: number) {
  return fetchAPI<any>(`/api/workers/${id}`, { method: 'DELETE' });
}

export async function importWorkers() {
  return fetchAPI<any>('/api/workers/import', { method: 'POST' });
}

// ===== Payroll =====
export async function getPayrollSettings() {
  return fetchAPI<any[]>('/api/payroll/settings');
}

export async function savePayrollSettings(settings: any[]) {
  return fetchAPI<any>('/api/payroll/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
}

export async function calculatePayroll(year: number, month: number) {
  return fetchAPI<any>(`/api/payroll/calculate?year=${year}&month=${month}`);
}

export async function exportPayrollExcel(year: number, month: number) {
  const res = await fetch(`${API_URL}/api/payroll/export?year=${year}&month=${month}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('급여 엑셀 다운로드 실패');
  return res.blob();
}

// ===== Reminders =====
export async function triggerReminders(date: string, thresholdHours = 2) {
  return fetchAPI<any>('/api/survey/remind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, threshold_hours: thresholdHours }),
  });
}

// ===== Anomalies =====
export async function getAttendanceAnomalies(year: number, month: number) {
  return fetchAPI<any>(`/api/attendance/anomalies?year=${year}&month=${month}`);
}

export async function submitClockOut(token: string, data: any) {
  const res = await fetch(`${API_URL}/api/survey-public/${token}/clock-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '퇴근 기록 실패' }));
    throw new Error(err.error);
  }
  return res.json();
}
