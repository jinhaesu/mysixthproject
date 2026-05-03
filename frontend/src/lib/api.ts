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
export async function sendSurvey(data: { phone: string; date: string; workplace_id: number | null; message_type: string; department?: string; planned_clock_in?: string; planned_clock_out?: string; scheduled_at?: string; schedule_range?: { start_date: string; end_date: string; daily_time: string } }) {
  return fetchAPI<any>('/api/survey/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function sendSurveyBatch(data: { phones: string[]; date: string; workplace_id: number | null; message_type: string; department?: string; planned_clock_in?: string; planned_clock_out?: string; scheduled_at?: string; schedule_range?: { start_date: string; end_date: string; daily_time: string } }) {
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
export async function sendRegularLink(id: number) {
  return fetchAPI<any>(`/api/regular/employees/${id}/send-link`, { method: 'POST' });
}
export async function sendRegularLinkBatch(ids: number[]) {
  return fetchAPI<any>('/api/regular/employees/send-link-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
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
