import 'dotenv/config';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'attendance-management-secret-key';
const token = jwt.sign({ type: 'auth', id: 1, email: 'ceo@joinandjoin.com', role: 'admin', name: 'CEO' }, JWT_SECRET, { expiresIn: '10m' });

const API = 'http://localhost:3099';

for (const ym of ['2026-08']) {
  const r = await fetch(`${API}/api/regular/payroll-calc?year_month=${ym}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`\n=== ${ym} HTTP ${r.status} ===`);
  if (!r.ok) { console.log(await r.text()); continue; }
  const d = await r.json();
  console.log('total results:', (d.results||[]).length);
  const byId = (id) => (d.results||[]).find(r => r.employee_id === id);
  const jyh = byId(109);
  const tinung = byId(47);
  console.log('정연화(id=109):', jyh ? { work_days: jyh.work_days, ot: jyh.overtime_hours, gross_pay: jyh.gross_pay } : '❌ 결과에 없음');
  console.log('티늉(id=47):', tinung ? { work_days: tinung.work_days, ot: tinung.overtime_hours, gross_pay: tinung.gross_pay } : '❌ 결과에 없음');
}
