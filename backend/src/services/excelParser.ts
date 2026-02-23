import * as XLSX from 'xlsx';

export interface AttendanceRecord {
  date: string;
  name: string;
  clock_in: string;
  clock_out: string;
  category: string;
  department: string;
  workplace: string;
  shift: string;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  break_time: number;
  annual_leave: string;
}

// Column name mappings (Korean -> English)
// Keys are SPACELESS (all whitespace removed) to allow flexible matching
const COLUMN_MAP: Record<string, keyof AttendanceRecord> = {
  // 날짜/이름
  '날짜': 'date',
  '근무일': 'date',
  '근무일자': 'date',
  '일자': 'date',
  '이름': 'name',
  '성명': 'name',
  '근무자': 'name',
  // 출퇴근
  '출근시간': 'clock_in',
  '출근': 'clock_in',
  '퇴근시간': 'clock_out',
  '퇴근': 'clock_out',
  // 분류
  '구분': 'category',
  '고용형태': 'category',
  '고용구분': 'category',
  '근무형태': 'category',
  '부서': 'department',
  '부서명': 'department',
  '근무지': 'workplace',
  '근무층': 'workplace',
  '사업장': 'workplace',
  '근무시간대': 'shift',
  '시간대': 'shift',
  '주야간': 'shift',
  '주야구분': 'shift',
  // 시간
  '총근로시간': 'total_hours',
  '총근무시간': 'total_hours',
  '근로시간합계': 'total_hours',
  '정규시간': 'regular_hours',
  '정규근로시간': 'regular_hours',
  '정규근무시간': 'regular_hours',
  '기본시간': 'regular_hours',
  '기본근로시간': 'regular_hours',
  '연장근로시간': 'overtime_hours',
  '연장시간': 'overtime_hours',
  '연장근무시간': 'overtime_hours',
  '초과근로시간': 'overtime_hours',
  '초과근무시간': 'overtime_hours',
  '야간시간': 'night_hours',
  '야간근로시간': 'night_hours',
  '야간근무시간': 'night_hours',
  '휴게시간': 'break_time',
  // 연차
  '연차사용여부': 'annual_leave',
  '연차': 'annual_leave',
  '연차사용': 'annual_leave',
};

function normalizeColumnName(name: string): string {
  // Remove ALL whitespace (spaces, tabs, NBSP, full-width spaces) for robust matching
  return name.replace(/[\s\u00A0\u3000]+/g, '').trim();
}

// Normalize category values to standard forms: 정규직, 파견, 알바
function normalizeCategory(value: string): string {
  const trimmed = value.replace(/[\s\u00A0\u3000]+/g, ' ').trim();
  if (!trimmed) return '';
  if (trimmed.includes('파견')) return '파견';
  if (trimmed.includes('정규')) return '정규직';
  if (trimmed.includes('알바') || trimmed.includes('사업소득') || trimmed.includes('일용') || trimmed.includes('단기')) return '알바';
  return trimmed;
}

function parseExcelDate(value: any): string {
  if (!value) return '';

  // If it's already a string in date format
  if (typeof value === 'string') {
    // Try to parse various date formats
    const dateStr = value.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) return dateStr.replace(/\//g, '-');
    // YYYY.MM.DD
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(dateStr)) return dateStr.replace(/\./g, '-');
    return dateStr;
  }

  // If it's an Excel serial date number
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

  if (typeof value === 'string') {
    return value.trim();
  }

  // Excel time as decimal (e.g., 0.333... = 8:00)
  if (typeof value === 'number') {
    if (value < 1) {
      // Pure time value
      const totalMinutes = Math.round(value * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    // Date+time value - extract time
    const timePart = value - Math.floor(value);
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

// --- Name normalization & deduplication ---

// Extract a canonical form of a name for matching
function normalizeName(name: string): string {
  let n = name.trim();
  // Remove parenthetical content: "김철수(John)" → "김철수"
  n = n.replace(/[（(][^）)]*[）)]/g, '').trim();
  // Remove content after slash/colon: "김철수/John" → "김철수"
  n = n.replace(/[/／:：].*$/, '').trim();
  // If contains Korean characters (2+), prefer Korean only
  const korean = n.match(/[가-힣]+/g);
  if (korean && korean.join('').length >= 2) {
    n = korean.join('');
  }
  // Remove all whitespace
  return n.replace(/[\s\u00A0\u3000]+/g, '');
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) dp[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

// After parsing, deduplicate names: typos, English/Korean variants → canonical name
function deduplicateNames(records: AttendanceRecord[]): void {
  // Step 1: Group by normalized name
  const normGroups = new Map<string, Map<string, number>>();
  for (const r of records) {
    const norm = normalizeName(r.name);
    if (!normGroups.has(norm)) normGroups.set(norm, new Map());
    const m = normGroups.get(norm)!;
    m.set(r.name, (m.get(r.name) || 0) + 1);
  }

  // Step 2: Pick canonical name per group (most frequent original)
  const normToCanonical = new Map<string, string>();
  for (const [norm, originals] of normGroups) {
    let best = '', bestCount = 0;
    for (const [name, count] of originals) {
      if (count > bestCount) { best = name; bestCount = count; }
    }
    normToCanonical.set(norm, best);
  }

  // Step 3: Merge groups with edit distance <= 1 (typo detection)
  const norms = [...normToCanonical.keys()];
  const parent = new Map<string, string>();
  for (const n of norms) parent.set(n, n);
  const find = (x: string): string => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; }
    return x;
  };

  for (let i = 0; i < norms.length; i++) {
    for (let j = i + 1; j < norms.length; j++) {
      // Only merge if both are Korean names with 2+ chars
      if (norms[i].length >= 2 && norms[j].length >= 2 &&
          /^[가-힣]+$/.test(norms[i]) && /^[가-힣]+$/.test(norms[j]) &&
          editDistance(norms[i], norms[j]) <= 1) {
        const ri = find(norms[i]), rj = find(norms[j]);
        if (ri !== rj) {
          const countI = Array.from(normGroups.get(ri)?.values() || []).reduce((s, v) => s + v, 0);
          const countJ = Array.from(normGroups.get(rj)?.values() || []).reduce((s, v) => s + v, 0);
          if (countI >= countJ) parent.set(rj, ri);
          else parent.set(ri, rj);
        }
      }
    }
  }

  // Step 4: Apply canonical names to all records
  for (const r of records) {
    const norm = normalizeName(r.name);
    const root = find(norm);
    r.name = normToCanonical.get(root) || r.name;
  }
}

export function parseExcelFile(filePath: string): AttendanceRecord[] {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get raw data with headers
  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  if (rawData.length === 0) {
    throw new Error('엑셀 파일에 데이터가 없습니다.');
  }

  // Map column names
  const firstRow = rawData[0];
  const columnMapping: Record<string, keyof AttendanceRecord> = {};

  for (const key of Object.keys(firstRow)) {
    const normalized = normalizeColumnName(key);
    const mapped = COLUMN_MAP[normalized];
    if (mapped) {
      columnMapping[key] = mapped;
    }
  }

  // Check required columns
  const mappedValues = Object.values(columnMapping);
  const requiredColumns: (keyof AttendanceRecord)[] = ['date', 'name'];
  for (const req of requiredColumns) {
    if (!mappedValues.includes(req)) {
      throw new Error(`필수 컬럼 '${req === 'date' ? '날짜' : '이름'}'을(를) 찾을 수 없습니다.`);
    }
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
        case 'night_hours':
        case 'break_time':
          record[fieldName] = parseNumber(value);
          break;
        default:
          record[fieldName] = value ? String(value).trim() : '';
      }
    }

    // Set defaults for missing fields
    // Derive shift from clock_in if not explicitly set
    let shift = record.shift || '';
    if (!shift && record.clock_in) {
      const hourMatch = String(record.clock_in).match(/^(\d{1,2})/);
      if (hourMatch) {
        shift = parseInt(hourMatch[1]) >= 14 ? '야간' : '주간';
      }
    }

    return {
      date: record.date || '',
      name: record.name || '',
      clock_in: record.clock_in || '',
      clock_out: record.clock_out || '',
      category: normalizeCategory(record.category || ''),
      department: record.department || '',
      workplace: record.workplace || '',
      shift,
      total_hours: record.total_hours || 0,
      regular_hours: record.regular_hours || 0,
      overtime_hours: record.overtime_hours || 0,
      night_hours: record.night_hours || 0,
      break_time: record.break_time || 0,
      annual_leave: record.annual_leave || '',
    } as AttendanceRecord;
  });

  // Filter out rows with no date or name
  const filtered = records.filter((r) => r.date && r.name);

  // Normalize names to merge duplicates (typos, English/Korean variants)
  deduplicateNames(filtered);

  return filtered;
}
