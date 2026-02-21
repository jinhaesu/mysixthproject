import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDB } from './db';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import attendanceRoutes from './routes/attendance';
import orgChartRoutes from './routes/orgChart';
import workforcePlanRoutes from './routes/workforcePlan';
import { requireAuth } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize database
initializeDB();

// Middleware - CORS
// FRONTEND_URL can be comma-separated for multiple origins
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
