/** Overdue Scanner — Cron Job ที่รันทุกชั่วโมงเพื่อแจ้งเตือนแฟ้มเกินกำหนด */

import { prisma } from "./prisma.js";
import { sendLineNotify, formatOverdueMessage, formatEscalationMessage } from "./notifications.js";
import type { OverdueAlert } from "./notifications.js";
import { OVERDUE_GRACE_DAYS } from "./domain.js";

const ESCALATION_DAYS = 14; // เกิน 14 วัน แจ้งหัวหน้า
const MAX_NOTIFICATIONS_PER_BORROW = 3; // จำกัดจำนวนแจ้งเตือนต่อรายการต่อวัน

/** เริ่มต้นวันนี้ตามโซน Asia/Bangkok — ใช้นับ quota แจ้งเตือนรายวัน */
function startOfTodayBangkok(now: Date): Date {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  bangkok.setUTCHours(0, 0, 0, 0);
  return new Date(bangkok.getTime() - 7 * 60 * 60 * 1000);
}

/** สแกนรายการที่ยืมอยู่และเกินกำหนด — ส่งแจ้งเตือน + บันทึก audit log */
export async function scanOverdueAndNotify(): Promise<{ newAlerts: number; escalated: number }> {
  const now = new Date();
  const graceMs = OVERDUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

  // หา borrow ที่ ACTIVE และ dueDate + grace < now (เกินกำหนดแล้ว)
  const overdueBorrows = await prisma.borrow.findMany({
    where: {
      status: "ACTIVE",
      dueDate: { lt: new Date(now.getTime() - graceMs) },
    },
    include: {
      medicalRecord: true,
      borrower: { include: { department: true } },
      department: true,
    },
    orderBy: { dueDate: "asc" },
  });

  if (overdueBorrows.length === 0) {
    return { newAlerts: 0, escalated: 0 };
  }

  const daysOverdueOf = (dueDate: Date): number =>
    Math.ceil((now.getTime() - dueDate.getTime() - graceMs) / 86400000);

  const toAlert = (b: (typeof overdueBorrows)[number]): OverdueAlert => ({
    hn: b.medicalRecord.hn,
    patientName: b.medicalRecord.patientName,
    borrowerName: b.borrower.fullName,
    departmentName: b.department.name,
    dueDate: b.dueDate,
    daysOverdue: daysOverdueOf(b.dueDate),
  });

  const todayStart = startOfTodayBangkok(now);
  let newAlerts = 0;

  // ---- แจ้งเตือนรายรายการ ----
  for (const borrow of overdueBorrows) {
    if (daysOverdueOf(borrow.dueDate) <= 0) continue;

    // ตรวจว่าแจ้งเตือนครบ quota ของวันนี้แล้วหรือยัง (นับจาก audit log)
    const sentToday = await prisma.auditLog.count({
      where: {
        entity: "Notification",
        entityId: String(borrow.id),
        createdAt: { gte: todayStart },
      },
    });
    if (sentToday >= MAX_NOTIFICATIONS_PER_BORROW) continue;

    const alert = toAlert(borrow);
    const sent = await sendLineNotify(formatOverdueMessage(alert));
    if (!sent) continue;

    newAlerts++;
    await prisma.auditLog.create({
      data: {
        action: "OVERDUE_NOTIFICATION",
        entity: "Notification",
        entityId: String(borrow.id),
        detail: { hn: alert.hn, daysOverdue: alert.daysOverdue, channel: "LINE", sentAt: now.toISOString() },
      },
    });
  }

  // ---- Escalation: สรุปรายการที่เกินเกณฑ์ ส่งครั้งเดียวต่อรอบ ----
  // (เดิมอยู่ใน loop แล้ว `break` ทำให้รายการที่เหลือไม่ได้รับแจ้งเตือนเลย)
  const escalations = overdueBorrows.filter((b) => daysOverdueOf(b.dueDate) >= ESCALATION_DAYS);
  let escalated = 0;

  if (escalations.length > 0) {
    const escSent = await sendLineNotify(formatEscalationMessage(escalations.map(toAlert)));
    if (escSent) {
      escalated = escalations.length;
      await prisma.auditLog.create({
        data: {
          action: "OVERDUE_ESCALATION",
          entity: "Notification",
          detail: { channel: "LINE", count: escalated, sentAt: now.toISOString() },
        },
      });
    }
  }

  return { newAlerts, escalated };
}

/** รายงานสรุปสถิติประจำวัน */
export async function generateDailySummary(): Promise<string> {
  const [totalRecords, activeBorrows, returnedToday] = await Promise.all([
    prisma.medicalRecord.count(),
    prisma.borrow.count({ where: { status: "ACTIVE" } }),
    prisma.borrow.count({
      where: {
        status: "RETURNED",
        returnedAt: { gte: startOfTodayBangkok(new Date()) },
      },
    }),
  ]);

  return `📊 สรุปประจำวัน
แฟ้มทั้งหมด: ${totalRecords}
อยู่ระหว่างยืม: ${activeBorrows}
คืนวันนี้: ${returnedToday}`;
}
