import type { Borrow, MedicalRecord } from "@prisma/client";

/** ระยะเวลาผ่อนผัน (วัน) หลัง dueDate ก่อนนับเป็น "เกินกำหนด" — อ้างอิง PRD */
export const OVERDUE_GRACE_DAYS = 7;

/** สถานะที่ส่งออกผ่าน API — OVERDUE เป็น derived status จาก dueDate + grace */
export type BorrowStatusView = "PENDING_APPROVAL" | "ACTIVE" | "RETURNED" | "REJECTED" | "OVERDUE";
export type RecordStatusView = "AVAILABLE" | "BORROWED" | "DAMAGED" | "LOST";

export const BORROW_STATUS_LABEL: Record<BorrowStatusView, string> = {
  PENDING_APPROVAL: "รออนุมัติ",
  ACTIVE: "อยู่ระหว่างยืม",
  RETURNED: "คืนแล้ว",
  REJECTED: "ไม่อนุมัติ",
  OVERDUE: "เกินกำหนด",
};

export const RECORD_STATUS_LABEL: Record<RecordStatusView, string> = {
  AVAILABLE: "พร้อมยืม",
  BORROWED: "ถูกยืมอยู่",
  DAMAGED: "ชำรุด",
  LOST: "สูญหาย",
};

export const INCIDENT_TYPE_LABEL = {
  DAMAGED: "ชำรุด",
  LOST: "สูญหาย",
} as const;

export const INCIDENT_STATUS_LABEL = {
  OPEN: "รอดำเนินการ",
  RESOLVED: "ปิดเรื่องแล้ว",
} as const;

/** แฟ้มนี้เกินกำหนดหรือไม่: เกิน dueDate + 7 วัน (นับตาม UTC, แปลงโซนที่ render) */
export function isOverdue(dueDate: Date, now: Date = new Date()): boolean {
  return now.getTime() > dueDate.getTime() + OVERDUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export interface BorrowView {
  borrow: Borrow;
  status: BorrowStatusView;
}

/** คำนวณสถานะ view ของ borrow — เฉพาะ ACTIVE ที่เลยกำหนดจึงกลายเป็น OVERDUE */
export function toBorrowView(borrow: Borrow): BorrowView {
  const status: BorrowStatusView =
    borrow.status === "ACTIVE" && isOverdue(borrow.dueDate) ? "OVERDUE" : borrow.status;
  return { borrow, status };
}

/** แฟ้มพร้อมให้ยืมหรือไม่ — ชำรุด/สูญหายยืมไม่ได้ */
export function isRecordBorrowable(status: MedicalRecord["status"]): boolean {
  return status === "AVAILABLE";
}
