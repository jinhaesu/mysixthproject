import { dbAll, dbRun } from '../db';
import { sendSurveyMessage } from './smsService';

const REMINDER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const THRESHOLD_HOURS = parseInt(process.env.REMINDER_THRESHOLD_HOURS || '2', 10);

async function checkAndSendReminders() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const threshold = new Date(Date.now() - THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    const pending = await dbAll(`
      SELECT sr.id, sr.phone, sr.token, sr.date, sw.name as workplace_name
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.date = ? AND sr.status = 'sent' AND sr.reminder_sent = 0
        AND sr.created_at < ?
    `, today, threshold);

    if (pending.length === 0) return;

    console.log(`[Reminder] Found ${pending.length} pending workers for ${today}`);

    for (const req of pending) {
      const result = await sendSurveyMessage(
        req.phone, req.token, req.date, req.workplace_name || '', 'sms'
      );
      if (result.success) {
        await dbRun(
          'UPDATE survey_requests SET reminder_sent = 1, reminder_sent_at = CURRENT_TIMESTAMP WHERE id = ?',
          req.id
        );
        console.log(`[Reminder] Sent to ${req.phone}`);
      }
    }
  } catch (err) {
    console.error('[Reminder] Error:', err);
  }
}

export function startReminderService() {
  console.log(`[Reminder] Service started (interval: ${REMINDER_INTERVAL_MS / 60000}min, threshold: ${THRESHOLD_HOURS}h)`);
  setInterval(checkAndSendReminders, REMINDER_INTERVAL_MS);
}
