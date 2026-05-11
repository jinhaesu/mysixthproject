import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { initializeDB, pool, dbGet } from './db';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import attendanceRoutes from './routes/attendance';
import orgChartRoutes from './routes/orgChart';
import workforcePlanRoutes from './routes/workforcePlan';
import surveyRoutes from './routes/survey';
import surveyPublicRoutes from './routes/surveyPublic';
import payrollRoutes from './routes/payroll';
import workersRoutes from './routes/workers';
import regularRoutes from './routes/regular';
import regularPublicRoutes from './routes/regularPublic';
import dashboardRoutes from './routes/dashboard';
import contractsRoutes from './routes/contracts';
import offboardingRoutes from './routes/offboarding';
import offboardingPublicRoutes from './routes/offboardingPublic';
import onboardingRoutes from './routes/onboarding';
import { requireAuth } from './middleware/auth';
import { startReminderService } from './services/reminderService';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware - CORS
app.use(cors({
  origin: true,
  credentials: true,
}));
// Body limit 20MB — 통장사본·외국인등록증·사직서 등 Base64 이미지/PDF 업로드 허용
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Request logging
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path} [origin: ${req.headers.origin || 'none'}]`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', requireAuth, uploadRoutes);
app.use('/api/attendance', requireAuth, attendanceRoutes);
app.use('/api/org-chart', requireAuth, orgChartRoutes);
app.use('/api/workforce-plan', requireAuth, workforcePlanRoutes);
app.use('/api/survey', requireAuth, surveyRoutes);
app.use('/api/survey-public', surveyPublicRoutes);
app.use('/api/payroll', requireAuth, payrollRoutes);
app.use('/api/workers', requireAuth, workersRoutes);
app.use('/api/regular', requireAuth, regularRoutes);
app.use('/api/regular-public', regularPublicRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/contracts', requireAuth, contractsRoutes);
app.use('/api/offboarding', requireAuth, offboardingRoutes);
app.use('/api/offboarding-public', offboardingPublicRoutes);  // no auth
app.use('/api/onboarding', requireAuth, onboardingRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.21.6',
    features: {
      manualAttendance: true,
      onboarding: true,
      offboarding: true,
      contracts: true,
      payrollPhoneMatch: true,
      tzAwareHoliday: true,
      contractDateExplicit: true,
      bodyLimit20mb: true,
      onboardingListSlim: true,
      poolHardened: true,
      onboardingSmartFields: true,
      contractLatestSignedFirst: true,
      payrollFirstMonthProrate: true,
      payrollFirstMonthAbsentToo: true,
      payrollPartialMonthSimple: true,
      payrollPartialMonthCalRatio: true,  // 입사월·퇴사월 calRatio × workRatio (window 기반)
      payrollHolidayIncludeNight: true,   // 야간 근로자 토요일 근무 시 nightH 도 holiday_hours 에 합산
      payrollAdjustment: true,            // 기타(조정) 입력 — 과지급/미지급 정산
      payrollPaymentStatus: true,         // 지급 완료 상태 추적
      nonBlockingDbInit: true,            // DB 마이그레이션 비동기 — 부팅 시 502 방지
      employeeLoans: true,                // 직원 대출 관리 + 급여대장 자동 차감
      payroll202604Backfill: true,        // 4월 v2 엑셀 마감본 1회성 기타 조정 backfill
      minWage2026: true,                  // 연장/휴일 시급 기본값 10,320 (2026 최저임금)
      payroll202604V2Backfill: true,      // 4월 v2 마감본 종합 backfill (21명)
      perEmployeeHourlyRate: true,        // 직원별 시급 편집 (테이블 내 inline + 전체 적용)
      workerHourlyRate: true,             // 알바·파견 직원별 시급 (workers.hourly_rate)
      poolTuning: true,                   // max=8, keepAlive — Supabase ECHECKOUTTIMEOUT 방지
      workersLite: true,                  // /api/workers/lite — subquery 없는 빠른 목록
      migrationGuard: true,               // 매 부팅마다 ALTER 재실행 방지 (schema_migrations 게이트)
      gracefulShutdown: true,             // SIGTERM 시 pool.end() — Supabase 누적 방지
      dbHeartbeat: true,                  // 90s 마다 SELECT 1 — Supabase auto-pause 방지
      poolErrorHandler: true,             // pool.on('error') + uncaughtException 핸들러 — Node crash 방지
      initRetry: true,                    // initializeDB 트랜지언트 EDBHANDLEREXITED 재시도
      queryRetry: true,                    // dbGet/dbAll/dbRun 모두 EDBHANDLEREXITED 자동 재시도
    },
  });
});

// MCP SSE endpoint (remote MCP server for Claude Desktop/Mobile)
import { setupMcpRoutes } from './routes/mcp';
setupMcpRoutes(app);

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

// Start server immediately — DB schema migrations run in background.
// 이전: initializeDB() 가 30s 이상 걸리면 app.listen 까지 도달 못해 Railway 502.
// 이제: 서버는 즉시 listen, 마이그레이션은 비동기로 best-effort 실행.
// 테이블/컬럼 추가는 IF NOT EXISTS 라 매 부팅마다 안전하게 재실행됨.
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

initializeDB()
  .then(() => {
    console.log('Database migrations completed');
    startReminderService();
  })
  .catch((err) => {
    console.error('Database migration failed (server still running):', err);
    // 서버는 계속 동작 — 기존 스키마로 운영 가능
    startReminderService();
  });

// Last-resort: 어떤 비동기에서 uncaught 발생해도 프로세스 죽이지 않고 로그만 남김.
// (Pool 에러는 별도로 db.ts 에서 처리하지만, fetch/timer 등 어디서든 보호.)
process.on('unhandledRejection', (reason: any) => {
  console.error('[unhandledRejection]', reason?.message || reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException]', err.message);
});

// DB Heartbeat — Supabase auto-pause/cold-start 방지.
// 첫 쿼리가 cold 일 때 30초 가까이 걸리는 현상 → 매 90초마다 가벼운 ping 으로 워밍 유지.
setInterval(async () => {
  try { await dbGet('SELECT 1'); }
  catch (e: any) { console.error('DB heartbeat error:', e.message); }
}, 90_000);

// Graceful shutdown — Railway redeploy 시 connection 정상 종료해서
// Supabase pooler 측 stale connection 누적 방지.
const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, closing pool...`);
  try { await pool.end(); console.log('Pool closed'); }
  catch (e) { console.error('Pool close error:', e); }
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
