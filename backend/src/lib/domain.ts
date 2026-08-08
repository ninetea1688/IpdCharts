import type { Borrow, MedicalRecord } from "@prisma/client";

/** ระยะเวลาผ่อนผัน (วัน) หลัง dueDate ก่อนนับเป็น "เกินกำหนด" — อ้างอิง PRD */
export const OVERDUE_GRACE_DAYS = 7;

/** สถานะที่ส่งออกผ่าน API — OVERDUE เป็น derived status จาก dueDate + grace */
export type BorrowStatusView = "ACTIVE" | "RETURNED" | "OVERDUE";
export type RecordStatusView = "AVAILABLE" | "BORROWED";

export const BORROW_STATUS_LABEL: Record<BorrowStatusView, string> = {
  ACTIVE: "อยู่ระหว่างยืม",
  RETURNED: "คืนแล้ว",
  OVERDUE: "เกินกำหนด",
};

export const RECORD_STATUS_LABEL: Record<RecordStatusView, string> = {
  AVAILABLE: "พร้อมยืม",
  BORROWED: "ถูกยืมอยู่",
};

/** แฟ้มนี้เกินกำหนดหรือไม่: เกิน dueDate + 7 วัน (นับตาม UTC, แปลงโซนที่ render) */
export function isOverdue(dueDate: Date, now: Date = new Date()): boolean {
  return now.getTime() > dueDate.getTime() + OVERDUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

export interface BorrowView {
  borrow: Borrow;
  status: BorrowStatusView;
}

/** คำนวณสถานะ view ของ borrow — ACTIVE ที่เลยกำหนด → OVERDUE */
export function toBorrowView(borrow: Borrow): BorrowView {
  const status: BorrowStatusView =
    borrow.status === "ACTIVE" && isOverdue(borrow.dueDate) ? "OVERDUE" : borrow.status;
  return { borrow, status };
}

/** สถานะแฟ้มที่ส่งออก — borrow ที่เกินกำหนดถือเป็น BORROWED เหมือนเดิม (ใช้ status ต่างหาก) */
export function toRecordStatusView(status: MedicalRecord["status"]): RecordStatusView {
  return status;
}
