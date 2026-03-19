import { dbAll, dbRun, dbGet } from '../db';
import { sendSurveyMessage, sendGeneralSms } from './smsService';

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

async function checkAndSendSafetyNotices() {
  try {
    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Check if there are workers scheduled for tomorrow who haven't received a safety notice
    const workers = await dbAll(`
      SELECT DISTINCT sr.phone
      FROM survey_requests sr
      WHERE sr.date = ? AND sr.status = 'sent'
        AND sr.phone NOT IN (
          SELECT phone FROM safety_notice_log WHERE date = ?
        )
    `, tomorrowStr, tomorrowStr);

    if (workers.length === 0) return;

    // Get the first active safety notice
    const notice = await dbGet('SELECT * FROM safety_notices WHERE is_active = 1 ORDER BY id LIMIT 1');
    if (!notice) return;

    console.log(`[SafetyNotice] Sending to ${workers.length} workers for ${tomorrowStr}`);

    for (const w of workers) {
      const result = await sendGeneralSms(w.phone, notice.content);
      if (result.success) {
        await dbRun(
          'INSERT INTO safety_notice_log (phone, date, notice_id) VALUES (?, ?, ?)',
          w.phone, tomorrowStr, notice.id
        );
        console.log(`[SafetyNotice] Sent to ${w.phone}`);
      }
    }
  } catch (err) {
    console.error('[SafetyNotice] Error:', err);
  }
}

export function startReminderService() {
  console.log(`[Reminder] Service started (interval: ${REMINDER_INTERVAL_MS / 60000}min, threshold: ${THRESHOLD_HOURS}h)`);
  setInterval(checkAndSendReminders, REMINDER_INTERVAL_MS);
  // Safety notice check every hour
  setInterval(checkAndSendSafetyNotices, 60 * 60 * 1000);
  // Also run once on startup (after 30 seconds delay)
  setTimeout(checkAndSendSafetyNotices, 30 * 1000);
}
