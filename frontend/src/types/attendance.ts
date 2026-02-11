export interface AttendanceRecord {
  id: number;
  upload_id: string;
  date: string;
  name: string;
  clock_in: string;
  clock_out: string;
  category: string;
  department: string;
  workplace: string;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  break_time: number;
  annual_leave: string;
  created_at: string;
}

export interface Upload {
  id: string;
  filename: string;
  original_filename: string;
  record_count: number;
  ai_analysis: string;
  uploaded_at: string;
}

export interface DuplicateEntry {
  date: string;
  name: string;
  count: number;
  details: string;
}

export interface WarningEntry {
  type: 'overtime' | 'missing_data' | 'inconsistency' | 'pattern' | 'other';
  severity: 'low' | 'medium' | 'high';
  message: string;
  relatedRecords?: { date: string; name: string }[];
}

export interface AnalysisResult {
  duplicates: DuplicateEntry[];
  warnings: WarningEntry[];
  summary: string;
}

export interface UploadResponse {
  uploadId: string;
  filename: string;
  recordCount: number;
  analysis: AnalysisResult;
}

export interface StatsData {
  byWorker: { name: string; days: number; total_hours: number; regular_hours: number; overtime_hours: number; avg_hours: number }[];
  byCategory: { category: string; count: number; total_hours: number; regular_hours: number; overtime_hours: number }[];
  byDepartment: { department: string; count: number; total_hours: number; regular_hours: number; overtime_hours: number }[];
  byWorkplace: { workplace: string; count: number; total_hours: number; regular_hours: number; overtime_hours: number }[];
  dailyTrend: { date: string; count: number; total_hours: number; overtime_hours: number }[];
  monthlyTrend: { month: string; count: number; total_hours: number; overtime_hours: number }[];
}

export interface FilterOptions {
  names: string[];
  categories: string[];
  departments: string[];
  workplaces: string[];
  dateRange: { minDate: string; maxDate: string };
}

export interface PivotData {
  columns: string[];
  data: Record<string, any>[];
  rowField: string;
  colField: string;
  valueField: string;
  aggFunc: string;
}
