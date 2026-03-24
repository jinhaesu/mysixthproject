import { dbAll, dbRun, dbGet, getKSTDate } from '../db';
import { sendSurveyMessage, sendGeneralSms } from './smsService';

const REMINDER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const THRESHOLD_HOURS = parseInt(process.env.REMINDER_THRESHOLD_HOURS || '2', 10);

async function checkAndSendReminders() {
  try {
    const today = getKSTDate();
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
    // Get tomorrow's date in KST
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    nowKst.setUTCDate(nowKst.getUTCDate() + 1);
    const tomorrowStr = nowKst.toISOString().slice(0, 10);

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

async function checkAndSendReports() {
  try {
    const now = new Date();
    // KST time (UTC+9)
    const kstHours = (now.getUTCHours() + 9) % 24;
    const kstMinutes = now.getUTCMinutes();
    const currentTime = `${String(kstHours).padStart(2, '0')}:${String(kstMinutes).padStart(2, '0')}`;

    // Match within 10-minute window
    const schedules = await dbAll('SELECT * FROM report_schedules WHERE is_active = 1');

    for (const schedule of schedules) {
      const [schedH, schedM] = schedule.time.split(':').map(Number);
      const diffMinutes = Math.abs((kstHours * 60 + kstMinutes) - (schedH * 60 + schedM));

      if (diffMinutes > 10) continue; // Changed from 5 to 10 to match interval

      // Check if today matches the repeat pattern
      const jsDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getDay(); // KST day
      const kstDayOfWeek = jsDay === 0 ? 7 : jsDay; // 1=Mon ... 7=Sun

      if (schedule.repeat_days && schedule.repeat_days !== 'daily') {
        const allowedDays = schedule.repeat_days.split(',').map(Number);
        if (!allowedDays.includes(kstDayOfWeek)) continue;
      }

      // Check if already sent in last 30 minutes
      if (schedule.last_sent_at) {
        const lastSent = new Date(schedule.last_sent_at);
        if (now.getTime() - lastSent.getTime() < 30 * 60 * 1000) continue;
      }

      // Get today's dashboard data
      const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const stats = await dbGet(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as not_clocked_in,
          SUM(CASE WHEN status = 'clock_in' THEN 1 ELSE 0 END) as clocked_in,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM survey_requests WHERE date = ?
      `, today);

      if (!stats || stats.total === 0) continue;

      const frontendUrl = process.env.FRONTEND_URL || process.env.SURVEY_BASE_URL?.replace('/s', '') || 'https://mysixthproject.vercel.app';
      const detailLink = `${frontendUrl}/report?date=${today}`;
      const message = `[조인앤조인 출퇴근 현황]\n${today} ${currentTime} 기준\n\n전체: ${stats.total}명\n출근완료: ${stats.clocked_in || 0}명\n미출근: ${stats.not_clocked_in || 0}명\n퇴근완료: ${stats.completed || 0}명\n\n상세 현황: ${detailLink}`;

      const phones = JSON.parse(schedule.phones);
      for (const phone of phones) {
        await sendGeneralSms(phone, message);
      }

      await dbRun('UPDATE report_schedules SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?', schedule.id);
      console.log(`[Report] Sent status report at ${currentTime} to ${phones.length} recipients`);
    }
  } catch (err) {
    console.error('[Report] Error:', err);
  }
}

async function checkAndSendScheduledSurveys() {
  try {
    const pending = await dbAll(`
      SELECT sr.id, sr.phone, sr.token, sr.date, sr.department, sw.name as workplace_name
      FROM survey_requests sr
      LEFT JOIN survey_workplaces sw ON sr.workplace_id = sw.id
      WHERE sr.scheduled_status = 'scheduled' AND sr.scheduled_at <= NOW()
    `);

    for (const req of pending) {
      const result = await sendSurveyMessage(req.phone, req.token, req.date, req.workplace_name || '', 'sms', req.department || '');
      if (result.success) {
        await dbRun("UPDATE survey_requests SET scheduled_status = 'sent', status = 'sent' WHERE id = ?", req.id);
      }
    }
    if (pending.length > 0) console.log(`[Scheduler] Sent ${pending.length} scheduled surveys`);
  } catch (err) {
    console.error('[Scheduler] Error checking scheduled surveys:', err);
  }
}

async function checkAndSendScheduledMessages() {
  try {
    const pending = await dbAll(`
      SELECT sm.*, sn.content as notice_content
      FROM scheduled_messages sm
      LEFT JOIN safety_notices sn ON sm.notice_id = sn.id
      WHERE sm.status = 'scheduled' AND sm.scheduled_at <= NOW()
    `);

    for (const msg of pending) {
      const phones = JSON.parse(msg.phones);
      for (const phone of phones) {
        await sendGeneralSms(phone, msg.notice_content);
      }
      await dbRun("UPDATE scheduled_messages SET status = 'sent' WHERE id = ?", msg.id);
    }
    if (pending.length > 0) console.log(`[Scheduler] Sent ${pending.length} scheduled messages`);
  } catch (err) {
    console.error('[Scheduler] Error checking scheduled messages:', err);
  }
}

export function startReminderService() {
  console.log(`[Reminder] Service started (interval: ${REMINDER_INTERVAL_MS / 60000}min, threshold: ${THRESHOLD_HOURS}h)`);
  setInterval(checkAndSendReminders, REMINDER_INTERVAL_MS);
  // Safety notice check every hour
  setInterval(checkAndSendSafetyNotices, 60 * 60 * 1000);
  // Also run once on startup (after 30 seconds delay)
  setTimeout(checkAndSendSafetyNotices, 30 * 1000);
  // Report schedule check every 10 minutes
  setInterval(checkAndSendReports, 10 * 60 * 1000);
  setTimeout(checkAndSendReports, 60 * 1000); // Run reports check 1 min after startup
  // Check scheduled items every 5 minutes
  setInterval(checkAndSendScheduledSurveys, 5 * 60 * 1000);
  setInterval(checkAndSendScheduledMessages, 5 * 60 * 1000);
}
