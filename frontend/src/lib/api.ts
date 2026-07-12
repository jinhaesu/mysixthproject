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

// 모든 API 호출에 45초 hard timeout. 무한 대기 방지 (이전: 브라우저 기본).
const DEFAULT_TIMEOUT_MS = 45_000;

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options?.signal || controller.signal,
      headers: {
        ...getAuthHeaders(),
        ...options?.headers,
      },
    });
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('서버 응답이 지연되어 시간 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }
    throw e;
  }
  clearTimeout(timeoutId);

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: `HTTP ${res.status} 오류` }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// Upload
export async function uploadFile(file: File, options?: { exclude_category?: string; only_category?: string }): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  let url = '/api/upload';
  const params = new URLSearchParams();
  if (options?.exclude_category) params.set('exclude_category', options.exclude_category);
  if (options?.only_category) params.set('only_category', options.only_category);
  if (params.toString()) url += '?' + params.toString();

  return fetchAPI<UploadResponse>(url, {
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
type WeekSchedule = { start_date: string; weekdays: number[]; daily_time: string; repeat_weeks: number };
export async function sendSurvey(data: { phone: string; date: string; workplace_id: number | null; message_type: string; department?: string; planned_clock_in?: string; planned_clock_out?: string; scheduled_at?: string; schedule_range?: { start_date: string; end_date: string; daily_time: string }; week_schedule?: WeekSchedule }) {
  return fetchAPI<any>('/api/survey/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function sendSurveyBatch(data: { phones: string[]; date: string; workplace_id: number | null; message_type: string; department?: string; planned_clock_in?: string; planned_clock_out?: string; scheduled_at?: string; schedule_range?: { start_date: string; end_date: string; daily_time: string }; week_schedule?: WeekSchedule }) {
  return fetchAPI<any>('/api/survey/send-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Survey stats & resend
export async function getSurveyStats(department?: string) {
  const query = department ? `?department=${encodeURIComponent(department)}` : '';
  return fetchAPI<any>(`/api/survey/stats${query}`);
}

export async function resendSurvey(id: number) {
  return fetchAPI<any>(`/api/survey/resend/${id}`, { method: 'POST' });
}

export async function addManualAttendance(data: { password: string; phone: string; date: string; clock_in_time?: string; clock_out_time?: string }) {
  // 방어적 URL 해석: 오래된 캐시/환경변수 누락으로 API_URL 이 비어있어도 Railway 로 직접 호출
  const base = API_URL || 'https://mysixthproject-production.up.railway.app';
  const url = `${base}/api/survey/manual-attendance`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: `비JSON 응답: ${text.slice(0, 120)}` }; }
  if (!res.ok) {
    const suffix = body?.error ? ` — ${body.error}` : (text ? ` — ${text.slice(0, 80)}` : '');
    throw new Error(`HTTP ${res.status} (${url})${suffix}`);
  }
  return body;
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
  return fetchAPI<any>(`/api/survey/edit-time/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ===== Safety Notices =====
export async function getSafetyNotices() {
  return fetchAPI<any[]>('/api/survey/safety-notices');
}

export async function createSafetyNotice(data: { title: string; content: string }) {
  return fetchAPI<any>('/api/survey/safety-notices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function updateSafetyNotice(id: number, data: { title: string; content: string }) {
  return fetchAPI<any>(`/api/survey/safety-notices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteSafetyNotice(id: number) {
  return fetchAPI<any>(`/api/survey/safety-notices/${id}`, { method: 'DELETE' });
}

export async function sendSafetyNotice(date: string, noticeId: number, phones?: string[], scheduledAt?: string, scheduleRange?: { start_date: string; end_date: string; daily_time: string }) {
  return fetchAPI<any>('/api/survey/send-safety-notice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, notice_id: noticeId, phones, scheduled_at: scheduledAt, schedule_range: scheduleRange }),
  });
}

export async function batchEditResponseTime(ids: number[], data: { clock_in_time?: string; clock_out_time?: string }) {
  return fetchAPI<any>('/api/survey/responses/batch-edit-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, ...data }),
  });
}

export async function batchDeleteResponses(ids: number[]) {
  return fetchAPI<any>('/api/survey/responses/batch-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

// ===== Regular Employees (현장 정규직) =====
export async function getRegularEmployees(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/regular/employees?${query}`);
}
export async function createRegularEmployee(data: any) {
  return fetchAPI<any>('/api/regular/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function updateRegularEmployee(id: number, data: any) {
  return fetchAPI<any>(`/api/regular/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function deleteRegularEmployee(id: number) {
  return fetchAPI<any>(`/api/regular/employees/${id}`, { method: 'DELETE' });
}
export async function resignRegularEmployee(id: number, resign_date: string) {
  return fetchAPI<any>(`/api/regular/employees/${id}/resign`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resign_date }) });
}
export async function getResignedEmployees() {
  return fetchAPI<any[]>('/api/regular/employees/resigned');
}
export async function sendRegularLink(id: number, kind?: 'cafe' | 'regular') {
  return fetchAPI<any>(`/api/regular/employees/${id}/send-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kind ? { kind } : {}),
  });
}
export async function sendRegularLinkBatch(ids: number[], kind?: 'cafe' | 'regular') {
  return fetchAPI<any>('/api/regular/employees/send-link-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kind ? { ids, kind } : { ids }),
  });
}
export async function getRegularDashboard(date: string) {
  return fetchAPI<any>(`/api/regular/dashboard?date=${date}`);
}
export async function getRegularNotices(date?: string) {
  return fetchAPI<any[]>(`/api/regular/notices${date ? '?date=' + date : ''}`);
}
export async function createRegularNotice(data: any) {
  return fetchAPI<any>('/api/regular/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function updateRegularNotice(id: number, data: any) {
  return fetchAPI<any>(`/api/regular/notices/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function deleteRegularNotice(id: number) {
  return fetchAPI<any>(`/api/regular/notices/${id}`, { method: 'DELETE' });
}
export async function getRegularOrgSettings() {
  return fetchAPI<any[]>('/api/regular/org-settings');
}
export async function createRegularOrgSetting(data: any) {
  return fetchAPI<any>('/api/regular/org-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function updateRegularOrgSetting(id: number, data: any) {
  return fetchAPI<any>(`/api/regular/org-settings/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function deleteRegularOrgSetting(id: number) {
  return fetchAPI<any>(`/api/regular/org-settings/${id}`, { method: 'DELETE' });
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
export async function getWorkersLite() {
  return fetchAPI<any>('/api/workers/lite');
}
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

export async function updateWorkerHourlyRate(id: number, hourly_rate: number) {
  return fetchAPI<any>(`/api/workers/${id}/hourly-rate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hourly_rate }),
  });
}

export async function bulkWorkerHourlyRate(category: string, hourly_rate: number) {
  return fetchAPI<any>(`/api/workers/bulk-hourly-rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, hourly_rate }),
  });
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

// ===== Report Schedules =====
export async function getReportSchedules() {
  return fetchAPI<any[]>('/api/survey/report-schedules');
}
export async function createReportSchedule(data: { time: string; phones: string[]; repeat_days?: string }) {
  return fetchAPI<any>('/api/survey/report-schedules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}
export async function deleteReportSchedule(id: number) {
  return fetchAPI<any>(`/api/survey/report-schedules/${id}`, { method: 'DELETE' });
}
export async function sendReportNow(id: number) {
  return fetchAPI<any>(`/api/survey/report-schedules/${id}/send-now`, { method: 'POST' });
}

// ===== Regular Report Schedules =====
export async function getRegularReportSchedules() {
  return fetchAPI<any[]>('/api/regular/report-schedules');
}
export async function createRegularReportSchedule(data: { time: string; phones: string[]; repeat_days?: string }) {
  return fetchAPI<any>('/api/regular/report-schedules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
}
export async function deleteRegularReportSchedule(id: number) {
  return fetchAPI<any>(`/api/regular/report-schedules/${id}`, { method: 'DELETE' });
}
export async function sendRegularReportNow(id: number) {
  return fetchAPI<any>(`/api/regular/report-schedules/${id}/send-now`, { method: 'POST' });
}

// ===== Scheduler =====
export async function runScheduler() {
  return fetchAPI<any>('/api/survey/run-scheduler', { method: 'POST' });
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

// ===== Weekly Holiday Pay (주휴수당) =====
export async function getWeeklyHolidayStatus(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/survey/weekly-holiday-status?${query}`);
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

// ===== Regular Vacation =====
export async function getRegularVacations(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return fetchAPI<any[]>(`/api/regular/vacations${qs}`);
}
export async function approveVacation(id: number, admin_memo?: string) {
  return fetchAPI<any>(`/api/regular/vacations/${id}/approve`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_memo }) });
}
export async function rejectVacation(id: number, admin_memo?: string) {
  return fetchAPI<any>(`/api/regular/vacations/${id}/reject`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_memo }) });
}
export async function getVacationBalances(year?: string) {
  return fetchAPI<any[]>(`/api/regular/vacation-balances${year ? '?year=' + year : ''}`);
}
export async function setVacationBalance(employeeId: number, data: { year: number; total_days: number }) {
  return fetchAPI<any>(`/api/regular/vacation-balances/${employeeId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function initVacationBalances(data: { year: number; total_days: number }) {
  return fetchAPI<any>('/api/regular/vacation-balances/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function autoCalcVacationBalances(year: number) {
  return fetchAPI<any>('/api/regular/vacation-balances/auto-calc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year }) });
}
export async function getVacationLogs() {
  return fetchAPI<any[]>('/api/regular/vacation-logs');
}

// ===== Regular Shifts =====
export async function getRegularShifts() {
  return fetchAPI<any[]>('/api/regular/shifts');
}
export async function createRegularShift(data: { name: string; week_number: number; day_of_week: number; planned_clock_in: string; planned_clock_out: string }) {
  return fetchAPI<any>('/api/regular/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function deleteRegularShift(id: number) {
  return fetchAPI<any>(`/api/regular/shifts/${id}`, { method: 'DELETE' });
}
export async function getShiftAssignments(shiftId: number) {
  return fetchAPI<any[]>(`/api/regular/shifts/${shiftId}/assignments`);
}
export async function assignEmployeesToShift(shiftId: number, employeeIds: number[]) {
  return fetchAPI<any>(`/api/regular/shifts/${shiftId}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_ids: employeeIds }) });
}
export async function removeShiftAssignment(shiftId: number, employeeId: number) {
  return fetchAPI<any>(`/api/regular/shifts/${shiftId}/assignments/${employeeId}`, { method: 'DELETE' });
}
export async function getShiftPlan(date: string) {
  return fetchAPI<any>(`/api/regular/shift-plan?date=${date}`);
}
export async function sendRegularContract(employeeId: number, data?: any) {
  return fetchAPI<any>('/api/regular/contracts/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, ...data }) });
}
export async function getRegularContracts() {
  return fetchAPI<any[]>('/api/regular/contracts');
}

// ===== Attendance Summary =====
export async function getAttendanceSummaryRegular(year: number, month: number) {
  return fetchAPI<any>(`/api/regular/attendance-summary?year=${year}&month=${month}`);
}
export async function getAttendanceSummaryDispatch(year: number, month: number) {
  return fetchAPI<any>(`/api/survey/attendance-summary?year=${year}&month=${month}`);
}
export async function confirmAttendance(records: any[]) {
  return fetchAPI<any>('/api/regular/attendance-confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) });
}
export async function getConfirmedList(yearMonth: string, employeeType?: string) {
  const params = new URLSearchParams({ year_month: yearMonth });
  if (employeeType) params.set('employee_type', employeeType);
  return fetchAPI<any[]>(`/api/regular/confirmed-list?${params}`);
}
export async function updateConfirmedRecord(id: number, data: any) {
  return fetchAPI<any>(`/api/regular/confirmed-list/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function deleteConfirmedRecord(id: number) {
  return fetchAPI<any>(`/api/regular/confirmed-list/${id}`, { method: 'DELETE' });
}
export async function updateConfirmedRecordType(id: number, employee_type: string) {
  return fetchAPI<any>(`/api/regular/confirmed-list/${id}/type`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_type }) });
}
export async function deleteRegularAttendanceMonth(employeeId: number, year: number, month: number) {
  return fetchAPI<any>(`/api/regular/attendance-month/${employeeId}?year=${year}&month=${month}`, { method: 'DELETE' });
}

// ===== Salary Settings =====
export async function getSalarySettings() {
  return fetchAPI<any[]>('/api/regular/salary-settings');
}
export async function updateSalarySettings(employeeId: number, data: any) {
  return fetchAPI<any>(`/api/regular/salary-settings/${employeeId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function updateHourlyRate(employeeId: number, overtime_hourly_rate: number) {
  return fetchAPI<any>(`/api/regular/salary-settings/${employeeId}/hourly-rate`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overtime_hourly_rate }) });
}
export async function bulkSetHourlyRate(overtime_hourly_rate: number) {
  return fetchAPI<any>(`/api/regular/salary-settings/bulk-hourly-rate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overtime_hourly_rate }) });
}
export async function getPayrollCalc(yearMonth: string) {
  return fetchAPI<any>(`/api/regular/payroll-calc?year_month=${yearMonth}`);
}
export async function getPayrollClosing(yearMonth: string) {
  return fetchAPI<any>(`/api/regular/payroll-closing/${yearMonth}`);
}
export async function closePayroll(yearMonth: string) {
  return fetchAPI<any>(`/api/regular/payroll-closing/${yearMonth}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
}
export async function cancelPayrollClosing(yearMonth: string) {
  return fetchAPI<any>(`/api/regular/payroll-closing/${yearMonth}`, { method: 'DELETE' });
}
export async function savePayrollAdjustment(employeeId: number, yearMonth: string, amount: number, memo: string) {
  return fetchAPI<any>(`/api/regular/payroll-adjustment`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId, year_month: yearMonth, amount, memo }) });
}
export async function markPayrollPaid(yearMonth: string) {
  return fetchAPI<any>(`/api/regular/payroll-payment/${yearMonth}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
}
export async function unmarkPayrollPaid(yearMonth: string) {
  return fetchAPI<any>(`/api/regular/payroll-payment/${yearMonth}`, { method: 'DELETE' });
}
// Employee loans
export async function listEmployeeLoans() {
  return fetchAPI<any[]>(`/api/regular/loans`);
}
export async function searchLoanEmployees(q: string) {
  return fetchAPI<any[]>(`/api/regular/loans/employee-search?q=${encodeURIComponent(q)}`);
}
export async function createEmployeeLoan(data: any) {
  return fetchAPI<any>(`/api/regular/loans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function updateEmployeeLoan(id: number, data: any) {
  return fetchAPI<any>(`/api/regular/loans/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}
export async function deleteEmployeeLoan(id: number) {
  return fetchAPI<any>(`/api/regular/loans/${id}`, { method: 'DELETE' });
}

export async function getSettlement(yearMonth: string, type: string) {
  return fetchAPI<any>(`/api/survey/settlement?year_month=${yearMonth}&type=${type}`);
}

// ===== Dashboard Home Stats =====
export async function getDashboardHomeStats(yearMonth: string) {
  return fetchAPI<any>(`/api/dashboard/home-stats?year_month=${yearMonth}`);
}

// ===== Contracts =====
export async function getContractsLatest(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/contracts/latest${query ? '?' + query : ''}`);
}

export async function getContractsMissing(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/contracts/missing${query ? '?' + query : ''}`);
}

export async function getContractHistory(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/contracts/history${query ? '?' + query : ''}`);
}

export async function uploadLegacyContract(body: {
  employee_type: 'regular' | 'dispatch' | 'alba';
  employee_id?: number;
  phone?: string;
  filename: string;
  file_data: string;
  contract_start?: string;
  contract_end?: string;
  work_start_date?: string;
  notes?: string;
}) {
  return fetchAPI<{ ok: boolean; contract_id: number }>('/api/contracts/upload-legacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ===== Offboarding =====
export async function getOffboardings(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/offboarding${query ? '?' + query : ''}`);
}

export async function getOffboarding(id: number) {
  return fetchAPI<any>(`/api/offboarding/${id}`);
}

export async function createOffboarding(body: {
  employee_type: string;
  employee_ref_id: number;
  resign_date: string;
  reason_code: string;
  reason_detail?: string;
  send_email?: boolean;
  send_resignation_letter_sms?: boolean;
}) {
  return fetchAPI<any>('/api/offboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchOffboarding(id: number, partial: Record<string, any>) {
  return fetchAPI<any>(`/api/offboarding/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export async function deleteOffboarding(id: number) {
  return fetchAPI<any>(`/api/offboarding/${id}`, { method: 'DELETE' });
}

export async function recomputeOffboarding(id: number) {
  return fetchAPI<any>(`/api/offboarding/${id}/recompute`, { method: 'POST' });
}

export async function sendOffboardingEmail(id: number) {
  return fetchAPI<any>(`/api/offboarding/${id}/send-email`, { method: 'POST' });
}

export async function getOffboardingDashboard() {
  return fetchAPI<any>('/api/offboarding/dashboard');
}

export async function getOffboardingRecipients() {
  return fetchAPI<any>('/api/offboarding/settings/email-recipients');
}

export async function setOffboardingRecipients(emails: string[]) {
  return fetchAPI<any>('/api/offboarding/settings/email-recipients', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails }),
  });
}

// ===== Onboarding =====
export async function getOnboardings(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchAPI<any>(`/api/onboarding${query ? '?' + query : ''}`);
}

export async function getOnboarding(id: number) {
  return fetchAPI<any>(`/api/onboarding/${id}`);
}

export async function patchOnboarding(id: number, partial: Record<string, any>) {
  return fetchAPI<any>(`/api/onboarding/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
}

export async function sendOnboardingEmail(id: number) {
  return fetchAPI<any>(`/api/onboarding/${id}/send-email`, { method: 'POST' });
}

export async function getOnboardingDashboard() {
  return fetchAPI<any>('/api/onboarding/dashboard');
}

export async function getOnboardingRecipients() {
  return fetchAPI<any>('/api/onboarding/settings/email-recipients');
}

export async function setOnboardingRecipients(emails: string[]) {
  return fetchAPI<any>('/api/onboarding/settings/email-recipients', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails }),
  });
}

// 회사 기본값 (직종코드·사업장관리번호·소정근로시간)
export async function getOnboardingCompanyDefaults() {
  return fetchAPI<{ job_code?: string; business_registration_no?: string; weekly_work_hours?: number }>(
    '/api/onboarding/settings/company-defaults'
  );
}

export async function setOnboardingCompanyDefaults(payload: {
  job_code?: string;
  business_registration_no?: string;
  weekly_work_hours?: number;
}) {
  return fetchAPI<any>('/api/onboarding/settings/company-defaults', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function applyOnboardingCompanyDefaults() {
  return fetchAPI<{ success: boolean; updated: number }>(
    '/api/onboarding/settings/company-defaults/apply-all',
    { method: 'POST' }
  );
}

export async function bulkSendOnboardingLinks(ids: number[]) {
  return fetchAPI<any>('/api/onboarding/bulk-send-links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function bulkUpdateOnboarding(ids: number[], updates: Record<string, any>) {
  return fetchAPI<any>('/api/onboarding/bulk-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, updates }),
  });
}

// ═══════════════════════════════════════════════════════════════
// 안전보건 시스템 P1 — 근로자 셀프체크 이행 현황 (관리자)
// ═══════════════════════════════════════════════════════════════

export interface SafetyComplianceRow {
  employee_id: number;
  name: string;
  phone: string;
  department: string | null;
  team: string | null;
  role: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  precheck_done: boolean;
  precheck_ok: boolean | null;
  precheck_completed_at: string | null;
  postcheck_done: boolean;
  postcheck_ok: boolean | null;
  postcheck_completed_at: string | null;
  status: 'no_attendance' | 'pre_missing' | 'post_missing' | 'has_issue' | 'complete';
  missing_pre_7d: number;
  missing_post_7d: number;
}

export interface SafetyComplianceResponse {
  date: string;
  items: SafetyComplianceRow[];
  summary: {
    total: number;
    no_attendance: number;
    pre_missing: number;
    post_missing: number;
    has_issue: number;
    complete: number;
  };
}

export async function getSafetyWorkerCompliance(date?: string, department?: string) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (department) params.set('department', department);
  const qs = params.toString();
  return fetchAPI<SafetyComplianceResponse>(`/api/safety-manager/worker-compliance${qs ? `?${qs}` : ''}`);
}

export async function getSafetyWorkerDetail(employeeId: number, from: string, to?: string) {
  const params = new URLSearchParams({ from });
  if (to) params.set('to', to);
  return fetchAPI<{ employee: any; from: string; to: string; logs: any[] }>(
    `/api/safety-manager/worker-compliance/${employeeId}/detail?${params.toString()}`
  );
}

export async function getSafetyTemplates() {
  return fetchAPI<{ templates: any[] }>('/api/safety-manager/templates');
}

export async function getSafetyTemplateItems(templateId: number) {
  return fetchAPI<{ items: any[] }>(`/api/safety-manager/templates/${templateId}/items`);
}

// ═══════════════════════════════════════════════════════════════
// 안전보건 시스템 P2 — 아차사고 신고 + 순회점검 + 조치 티켓
// ═══════════════════════════════════════════════════════════════

export interface SafetyArea {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  active: number;
}

export interface InspectionTemplateItem {
  id: number;
  item_no: number;
  item_title: string;
  item_detail: string;
  requires_photo_on_x: number;
  sort_order: number;
}

export interface InspectionTemplate {
  id: number;
  name: string;
  area_id: number | null;
  area_name?: string;
  area_code?: string;
  sort_order: number;
  items: InspectionTemplateItem[];
}

export interface SafetyTicket {
  id: number;
  source_type: 'inspection' | 'hazard' | 'selfcheck' | string;
  source_id: number | null;
  area_id: number | null;
  area_name?: string;
  area_code?: string;
  title: string;
  description: string;
  severity: 'low' | 'mid' | 'high' | 'critical' | string;
  assignee_type: string;
  assignee_id: number | null;
  assignee_name: string;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'done' | string;
  completion_photo_url: string;
  completion_notes: string;
  completed_at: string | null;
  verified_by: number | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  is_overdue?: boolean;
}

export interface HazardReport {
  id: number;
  reporter_employee_id: number | null;
  reporter_name: string;
  reporter_phone: string;
  is_anonymous: number;
  occurred_at: string;
  area_id: number | null;
  area_name: string;
  area_name_lookup?: string;
  hazard_type: string;
  description: string;
  photo_url: string;
  freq_score: number | null;
  intensity_score: number | null;
  grade: string | null;
  assessed_by: number | null;
  assessed_at: string | null;
  ticket_id: number | null;
  ticket_status?: string;
  ticket_severity?: string;
  ticket_due_date?: string;
  response_to_reporter: string;
  response_sent_at: string | null;
  closed_at: string | null;
  status: 'reported' | 'assessed' | 'in_progress' | 'closed' | string;
  created_at: string;
}

// ---- Public (근로자 토큰) ----
export async function reportHazard(token: string, body: {
  hazard_type: string;
  description?: string;
  area_id?: number | null;
  area_name?: string;
  is_anonymous?: boolean;
  photo_url?: string;
  occurred_at?: string;
}) {
  const res = await fetch(`${API_URL}/api/regular-public/${token}/hazard/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { success: boolean; id: number; message: string };
}

export async function getHazardHistory(token: string) {
  const res = await fetch(`${API_URL}/api/regular-public/${token}/hazard/history`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as { reports: HazardReport[] };
}

// ---- 관리자 (JWT 필요) ----
export async function listSafetyAreas() {
  return fetchAPI<{ areas: SafetyArea[] }>('/api/safety-manager/areas');
}

export async function getInspectionTemplates(areaId?: number) {
  const qs = areaId ? `?area_id=${areaId}` : '';
  return fetchAPI<{ templates: InspectionTemplate[] }>(`/api/safety-manager/inspection-templates${qs}`);
}

export async function getInspections(params?: { date?: string; area_id?: number }) {
  const qs = new URLSearchParams();
  if (params?.date) qs.set('date', params.date);
  if (params?.area_id) qs.set('area_id', String(params.area_id));
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{ date: string; inspections: any[] }>(`/api/safety-manager/inspections${suffix}`);
}

export async function createInspection(body: {
  area_id: number;
  inspection_date?: string;
  weather?: string;
  overall_notes?: string;
}) {
  return fetchAPI<{ success: boolean; id: number; inspection_date: string }>(
    '/api/safety-manager/inspections',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchInspection(id: number, body: {
  status?: string; overall_notes?: string; weather?: string;
}) {
  return fetchAPI<{ success: boolean }>(`/api/safety-manager/inspections/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

export async function saveFindings(inspectionId: number, findings: Array<{
  item_master_id?: number | null;
  item_title: string;
  judgement: 'O' | '△' | 'X';
  photo_url?: string;
  notes?: string;
}>) {
  return fetchAPI<{
    success: boolean;
    inspection_id: number;
    findings_saved: number;
    tickets_created: number;
    results: { finding_id: number; ticket_id: number | null }[];
  }>(`/api/safety-manager/inspections/${inspectionId}/findings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ findings }),
  });
}

export async function getFindings(inspectionId: number) {
  return fetchAPI<{ inspection_id: number; findings: any[] }>(
    `/api/safety-manager/inspections/${inspectionId}/findings`
  );
}

export async function listTickets(filter?: {
  status?: string; severity?: string; area_id?: number; overdue?: boolean;
}) {
  const qs = new URLSearchParams();
  if (filter?.status) qs.set('status', filter.status);
  if (filter?.severity) qs.set('severity', filter.severity);
  if (filter?.area_id) qs.set('area_id', String(filter.area_id));
  if (filter?.overdue) qs.set('overdue', '1');
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{
    tickets: SafetyTicket[];
    summary: { total: number; open: number; in_progress: number; done: number; overdue: number };
  }>(`/api/safety-manager/tickets${suffix}`);
}

export async function patchTicket(id: number, body: Partial<{
  status: string; severity: string; assignee_name: string; assignee_id: number;
  due_date: string; title: string; description: string;
  completion_photo_url: string; completion_notes: string;
}>) {
  return fetchAPI<{ success: boolean; ticket: SafetyTicket }>(
    `/api/safety-manager/tickets/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function listHazardReports(filter?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (filter?.status) qs.set('status', filter.status);
  if (filter?.limit) qs.set('limit', String(filter.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{
    reports: HazardReport[];
    summary: { total: number; reported: number; assessed: number; in_progress: number; closed: number };
  }>(`/api/safety-manager/hazard-reports${suffix}`);
}

export async function assessHazardReport(id: number, body: {
  freq_score: number; intensity_score: number;
  severity?: string; due_date?: string; assignee_name?: string; notes?: string;
}) {
  return fetchAPI<{ success: boolean; report: HazardReport; ticket_id: number }>(
    `/api/safety-manager/hazard-reports/${id}/assess`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchHazardReport(id: number, body: Partial<{
  status: string; area_id: number | null; area_name: string; description: string; hazard_type: string;
}>) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/hazard-reports/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function replyToHazardReport(id: number, response_to_reporter: string) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/hazard-reports/${id}/reply`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response_to_reporter }) }
  );
}

// ═══════════════════════════════════════════════════════════════
// 보건 P3 — 보건관리자 (관리자 API)
// ═══════════════════════════════════════════════════════════════

export interface HealthInspection {
  id: number;
  inspector_id: number;
  inspector_name: string;
  inspection_date: string;
  noise_status: string;
  dust_status: string;
  temp_status: string;
  rest_area_status: string;
  wash_area_status: string;
  first_aid_status: string;
  aed_status: string;
  chemical_storage_status: string;
  overall_notes: string;
  created_at: string;
}

export interface HealthConsultation {
  id: number;
  employee_id: number;
  employee_name: string;
  consultation_date: string;
  consultation_type: string;
  chief_complaint: string;
  action_taken: string;
  next_followup_date: string | null;
  consulted_by: number | null;
  consulted_by_name: string;
  employee_department?: string | null;
  employee_team?: string | null;
  created_at: string;
}

export interface MsdsEntry {
  id: number;
  material_name: string;
  usage_description: string;
  handling_dept: string;
  handling_location: string;
  posted_photo_url: string;
  container_label_photo_url: string;
  required_ppe: string;
  training_completed_at: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface HealthCheckup {
  id: number;
  employee_id: number;
  employee_name: string;
  checkup_type: string;
  scheduled_year: number | null;
  scheduled_month: string | null;
  received_at: string | null;
  result_grade: string;
  result_notes: string;
  followup_required: number;
  followup_actions: string;
  followup_completed_at: string | null;
  employee_department?: string | null;
  employee_team?: string | null;
  employee_phone?: string | null;
  created_at: string;
}

export interface HealthCertificate {
  id: number;
  employee_id: number;
  employee_name: string;
  cert_type: string;
  issue_date: string;
  expiry_date: string;
  cert_photo_url: string;
  status: string;
  days_until_expiry: number | null;
  status_hint: 'valid' | 'warning' | 'urgent' | 'expired';
  employee_department?: string | null;
  employee_team?: string | null;
  employee_phone?: string | null;
  is_active?: number;
  created_at: string;
  updated_at: string;
}

// ── 주간 순회 ──────────────────────────────────
export async function listHealthInspections(from?: string, to?: string) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{ inspections: HealthInspection[] }>(`/api/health-manager/inspections${suffix}`);
}
export async function createHealthInspection(body: Partial<HealthInspection>) {
  return fetchAPI<{ success: boolean; id: number; inspection_date: string }>(
    `/api/health-manager/inspections`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ── 건강상담 ──────────────────────────────────
export async function listHealthConsultations(employeeId?: number) {
  const qs = employeeId ? `?employee_id=${employeeId}` : '';
  return fetchAPI<{ consultations: HealthConsultation[] }>(`/api/health-manager/consultations${qs}`);
}
export async function createHealthConsultation(body: {
  employee_id: number; consultation_type: string; consultation_date?: string;
  chief_complaint?: string; action_taken?: string; next_followup_date?: string | null;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    `/api/health-manager/consultations`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ── MSDS ──────────────────────────────────────
export async function listMsds(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchAPI<{ msds: MsdsEntry[] }>(`/api/health-manager/msds${qs}`);
}
export async function createMsds(body: Partial<MsdsEntry>) {
  return fetchAPI<{ success: boolean; id: number }>(
    `/api/health-manager/msds`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}
export async function patchMsds(id: number, body: Partial<MsdsEntry>) {
  return fetchAPI<{ success: boolean }>(
    `/api/health-manager/msds/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ── 건강진단 ──────────────────────────────────
export async function listHealthCheckups(filter?: {
  employee_id?: number; year?: number; type?: string; followup_only?: boolean;
}) {
  const qs = new URLSearchParams();
  if (filter?.employee_id) qs.set('employee_id', String(filter.employee_id));
  if (filter?.year) qs.set('year', String(filter.year));
  if (filter?.type) qs.set('type', filter.type);
  if (filter?.followup_only) qs.set('followup_only', '1');
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{
    checkups: HealthCheckup[];
    summary: { total: number; received: number; not_received: number; followup: number };
  }>(`/api/health-manager/checkups${suffix}`);
}
export async function createHealthCheckup(body: Partial<HealthCheckup> & { employee_id: number; checkup_type: string }) {
  return fetchAPI<{ success: boolean; id: number }>(
    `/api/health-manager/checkups`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}
export async function patchHealthCheckup(id: number, body: Partial<HealthCheckup>) {
  return fetchAPI<{ success: boolean }>(
    `/api/health-manager/checkups/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ── 보건증 ─────────────────────────────────────
export async function listHealthCertificates(filter?: { employee_id?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (filter?.employee_id) qs.set('employee_id', String(filter.employee_id));
  if (filter?.status) qs.set('status', filter.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{
    certificates: HealthCertificate[];
    summary: { total: number; urgent: number; expired: number; warning: number; valid: number };
  }>(`/api/health-manager/certificates${suffix}`);
}
export async function createHealthCertificate(body: {
  employee_id: number; issue_date: string; expiry_date: string;
  cert_type?: string; cert_photo_url?: string; status?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    `/api/health-manager/certificates`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}
export async function patchHealthCertificate(id: number, body: Partial<HealthCertificate>) {
  return fetchAPI<{ success: boolean }>(
    `/api/health-manager/certificates/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function listExpiringCerts() {
  return fetchAPI<{ today: string; items: HealthCertificate[] }>(`/api/health-manager/expiring-certs`);
}

// ═══════════════════════════════════════════════════════════════
// 안전보건 P4 — 반기 정기교육 + 근골격계·의견 설문
// ═══════════════════════════════════════════════════════════════

export interface TrainingCourse {
  id: number;
  title: string;
  description: string;
  video_source_type: string;
  video_url: string;
  duration_min: number;
  half_year_credit_hours: number;
  target_role: string;
  category: string;
  active: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  quiz_count?: number;
}

export interface TrainingQuizItem {
  id: number;
  question_no: number;
  question: string;
  choices: string[];
  correct_index?: number;
}

export interface TrainingStatusRow {
  employee_id: number;
  name: string;
  phone: string;
  department: string | null;
  team: string | null;
  role: string | null;
  done_count: number;
  required_count: number;
  credited_hours: number;
  status: 'complete' | 'partial' | 'not_started' | 'no_required';
}

export interface SurveyStatusRow {
  employee_id: number;
  name: string;
  phone: string;
  department: string | null;
  team: string | null;
  role: string | null;
  musculoskeletal_done?: boolean;
  musculoskeletal_at?: string | null;
  opinion_done?: boolean;
  opinion_at?: string | null;
}

// ── 교육 콘텐츠 마스터 CRUD ────────────────────────────────
export async function listTrainingCourses() {
  return fetchAPI<{ courses: TrainingCourse[] }>(`/api/admin/training-master`);
}
export async function createTrainingCourse(body: Partial<TrainingCourse> & { title: string }) {
  return fetchAPI<{ success: boolean; id: number }>(`/api/admin/training-master`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
export async function patchTrainingCourse(id: number, body: Partial<TrainingCourse>) {
  return fetchAPI<{ success: boolean }>(`/api/admin/training-master/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
export async function deleteTrainingCourse(id: number) {
  return fetchAPI<{ success: boolean }>(`/api/admin/training-master/${id}`, { method: 'DELETE' });
}

// 퀴즈 편집
export async function listTrainingQuiz(courseId: number) {
  return fetchAPI<{ items: (TrainingQuizItem & { correct_index: number })[] }>(
    `/api/admin/training-master/${courseId}/quiz`
  );
}
export async function createTrainingQuiz(courseId: number, body: { question: string; choices: string[]; correct_index: number }) {
  return fetchAPI<{ success: boolean; id: number; question_no: number }>(
    `/api/admin/training-master/${courseId}/quiz`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}
export async function patchTrainingQuiz(courseId: number, qid: number, body: Partial<{ question: string; choices: string[]; correct_index: number }>) {
  return fetchAPI<{ success: boolean }>(
    `/api/admin/training-master/${courseId}/quiz/${qid}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}
export async function deleteTrainingQuiz(courseId: number, qid: number) {
  return fetchAPI<{ success: boolean }>(
    `/api/admin/training-master/${courseId}/quiz/${qid}`,
    { method: 'DELETE' }
  );
}

// ── 안전관리자 이수·설문 현황 ──────────────────────────────
export async function getTrainingStatus(period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return fetchAPI<{
    period: string;
    period_end: string;
    summary: { period: string; period_end: string; required_count: number; target_count: number; complete: number; partial: number; not_started: number };
    rows: TrainingStatusRow[];
    by_department: { dept: string; total: number; complete: number; partial: number; not_started: number }[];
  }>(`/api/safety-manager/training-status${qs}`);
}

export async function getSurveyStatus(period?: string, kind?: 'musculoskeletal' | 'opinion') {
  const p = new URLSearchParams();
  if (period) p.set('period', period);
  if (kind) p.set('kind', kind);
  const qs = p.toString();
  return fetchAPI<{
    period: string;
    period_end: string;
    summary: any;
    rows: SurveyStatusRow[];
  }>(`/api/safety-manager/survey-status${qs ? `?${qs}` : ''}`);
}

export async function getSafetySurveyResponses(kind: 'musculoskeletal' | 'opinion', period?: string) {
  const qs = period ? `?period=${encodeURIComponent(period)}` : '';
  return fetchAPI<{
    period: string;
    kind: string;
    responses: {
      id: number;
      submitted_at: string;
      name: string;
      department: string;
      team: string;
      response_json: any;
      survey_title: string;
    }[];
  }>(`/api/safety-manager/survey-status/${kind}/responses${qs}`);
}

// ═══════════════════════════════════════════════════════════════
// 안전보건 시스템 P5 — 위험성평가 + LOTO + 산업재해 + 산업안전보건위원회
// ═══════════════════════════════════════════════════════════════

// ---- 위험성평가 ----
export interface RiskAssessment {
  id: number;
  year: number;
  kind: string;
  title: string;
  triggered_by: string;
  status: string;
  posted_at: string | null;
  ceo_reported_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  participant_count?: number;
  signed_count?: number;
}

export interface RiskAssessmentItem {
  id: number;
  assessment_id: number;
  process: string;
  task: string;
  hazard: string;
  freq_score: number;
  intensity_score: number;
  risk_grade: string;
  mitigation: string;
  assignee_id: number | null;
  assignee_name: string;
  due_date: string | null;
  closed_risk_grade: string;
  ticket_id: number | null;
  created_at: string;
}

export interface RiskAssessmentParticipant {
  id: number;
  assessment_id: number;
  employee_id: number | null;
  participant_name: string;
  role: string;
  signed_at: string | null;
  signature_notes: string;
}

export async function listRiskAssessments(params?: { year?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.year) qs.set('year', String(params.year));
  if (params?.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{ items: RiskAssessment[] }>(`/api/safety-manager/risk-assessments${suffix}`);
}

export async function getRiskAssessment(id: number) {
  return fetchAPI<{
    assessment: RiskAssessment;
    items: RiskAssessmentItem[];
    participants: RiskAssessmentParticipant[];
  }>(`/api/safety-manager/risk-assessments/${id}`);
}

export async function createRiskAssessment(body: {
  year: number;
  kind?: string;
  title: string;
  triggered_by?: string;
}) {
  return fetchAPI<{ success: boolean; id: number; year: number }>(
    '/api/safety-manager/risk-assessments',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchRiskAssessment(id: number, body: {
  status?: string; title?: string; triggered_by?: string; kind?: string;
  posted?: boolean; ceo_reported?: boolean;
}) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/risk-assessments/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function addRiskAssessmentItem(id: number, body: {
  process: string; task?: string; hazard: string;
  freq_score: number; intensity_score: number;
  mitigation?: string; assignee_name?: string; assignee_id?: number; due_date?: string;
}) {
  return fetchAPI<{ success: boolean; id: number; ticket_id: number; risk_grade: string }>(
    `/api/safety-manager/risk-assessments/${id}/items`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchRiskAssessmentItem(id: number, itemId: number, body: {
  closed_risk_grade?: string; mitigation?: string;
}) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/risk-assessments/${id}/items/${itemId}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function addRiskAssessmentParticipant(id: number, body: {
  participant_name: string; employee_id?: number; role?: string;
  signature_notes?: string; signed?: boolean;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    `/api/safety-manager/risk-assessments/${id}/participants`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchRiskAssessmentParticipant(id: number, pid: number, body: {
  signed?: boolean; signature_notes?: string;
}) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/risk-assessments/${id}/participants/${pid}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ---- LOTO ----
export interface LotoAuthorization {
  id: number;
  equipment_name: string;
  area_id: number | null;
  area_name?: string;
  area_code?: string;
  work_description: string;
  worker_ids: string;
  worker_names: string;
  expected_hours: number;
  energy_off_photo_url: string;
  lock_photo_url: string;
  verify_no_energy: number;
  release_photo_url: string;
  trial_run_ok: number;
  status: string;
  started_at: string | null;
  released_at: string | null;
  created_by: number | null;
  created_at: string;
}

export async function listLoto(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchAPI<{
    items: LotoAuthorization[];
    summary: { total: number; requested: number; in_progress: number; released: number };
  }>(`/api/safety-manager/loto${qs}`);
}

export async function getLoto(id: number) {
  return fetchAPI<{ item: LotoAuthorization }>(`/api/safety-manager/loto/${id}`);
}

export async function createLoto(body: {
  equipment_name: string; area_id?: number; work_description: string;
  worker_names?: string; worker_ids?: string; expected_hours?: number;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/safety-manager/loto',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchLoto(id: number, body: Partial<{
  equipment_name: string; area_id: number | null; work_description: string;
  worker_names: string; worker_ids: string; expected_hours: number;
  energy_off_photo_url: string; lock_photo_url: string; verify_no_energy: boolean;
  release_photo_url: string; trial_run_ok: boolean; status: string;
}>) {
  return fetchAPI<{ success: boolean; item: LotoAuthorization }>(
    `/api/safety-manager/loto/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ---- 산업재해 ----
export interface Incident {
  id: number;
  occurred_at: string;
  area_id: number | null;
  area_name: string;
  area_name_lookup?: string;
  injured_employee_id: number | null;
  injured_name: string;
  injury_body_part: string;
  injury_severity: string;
  witnesses: string;
  description: string;
  photo_url: string;
  hospital_transfer: number;
  first_aid_notes: string;
  is_critical: number;
  cause_unsafe_state: string;
  cause_unsafe_action: string;
  cause_managerial: string;
  mitigation: string;
  hospitalization_days: number;
  requires_report: number;
  report_deadline: string | null;
  report_submitted_at: string | null;
  report_receipt_url: string;
  status: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  is_report_overdue?: boolean;
  days_until_deadline?: number | null;
}

export async function listIncidents(params?: { year?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.year) qs.set('year', String(params.year));
  if (params?.status) qs.set('status', params.status);
  const suffix = qs.toString() ? `?${qs}` : '';
  return fetchAPI<{
    items: Incident[];
    summary: { total: number; critical: number; requires_report: number; report_overdue: number; closed: number };
  }>(`/api/safety-manager/incidents${suffix}`);
}

export async function getIncident(id: number) {
  return fetchAPI<{ item: Incident }>(`/api/safety-manager/incidents/${id}`);
}

export async function createIncident(body: {
  occurred_at: string;
  area_id?: number; area_name?: string;
  injured_employee_id?: number; injured_name?: string;
  injury_body_part?: string; injury_severity?: string;
  hospitalization_days?: number; description?: string; photo_url?: string;
  hospital_transfer?: boolean; first_aid_notes?: string; witnesses?: string;
}) {
  return fetchAPI<{
    success: boolean; id: number;
    is_critical: boolean; requires_report: boolean; report_deadline: string;
  }>(
    '/api/safety-manager/incidents',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchIncident(id: number, body: Partial<{
  area_id: number | null;
  area_name: string;
  injured_employee_id: number | null;
  injured_name: string;
  injury_body_part: string;
  injury_severity: string;
  hospitalization_days: number;
  witnesses: string;
  description: string;
  photo_url: string;
  hospital_transfer: boolean;
  first_aid_notes: string;
  cause_unsafe_state: string;
  cause_unsafe_action: string;
  cause_managerial: string;
  mitigation: string;
  status: string;
}>) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/incidents/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function submitIncidentReport(id: number, body: { report_receipt_url?: string }) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/incidents/${id}/report-submitted`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ---- 산업안전보건위원회 ----
export interface CommitteeMinute {
  id: number;
  year: number;
  quarter: number;
  round_no: number | null;
  held_at: string;
  location: string;
  agenda_reported: string;
  agenda_decided: string;
  decisions: string;
  worker_rep_input: string;
  participants_employer: string;
  participants_worker: string;
  status: string;
  created_by: number | null;
  created_at: string;
}

export async function listCommitteeMinutes(year?: number) {
  const qs = year ? `?year=${year}` : '';
  return fetchAPI<{ items: CommitteeMinute[] }>(`/api/safety-manager/committee-minutes${qs}`);
}

export async function getCommitteeMinute(id: number) {
  return fetchAPI<{ item: CommitteeMinute }>(`/api/safety-manager/committee-minutes/${id}`);
}

export async function createCommitteeMinute(body: {
  year: number; quarter: number; round_no?: number; held_at: string;
  location?: string; agenda_reported?: string; agenda_decided?: string;
  decisions?: string; worker_rep_input?: string;
  participants_employer?: string; participants_worker?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/safety-manager/committee-minutes',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchCommitteeMinute(id: number, body: Partial<CommitteeMinute>) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-manager/committee-minutes/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ═══════════════════════════════════════════════════════════════
// P6 — 대표이사 대시보드 + 중처법 반기 이행점검 + 시간 결산
// ═══════════════════════════════════════════════════════════════

export interface CeoDashboardKpis {
  cdpa_compliance: {
    review_id: number | null;
    total: number;
    done: number;
    in_progress: number;
    not_started: number;
    rate: number | null;
    status: string | null;
    ceo_signed_at: string | null;
  };
  open_tickets: { open: number; overdue: number; high_severity: number };
  training_compliance: {
    period: string;
    target_count: number;
    complete: number;
    required_count: number;
    rate: number | null;
  };
  hazard_trend: Array<{ month: string; count: number }>;
  manager_hours: {
    current_month: string;
    current_month_hours: number;
    current_half: string;
    current_half_hours: number;
    year: number;
    year_hours: number;
    half_target_min: number;
    half_target_max: number;
    half_gauge_pct: number;
    monthly_breakdown: Array<{ month: string; hours: number }>;
  };
}

export interface CeoDashboardResponse {
  kpis: CeoDashboardKpis;
  generated_at: string;
  year: number;
  half: number;
}

export async function getCeoDashboard(year?: number) {
  const qs = year ? `?year=${year}` : '';
  return fetchAPI<CeoDashboardResponse>(`/api/ceo/dashboard${qs}`);
}

export interface CdpaReview {
  id: number;
  year: number;
  half: number;
  status: string;
  ceo_signed_at: string | null;
  ceo_signature_name: string;
  summary: string;
  improvement_plan: string;
  item_count?: number;
  done_count?: number;
  updated_at?: string;
}

export interface CdpaReviewItem {
  id: number;
  review_id: number;
  item_no: number;
  obligation_name: string;
  status: string;
  evidence_source: string;
  evidence_url: string;
  notes: string;
  improvement_action: string;
  // P7E — 자동 근거·모듈 통합
  evidence_module_key?: string;
  auto_status?: string;
  auto_status_summary?: Record<string, any>;
  module_link?: string;
}

export async function listCdpaReviews(year?: number) {
  const qs = year ? `?year=${year}` : '';
  return fetchAPI<{ items: CdpaReview[] }>(`/api/ceo/cdpa-reviews${qs}`);
}

export async function getCdpaReview(id: number) {
  return fetchAPI<{ review: CdpaReview; items: CdpaReviewItem[] }>(`/api/ceo/cdpa-reviews/${id}`);
}

export async function createCdpaReview(body: { year: number; half: 1 | 2 }) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/ceo/cdpa-reviews',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchCdpaReview(id: number, body: Partial<Pick<CdpaReview, 'summary' | 'improvement_plan' | 'status'>>) {
  return fetchAPI<{ success: boolean }>(
    `/api/ceo/cdpa-reviews/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchCdpaReviewItem(reviewId: number, itemId: number, body: Partial<CdpaReviewItem>) {
  return fetchAPI<{ success: boolean }>(
    `/api/ceo/cdpa-reviews/${reviewId}/items/${itemId}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function signCdpaReview(id: number, ceo_signature_name: string) {
  return fetchAPI<{ success: boolean; signed_at: string }>(
    `/api/ceo/cdpa-reviews/${id}/sign`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ceo_signature_name }) }
  );
}

export interface ManagerHoursHalfSummary {
  hours: number;
  target_min: number;
  target_max: number;
  gauge_pct: number;
}

export interface ManagerHoursResponse {
  year: number;
  manager_name: string | null;
  total_hours: number;
  by_activity: Record<string, { minutes: number; hours: number; events: number; label: string }>;
  activity_labels: Record<string, string>;
  monthly: Array<{ month: string; total_hours: number; by_activity: Record<string, number> }>;
  per_manager: Array<{ name: string; hours: number; minutes: number; event_count: number }>;
  half_summary: { H1: ManagerHoursHalfSummary; H2: ManagerHoursHalfSummary };
}

export async function getManagerHours(year?: number, managerName?: string) {
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (managerName) params.set('manager_name', managerName);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return fetchAPI<ManagerHoursResponse>(`/api/safety-manager/manager-hours${qs}`);
}

export async function listManagerHoursManagers() {
  return fetchAPI<{ managers: string[] }>(`/api/safety-manager/manager-hours/managers`);
}

export async function logManagerHoursManual(body: {
  activity_type: string;
  minutes?: number;
  manager_name?: string;
  occurred_at?: string;
  notes?: string;
}) {
  return fetchAPI<{ success: boolean; minutes: number }>(
    '/api/safety-manager/manager-hours/log',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ===== P7B — 안전보건 조직도·선임계 =====
export interface SafetyOrgPosition {
  id: number;
  position_key: string;
  position_name: string;
  employee_id: number | null;
  employee_name: string;
  appointed_at: string | null;
  resigned_at: string | null;
  appointment_doc_url: string;
  certification_name: string;
  certification_no: string;
  is_concurrent: number;
  statutory_min_hours: number;
  department: string;
  parent_position_id: number | null;
  status: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
  emp_department?: string | null;
  emp_role?: string | null;
}

export interface SafetyOrgHistoryEntry {
  id: number;
  position_id: number;
  action: 'appoint' | 'resign' | 'change' | 'certification_update';
  occurred_at: string;
  actor_id: number | null;
  details_json: any;
  notes: string;
}

export interface SafetyOrgHoursSummary {
  position_id: number;
  position_key: string;
  position_name: string;
  employee_id: number | null;
  employee_name: string;
  statutory_min_hours: number;
  is_concurrent: number;
  half_minutes: number;
  half_hours: number;
  gauge_pct: number | null;
  shortfall_hours: number;
}

export interface SafetyOrgComplianceResponse {
  positions: SafetyOrgPosition[];
  missing: Array<{ position_key: string; position_name: string }>;
  hours_summary: SafetyOrgHoursSummary[];
  period: { year: number; half: number; from: string; to: string; label: string };
  required_keys: string[];
  compliant: boolean;
}

export async function listSafetyOrgPositions() {
  return fetchAPI<{ positions: SafetyOrgPosition[] }>('/api/safety-org/positions');
}

export async function createSafetyOrgPosition(body: {
  position_key: string;
  position_name?: string;
  department?: string;
  is_concurrent?: boolean | number;
  statutory_min_hours?: number;
  parent_position_id?: number | null;
  notes?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/safety-org/positions',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchSafetyOrgPosition(id: number, body: Partial<{
  position_name: string;
  employee_id: number | null;
  employee_name: string;
  appointed_at: string | null;
  resigned_at: string | null;
  appointment_doc_url: string;
  certification_name: string;
  certification_no: string;
  is_concurrent: boolean | number;
  statutory_min_hours: number;
  department: string;
  parent_position_id: number | null;
  status: string;
  notes: string;
}>) {
  return fetchAPI<{ success: boolean; position: SafetyOrgPosition }>(
    `/api/safety-org/positions/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function getSafetyOrgHistory(id: number) {
  return fetchAPI<{ history: SafetyOrgHistoryEntry[] }>(
    `/api/safety-org/positions/${id}/history`
  );
}

export async function getSafetyOrgCompliance() {
  return fetchAPI<SafetyOrgComplianceResponse>('/api/safety-org/compliance-check');
}

// ===== P7C — 안전보건 예산 편성·집행 =====
export interface SafetyBudgetPlan {
  id: number;
  year: number;
  category: string;
  category_label: string;
  planned_amount: number;
  notes: string;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface SafetyBudgetExecution {
  id: number;
  budget_plan_id: number;
  executed_at: string; // YYYY-MM-DD
  amount: number;
  description: string;
  receipt_url: string;
  vendor: string;
  executor_id?: number | null;
  executor_name: string;
  approved_by?: number | null;
  approved_by_name: string;
  linked_to_ticket_id: number | null;
  notes: string;
  created_at?: string;
  // Joined from safety_budget_plans (GET /executions)
  year?: number;
  category?: string;
  category_label?: string;
}

export interface SafetyBudgetSummaryCategory {
  category: string;
  category_label: string;
  planned: number;
  executed: number;
  execution_rate: number | null;
  remaining: number;
  count: number;
}

export interface SafetyBudgetSummaryMonthly {
  month: number;
  executed: number;
  by_category: Record<string, number>;
}

export interface SafetyBudgetSummaryQuarterly {
  quarter: number;
  months: number[];
  executed: number;
}

export interface SafetyBudgetSummaryResponse {
  year: number;
  categories: SafetyBudgetSummaryCategory[];
  monthly: SafetyBudgetSummaryMonthly[];
  quarterly: SafetyBudgetSummaryQuarterly[];
  totals: {
    planned: number;
    executed: number;
    execution_rate: number | null;
    remaining: number;
  };
}

export async function listSafetyBudgetPlans(year: number) {
  return fetchAPI<{ year: number; plans: SafetyBudgetPlan[] }>(
    `/api/safety-budget/plans?year=${year}`
  );
}

export async function createSafetyBudgetPlan(body: {
  year: number;
  category: string;
  category_label?: string;
  planned_amount?: number;
  notes?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/safety-budget/plans',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchSafetyBudgetPlan(id: number, body: Partial<{
  category_label: string;
  planned_amount: number;
  notes: string;
}>) {
  return fetchAPI<{ success: boolean; plan: SafetyBudgetPlan }>(
    `/api/safety-budget/plans/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function listSafetyBudgetExecutions(params: { year: number; category?: string }) {
  const q = new URLSearchParams();
  q.set('year', String(params.year));
  if (params.category) q.set('category', params.category);
  return fetchAPI<{ year: number; category: string | null; executions: SafetyBudgetExecution[] }>(
    `/api/safety-budget/executions?${q.toString()}`
  );
}

export async function createSafetyBudgetExecution(body: {
  budget_plan_id: number;
  executed_at: string;
  amount: number;
  description: string;
  receipt_url?: string;
  vendor?: string;
  executor_name?: string;
  approved_by_name?: string;
  linked_to_ticket_id?: number | null;
  notes?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/safety-budget/executions',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchSafetyBudgetExecution(id: number, body: Partial<{
  executed_at: string;
  amount: number;
  description: string;
  receipt_url: string;
  vendor: string;
  executor_name: string;
  approved_by_name: string;
  linked_to_ticket_id: number | null;
  notes: string;
}>) {
  return fetchAPI<{ success: boolean; execution: SafetyBudgetExecution }>(
    `/api/safety-budget/executions/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function deleteSafetyBudgetExecution(id: number) {
  return fetchAPI<{ success: boolean }>(
    `/api/safety-budget/executions/${id}`,
    { method: 'DELETE' }
  );
}

export async function getSafetyBudgetSummary(year: number) {
  return fetchAPI<SafetyBudgetSummaryResponse>(
    `/api/safety-budget/summary?year=${year}`
  );
}

// ===== P7D — 비상 매뉴얼·훈련·도급업체 관리 =====
export type EmergencyScenarioKind =
  | 'fire' | 'gas_leak' | 'blackout' | 'critical_incident' | 'chemical' | 'other';

export interface EmergencyManual {
  id: number;
  scenario_kind: EmergencyScenarioKind;
  title: string;
  version: string;
  content_html: string;
  attachment_url: string;
  effective_from: string | null;
  status: string; // draft | active | superseded
  superseded_by: number | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export async function listEmergencyManuals(params: { kind?: string; status?: string } = {}) {
  const q = new URLSearchParams();
  if (params.kind) q.set('kind', params.kind);
  if (params.status) q.set('status', params.status);
  const s = q.toString();
  return fetchAPI<{ manuals: EmergencyManual[] }>(
    `/api/emergency-manual/manuals${s ? `?${s}` : ''}`
  );
}

export async function getEmergencyManual(id: number) {
  return fetchAPI<{ manual: EmergencyManual }>(`/api/emergency-manual/manuals/${id}`);
}

export async function createEmergencyManual(body: {
  scenario_kind: string;
  title: string;
  version?: string;
  content_html?: string;
  attachment_url?: string;
  effective_from?: string | null;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/emergency-manual/manuals',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchEmergencyManual(id: number, body: Partial<{
  scenario_kind: string;
  title: string;
  version: string;
  content_html: string;
  attachment_url: string;
  effective_from: string | null;
  status: string;
  superseded_by: number | null;
}>) {
  return fetchAPI<{ success: boolean; manual: EmergencyManual }>(
    `/api/emergency-manual/manuals/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function publishEmergencyManual(id: number, body: { effective_from?: string } = {}) {
  return fetchAPI<{ success: boolean; manual: EmergencyManual }>(
    `/api/emergency-manual/manuals/${id}/publish`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export interface EmergencyDrill {
  id: number;
  manual_id: number | null;
  scenario_kind: EmergencyScenarioKind;
  drill_date: string;
  location: string;
  participant_count: number;
  participant_names: string;
  findings: string;
  improvements: string;
  photo_urls: string;
  led_by?: number | null;
  led_by_name: string;
  ticket_id: number | null;
  created_at?: string;
  manual_title?: string;
  manual_version?: string;
}

export async function listEmergencyDrills(params: { kind?: string; from?: string; to?: string } = {}) {
  const q = new URLSearchParams();
  if (params.kind) q.set('kind', params.kind);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const s = q.toString();
  return fetchAPI<{ drills: EmergencyDrill[] }>(
    `/api/emergency-drill/drills${s ? `?${s}` : ''}`
  );
}

export async function createEmergencyDrill(body: {
  scenario_kind: string;
  drill_date: string;
  manual_id?: number | null;
  location?: string;
  participant_count?: number;
  participant_names?: string;
  findings?: string;
  improvements?: string;
  photo_urls?: string;
  led_by_name?: string;
}) {
  return fetchAPI<{ success: boolean; id: number; ticket_id: number | null }>(
    '/api/emergency-drill/drills',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchEmergencyDrill(id: number, body: Partial<{
  manual_id: number | null;
  location: string;
  participant_count: number;
  participant_names: string;
  findings: string;
  improvements: string;
  photo_urls: string;
  led_by_name: string;
}>) {
  return fetchAPI<{ success: boolean }>(
    `/api/emergency-drill/drills/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export interface EmergencyDrillCoverage {
  period: { year: number; half: number; from: string; to: string; label: string };
  required_kinds: string[];
  items: Array<{
    scenario_kind: string;
    drill_count: number;
    last_drill_date: string | null;
    completed: boolean;
  }>;
  completed_count: number;
  required_count: number;
  compliant: boolean;
}

export async function getEmergencyDrillCoverage(half?: string) {
  const q = half ? `?half=${encodeURIComponent(half)}` : '';
  return fetchAPI<EmergencyDrillCoverage>(`/api/emergency-drill/coverage${q}`);
}

// ── 도급업체 ─────────────────────────────────────────────────────
export interface Contractor {
  id: number;
  business_name: string;
  business_reg_no: string;
  representative_name: string;
  contact_phone: string;
  contact_email: string;
  work_scope: string;
  contract_start: string | null;
  contract_end: string | null;
  safety_docs_url: string;
  insurance_status: string;
  status: string; // active | suspended | terminated
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export async function listContractors(params: { status?: string; search?: string } = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.search) q.set('search', params.search);
  const s = q.toString();
  return fetchAPI<{ contractors: Contractor[] }>(
    `/api/contractor/registry${s ? `?${s}` : ''}`
  );
}

export async function getContractor(id: number) {
  return fetchAPI<{ contractor: Contractor }>(`/api/contractor/registry/${id}`);
}

export async function createContractor(body: {
  business_name: string;
  work_scope: string;
  business_reg_no?: string;
  representative_name?: string;
  contact_phone?: string;
  contact_email?: string;
  contract_start?: string | null;
  contract_end?: string | null;
  safety_docs_url?: string;
  insurance_status?: string;
  status?: string;
  notes?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/contractor/registry',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchContractor(id: number, body: Partial<{
  business_name: string;
  business_reg_no: string;
  representative_name: string;
  contact_phone: string;
  contact_email: string;
  work_scope: string;
  contract_start: string | null;
  contract_end: string | null;
  safety_docs_url: string;
  insurance_status: string;
  status: string;
  notes: string;
}>) {
  return fetchAPI<{ success: boolean; contractor: Contractor }>(
    `/api/contractor/registry/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export interface ContractorWorkPermit {
  id: number;
  contractor_id: number;
  permit_no: string;
  work_description: string;
  hazard_types: string;
  permit_date: string;
  expiry_date: string;
  area_id: number | null;
  ppe_required: string;
  safety_measures: string;
  approver_id?: number | null;
  approver_name: string;
  status: string; // pending | approved | in_progress | closed | overdue
  closed_at?: string | null;
  created_at?: string;
  is_overdue?: boolean;
  contractor_name?: string;
  area_name?: string | null;
}

export async function listContractorPermits(params: { status?: string; contractor_id?: number } = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.contractor_id) q.set('contractor_id', String(params.contractor_id));
  const s = q.toString();
  return fetchAPI<{ permits: ContractorWorkPermit[] }>(
    `/api/contractor/permits${s ? `?${s}` : ''}`
  );
}

export async function createContractorPermit(body: {
  contractor_id: number;
  work_description: string;
  permit_date: string;
  expiry_date: string;
  permit_no?: string;
  hazard_types?: string;
  area_id?: number | null;
  ppe_required?: string;
  safety_measures?: string;
  approver_name?: string;
  status?: string;
}) {
  return fetchAPI<{ success: boolean; id: number }>(
    '/api/contractor/permits',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export async function patchContractorPermit(id: number, body: Partial<{
  permit_no: string;
  work_description: string;
  hazard_types: string;
  permit_date: string;
  expiry_date: string;
  area_id: number | null;
  ppe_required: string;
  safety_measures: string;
  approver_name: string;
  status: string;
}>) {
  return fetchAPI<{ success: boolean; permit: ContractorWorkPermit }>(
    `/api/contractor/permits/${id}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export interface ContractorJointInspection {
  id: number;
  contractor_id: number | null;
  permit_id: number | null;
  inspected_at: string;
  inspector_id?: number | null;
  inspector_name: string;
  findings: string;
  actions: string;
  photos: string;
  ticket_id: number | null;
  created_at?: string;
  contractor_name?: string | null;
  permit_description?: string | null;
}

export async function listContractorInspections(params: { contractor_id?: number; permit_id?: number } = {}) {
  const q = new URLSearchParams();
  if (params.contractor_id) q.set('contractor_id', String(params.contractor_id));
  if (params.permit_id) q.set('permit_id', String(params.permit_id));
  const s = q.toString();
  return fetchAPI<{ inspections: ContractorJointInspection[] }>(
    `/api/contractor/inspections${s ? `?${s}` : ''}`
  );
}

export async function createContractorInspection(body: {
  inspected_at: string;
  contractor_id?: number | null;
  permit_id?: number | null;
  findings?: string;
  actions?: string;
  photos?: string;
  inspector_name?: string;
}) {
  return fetchAPI<{ success: boolean; id: number; ticket_id: number | null }>(
    '/api/contractor/inspections',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

export interface ContractorActiveSummary {
  as_of: string;
  active_contractor_count: number;
  open_permit_count: number;
  overdue_permit_count: number;
  inspection_count_30d: number;
}

export async function getContractorActiveSummary() {
  return fetchAPI<ContractorActiveSummary>('/api/contractor/active-summary');
}

// ─── P7E — 중처법 반기점검 9개 항목 자동 근거·모듈 통합 ─────────
export interface CdpaAutoRecomputeResponse {
  success: boolean;
  updated: number;
  items: Array<{
    id: number;
    item_no: number;
    evidence_module_key: string;
    module_link: string;
    auto_status: string;
    auto_status_summary: Record<string, any>;
  }>;
}

export async function autoRecomputeCdpaReview(id: number) {
  return fetchAPI<CdpaAutoRecomputeResponse>(`/api/ceo/cdpa-reviews/${id}/auto-recompute`);
}

export async function overrideCdpaItem(
  reviewId: number,
  itemId: number,
  body: { status?: string; notes?: string; evidence_source?: string; evidence_url?: string }
) {
  return fetchAPI<{ success: boolean }>(
    `/api/ceo/cdpa-reviews/${reviewId}/items/${itemId}/link`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}
