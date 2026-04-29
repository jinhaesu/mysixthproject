import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { initializeDB } from './db';
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/onboarding', requireAuth, onboardingRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: { manualAttendance: true }, // 배포 검증용 마커 (manual-attendance 라우트 포함)
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

// Initialize database and start server
initializeDB()
  .then(() => {
    startReminderService();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

export default app;
