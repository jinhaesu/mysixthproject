import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }});

async function main() {
  // /r 페이지 banner 조건: !email || !bank_slip_data || (FOREIGN && (!visa_type || !foreign_id_card_data))
  const rows = (await pool.query(`
    SELECT id, name, phone, nationality,
           CASE WHEN email IS NULL OR email = '' THEN 'X' ELSE 'O' END AS email_ok,
           CASE WHEN bank_slip_data IS NULL OR bank_slip_data = '' THEN 'X' ELSE 'O' END AS bank_slip_ok,
           CASE WHEN visa_type IS NULL OR visa_type = '' THEN 'X' ELSE 'O' END AS visa_type_ok,
           CASE WHEN foreign_id_card_data IS NULL OR foreign_id_card_data = '' THEN 'X' ELSE 'O' END AS foreign_id_ok,
           CASE WHEN bank_account IS NULL OR bank_account = '' THEN 'X' ELSE 'O' END AS bank_account_ok
    FROM regular_employees
    WHERE is_active = 1
    ORDER BY name
  `)).rows;

  let bannerCnt = 0, fullCnt = 0, partialCnt = 0;
  const bannerList = [];
  const fullList = [];
  const partialList = [];

  for (const r of rows) {
    const isForeign = r.nationality === 'FOREIGN';
    const missingEmail = r.email_ok === 'X';
    const missingBankSlip = r.bank_slip_ok === 'X';
    const missingForeign = isForeign && (r.visa_type_ok === 'X' || r.foreign_id_ok === 'X');
    const bannerShows = missingEmail || missingBankSlip || missingForeign;

    if (bannerShows) {
      bannerCnt++;
      // 동시에 onboarding 페이지에서도 모든 항목 비어있는 경우 (전혀 입력 안 함) 와
      // 일부만 입력했지만 banner 조건에 걸리는 경우 분리
      const allEmpty = missingEmail && missingBankSlip && (isForeign ? (r.visa_type_ok === 'X' && r.foreign_id_ok === 'X') : true);
      if (allEmpty) fullList.push(r);
      else { partialList.push({ ...r, missingEmail, missingBankSlip, missingForeign }); partialCnt++; }
    }
  }
  fullCnt = fullList.length;

  console.log(`전체 active 정규직: ${rows.length}명`);
  console.log(`/r banner 표시 대상: ${bannerCnt}명`);
  console.log(`  - 모든 항목 미입력: ${fullCnt}명`);
  console.log(`  - 일부만 입력 (사용자 인지 못한 누락): ${partialCnt}명\n`);

  console.log(`=== 일부만 입력했는데 banner 계속 떠있는 인원 (사용자가 "등록했다"고 인지하지만 시스템은 누락) ===`);
  for (const r of partialList) {
    const reasons = [];
    if (r.missingEmail) reasons.push('email');
    if (r.missingBankSlip) reasons.push('bank_slip_data');
    if (r.missingForeign) {
      if (r.visa_type_ok === 'X') reasons.push('visa_type');
      if (r.foreign_id_ok === 'X') reasons.push('foreign_id_card_data');
    }
    console.log(`  #${r.id} ${r.name.padEnd(40)} ${r.nationality.padEnd(8)} 누락: ${reasons.join(', ')}`);
  }

  console.log(`\n=== 모든 항목 미입력 (정보 입력 자체 안 한 인원) — ${fullCnt}명 (간략) ===`);
  fullList.slice(0, 10).forEach(r => console.log(`  #${r.id} ${r.name} ${r.nationality}`));
  if (fullList.length > 10) console.log(`  ... 외 ${fullList.length - 10}명`);

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
