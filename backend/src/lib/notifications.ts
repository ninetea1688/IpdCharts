/** LINE Notify + Email notification service สำหรับแจ้งเตือน overdue */

const LINE_NOTIFY_URL = "https://notify-api.line.me/api/notify";

export interface OverdueAlert {
  hn: string;
  patientName: string;
  borrowerName: string;
  departmentName: string;
  dueDate: Date;
  daysOverdue: number;
}

/** ส่งแจ้งเตือนผ่าน LINE Notify */
export async function sendLineNotify(message: string): Promise<boolean> {
  const token = process.env.LINE_NOTIFY_TOKEN;
  if (!token) {
    console.warn("[LINE Notify] Token not configured — skipping notification");
    return false;
  }

  try {
    const res = await fetch(LINE_NOTIFY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ message }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[LINE Notify] Failed: ${res.status} ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[LINE Notify] Network error:", err);
    return false;
  }
}

/** สร้างข้อความแจ้งเตือนสำหรับ overdue */
export function formatOverdueMessage(alert: OverdueAlert): string {
  const dueThai = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  }).format(alert.dueDate);

  return `⚠️ แจ้งเตือนเวชระเบียนเกินกำหนด

HN: ${alert.hn}
ผู้ป่วย: ${alert.patientName}
ผู้ยืม: ${alert.borrowerName}
หน่วยงาน: ${alert.departmentName}
กำหนดคืน: ${dueThai}
เกินกำหนด: ${alert.daysOverdue} วัน

กรุณานำแฟ้มมาคืนที่ห้องเวชระเบียนโดยด่วน`;
}

/** ส่งแจ้งเตือนให้ผู้บริหารเมื่อเกินกำหนดนาน (escalation) */
export function formatEscalationMessage(alerts: OverdueAlert[]): string {
  const list = alerts.map((a) => `• HN ${a.hn} (${a.borrowerName}) — เกิน ${a.daysOverdue} วัน`).join("\n");

  return `🚨 รายงาน escalated — มีแฟ้มเกินกำหนดนานกว่าเกณฑ์

จำนวนรายการ: ${alerts.length}

${list}

ขอให้ติดตามผู้ยืมโดยด่วน`;
}
