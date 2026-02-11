import Anthropic from '@anthropic-ai/sdk';
import { AttendanceRecord } from './excelParser';

const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

export interface AnalysisResult {
  duplicates: DuplicateEntry[];
  warnings: WarningEntry[];
  summary: string;
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

function findDuplicates(records: AttendanceRecord[]): DuplicateEntry[] {
  const dateNameMap = new Map<string, AttendanceRecord[]>();

  for (const record of records) {
    const key = `${record.date}|${record.name}`;
    if (!dateNameMap.has(key)) {
      dateNameMap.set(key, []);
    }
    dateNameMap.get(key)!.push(record);
  }

  const duplicates: DuplicateEntry[] = [];
  for (const [key, recs] of dateNameMap) {
    if (recs.length > 1) {
      const [date, name] = key.split('|');
      duplicates.push({
        date,
        name,
        count: recs.length,
        details: `${name}님이 ${date}에 ${recs.length}건 중복 등록되었습니다.`,
      });
    }
  }

  return duplicates;
}

function findBasicWarnings(records: AttendanceRecord[]): WarningEntry[] {
  const warnings: WarningEntry[] = [];

  for (const record of records) {
    // Check for excessive overtime
    if (record.overtime_hours > 4) {
      warnings.push({
        type: 'overtime',
        severity: 'high',
        message: `${record.name}님이 ${record.date}에 연장근로 ${record.overtime_hours}시간으로 과도한 초과근무가 감지되었습니다.`,
        relatedRecords: [{ date: record.date, name: record.name }],
      });
    }

    // Check for missing clock-in or clock-out
    if (!record.clock_in || !record.clock_out) {
      warnings.push({
        type: 'missing_data',
        severity: 'medium',
        message: `${record.name}님의 ${record.date} 기록에 ${!record.clock_in ? '출근시간' : '퇴근시간'}이 누락되었습니다.`,
        relatedRecords: [{ date: record.date, name: record.name }],
      });
    }

    // Check for total hours inconsistency
    if (record.clock_in && record.clock_out && record.total_hours > 0) {
      const [inH, inM] = record.clock_in.split(':').map(Number);
      const [outH, outM] = record.clock_out.split(':').map(Number);
      if (!isNaN(inH) && !isNaN(outH)) {
        const workedHours = (outH + outM / 60) - (inH + inM / 60);
        const expected = workedHours - record.break_time;
        if (Math.abs(expected - record.total_hours) > 0.5) {
          warnings.push({
            type: 'inconsistency',
            severity: 'medium',
            message: `${record.name}님의 ${record.date} 기록에서 출퇴근 시간 기준 예상 근로시간(${expected.toFixed(1)}h)과 기록된 총 근로시간(${record.total_hours}h)이 불일치합니다.`,
            relatedRecords: [{ date: record.date, name: record.name }],
          });
        }
      }
    }

    // Check for very long shifts
    if (record.total_hours > 12) {
      warnings.push({
        type: 'pattern',
        severity: 'high',
        message: `${record.name}님이 ${record.date}에 총 ${record.total_hours}시간 근무로 장시간 근로가 감지되었습니다.`,
        relatedRecords: [{ date: record.date, name: record.name }],
      });
    }
  }

  return warnings;
}

export async function analyzeAttendance(records: AttendanceRecord[]): Promise<AnalysisResult> {
  const duplicates = findDuplicates(records);
  const basicWarnings = findBasicWarnings(records);

  const client = getClient();

  // If no API key, return rule-based analysis only
  if (!client) {
    const summaryParts: string[] = [];
    summaryParts.push(`총 ${records.length}건의 근태 기록을 분석했습니다.`);
    if (duplicates.length > 0) {
      summaryParts.push(`${duplicates.length}건의 중복 기록이 발견되었습니다.`);
    }
    if (basicWarnings.length > 0) {
      summaryParts.push(`${basicWarnings.length}건의 주의사항이 발견되었습니다.`);
    }
    if (duplicates.length === 0 && basicWarnings.length === 0) {
      summaryParts.push('특별한 이상사항은 발견되지 않았습니다.');
    }

    return {
      duplicates,
      warnings: basicWarnings,
      summary: summaryParts.join(' '),
    };
  }

  // Use AI for deeper analysis
  try {
    const dataSnippet = records.slice(0, 100).map(r =>
      `${r.date} | ${r.name} | ${r.clock_in}-${r.clock_out} | ${r.category} | ${r.department} | ${r.workplace} | 총${r.total_hours}h | 정규${r.regular_hours}h | 연장${r.overtime_hours}h | 휴게${r.break_time}h | 연차:${r.annual_leave}`
    ).join('\n');

    const duplicateInfo = duplicates.length > 0
      ? `\n\n발견된 중복:\n${duplicates.map(d => d.details).join('\n')}`
      : '';

    const warningInfo = basicWarnings.length > 0
      ? `\n\n기본 점검 결과:\n${basicWarnings.map(w => w.message).join('\n')}`
      : '';

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `당신은 근태 관리 전문가입니다. 다음 근태 데이터를 분석하고 우려스러운 패턴이나 이상사항을 한국어로 요약해주세요.

근태 데이터 (총 ${records.length}건, 처음 100건 표시):
${dataSnippet}
${duplicateInfo}
${warningInfo}

다음을 확인해주세요:
1. 중복 기록 외에 추가적인 이상 패턴
2. 근로기준법 관점에서 우려되는 사항 (주 52시간, 야간근로 등)
3. 데이터 일관성 문제
4. 전반적인 근태 현황 요약

간결하게 3-5문장으로 요약해주세요.`
      }]
    });

    const aiSummary = message.content[0].type === 'text' ? message.content[0].text : '';

    return {
      duplicates,
      warnings: basicWarnings,
      summary: aiSummary,
    };
  } catch (error) {
    console.error('AI analysis error:', error);
    // Fallback to basic analysis
    return {
      duplicates,
      warnings: basicWarnings,
      summary: `총 ${records.length}건 분석 완료. 중복 ${duplicates.length}건, 주의사항 ${basicWarnings.length}건 발견. (AI 상세 분석 불가)`,
    };
  }
}
