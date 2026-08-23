// ============================================================================
// 근로계약서 양식1 (전체) — HTML Template — 정규직 카페팀 (contract_kind='cafe') 전용
// myseventhproject/backend/src/templates/contract-general.ts 를 포팅.
// WORD 원문을 한 글자도 빠짐없이 재현 + 7번째 문서(취업규칙 열람·안내 확인서) 추가.
//
// 필드 마커 클래스:
//   .cf-admin       data-key="..."  → 관리자(초록) 필드 (값 채워짐)
//   .cf-employee    data-key="..."  → 근로자(노란) 필드 (서명 시 인라인 입력)
//   .cf-stamp       data-key="..."  → 구성원 직인 (서명패드)
//   .cf-company-stamp               → 회사 직인 (인감 이미지 자동 삽입)
// ============================================================================

export interface ContractAdminFields {
  contract_start_date: string;   // 계약기간 시작일
  job_description: string;       // 업무내용
  contract_date: string;         // 계약 체결일 (YYYY-MM-DD)
  annual_salary: string;         // 연봉(세전)
  base_salary: string;           // 기본급(주휴수당)
  meal_allowance: string;        // 식대
  other_allowance: string;       // 기타 수당 (금액)
  other_allowance_detail: string;// 기타 수당 항목명/설명 (예: 직책수당, 연구수당 등)
  monthly_work_hours: string;    // 월간 총 시간
  monthly_total: string;         // 총계
  salary_start_date: string;     // 임금계약 시작일
  salary_end_date: string;       // 임금계약 종료일
  rulebook_url: string;          // 취업규칙(사규) 원문 링크
}

export interface ContractEmployeeFields {
  employee_name: string;
  employee_address: string;
  employee_phone: string;
  employee_birthday: string;
}

// 직인(서명) 위치 키 목록
export const STAMP_KEYS = [
  'stamp_art3',          // 근로계약서 제3조 직인
  'stamp_art4',          // 근로계약서 제4조 직인
  'stamp_art5',          // 근로계약서 제5조 직인
  'stamp_art6',          // 근로계약서 제6조 직인
  'stamp_art8',          // 근로계약서 제8조 직인
  'stamp_art9',          // 근로계약서 제9조 직인
  'stamp_art11',         // 근로계약서 제11조 직인
  'stamp_contract',      // 근로계약서 하단 근로자 직인
  'stamp_salary_art2',   // 연봉계약서 제2조 직인
  'stamp_salary',        // 연봉계약서 하단 근로자 직인
  'stamp_rulebook',      // 취업규칙 열람·안내 확인서 하단 근로자 직인
] as const;

export type StampKey = typeof STAMP_KEYS[number];

// 관리자 필드 키 목록
export const ADMIN_FIELD_KEYS: (keyof ContractAdminFields)[] = [
  'contract_start_date', 'job_description', 'contract_date',
  'annual_salary', 'base_salary', 'meal_allowance',
  'other_allowance', 'other_allowance_detail',
  'monthly_work_hours', 'monthly_total',
  'salary_start_date', 'salary_end_date',
  'rulebook_url',
];

// 근로자 필드 키 목록
export const EMPLOYEE_FIELD_KEYS: (keyof ContractEmployeeFields)[] = [
  'employee_name', 'employee_address', 'employee_phone', 'employee_birthday',
];

// ---------------------------------------------------------------------------
// 렌더링 모드
// ---------------------------------------------------------------------------
export type RenderMode = 'view' | 'sign';

// ---------------------------------------------------------------------------
// 날짜 파싱 헬퍼
// ---------------------------------------------------------------------------
function parseDateParts(dateStr: string): { year: string; month: string; day: string } {
  if (!dateStr) return { year: '', month: '', day: '' };
  const parts = dateStr.split('-');
  return {
    year: parts[0] || '',
    month: parts[1] ? String(parseInt(parts[1])) : '',
    day: parts[2] ? String(parseInt(parts[2])) : '',
  };
}

// ---------------------------------------------------------------------------
// 필드 렌더링 헬퍼
// ---------------------------------------------------------------------------
function adminField(key: string, value: string): string {
  const display = value || '';
  return `<span class="cf-admin" data-key="${key}" style="background:#C6EFCE;padding:2px 6px;border-radius:3px;min-width:60px;display:inline-block;">${display || '<span style="color:#999;">[미입력]</span>'}</span>`;
}

function employeeField(key: string, value: string, mode: RenderMode, label: string): string {
  if (mode === 'view') {
    return `<span class="cf-employee" data-key="${key}" style="background:#FFFF99;padding:2px 6px;border-radius:3px;min-width:60px;display:inline-block;">${value || '<span style="color:#999;">[미입력]</span>'}</span>`;
  }
  // sign mode — interactive
  if (value) {
    return `<span class="cf-employee" data-key="${key}" data-label="${label}" style="background:#FFFF99;padding:2px 6px;border-radius:3px;min-width:60px;display:inline-block;cursor:pointer;border-bottom:2px solid #E6C300;">${value}</span>`;
  }
  return `<span class="cf-employee" data-key="${key}" data-label="${label}" style="background:#FFFF99;padding:4px 12px;border-radius:3px;min-width:80px;display:inline-block;cursor:pointer;border:1px dashed #CCAA00;color:#999;font-size:13px;">[ ${label} ]</span>`;
}

function consentField(key: string, value: string, mode: RenderMode): string {
  // 동의란 — 근로자 이름 입력 (employee_name과 연동)
  if (mode === 'view') {
    return `<span class="cf-consent" data-key="${key}" style="background:#FFFF99;padding:2px 6px;border-radius:3px;min-width:80px;display:inline-block;">${value || ''}</span>`;
  }
  return `<span class="cf-consent" data-key="${key}" style="background:#FFFF99;padding:4px 12px;border-radius:3px;min-width:80px;display:inline-block;cursor:pointer;border:1px dashed #CCAA00;color:#999;font-size:13px;">[ 동의 서명 ]</span>`;
}

function stampField(key: string, signatureBase64: string, mode: RenderMode): string {
  if (mode === 'view' && signatureBase64) {
    return `<span class="cf-stamp cf-stamp-signed" data-key="${key}" style="display:inline-block;"><img src="${signatureBase64}" alt="직인" style="max-width:70px;max-height:35px;vertical-align:middle;" /></span>`;
  }
  if (mode === 'view') {
    return `<span class="cf-stamp" data-key="${key}" style="display:inline-block;color:#aaa;font-size:12px;">(미서명)</span>`;
  }
  // sign mode
  return `<span class="cf-stamp" data-key="${key}" style="display:inline-block;width:80px;height:40px;border:2px dashed #CCAA00;border-radius:4px;background:#FFFDE7;cursor:pointer;text-align:center;line-height:36px;font-size:11px;color:#999;vertical-align:middle;">터치하여 서명</span>`;
}

function companyStamp(imageUrl: string): string {
  if (imageUrl) {
    return `<span class="cf-company-stamp" style="display:inline-block;"><img src="${imageUrl}" alt="회사직인" style="max-width:70px;max-height:70px;vertical-align:middle;" /></span>`;
  }
  return `<span class="cf-company-stamp" style="display:inline-block;color:#D32F2F;font-weight:bold;font-size:13px;">(인)</span>`;
}

// ---------------------------------------------------------------------------
// 메인 렌더 함수
// ---------------------------------------------------------------------------
export function renderRegularCafeContract(
  admin: Partial<ContractAdminFields>,
  employee: Partial<ContractEmployeeFields>,
  signatures: Partial<Record<StampKey, string>>,
  companyStampUrl: string,
  mode: RenderMode,
): string {
  const a = (key: keyof ContractAdminFields) => adminField(key, (admin as any)[key] || '');
  const e = (key: keyof ContractEmployeeFields, label: string) => employeeField(key, (employee as any)[key] || '', mode, label);
  const consent = (key: string) => consentField(key, (employee as any).employee_name || '', mode);
  const stamp = (key: StampKey) => stampField(key, (signatures as any)[key] || '', mode);
  const cs = () => companyStamp(companyStampUrl);
  // 취업규칙 원문 링크 — a() 헬퍼는 <span> 으로 감싸므로 href 속성에는 절대 쓰지 않는다
  // (감싼 HTML이 그대로 href 값으로 들어가 링크가 깨지는 버그였음). 원문(raw) 값만 사용.
  const rulebookHref = (admin as any).rulebook_url || '/rulebook';

  const dateParts = parseDateParts((admin as any).contract_date || '');
  const dateY = adminField('contract_year', dateParts.year);
  const dateM = adminField('contract_month', dateParts.month);
  const dateD = adminField('contract_day', dateParts.day);

  // 동의 + 직인 블록 (조항 뒤에 반복되는 패턴)
  const consentBlock = (stampKey: StampKey) => `
    <p style="text-align:right;margin-top:8px;">※ 근로자 동의 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${consent(stampKey + '_consent')}</p>
    <p style="text-align:right;">${stamp(stampKey)}</p>`;

  return `
<div class="contract-body" style="font-family:'Malgun Gothic','맑은 고딕',sans-serif;max-width:800px;margin:0 auto;padding:40px 32px;line-height:2.0;color:#222;font-size:14px;">

  <!-- ================================================================== -->
  <!-- 문서 1: 근 로 계 약 서                                              -->
  <!-- ================================================================== -->
  <section class="contract-section" data-doc="labor-contract">
    <h1 style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:24px;font-weight:bold;">근 로 계 약 서</h1>

    <p>조인앤조인 (이하 '회사')와(과) &nbsp;${e('employee_name', '성명')}&nbsp; (이하 '근로자')은(는) 근로관계에 관한 사항을 정함을 목적으로 다음과 같이 근로계약을 체결한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제1조 (의무)</h2>
    <p>회사와 근로자는 신의성실 원칙에 입각하여 본 계약을 성실히 이행·준수하여야 한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제2조 (근로계약기간)</h2>
    <p>계약기간은 ${a('contract_start_date')} 부터 1년으로 정한다.</p>
    <p>단, 근로계약서에서 종료일에 별고 기입하지 않은 경우에는 기간의 정함이 없는 근로계약을 체결하기로 한다.</p>
    <p>계약 종료 전후 1개월 내에 상호간 추가적인 의견이 없을 경우, 1년씩 연장한다.</p>
    <p>해당 계약은 상호 협의를 통해 임금 재협상 시, 재계약할 수 있다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제3조 (시용(수습)기간)</h2>
    <p>① 입사일을 기준으로 3개월 간은 시용(수습)기간이며, 이 기간 동안 근로자의 지속적인 업무수행이 곤란하다고 판단되거나, 근로자의 귀책사유가 발생 시 사전통지 없이 회사는 근로자를 본 채용을 거부 할 수 있다.</p>
    <p>② 시용(수습)기간은 근속기간에 포함한다.</p>
    <p>※ 근로자는 사용기간 및 본 채용거부에 관하여 설명을 들었으며 이에 동의합니다.</p>
    ${consentBlock('stamp_art3')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제4조 (직무)</h2>
    <p>① 근로자의 업무내용은 ${a('job_description')} 등으로 한다.</p>
    <p>② 근로자의 업무 내용은 회사의 업무상 필요에 의해 변경 될 수 있다.</p>
    ${consentBlock('stamp_art4')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제5조 (근무장소)</h2>
    <p>① 근로자의 근무장소는 회사가 지정하는 장소로 한다.</p>
    <p>② 근로자의 계약 체결 시 근무장소는 회사의 사업장 또는 회사가 지정하는 장소 이다.</p>
    <p>③ 근로자의 업무장소는 회사의 업무상 필요에 의해 변경 될 수 있다.</p>
    ${consentBlock('stamp_art5')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제6조 (근로시간)</h2>
    <p>① 근무시간은 1일 8시간, 주5일 근무하는 것을 원칙으로 한다.<br/>(회사는 업무 특성에 따라 유연근무제(시차출퇴근제)를 운영할 수 있으며, 세부사항은 별도로 정한다.)</p>
    <p>② 휴게시간은 12:00시 에서 13:00시 까지 1시간을 원칙으로 한다.</p>
    <p>③ 근무시간은 변동될 수 있으며 변동되는 경우 사전에 스케쥴표를 제공한다.</p>
    <p>④ 근로자는 회사의 업무 특성을 고려하여 연장, 야간, 휴일근로를 수행한다.</p>
    ${consentBlock('stamp_art6')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제7조 (임금)</h2>
    <p>임금은 별도 연봉계약서에 따른다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제8조 (임금의 지급)</h2>
    <p>① 월 급여는 매월 1회 지급한다.</p>
    <p>② 회사는 당월1일부터 당월 말일까지의 근무를 기준으로, 익월 지정된 날짜에 근로자가 지정한 통장으로 세금 등 을 원천징수 한 후 지급한다.</p>
    <p>③ 퇴사 시 근로자의 임금정산을 위한 행정절차상 사유로 인하여 퇴사일 당일이 아닌 당사의 임금지급일에 지급한다. 이로 인하여 퇴직으로 인한 금품청산이 14일보다 연장 될 수 있으며, 이 경우 근로자의 사전 동의를 득한다.</p>
    ${consentBlock('stamp_art8')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제9조 (휴일 및 휴가)</h2>
    <p>근로자의 휴일 및 휴가는 취업규칙 및 근로기준법에 정한 바에 따른다.</p>
    <p>※ 근로자는 특정된 휴일을 근로일로 하는 경우 그 근로일을 휴일로 교체하는 대체휴무를 실시할 수 있음에 동의한다.</p>
    <p>※ 주휴일은 일요일을 기본으로 한다. 그외 휴무일자는 협의 하에 별도로 정함.</p>
    ${consentBlock('stamp_art9')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제10조 (채용의 취소)</h2>
    <p>① 회사는 근로자가 취업 시에 입사관련 서류를 허위로 기재한 경우, 채용을 취소할 수 있다.</p>
    <p>② 회사는 근로자가 불법체류자, 지명수배중에 있는 경우 채용을 취소할 수 있다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제11조 (당연퇴직 사유)</h2>
    <p>① 다음 각 호의 경우에는 근로계약이 별도의 절차 없이 근로계약이 종료되는 것으로 한다.</p>
    <p style="padding-left:20px;">1. 근로계약의 만료 &nbsp;&nbsp;&nbsp; 2. 근로자의 사망 &nbsp;&nbsp;&nbsp; 3. 근로자의 정년 도달</p>
    <p style="padding-left:20px;">4. 근로자가 무단결근을 3회 이상 한 경우</p>
    <p style="padding-left:20px;">5. 기타 취업규칙 등 회사가 정한 규정</p>
    <p style="padding-left:20px;">6. 잦은 결근/지각/조퇴 등 근태불량으로 월 3회 이상 지적을 받은 경우</p>
    <p style="padding-left:20px;">7. 업무외적인 질병 또는 부상 등 일신상의 사유로 월간 7일 이상 직무수행이 불가능한 경우</p>
    <p style="padding-left:20px;">8. 기타 사회 통념상 고용관계유지가 불가능한 귀책사유를 유발한 경우</p>
    <p>단, 연락두절 상태로 3일 이상 무단결근한 경우에는 당연 퇴직으로 간주한다</p>
    <p>※ 근로자는 무단 결근 시 회사의 방침 및 절차에 대하여 설명을 들었으며 이에 동의합니다.</p>
    ${consentBlock('stamp_art11')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제12조 (안전)</h2>
    <p>근로자는 회사의 사업장에서 정한 사업안전수칙을 준수하며, 사업장의 안전관리에 적극 협조한다. 만일 이를 태만히 하여 근로자의 귀책사유로 피해가 발생하는 경우 회사에 이의를 제기할 수 없다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제13조 (개인정보보호 및 비밀유지 의무)</h2>
    <p>① 근로자는 근로 중 취득 또는 취득한 고객의 개인정보 및 회사의 영업비밀 등 사업에 관련한 정보를 사적인 용도로 사용하거나 유출하여서는 안된다.</p>
    <p>② 본 조1항의 경우에는 근로계약이 종료된 이후에도 계속적으로 유효하다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제14조 (근로자의 퇴직절차)</h2>
    <p>근로자의 사정으로 근로계약의 해지를 원하는 경우에는 퇴사일로 부터 최소 30일 전에 회사에 퇴직원을 제출하여야 하며, 후임자에게 업무를 인수인계하여야 한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제15조 (손해배상)</h2>
    <p>근로자는 고의 또는 과실로 손해를 끼친 경우 그 손해를 배상하여야 한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제16조 (기타)</h2>
    <p>① 본 계약서상에 명시되지 않은 사항은 근로기준법 등의 관계법령 및 취업규칙 등의 회사가 정한 규정에 따른다.</p>
    <p>② 근로기준법 등의 관계법령의 적용은 법령에 정한 상시근로자 수에 따라 적용 여부를 결정한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제17조 (전자서명)</h2>
    <p>본 계약서의 전자서명(모바일 서명)은 전자서명법에 따라 자필서명과 동일한 효력을 가진다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제18조 (분쟁해결)</h2>
    <p>본 계약에 관한 분쟁은 회사 소재지 관할 법원을 전속관할로 한다.</p>
    <p style="margin-top:16px;">이상 계약 내용을 명확히 하기위하여 회사와 근로자는 계약서를 작성하여 전자서명하고 각 1부씩 보관한다.</p>

    <p style="text-align:center;margin-top:32px;font-weight:bold;">${dateY} &nbsp;년 &nbsp;&nbsp;&nbsp; ${dateM} &nbsp;월 &nbsp;&nbsp;&nbsp; ${dateD} &nbsp;일</p>

    <div style="margin-top:40px;border-top:1px solid #ccc;padding-top:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:50%;padding:12px;vertical-align:top;">
            <p style="font-weight:bold;">(회사)</p>
            <p>회사명 : 조인앤조인</p>
            <p>주 &nbsp;소 : 전북특별자치도 전주시 덕진구 기린대로 458</p>
            <p>대표자 : 진해수 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${cs()}</p>
          </td>
          <td style="width:50%;padding:12px;vertical-align:top;">
            <p style="font-weight:bold;">(근로자)</p>
            <p>성 &nbsp;명 : ${e('employee_name', '성명')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${stamp('stamp_contract')}</p>
            <p>주 &nbsp;소 : ${e('employee_address', '주소')}</p>
            <p>연락처 : ${e('employee_phone', '연락처')}</p>
          </td>
        </tr>
      </table>
    </div>
  </section>

  <!-- ================================================================== -->
  <!-- 문서 2: 연 봉 계 약 서                                              -->
  <!-- ================================================================== -->
  <div style="page-break-before:always;margin-top:60px;border-top:3px solid #333;padding-top:40px;"></div>
  <section class="contract-section" data-doc="salary-contract">
    <h1 style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:24px;font-weight:bold;">연 봉 계 약 서</h1>

    <div style="margin-bottom:20px;">
      <p>성 명: ${e('employee_name', '성명')}</p>
      <p>생년월일: ${e('employee_birthday', '생년월일')}</p>
      <p>연락처: ${e('employee_phone', '연락처')}</p>
    </div>

    <p>1. 상기 본인은 연봉계약서의 상세 내용을 숙지하였으며, 다음과 같이 연봉계약을 체결하는데 동의합니다.</p>
    <p>2. 상기 본인은 연봉계약서를 체결함에 있어 책정된 급여액을 타인에게 공표하지 않겠습니다.</p>
    <p>3. 상기 1, 2항의 내용을 1급 비밀로 지정하며, 이를 위반하는 경우, 회사의 어떤 조치에도 이의를 제기하지 않고 감수하겠음.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제1조 (연봉계약기간)</h2>
    <p>연봉계약기간은 ${a('salary_start_date')}부터 ${a('salary_end_date')}까지로 한다.</p>
    <p>※ 연봉계약의 기간이 종료된 이후에 계약을 재체결 하지 않은 경우, 동일 조건으로 1년간 갱신 된것으로 한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제2조 (연봉의 상세내역) [연봉(세전): ${a('annual_salary')}]</h2>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="border:1px solid #ccc;padding:8px 12px;text-align:left;">구분</th>
          <th style="border:1px solid #ccc;padding:8px 12px;text-align:right;">금액(원)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #ccc;padding:8px 12px;">기본급(주휴수당)</td>
          <td style="border:1px solid #ccc;padding:8px 12px;text-align:right;">${a('base_salary')}</td>
        </tr>
        <tr>
          <td style="border:1px solid #ccc;padding:8px 12px;">식대</td>
          <td style="border:1px solid #ccc;padding:8px 12px;text-align:right;">${a('meal_allowance')}</td>
        </tr>
        <tr>
          <td style="border:1px solid #ccc;padding:8px 12px;">기타 수당${(admin as any).other_allowance_detail ? ` <span style="color:#666;font-size:12px;">(${(admin as any).other_allowance_detail})</span>` : ''}</td>
          <td style="border:1px solid #ccc;padding:8px 12px;text-align:right;">${a('other_allowance')}</td>
        </tr>
        <tr>
          <td style="border:1px solid #ccc;padding:8px 12px;">월간 총 시간</td>
          <td style="border:1px solid #ccc;padding:8px 12px;text-align:right;">${a('monthly_work_hours')}</td>
        </tr>
        <tr style="font-weight:bold;background:#f9f9f9;">
          <td style="border:1px solid #ccc;padding:8px 12px;">총계</td>
          <td style="border:1px solid #ccc;padding:8px 12px;text-align:right;">${a('monthly_total')}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top:12px;font-size:13px;color:#555;">※ 시수는 가산한 값을 표기 하였음.</p>
    <p style="font-size:13px;color:#555;">※ 근로시간과 무관하게 전항에 명시된 법정제수당이외에는 추가로 지급하지 아니한다.</p>
    <p style="font-size:13px;color:#555;">※ 당사는 기본적으로 유연 근무제를 비롯하여 다양한 유동적인 근무제도를 운영하고 있습니다.</p>
    <p style="font-size:13px;color:#555;">※ 휴일(주말)근로시간의 경우, 별도로 근로시간 측정과 개별 보고가 필수적이며, 근로시간만큼 지급합니다.</p>
    <p>※ 상기와 같이 포괄임금제로 근로계약을 체결함에 동의합니다.</p>
    ${consentBlock('stamp_salary_art2')}

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제3조 (연봉 조정)</h2>
    <p>연봉 조정은 매년 1회 회사의 경영실적 및 개인 성과를 반영하여 결정한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제4조 (성과급 및 상여금)</h2>
    <p>성과급 및 상여금은 회사 규정에 따르며, 지급 여부 및 금액은 회사의 경영상황과 개인 성과를 고려하여 회사가 결정한다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제5조 (퇴직금)</h2>
    <p>상기 금액에서 제외되는 퇴직금 등은 근로기준법에 따른다. 산정 방법은 회사의 규정을 따른다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제6조 (기타)</h2>
    <p>기타 본 계약서에 명시되지 않은 내용은 회사의 규정에 따른다.</p>

    <div style="margin-top:40px;border-top:1px solid #ccc;padding-top:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:50%;padding:12px;vertical-align:top;">
            <p style="font-weight:bold;">(회사)</p>
            <p>회사명 : 조인앤조인</p>
            <p>주 &nbsp;소 : 전북특별자치도 전주시 덕진구 기린대로 458</p>
            <p>대표자 : 진해수 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${cs()}</p>
          </td>
          <td style="width:50%;padding:12px;vertical-align:top;">
            <p style="font-weight:bold;">(근로자)</p>
            <p>성 &nbsp;명 : ${e('employee_name', '성명')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${stamp('stamp_salary')}</p>
            <p>주 &nbsp;소 : ${e('employee_address', '주소')}</p>
            <p>연락처 : ${e('employee_phone', '연락처')}</p>
          </td>
        </tr>
      </table>
    </div>
  </section>

  <!-- ================================================================== -->
  <!-- 문서 3: 비밀유지서약서                                              -->
  <!-- ================================================================== -->
  <div style="page-break-before:always;margin-top:60px;border-top:3px solid #333;padding-top:40px;"></div>
  <section class="contract-section" data-doc="nda">
    <h1 style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:24px;font-weight:bold;">비 밀 유 지 서 약 서</h1>

    <p>${e('employee_name', '성명')}(이하 "본인")은(는) 조인앤조인 (이하 "회사")의 임직원으로서 회사에 입사하여 회사를 위하여 업무를 수행함에 있어 취득할 가능성이 있는 회사의 영업비밀 보호와 관련하여 다음과 같이 서약합니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제1조 (영업비밀)</h2>
    <p>본 서약서상 영업비밀이란 회사 업무수행과 관련하여 알게 되거나 제공받는 영업활동에 유용한 기술상 또는 경영상의 제반 정보를 의미합니다.</p>
    <p style="padding-left:20px;">1. 제품의 소스코드, 지식재산 및 관련 기술, 마케팅 계획, 판매기법 및 영업기법</p>
    <p style="padding-left:20px;">2. 회사의 인사, 조직, 재무, 전산, 연구개발, 교육, 훈련 등에 관한 사항</p>
    <p style="padding-left:20px;">3. 타사와의 계약 및 그 계약 관계에서 생성하거나 제공받은 각종 기술 및 경영상의 정보</p>
    <p style="padding-left:20px;">4. 사업계획수립시 생성된 각종 보고서 및 기초자료, 분석정보 등 내부논의 문건</p>
    <p style="padding-left:20px;">5. 기타 회사의 영업활동에 유용한 기술상 또는 경영상 정보</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제2조 (비밀유지의무)</h2>
    <p style="padding-left:20px;">1. 재직 중에 알게 된 영업비밀을 회사가 명시적으로 승인한 이외의 방법으로 사용하지 않겠습니다.</p>
    <p style="padding-left:20px;">2. 영업비밀 관련 자료를 사전 서면승인없이 복사, 녹음, 촬영 기타 방법에 의해 복제, 반출, 전송하지 않겠습니다.</p>
    <p style="padding-left:20px;">3. 영업비밀의 유지, 관리에 최선을 다하며, 제3자에게 유출, 공개되지 않도록 필요한 모든 조치를 취하겠습니다.</p>
    <p style="padding-left:20px;">4. 재직 시, 퇴사 후에도 사전 서면승인 없이 영업비밀을 사용하지 않겠습니다.</p>
    <p style="padding-left:20px;">5. 상기 비밀유지의무는 구두, 서면, 파일(동영상 포함) 등에 의한 경우를 포함합니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제3조 (자료의 반환)</h2>
    <p style="padding-left:20px;">1. 퇴사, 업무변경시 영업비밀을 포함한 자료를 회사에 반환하겠습니다.</p>
    <p style="padding-left:20px;">2. 회사가 영업비밀 포함자료를 즉시 반환, 또는 회사의 동의하에 폐기 요청시 이에 따르겠습니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제4조 (소유권의 귀속)</h2>
    <p style="padding-left:20px;">1. 재직 중 작성한 업무관련 그래픽, 문구, 보고서 등의 소유권, 저작권 등의 재산권 일체가 회사에 귀속됨을 확인합니다.</p>
    <p style="padding-left:20px;">2. 회사 업무 관련하여 개발, 취득, 인지하게 된 모든 기술, 발명, 노하우 등에 대한 권리가 회사에 귀속됨을 인정합니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제5조 (비공개의무)</h2>
    <p>회사의 사전 서면동의를 얻지 아니하고는 언론 등에 회사 업무 및 그 수행내용을 게시하거나 어떠한 매체와도 인터뷰 등을 하지 않겠습니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제6조 (손해배상)</h2>
    <p style="padding-left:20px;">1. 본 서약서 상의 의무를 위반할 경우, 부정경쟁방지법에 규정된 손해배상 책임 등의 책임을 질 것을 확인합니다.</p>
    <p style="padding-left:20px;">2. 본인의 귀책사유로 영업비밀을 분실, 도난 및 침해 당한 경우 본인의 비용과 책임으로 수습조치를 취하며, 회사에 발생하는 모든 손해를 배상하겠습니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">제7조 (위반 시 제재)</h2>
    <p style="padding-left:20px;">1. 부정경쟁방지법, 형법상 책임</p>
    <p style="padding-left:20px;">2. 연봉의 최소 3배 위약금</p>
    <p style="padding-left:20px;">3. 회사에 발생하는 모든 손해 배상(변호사 비용 포함)</p>

    <p style="text-align:center;margin-top:32px;font-weight:bold;">${dateY} &nbsp;년 &nbsp;&nbsp;&nbsp; ${dateM} &nbsp;월 &nbsp;&nbsp;&nbsp; ${dateD} &nbsp;일</p>

    <div style="margin-top:24px;">
      <p>성 명: ${e('employee_name', '성명')}</p>
      <p>생년월일: ${e('employee_birthday', '생년월일')}</p>
      <p>연락처: ${e('employee_phone', '연락처')}</p>
    </div>
  </section>

  <!-- ================================================================== -->
  <!-- 문서 4: 개인정보 수집·이용에 관한 동의서                              -->
  <!-- ================================================================== -->
  <div style="page-break-before:always;margin-top:60px;border-top:3px solid #333;padding-top:40px;"></div>
  <section class="contract-section" data-doc="privacy-consent">
    <h1 style="text-align:center;font-size:22px;letter-spacing:4px;margin-bottom:24px;font-weight:bold;">개인정보 수집·이용에 관한 동의서</h1>

    <p>1. ${e('employee_name', '성명')}은(는) 조인앤조인의 근로자로서 인사관리상 개인정보의 수집·이용이 필요하다는 것을 이해하고 동의합니다.</p>
    <p style="padding-left:20px;">[개인정보] 성명, 증명사진, 주소, 이메일, 연락처, 학력, 근무경력, 자격증</p>
    <p style="padding-left:20px;">[민감정보] 신체장애, 병력, 범죄정보, 보훈대상여부</p>
    <p style="padding-left:20px;">[고유식별정보] 주민등록번호, 운전면허번호, 여권번호, 외국인등록번호</p>
    <p>2. CCTV녹화, 업무용차량에 대한 GPS기록장치에 대하여 동의합니다.</p>
    <p>3. 개인정보를 제공한 당사자는 언제나 열람·수정 및 정보제공에 대한 철회를 할 수 있습니다.</p>
    <p>4. 미동의시 발생하는 불이익에 대한 책임은 본인에게 있음을 확인합니다.</p>

    <p style="text-align:center;margin-top:32px;font-weight:bold;">${dateY} &nbsp;년 &nbsp;&nbsp;&nbsp; ${dateM} &nbsp;월 &nbsp;&nbsp;&nbsp; ${dateD} &nbsp;일</p>

    <div style="margin-top:24px;">
      <p>성 명: ${e('employee_name', '성명')}</p>
      <p>생년월일: ${e('employee_birthday', '생년월일')}</p>
      <p>연락처: ${e('employee_phone', '연락처')}</p>
    </div>
  </section>

  <!-- ================================================================== -->
  <!-- 문서 5: 경업금지서약서                                              -->
  <!-- ================================================================== -->
  <div style="page-break-before:always;margin-top:60px;border-top:3px solid #333;padding-top:40px;"></div>
  <section class="contract-section" data-doc="non-compete">
    <h1 style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:24px;font-weight:bold;">경 업 금 지 서 약 서</h1>

    <p>${e('employee_name', '성명')} (이하 '본인')은(는) 조인앤조인 (이하 '회사')에 입사함에 있어 다음과 같이 서약합니다.</p>

    <h2 style="font-size:15px;margin-top:28px;font-weight:bold;">서약사항</h2>
    <p style="padding-left:20px;">1. 영업비밀의 전부 또는 일부를 제3자에게 이전 또는 양도하거나 회사업무 이외의 목적으로 이용하지 않고,</p>
    <p style="padding-left:20px;">2. 회사가 경영하는 사업에 직접 또는 간접적으로 중대한 영향을 미치는 다른 사업에 종사하지 아니할 것입니다.</p>
    <p style="padding-left:20px;">3. 종전 회사의 영업비밀을 부당 이용하지 아니할 것입니다.</p>
    <p style="padding-left:20px;">4. 본 서약사항은 회사에 근무하는 기간은 동안 유효합니다.</p>
    <p>본인은 위 서약 사항을 위반하는 경우 회사에게 발생하는 모든 손해를 배상할 것입니다.</p>

    <p style="text-align:center;margin-top:32px;font-weight:bold;">${dateY} &nbsp;년 &nbsp;&nbsp;&nbsp; ${dateM} &nbsp;월 &nbsp;&nbsp;&nbsp; ${dateD} &nbsp;일</p>

    <div style="margin-top:24px;">
      <p>성 명: ${e('employee_name', '성명')}</p>
      <p>생년월일: ${e('employee_birthday', '생년월일')}</p>
      <p>연락처: ${e('employee_phone', '연락처')}</p>
    </div>
  </section>

  <!-- ================================================================== -->
  <!-- 문서 6: 법정 의무 교육 실시 및 확인서                                -->
  <!-- ================================================================== -->
  <div style="page-break-before:always;margin-top:60px;border-top:3px solid #333;padding-top:40px;"></div>
  <section class="contract-section" data-doc="mandatory-education">
    <h1 style="text-align:center;font-size:22px;letter-spacing:4px;margin-bottom:24px;font-weight:bold;">법정 의무 교육 실시 및 확인서</h1>

    <p>당사(주식회사 조인앤조인)에 입사 직후, 영상 시청 및 기타 지도를 통해 법정 의무 교육을 안내 받고, 이수했음을 확인 합니다.</p>

    <p style="padding-left:20px;margin-top:16px;">1. 성희롱 예방교육 (연 1회)<br/><a href="https://youtu.be/OoO9ZHuaHN4" target="_blank" style="color:#1976D2;">https://youtu.be/OoO9ZHuaHN4</a></p>
    <p style="padding-left:20px;">2. 장애인 인식개선 교육 (연 1회)<br/><a href="https://youtu.be/VRBDaQwvvHg" target="_blank" style="color:#1976D2;">https://youtu.be/VRBDaQwvvHg</a></p>
    <p style="padding-left:20px;">3. 산업안전 보건교육 (분기마다)<br/><a href="https://youtu.be/SxwAwn8bLic" target="_blank" style="color:#1976D2;">https://youtu.be/SxwAwn8bLic</a></p>
    <p style="padding-left:20px;">4. 개인정보 보호교육 (연 1회)<br/><a href="https://youtu.be/4jw2tiz60jo" target="_blank" style="color:#1976D2;">https://youtu.be/4jw2tiz60jo</a></p>
    <p style="padding-left:20px;">5. 퇴직연금교육 (연 1회)<br/><a href="https://youtu.be/V2GFdiJCYLQ" target="_blank" style="color:#1976D2;">https://youtu.be/V2GFdiJCYLQ</a></p>

    <p style="margin-top:16px;">이를 모두 구두 및 기타 안내 받고, 모두 시청 및 확인했습니다.</p>

    <p style="text-align:center;margin-top:32px;font-weight:bold;">${dateY} &nbsp;년 &nbsp;&nbsp;&nbsp; ${dateM} &nbsp;월 &nbsp;&nbsp;&nbsp; ${dateD} &nbsp;일</p>

    <div style="margin-top:24px;">
      <p>성 명: ${e('employee_name', '성명')}</p>
      <p>생년월일: ${e('employee_birthday', '생년월일')}</p>
      <p>연락처: ${e('employee_phone', '연락처')}</p>
    </div>
  </section>

  <!-- ================================================================== -->
  <!-- 문서 7: 취업규칙 열람·안내 확인서                                    -->
  <!-- ================================================================== -->
  <div style="page-break-before:always;margin-top:60px;border-top:3px solid #333;padding-top:40px;"></div>
  <section class="contract-section" data-doc="rulebook-acknowledgment">
    <h1 style="text-align:center;font-size:22px;letter-spacing:4px;margin-bottom:24px;font-weight:bold;">취업규칙 열람·안내 확인서</h1>

    <p>본인 ${e('employee_name', '성명')}은(는) 주식회사 조인앤조인의 취업규칙(사규) 전문을 열람하고, 그 주요 내용(근로시간·휴게·휴일·휴가·임금·복무·상벌·안전보건 등)을 안내 받았으며, 이를 숙지하고 재직 중 준수할 것에 동의합니다.</p>
    <p>취업규칙 원문: <a href="${rulebookHref}" target="_blank" style="color:#1976D2;text-decoration:underline;">${rulebookHref}</a> (사이트 → 취업규칙 메뉴에서도 언제든 조회 가능)</p>

    <p style="text-align:center;margin-top:32px;font-weight:bold;">${dateY} &nbsp;년 &nbsp;&nbsp;&nbsp; ${dateM} &nbsp;월 &nbsp;&nbsp;&nbsp; ${dateD} &nbsp;일</p>

    <div style="margin-top:24px;">
      <p>성 &nbsp;명 : ${e('employee_name', '성명')} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${stamp('stamp_rulebook')}</p>
      <p>생년월일: ${e('employee_birthday', '생년월일')}</p>
      <p>연락처: ${e('employee_phone', '연락처')}</p>
    </div>
  </section>

</div>`;
}

// ---------------------------------------------------------------------------
// 완성된 HTML 페이지 빌드 (상태바 + 메타태그 포함)
// ---------------------------------------------------------------------------
export function buildRegularCafeContractPage(
  admin: Partial<ContractAdminFields>,
  employee: Partial<ContractEmployeeFields>,
  signatures: Partial<Record<StampKey, string>>,
  companyStampUrl: string,
  mode: RenderMode,
  status: string,
  employeeName: string,
): string {
  const body = renderRegularCafeContract(admin, employee, signatures, companyStampUrl, mode);

  const statusLabel = status === 'signed' ? '서명 완료' : status === 'sent' ? '서명 대기' : '초안';
  const statusColor = status === 'signed' ? '#16a34a' : status === 'sent' ? '#d97706' : '#6b7280';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>근로계약서 - ${employeeName}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f5f5f5; }
    .page-wrapper { background: #fff; min-height: 100vh; }
    .status-bar { background: ${statusColor}; color: #fff; padding: 10px 40px; font-size: 14px; font-family: 'Malgun Gothic', sans-serif; }
    @media print { .status-bar { display: none; } .contract-section + div[style*="page-break"] { page-break-before: always; } }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <div class="status-bar">계약 상태: ${statusLabel}</div>
    ${body}
  </div>
</body>
</html>`;
}
