/**
 * severanceTax.ts — Korean Retirement Income Tax (퇴직소득세) Calculator
 *
 * Formula reference: 소득세법 제48조 (퇴직소득 과세표준), 시행령 §102~§107
 * All monetary values are in KRW (원). Math.floor used for tax amounts (1원 단위 절삭).
 */

export interface SeveranceTaxBreakdown {
  severance_total: number;       // 퇴직소득금액 (비과세 차감 전 = 총 퇴직금)
  years_of_service: number;      // 근속연수 (정수, 소수점 이하 올림)
  service_year_deduction: number; // 근속연수공제
  taxable_amount: number;        // 과세표준 = 퇴직소득금액 - 근속연수공제 (min 0)
  converted_pay: number;         // 환산급여 = 과세표준 × 12 ÷ 근속연수
  converted_pay_deduction: number; // 환산급여공제
  converted_taxable: number;     // 환산과세표준 = 환산급여 - 환산급여공제 (min 0)
  converted_tax: number;         // 환산산출세액 (종합소득세율 누진 적용)
  income_tax: number;            // 산출세액 = 환산산출세액 × 근속연수 ÷ 12
  local_income_tax: number;      // 지방소득세 = 산출세액 × 10%
  total_tax: number;             // 총 원천세 = 산출세액 + 지방소득세
  net_severance: number;         // 실지급액 = severance_total - total_tax
}

/**
 * Step 2: 근속연수공제
 * 근속연수는 소수점 이하 올림(ceiling) — 예: 3년 2개월 → 4년
 */
function computeServiceYearDeduction(yearsRounded: number): number {
  const y = yearsRounded;
  if (y <= 5) {
    return 100_0000 * y; // 100만원 × 근속연수
  } else if (y <= 10) {
    return 500_0000 + 200_0000 * (y - 5); // 500만원 + 200만원 × (근속연수 - 5)
  } else if (y <= 20) {
    return 1500_0000 + 250_0000 * (y - 10); // 1500만원 + 250만원 × (근속연수 - 10)
  } else {
    return 4000_0000 + 300_0000 * (y - 20); // 4000만원 + 300만원 × (근속연수 - 20)
  }
}

/**
 * Step 5: 환산급여공제
 */
function computeConvertedPayDeduction(convertedPay: number): number {
  const cp = convertedPay;
  if (cp <= 8_000_0000) {           // 800만원 이하
    return cp;                      // 100%
  } else if (cp <= 7000_0000) {     // 800만원 초과 ~ 7000만원
    return 800_0000 + (cp - 800_0000) * 0.6;
  } else if (cp <= 10000_0000) {    // 7000만원 초과 ~ 1억
    return 4520_0000 + (cp - 7000_0000) * 0.55;
  } else if (cp <= 30000_0000) {    // 1억 초과 ~ 3억
    return 6170_0000 + (cp - 10000_0000) * 0.45;
  } else {                          // 3억 초과
    return 15170_0000 + (cp - 30000_0000) * 0.35;
  }
}

/**
 * Step 7: 환산산출세액 — 종합소득세율 누진표 적용
 * 단위: 만원 경계값은 원 단위로 변환하여 비교
 */
function computeConvertedTax(convertedTaxable: number): number {
  const ct = convertedTaxable;
  if (ct <= 1400_0000) {            // 1400만원 이하
    return Math.floor(ct * 0.06);
  } else if (ct <= 5000_0000) {     // 1400만원 초과 ~ 5000만원
    return Math.floor(ct * 0.15 - 126_0000);
  } else if (ct <= 8800_0000) {     // 5000만원 초과 ~ 8800만원
    return Math.floor(ct * 0.24 - 576_0000);
  } else if (ct <= 15000_0000) {    // 8800만원 초과 ~ 1.5억
    return Math.floor(ct * 0.35 - 1544_0000);
  } else if (ct <= 30000_0000) {    // 1.5억 초과 ~ 3억
    return Math.floor(ct * 0.38 - 1994_0000);
  } else if (ct <= 50000_0000) {    // 3억 초과 ~ 5억
    return Math.floor(ct * 0.40 - 2594_0000);
  } else if (ct <= 100000_0000) {   // 5억 초과 ~ 10억
    return Math.floor(ct * 0.42 - 3594_0000);
  } else {                          // 10억 초과
    return Math.floor(ct * 0.45 - 6594_0000);
  }
}

/**
 * Main export: compute full retirement income tax breakdown.
 *
 * @param severanceTotal  총 퇴직금 (원) — 비과세 없으므로 전액 과세
 * @param yearsOfServiceExact  정확한 근속연수 (소수 가능, 예: 3.25년)
 *   — 내부에서 ceiling 처리 (법정 기준)
 */
export function computeSeveranceTax(
  severanceTotal: number,
  yearsOfServiceExact: number,
): SeveranceTaxBreakdown {
  // Round all monetary values to integer KRW throughout
  const total = Math.round(severanceTotal);

  // Step 1: 퇴직소득금액 = 총 퇴직금 (비과세 없음)
  const severanceIncome = total;

  // 근속연수: 소수점 이하 올림, 최소 1
  const yearsRounded = Math.max(1, Math.ceil(yearsOfServiceExact));

  // Step 2: 근속연수공제
  const serviceYearDeduction = computeServiceYearDeduction(yearsRounded);

  // Step 3: 과세표준 (음수면 0)
  const taxableAmount = Math.max(0, severanceIncome - serviceYearDeduction);

  // Edge case: taxable = 0 → no tax
  if (taxableAmount === 0) {
    return {
      severance_total: total,
      years_of_service: yearsRounded,
      service_year_deduction: serviceYearDeduction,
      taxable_amount: 0,
      converted_pay: 0,
      converted_pay_deduction: 0,
      converted_taxable: 0,
      converted_tax: 0,
      income_tax: 0,
      local_income_tax: 0,
      total_tax: 0,
      net_severance: total,
    };
  }

  // Step 4: 환산급여 = 과세표준 × 12 ÷ 근속연수
  const convertedPay = Math.floor((taxableAmount * 12) / yearsRounded);

  // Step 5: 환산급여공제
  const convertedPayDeduction = Math.floor(computeConvertedPayDeduction(convertedPay));

  // Step 6: 환산과세표준 (음수면 0)
  const convertedTaxable = Math.max(0, convertedPay - convertedPayDeduction);

  // Step 7: 환산산출세액
  const convertedTax = convertedTaxable > 0 ? computeConvertedTax(convertedTaxable) : 0;

  // Step 8: 산출세액 = 환산산출세액 × 근속연수 ÷ 12
  const incomeTax = Math.floor((convertedTax * yearsRounded) / 12);

  // Step 9: 지방소득세 = 산출세액 × 10%
  const localIncomeTax = Math.floor(incomeTax * 0.1);

  // Step 10: 총 원천세
  const totalTax = incomeTax + localIncomeTax;

  return {
    severance_total: total,
    years_of_service: yearsRounded,
    service_year_deduction: serviceYearDeduction,
    taxable_amount: taxableAmount,
    converted_pay: convertedPay,
    converted_pay_deduction: convertedPayDeduction,
    converted_taxable: convertedTaxable,
    converted_tax: convertedTax,
    income_tax: incomeTax,
    local_income_tax: localIncomeTax,
    total_tax: totalTax,
    net_severance: Math.max(0, total - totalTax),
  };
}
