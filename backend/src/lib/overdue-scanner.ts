/** Overdue Scanner — Cron Job ที่รันทุกชั่วโมงเพื่อแจ้งเตือนแฟ้มเกินกำหนด */

import { prisma } from "./prisma.js";
import {
  notify,
  formatOverdueMessage,
  formatEscalationMessage,
  type OverdueAlert,
  type Recipient,
} from "./notifications.js";
import { OVERDUE_GRACE_DAYS } from "./domain.js";

const ESCALATION_DAYS = 14; // เกินกำหนด 14 วัน แจ้งหัวหน้าหน่วยงาน
const MAX_NOTIFICATIONS_PER_BORROW = 3; // จำกัดจำนวนแจ้งเตือนต่อรายการต่อวัน

/** เริ่มต้นวันนี้ตามโซน Asia/Bangkok — ใช้นับ quota แจ้งเตือนรายวัน */
function startOfTodayBangkok(now: Date): Date {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  bangkok.setUTCHours(0, 0, 0, 0);
  return new Date(bangkok.getTime() - 7 * 60 * 60 * 1000);
}

export interface ScanResult {
  /** จำนวนรายการที่ส่งแจ้งเตือนถึงผู้ยืมสำเร็จ */
  newAlerts: number;
  /** จำนวนรายการที่ถูกรวมอยู่ใน escalation ที่ส่งสำเร็จ */
  escalated: number;
  /** รายการที่เข้าเกณฑ์แต่ส่งไม่ได้ (ไม่มีอีเมล / SMTP ล่ม) — ต้องตามด้วยมือ */
  undeliverable: number;
}

/** สแกนรายการที่ยืมอยู่และเกินกำหนด — ส่งแจ้งเตือน + บันทึก audit log */
export async function scanOverdueAndNotify(now: Date = new Date()): Promise<ScanResult> {
  const graceMs = OVERDUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

  // เฉพาะรายการที่จ่ายแฟ้มออกไปแล้ว (ACTIVE) — รายการที่รออนุมัติยังไม่ถือว่าเกินกำหนด
  // และข้ามแฟ้มที่แจ้งชำรุด/สูญหายไปแล้ว เพราะมี incident ติดตามแทน การทวงคืนไม่มีประโยชน์
  const overdueBorrows = await prisma.borrow.findMany({
    where: {
      status: "ACTIVE",
      dueDate: { lt: new Date(now.getTime() - graceMs) },
      medicalRecord: { status: { notIn: ["DAMAGED", "LOST"] } },
    },
    include: {
      medicalRecord: true,
      borrower: true,
      department: true,
    },
    orderBy: { dueDate: "asc" },
  });

  if (overdueBorrows.length === 0) {
    return { newAlerts: 0, escalated: 0, undeliverable: 0 };
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
  let undeliverable = 0;

  // ---- แจ้งเตือนผู้ยืมเป็นรายคน ----
  for (const borrow of overdueBorrows) {
    if (daysOverdueOf(borrow.dueDate) <= 0) continue;

    const sentToday = await prisma.auditLog.count({
      where: {
        entity: "Notification",
        entityId: String(borrow.id),
        createdAt: { gte: todayStart },
      },
    });
    if (sentToday >= MAX_NOTIFICATIONS_PER_BORROW) continue;

    const alert = toAlert(borrow);
    const recipient: Recipient = {
      fullName: borrow.borrower.fullName,
      email: borrow.borrower.email,
      lineUserId: borrow.borrower.lineUserId,
    };
    const result = await notify(recipient, formatOverdueMessage(alert));

    if (result.channels.length === 0) {
      undeliverable++;
      console.warn(
        `[overdue-scanner] ส่งแจ้งเตือน HN ${alert.hn} ถึง ${alert.borrowerName} ไม่ได้: ${result.skippedReason}`,
      );
      continue;
    }

    newAlerts++;
    await prisma.auditLog.create({
      data: {
        action: "OVERDUE_NOTIFICATION",
        entity: "Notification",
        entityId: String(borrow.id),
        detail: {
          hn: alert.hn,
          daysOverdue: alert.daysOverdue,
          borrowerId: borrow.borrowerId,
          channels: result.channels,
          sentAt: now.toISOString(),
        },
      },
    });
  }

  // ---- Escalation: รวมตามหน่วยงาน ส่งถึงหัวหน้าหน่วยงานนั้น ----
  const escalations = overdueBorrows.filter((b) => daysOverdueOf(b.dueDate) >= ESCALATION_DAYS);
  let escalated = 0;

  if (escalations.length > 0) {
    const byDepartment = new Map<number, typeof escalations>();
    for (const b of escalations) {
      const bucket = byDepartment.get(b.departmentId);
      if (bucket) bucket.push(b);
      else byDepartment.set(b.departmentId, [b]);
    }

    for (const [departmentId, borrows] of byDepartment) {
      const departmentName = borrows[0]!.department.name;

      // หัวหน้าหน่วยงานนั้น — ถ้าไม่มี ให้ตกไปที่เจ้าหน้าที่เวชระเบียน (ADMIN)
      const heads = await prisma.user.findMany({
        where: { role: "DEPARTMENT_HEAD", departmentId, active: true },
      });
      const receivers =
        heads.length > 0 ? heads : await prisma.user.findMany({ where: { role: "ADMIN", active: true } });

      const message = formatEscalationMessage(departmentName, borrows.map(toAlert));
      const deliveredTo: string[] = [];

      for (const receiver of receivers) {
        const result = await notify(
          { fullName: receiver.fullName, email: receiver.email, lineUserId: receiver.lineUserId },
          message,
        );
        if (result.channels.length > 0) deliveredTo.push(receiver.username);
      }

      if (deliveredTo.length === 0) {
        console.warn(
          `[overdue-scanner] ส่ง escalation ของหน่วยงาน${departmentName} ไม่ได้ — ไม่มีผู้รับที่ติดต่อได้`,
        );
        continue;
      }

      escalated += borrows.length;
      await prisma.auditLog.create({
        data: {
          action: "OVERDUE_ESCALATION",
          entity: "Notification",
          entityId: String(departmentId),
          detail: {
            departmentName,
            count: borrows.length,
            deliveredTo,
            sentAt: now.toISOString(),
          },
        },
      });
    }
  }

  return { newAlerts, escalated, undeliverable };
}

/** รายงานสรุปสถิติประจำวัน */
export async function generateDailySummary(): Promise<string> {
  const [totalRecords, activeBorrows, returnedToday, openIncidents] = await Promise.all([
    prisma.medicalRecord.count(),
    prisma.borrow.count({ where: { status: "ACTIVE" } }),
    prisma.borrow.count({
      where: { status: "RETURNED", returnedAt: { gte: startOfTodayBangkok(new Date()) } },
    }),
    prisma.incident.count({ where: { status: "OPEN" } }),
  ]);

  return `📊 สรุปประจำวัน
แฟ้มทั้งหมด: ${totalRecords}
อยู่ระหว่างยืม: ${activeBorrows}
คืนวันนี้: ${returnedToday}
เหตุการณ์ชำรุด/สูญหายที่ยังไม่ปิด: ${openIncidents}`;
}
