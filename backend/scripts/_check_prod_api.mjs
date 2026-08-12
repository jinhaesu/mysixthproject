import 'dotenv/config';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('JWT_SECRET missing'); process.exit(1); }
const token = jwt.sign({ type: 'auth', id: 1, email: 'ceo@joinandjoin.com', role: 'admin', name: 'CEO' }, JWT_SECRET, { expiresIn: '10m' });

const API = 'https://mysixthproject-production.up.railway.app';

for (const ym of ['2026-07', '2026-08']) {
  const r = await fetch(`${API}/api/regular/payroll-calc?year_month=${ym}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`\n=== ${ym} HTTP ${r.status} ===`);
  if (!r.ok) { console.log(await r.text()); continue; }
  const d = await r.json();
  console.log('total results:', (d.results||[]).length);
  const jyh = (d.results||[]).find(r => (r.name||'').includes('정연화'));
  const tinung = (d.results||[]).find(r => (r.name||'').includes('티늉') || (r.name||'').includes('NHUNG'));
  console.log('정연화:', jyh ? { id: jyh.employee_id, work_days: jyh.work_days, ot: jyh.overtime_hours, base_pay: jyh.base_pay, gross_pay: jyh.gross_pay } : '❌ 결과에 없음');
  console.log('티늉:  ', tinung ? { id: tinung.employee_id, work_days: tinung.work_days, ot: tinung.overtime_hours, base_pay: tinung.base_pay, gross_pay: tinung.gross_pay } : '❌ 결과에 없음');
  // 상세: id=47, 109 검색
  const byId = (id) => (d.results||[]).find(r => r.employee_id === id);
  console.log('by id=47:', byId(47) ? 'found' : 'not found');
  console.log('by id=109:', byId(109) ? 'found' : 'not found');
  console.log('결과에 8월 재입사자 있음? (worker 이름 like %8월% 스캔 대신):');
  console.log('첫 5명:', (d.results||[]).slice(0, 5).map(r => `${r.employee_id}/${r.name}`));
}
