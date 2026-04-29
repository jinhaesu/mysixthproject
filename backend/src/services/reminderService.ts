import { dbAll, dbRun, dbGet, getKSTDate, getFrontendUrl } from '../db';
import { sendSurveyMessage, sendGeneralSms } from './smsService';
import { Resend } from 'resend';

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

      const detailLink = getFrontendUrl(`/report?date=${today}`);
      const message = `[조인앤조인 알바/파견 출퇴근 현황]\n${today} ${currentTime} 기준\n\n전체: ${stats.total}명\n출근완료: ${stats.clocked_in || 0}명\n미출근: ${stats.not_clocked_in || 0}명\n퇴근완료: ${stats.completed || 0}명\n\n상세 현황: ${detailLink}`;

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

// ===== Regular Employee Report Schedule =====
async function checkAndSendRegularReports() {
  try {
    const now = new Date();
    const kstHours = (now.getUTCHours() + 9) % 24;
    const kstMinutes = now.getUTCMinutes();
    const currentTime = `${String(kstHours).padStart(2, '0')}:${String(kstMinutes).padStart(2, '0')}`;

    const schedules = await dbAll('SELECT * FROM regular_report_schedules WHERE is_active = 1');

    for (const schedule of schedules as any[]) {
      const [schedH, schedM] = schedule.time.split(':').map(Number);
      const diffMinutes = Math.abs((kstHours * 60 + kstMinutes) - (schedH * 60 + schedM));

      if (diffMinutes > 10) continue;

      // Check day of week
      const jsDay = new Date(now.getTime() + 9 * 60 * 60 * 1000).getDay();
      const kstDayOfWeek = jsDay === 0 ? 7 : jsDay; // 1=Mon ... 7=Sun

      if (schedule.repeat_days && schedule.repeat_days !== 'daily') {
        const allowedDays = schedule.repeat_days.split(',').map(Number);
        if (!allowedDays.includes(kstDayOfWeek)) continue;
      }

      // Prevent duplicate sends within 30 min
      if (schedule.last_sent_at) {
        const lastSent = new Date(schedule.last_sent_at);
        if (now.getTime() - lastSent.getTime() < 30 * 60 * 1000) continue;
      }

      const today = getKSTDate();
      const stats = await dbGet(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN ra.clock_in_time IS NOT NULL AND ra.clock_out_time IS NULL THEN 1 ELSE 0 END) as clocked_in,
          SUM(CASE WHEN ra.clock_out_time IS NOT NULL THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN ra.clock_in_time IS NULL THEN 1 ELSE 0 END) as not_clocked_in
        FROM regular_employees re
        LEFT JOIN regular_attendance ra ON re.id = ra.employee_id AND ra.date = ?
        WHERE re.is_active = 1
      `, today) as any;

      if (!stats || stats.total === 0) continue;

      const detailLink = getFrontendUrl(`/report-regular?date=${today}`);
      const message = `[조인앤조인 정규직 출퇴근 현황]\n${today} ${currentTime} 기준\n\n전체: ${stats.total}명\n출근중: ${stats.clocked_in || 0}명\n미출근: ${stats.not_clocked_in || 0}명\n퇴근완료: ${stats.completed || 0}명\n\n상세 현황: ${detailLink}`;

      const phones = JSON.parse(schedule.phones);
      for (const phone of phones) {
        await sendGeneralSms(phone, message);
      }

      await dbRun('UPDATE regular_report_schedules SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?', schedule.id);
      console.log(`[RegularReport] Sent at ${currentTime} to ${phones.length} recipients`);
    }
  } catch (err) {
    console.error('[RegularReport] Error:', err);
  }
}

// ===== Auto Vacation Balance Update (Korean Labor Law) =====
let lastVacationCheckDate = '';

// Count completed full months from hireDate to today
function countCompletedMonths(hireDate: Date, today: Date): number {
  let months = 0;
  const cur = new Date(hireDate);
  while (true) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
    if (next > today) break;
    months++;
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

async function checkAndUpdateVacationBalances() {
  try {
    const today = getKSTDate();
    // Run once per day only
    if (today === lastVacationCheckDate) return;
    lastVacationCheckDate = today;

    const currentYear = parseInt(today.slice(0, 4));
    const todayDate = new Date(today + 'T00:00:00+09:00');

    const employees = await dbAll('SELECT id, hire_date, name FROM regular_employees WHERE is_active = 1') as any[];
    let updated = 0;

    for (const emp of employees) {
      if (!emp.hire_date) continue;

      const hireDate = new Date(emp.hire_date + 'T00:00:00+09:00');
      const msWorked = todayDate.getTime() - hireDate.getTime();
      if (msWorked < 0) continue;

      const daysWorked = msWorked / (24 * 60 * 60 * 1000);
      const yearsWorked = daysWorked / 365.25;

      let totalDays: number;

      if (yearsWorked < 1) {
        // 1년 미만: 입사일~오늘 기준 완전한 달 수 (월 1개, 최대 11)
        totalDays = Math.min(countCompletedMonths(hireDate, todayDate), 11);
      } else {
        const fullYears = Math.floor(yearsWorked);
        if (fullYears < 3) {
          totalDays = 15;
        } else {
          const extraDays = Math.floor((fullYears - 1) / 2);
          totalDays = Math.min(15 + extraDays, 25);
        }
      }

      const balance = await dbGet(
        'SELECT * FROM regular_vacation_balances WHERE employee_id = ? AND year = ?',
        emp.id, currentYear
      ) as any;

      if (balance) {
        const prevDays = parseFloat(balance.total_days);
        if (prevDays !== totalDays) {
          await dbRun(
            'UPDATE regular_vacation_balances SET total_days = ?, updated_at = NOW() WHERE id = ?',
            totalDays, balance.id
          );
          // Log the change
          const reason = yearsWorked < 1
            ? `1년 미만 월차 발생 (${countCompletedMonths(hireDate, todayDate)}개월 경과)`
            : `근속 ${Math.floor(yearsWorked)}년 연차`;
          await dbRun(
            'INSERT INTO vacation_update_logs (employee_id, employee_name, action, prev_days, new_days, reason) VALUES (?, ?, ?, ?, ?, ?)',
            emp.id, emp.name, '자동갱신', prevDays, totalDays, reason
          );
          updated++;
          console.log(`[Vacation] ${emp.name}: ${prevDays} → ${totalDays}일 (${reason})`);
        }
      } else {
        await dbRun(
          'INSERT INTO regular_vacation_balances (employee_id, year, total_days) VALUES (?, ?, ?)',
          emp.id, currentYear, totalDays
        );
        const reason = yearsWorked < 1
          ? `신규 등록 - 1년 미만 ${countCompletedMonths(hireDate, todayDate)}개월 경과`
          : `신규 등록 - 근속 ${Math.floor(yearsWorked)}년`;
        await dbRun(
          'INSERT INTO vacation_update_logs (employee_id, employee_name, action, prev_days, new_days, reason) VALUES (?, ?, ?, ?, ?, ?)',
          emp.id, emp.name, '신규생성', 0, totalDays, reason
        );
        updated++;
        console.log(`[Vacation] ${emp.name}: 신규 ${totalDays}일 (${reason})`);
      }
    }

    if (updated > 0) {
      console.log(`[Vacation] Auto-updated ${updated} employees for ${today}`);
    }
  } catch (err) {
    console.error('[Vacation] Auto-update error:', err);
  }
}

// ===== Offboarding Deadline Reminders =====
// Tracks the last date we ran the offboarding check (once per calendar day)
let lastOffboardingReminderDate = '';

async function sendOffboardingReminderEmail(
  record: any,
  daysToDeadline: number,
  recipients: string[],
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const systemUrl = getFrontendUrl(`/offboarding/${record.id}`);

  const subject = `[퇴사 D-${daysToDeadline} 알림] ${record.employee_name} — 자격 상실신고 마감 임박`;

  // Build incomplete items list
  const checklist: string[] = [];
  if (!record.resignation_letter_received) checklist.push('사직서 수령');
  if (!record.assets_returned) checklist.push('자산 반납');
  if (!record.pension_reported) checklist.push('국민연금 상실신고');
  if (!record.health_insurance_reported) checklist.push('건강보험 상실신고');
  if (!record.employment_insurance_reported) checklist.push('고용보험 상실신고');
  if (!record.industrial_accident_reported) checklist.push('산재보험 상실신고');
  if (!record.severance_paid) checklist.push('퇴직금 지급');
  if (!record.annual_leave_settled) checklist.push('연차수당 정산');
  if (!record.income_tax_reported) checklist.push('퇴직소득 원천세 신고');

  const checklistHtml =
    checklist.length > 0
      ? `<ul>${checklist.map((item) => `<li>${item}</li>`).join('')}</ul>`
      : '<p>모든 항목이 완료되었습니다.</p>';

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Apple SD Gothic Neo', '맑은 고딕', sans-serif; color: #1f2937; background: #f9fafb; margin: 0; padding: 20px; }
    .container { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #dc2626; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; font-size: 14px; opacity: 0.85; }
    .body { padding: 28px 32px; }
    table.info { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    table.info th { background: #fee2e2; color: #dc2626; text-align: left; padding: 8px 12px; font-size: 13px; width: 130px; }
    table.info td { padding: 8px 12px; font-size: 14px; border-bottom: 1px solid #e5e7eb; }
    .section-title { font-size: 15px; font-weight: 700; color: #dc2626; margin: 24px 0 12px; border-left: 4px solid #ef4444; padding-left: 10px; }
    ul { margin: 0; padding-left: 20px; }
    ul li { padding: 4px 0; font-size: 14px; color: #374151; }
    .btn { display: inline-block; background: #dc2626; color: #fff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; margin-top: 20px; }
    .footer { background: #f3f4f6; padding: 16px 32px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>[퇴사 D-${daysToDeadline} 알림] 자격 상실신고 마감 임박</h1>
    <p>${record.employee_name} — 퇴직일 ${record.resign_date}</p>
  </div>
  <div class="body">
    <p style="font-size:14px; color:#374151;">
      아래 직원의 4대보험 자격 상실신고 마감이 <strong>D-${daysToDeadline}</strong>입니다. 즉시 확인해 주세요.
    </p>

    <div class="section-title">직원 정보</div>
    <table class="info">
      <tr><th>이름</th><td>${record.employee_name}</td></tr>
      <tr><th>부서</th><td>${record.department || '-'}</td></tr>
      <tr><th>퇴직일</th><td>${record.resign_date}</td></tr>
      <tr><th>자격 상실일</th><td>${record.loss_date || '-'}</td></tr>
      <tr><th>상실사유코드</th><td>${record.reason_code || '-'}</td></tr>
      <tr><th>처리상태</th><td>${record.status}</td></tr>
    </table>

    <div class="section-title">미완료 항목 (${checklist.length}건)</div>
    ${checklistHtml}

    <a href="${systemUrl}" class="btn">시스템에서 처리하기 →</a>
  </div>
  <div class="footer">
    이 메일은 퇴사관리 시스템에서 자동 발송되었습니다. | 조인앤조인
  </div>
</div>
</body>
</html>
  `.trim();

  if (!apiKey) {
    console.log(`[OffboardingReminder MOCK] Subject: ${subject}`);
    console.log(`[OffboardingReminder MOCK] To: ${recipients.join(', ')}`);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `퇴사관리시스템 <${fromEmail}>`,
      to: recipients,
      subject,
      html,
    });
    if (error) {
      console.error('[OffboardingReminder] Resend error:', error);
    } else {
      console.log(`[OffboardingReminder] Sent to ${recipients.join(', ')} for ${record.employee_name} (D-${daysToDeadline})`);
    }
  } catch (err) {
    console.error('[OffboardingReminder] Unexpected error:', err);
  }
}

async function checkAndSendOffboardingReminders(): Promise<void> {
  try {
    const today = getKSTDate();

    // Gate: run once per calendar day
    if (today === lastOffboardingReminderDate) return;
    lastOffboardingReminderDate = today;

    // Get email recipients
    const row = await dbGet(
      "SELECT value FROM admin_settings WHERE key = 'offboarding_email_recipients'",
    );
    let recipients: string[] = [];
    if (row) {
      try {
        const parsed = JSON.parse(row.value);
        recipients = Array.isArray(parsed.emails) ? parsed.emails : [];
      } catch {
        recipients = [];
      }
    }

    if (recipients.length === 0) {
      console.log('[OffboardingReminder] No recipients configured — skipping');
      return;
    }

    // Find in_progress records where D-3 to D-0 and not yet reminded today
    const pending = await dbAll(`
      SELECT *,
        (14 - EXTRACT(DAY FROM (NOW() - resign_date::date))::int) AS days_to_loss_deadline
      FROM employee_offboardings
      WHERE status = 'in_progress'
        AND (14 - EXTRACT(DAY FROM (NOW() - resign_date::date))::int) BETWEEN 0 AND 3
        AND (last_reminder_sent_at IS NULL OR last_reminder_sent_at::date < CURRENT_DATE)
    `);

    if (pending.length === 0) {
      console.log(`[OffboardingReminder] No deadline-imminent records for ${today}`);
      return;
    }

    console.log(`[OffboardingReminder] Found ${pending.length} record(s) needing reminders for ${today}`);

    for (const record of pending) {
      const daysToDeadline = Number(record.days_to_loss_deadline);
      await sendOffboardingReminderEmail(record, daysToDeadline, recipients);
      await dbRun(
        'UPDATE employee_offboardings SET last_reminder_sent_at = NOW() WHERE id = ?',
        record.id,
      );
    }
  } catch (err) {
    console.error('[OffboardingReminder] Error:', err);
  }
}

// TODO: Onboarding reminder stub — send reminder to recipients for 'ready' employees
// not yet emailed (onboarding_email_sent=0) and created within last 7 days.
// async function checkAndSendOnboardingReminders(): Promise<void> {
//   // TODO Phase 3: implement
// }

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
  // Regular employee report schedules - check every 10 minutes
  setInterval(checkAndSendRegularReports, 10 * 60 * 1000);
  setTimeout(checkAndSendRegularReports, 90 * 1000); // 1.5 min after startup
  // Vacation balance auto-update: check every hour, runs once per day
  setInterval(checkAndUpdateVacationBalances, 60 * 60 * 1000);
  setTimeout(checkAndUpdateVacationBalances, 2 * 60 * 1000); // 2 min after startup
  // Offboarding deadline reminders: check every hour, runs once per calendar day
  setInterval(checkAndSendOffboardingReminders, 60 * 60 * 1000);
  setTimeout(checkAndSendOffboardingReminders, 3 * 60 * 1000); // 3 min after startup
}
