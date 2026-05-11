import dotenv from 'dotenv';
dotenv.config();

// PROCESS_TYPE 가 db.ts pool 설정을 분기시킴 (max:2, statement_timeout 60s)
process.env.PROCESS_TYPE = 'worker';

import { initializeDB, pool, dbGet } from './db';
import { startReminderService } from './services/reminderService';

console.log('=== Worker process starting ===');
console.log('PROCESS_TYPE:', process.env.PROCESS_TYPE);

initializeDB()
  .then(() => {
    console.log('[Worker] Database ready');
    startReminderService();
    console.log('[Worker] Reminder service started');
  })
  .catch((err) => {
    console.error('[Worker] Init error (continuing):', err.message);
    startReminderService();
  });

// Worker heartbeat — web 서버 pool 과 별개이므로 영향 없음.
// 5분마다 가벼운 ping 으로 worker pool warm 유지.
setInterval(async () => {
  try { await dbGet('SELECT 1'); }
  catch (e: any) { console.error('[Worker] Heartbeat error:', e.message); }
}, 5 * 60 * 1000);

process.on('unhandledRejection', (reason: any) => {
  console.error('[Worker unhandledRejection]', reason?.message || reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('[Worker uncaughtException]', err.message);
});

const shutdown = async (signal: string) => {
  console.log(`[Worker] ${signal} received, closing pool...`);
  try { await pool.end(); }
  catch (e) { console.error('[Worker] Pool close error:', e); }
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Worker 는 HTTP 서버 없음. 그냥 process 유지.
console.log('[Worker] Ready, running background timers');
