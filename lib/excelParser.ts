import * as XLSX from 'xlsx';

export interface AttendanceRecord {
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
}

const COLUMN_MAP: Record<string, keyof AttendanceRecord> = {
  '날짜': 'date',
  '이름': 'name',
  '출근시간': 'clock_in',
  '퇴근시간': 'clock_out',
  '구분': 'category',
  '부서': 'department',
  '근무지': 'workplace',
  '총 근로시간': 'total_hours',
  '총근로시간': 'total_hours',
  '정규시간': 'regular_hours',
  '연장 근로시간': 'overtime_hours',
  '연장근로시간': 'overtime_hours',
  '휴게시간': 'break_time',
  '연차 사용여부': 'annual_leave',
  '연차사용여부': 'annual_leave',
  '연차': 'annual_leave',
};

function normalizeColumnName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

function parseExcelDate(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const dateStr = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) return dateStr.replace(/\//g, '-');
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) return dateStr.replace(/\./g, '-');
    return dateStr;
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  return String(value);
}

function parseTime(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    const timePart = value < 1 ? value : value - Math.floor(value);
    const totalMinutes = Math.round(timePart * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return String(value);
}

function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

export function parseExcelBuffer(buffer: Buffer): AttendanceRecord[] {
  const workbook = XLSX.read(buffer);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  if (rawData.length === 0) {
    throw new Error('엑셀 파일에 데이터가 없습니다.');
  }

  const firstRow = rawData[0];
  const columnMapping: Record<string, keyof AttendanceRecord> = {};

  for (const key of Object.keys(firstRow)) {
    const normalized = normalizeColumnName(key);
    const mapped = COLUMN_MAP[normalized];
    if (mapped) {
      columnMapping[key] = mapped;
    }
  }

  const mappedValues = Object.values(columnMapping);
  if (!mappedValues.includes('date')) {
    throw new Error("필수 컬럼 '날짜'을(를) 찾을 수 없습니다.");
  }
  if (!mappedValues.includes('name')) {
    throw new Error("필수 컬럼 '이름'을(를) 찾을 수 없습니다.");
  }

  const records: AttendanceRecord[] = rawData.map((row) => {
    const record: any = {};
    for (const [excelCol, fieldName] of Object.entries(columnMapping)) {
      const value = row[excelCol];
      switch (fieldName) {
        case 'date':
          record[fieldName] = parseExcelDate(value);
          break;
        case 'clock_in':
        case 'clock_out':
          record[fieldName] = parseTime(value);
          break;
        case 'total_hours':
        case 'regular_hours':
        case 'overtime_hours':
        case 'break_time':
          record[fieldName] = parseNumber(value);
          break;
        default:
          record[fieldName] = value ? String(value).trim() : '';
      }
    }
    return {
      date: record.date || '',
      name: record.name || '',
      clock_in: record.clock_in || '',
      clock_out: record.clock_out || '',
      category: record.category || '',
      department: record.department || '',
      workplace: record.workplace || '',
      total_hours: record.total_hours || 0,
      regular_hours: record.regular_hours || 0,
      overtime_hours: record.overtime_hours || 0,
      break_time: record.break_time || 0,
      annual_leave: record.annual_leave || '',
    } as AttendanceRecord;
  });

  return records.filter((r) => r.date && r.name);
}
