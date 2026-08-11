/**
 * ระบบแจ้งเตือน — dispatcher ที่ส่งผ่านหลายช่องทางตาม config
 *
 * ช่องทางหลักคือ Email (SMTP) ตาม PRD ข้อ 8 และตารางความเสี่ยงที่ระบุว่า
 * "มี Email เป็นช่องทางสำรองเสมอ"
 *
 * LINE Notify ถูก LINE ปิดบริการถาวรแล้ว โค้ดเดิมจึงถูกแทนที่ด้วย LINE Messaging API
 * ซึ่งวางโครงไว้พร้อมใช้ แต่จะทำงานก็ต่อเมื่อตั้ง LINE_CHANNEL_ACCESS_TOKEN
 * และผู้ใช้มี lineUserId (ต้องให้ผู้ใช้แอดเพื่อน Official Account ก่อนจึงจะได้ userId)
 */

import nodemailer, { type Transporter } from "nodemailer";

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export type NotificationChannel = "EMAIL" | "LINE";

/** ปลายทางของผู้รับหนึ่งคน — ช่องทางไหนว่างก็ข้ามช่องทางนั้นไป */
export interface Recipient {
  fullName: string;
  email: string | null;
  lineUserId: string | null;
}

export interface NotificationMessage {
  subject: string;
  body: string;
}

export interface DeliveryResult {
  channels: NotificationChannel[];
  skippedReason?: string;
}

// ---- Email (SMTP) ----

let cachedTransport: Transporter | null = null;
let cachedTransportKey = "";

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? "IpdCharts <no-reply@ipdcharts.local>",
  };
}

/** สร้าง transporter ครั้งเดียวแล้ว cache ไว้ — สร้างใหม่ถ้า config เปลี่ยน (เช่นใน test) */
function mailTransport(): { transport: Transporter; from: string } | null {
  const cfg = smtpConfig();
  if (!cfg) return null;

  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user ?? ""}`;
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass ?? "" } } : {}),
    });
    cachedTransportKey = key;
  }
  return { transport: cachedTransport, from: cfg.from };
}

export async function sendEmail(to: string, message: NotificationMessage): Promise<boolean> {
  const mail = mailTransport();
  if (!mail) return false;

  try {
    await mail.transport.sendMail({
      from: mail.from,
      to,
      subject: message.subject,
      text: message.body,
    });
    return true;
  } catch (err) {
    console.error("[notify:email] ส่งไม่สำเร็จ:", err);
    return false;
  }
}

// ---- LINE Messaging API (เผื่อไว้ — ยังไม่ได้เปิดใช้งานจริง) ----

export async function sendLineMessage(userId: string, text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      console.error(`[notify:line] ส่งไม่สำเร็จ: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify:line] เชื่อมต่อไม่สำเร็จ:", err);
    return false;
  }
}

// ---- Dispatcher ----

/**
 * ส่งข้อความถึงผู้รับหนึ่งคนผ่านทุกช่องทางที่ตั้งค่าไว้
 * คืนรายชื่อช่องทางที่ส่งสำเร็จ — ว่างแปลว่าไม่ถึงผู้รับเลย
 */
export async function notify(to: Recipient, message: NotificationMessage): Promise<DeliveryResult> {
  const channels: NotificationChannel[] = [];

  if (to.email) {
    if (await sendEmail(to.email, message)) channels.push("EMAIL");
  }
  if (to.lineUserId) {
    if (await sendLineMessage(to.lineUserId, `${message.subject}\n\n${message.body}`)) {
      channels.push("LINE");
    }
  }

  if (channels.length > 0) return { channels };

  if (!to.email && !to.lineUserId) {
    return { channels, skippedReason: "ผู้รับไม่มีช่องทางติดต่อในระบบ" };
  }
  if (!smtpConfig() && !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return { channels, skippedReason: "ยังไม่ได้ตั้งค่าช่องทางแจ้งเตือนใดๆ (SMTP_HOST / LINE_CHANNEL_ACCESS_TOKEN)" };
  }
  return { channels, skippedReason: "ส่งไม่สำเร็จทุกช่องทาง" };
}

/** ตั้งค่าช่องทางแจ้งเตือนไว้แล้วหรือยัง — ใช้เตือนใน log ตอน start */
export function notificationChannelsConfigured(): NotificationChannel[] {
  const configured: NotificationChannel[] = [];
  if (smtpConfig()) configured.push("EMAIL");
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) configured.push("LINE");
  return configured;
}

// ---- รูปแบบข้อความ ----

export interface OverdueAlert {
  hn: string;
  patientName: string;
  borrowerName: string;
  departmentName: string;
  dueDate: Date;
  daysOverdue: number;
}

function thaiDate(d: Date): string {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(d);
}

export function formatOverdueMessage(alert: OverdueAlert): NotificationMessage {
  return {
    subject: `[เวชระเบียน] แฟ้ม HN ${alert.hn} เกินกำหนดคืน ${alert.daysOverdue} วัน`,
    body: `เรียน ${alert.borrowerName}

แฟ้มเวชระเบียนที่ท่านยืมไปเลยกำหนดคืนแล้ว

HN: ${alert.hn}
ผู้ป่วย: ${alert.patientName}
หน่วยงาน: ${alert.departmentName}
กำหนดคืน: ${thaiDate(alert.dueDate)}
เกินกำหนด: ${alert.daysOverdue} วัน

กรุณานำแฟ้มมาคืนที่ห้องเวชระเบียนโดยด่วน

อีเมลนี้ส่งอัตโนมัติจากระบบยืม-คืนเวชระเบียน กรุณาอย่าตอบกลับ`,
  };
}

export function formatEscalationMessage(
  departmentName: string,
  alerts: OverdueAlert[],
): NotificationMessage {
  const list = alerts
    .map((a) => `• HN ${a.hn} (${a.patientName}) — ${a.borrowerName} เกิน ${a.daysOverdue} วัน`)
    .join("\n");

  return {
    subject: `[เวชระเบียน] แจ้งหัวหน้าหน่วยงาน: มีแฟ้มค้างเกินเกณฑ์ ${alerts.length} รายการ`,
    body: `เรียน หัวหน้าหน่วยงาน${departmentName}

มีแฟ้มเวชระเบียนของหน่วยงานท่านค้างเกินเกณฑ์ที่กำหนด

${list}

ขอความอนุเคราะห์ติดตามผู้ยืมให้นำแฟ้มมาคืน

อีเมลนี้ส่งอัตโนมัติจากระบบยืม-คืนเวชระเบียน กรุณาอย่าตอบกลับ`,
  };
}

export function formatIncidentMessage(params: {
  hn: string;
  patientName: string;
  type: "DAMAGED" | "LOST";
  description: string;
  reportedBy: string;
}): NotificationMessage {
  const typeLabel = params.type === "LOST" ? "สูญหาย" : "ชำรุด";
  return {
    subject: `[เวชระเบียน] แจ้งแฟ้ม${typeLabel} — HN ${params.hn}`,
    body: `มีการรายงานแฟ้มเวชระเบียน${typeLabel}

HN: ${params.hn}
ผู้ป่วย: ${params.patientName}
ประเภท: ${typeLabel}
ผู้รายงาน: ${params.reportedBy}
รายละเอียด: ${params.description}

กรุณาตรวจสอบและดำเนินการติดตาม

อีเมลนี้ส่งอัตโนมัติจากระบบยืม-คืนเวชระเบียน กรุณาอย่าตอบกลับ`,
  };
}
