// has_* boolean 체크가 detoasting 유발하는지 비교
const { Pool } = require('pg');
const url = process.env.DATABASE_URL;
const m = url.match(/^postgresql:\/\/([^:]+):(.+)@([^:\/]+)(?::(\d+))?(?:\/(.+?))?(?:\?.*)?$/);
const [, user, password, host, port, database] = m;
const pool = new Pool({
  user, password, host, port: parseInt(port || '5432'), database: database || 'postgres',
  ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 30_000,
});
async function T(label, q) {
  const t = Date.now();
  try { const r = await pool.query(q); console.log(`  ${(Date.now()-t).toString().padStart(6)}ms  ${label}  rows=${r.rowCount}`); }
  catch (e) { console.log(`  ${(Date.now()-t).toString().padStart(6)}ms  ${label}  ERR: ${e.message.slice(0,80)}`); }
}
async function main() {
  console.log('=== Test: detoasting vs no detoasting on regular_employees ===');
  await T('id only', 'SELECT id FROM regular_employees LIMIT 50');
  await T('id + name + dept', 'SELECT id, name, department FROM regular_employees LIMIT 50');
  await T("id + (col != '') has-check (detoasts)",
    "SELECT id, (bank_slip_data IS NOT NULL AND bank_slip_data != '') as h FROM regular_employees LIMIT 50");
  await T('id + IS NOT NULL (no detoast)',
    'SELECT id, (bank_slip_data IS NOT NULL) as h FROM regular_employees LIMIT 50');
  await T("id + LENGTH (may detoast)",
    "SELECT id, LENGTH(bank_slip_data) > 0 as h FROM regular_employees LIMIT 50");
  await T("id + OCTET_LENGTH (no full detoast)",
    "SELECT id, OCTET_LENGTH(bank_slip_data) > 0 as h FROM regular_employees LIMIT 50");
  await T("FULL list (current production)",
    `SELECT
      re.id, re.phone, re.name, re.department, re.team, re.role, re.workplace_id,
      re.is_active, re.hire_date, re.resign_date, re.resigned_at,
      re.bank_name, re.bank_account, re.id_number,
      re.nationality, re.visa_expiry,
      re.employment_type, re.onboarding_status,
      (re.bank_slip_data IS NOT NULL AND re.bank_slip_data != '') as has_bank_slip,
      (re.foreign_id_card_data IS NOT NULL AND re.foreign_id_card_data != '') as has_foreign_id_card,
      (re.family_register_data IS NOT NULL AND re.family_register_data != '') as has_family_register,
      (re.resident_register_data IS NOT NULL AND re.resident_register_data != '') as has_resident_register
    FROM regular_employees re WHERE re.is_active = 1 LIMIT 50`);
  await T("FULL list with OCTET_LENGTH",
    `SELECT
      re.id, re.phone, re.name, re.department, re.team, re.role, re.workplace_id,
      re.is_active, re.hire_date, re.resign_date, re.resigned_at,
      re.bank_name, re.bank_account, re.id_number,
      re.nationality, re.visa_expiry,
      re.employment_type, re.onboarding_status,
      OCTET_LENGTH(re.bank_slip_data) > 0 as has_bank_slip,
      OCTET_LENGTH(re.foreign_id_card_data) > 0 as has_foreign_id_card,
      OCTET_LENGTH(re.family_register_data) > 0 as has_family_register,
      OCTET_LENGTH(re.resident_register_data) > 0 as has_resident_register
    FROM regular_employees re WHERE re.is_active = 1 LIMIT 50`);
  await T("FULL list NO blob check (just key columns)",
    `SELECT
      re.id, re.phone, re.name, re.department, re.team, re.role, re.workplace_id,
      re.is_active, re.hire_date, re.resign_date, re.resigned_at,
      re.bank_name, re.bank_account, re.id_number,
      re.nationality, re.visa_expiry,
      re.employment_type, re.onboarding_status
    FROM regular_employees re WHERE re.is_active = 1 LIMIT 50`);
  await pool.end();
}
main().catch(e=>{console.error(e); process.exit(1);});
