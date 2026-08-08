import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { resetDb, seedBase } from "./test/helpers.js";

const DAY = 24 * 60 * 60 * 1000;

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function borrow(hn: string, borrowerId: number, overrides: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/borrows",
    payload: {
      hn,
      borrowerId,
      reason: "ตรวจสอบประวัติ",
      dueDate: new Date(Date.now() + 2 * DAY).toISOString(),
      ...overrides,
    },
  });
}

describe("GET /api/v1/health", () => {
  it("returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});

describe("ยืมแฟ้ม (POST /api/v1/borrows)", () => {
  it("happy path: ยืมสำเร็จ → 201, แฟ้มเป็น BORROWED, มี audit log", async () => {
    const { borrower, record } = await seedBase();

    const res = await borrow(record.hn, borrower.id);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.borrow.status).toBe("ACTIVE");
    expect(body.borrow.statusLabel).toBe("อยู่ระหว่างยืม");
    expect(body.borrow.hn).toBe(record.hn);

    const recordRes = await app.inject({ method: "GET", url: `/api/v1/medical-records/${record.id}` });
    expect(recordRes.json().record.status).toBe("BORROWED");
    expect(recordRes.json().record.activeBorrow.borrower).toBe("ผู้ยืมทดสอบ");

    expect(await prisma.auditLog.count({ where: { action: "BORROW" } })).toBe(1);
  });

  it("ยืมแฟ้มที่ถูกยืมอยู่แล้ว → 409 RECORD_NOT_AVAILABLE", async () => {
    const { borrower, record } = await seedBase();
    await borrow(record.hn, borrower.id);

    const res = await borrow(record.hn, borrower.id);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("RECORD_NOT_AVAILABLE");
  });

  it("ยืม HN ที่ไม่มีในระบบ → 404 RECORD_NOT_FOUND", async () => {
    const { borrower } = await seedBase();
    const res = await borrow("9999999999", borrower.id);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("RECORD_NOT_FOUND");
  });

  it("reason ว่าง → 400 VALIDATION_ERROR", async () => {
    const { borrower, record } = await seedBase();
    const res = await borrow(record.hn, borrower.id, { reason: "  " });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("dueDate ในอดีต → 400 INVALID_DUE_DATE", async () => {
    const { borrower, record } = await seedBase();
    const res = await borrow(record.hn, borrower.id, {
      dueDate: new Date(Date.now() - DAY).toISOString(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_DUE_DATE");
  });

  it("ผู้ยืมไม่มีหน่วยงาน → 400 BORROWER_NO_DEPARTMENT", async () => {
    const { record } = await seedBase();
    const noDept = await prisma.user.create({
      data: { username: "test-nodept", fullName: "ไม่มีหน่วยงาน", role: "ADMIN" },
    });
    const res = await borrow(record.hn, noDept.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BORROWER_NO_DEPARTMENT");
  });
});

describe("คืนแฟ้ม (POST /api/v1/borrows/:id/return)", () => {
  it("คืนผิดคน → 400 WRONG_RETURNER, แฟ้มยัง BORROWED", async () => {
    const { borrower, record } = await seedBase();
    const others = await prisma.user.create({
      data: { username: "test-other", fullName: "คนอื่น", role: "BORROWER" },
    });
    const borrowRes = await borrow(record.hn, borrower.id);
    const borrowId = borrowRes.json().borrow.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/return`,
      payload: { returnedById: others.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("WRONG_RETURNER");

    const recordRes = await app.inject({ method: "GET", url: `/api/v1/medical-records/${record.id}` });
    expect(recordRes.json().record.status).toBe("BORROWED");
  });

  it("happy path: คืนโดยผู้ยืม → 200, แฟ้ม AVAILABLE, มี audit log", async () => {
    const { borrower, record } = await seedBase();
    const borrowRes = await borrow(record.hn, borrower.id);
    const borrowId = borrowRes.json().borrow.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/return`,
      payload: { returnedById: borrower.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().borrow.status).toBe("RETURNED");

    const recordRes = await app.inject({ method: "GET", url: `/api/v1/medical-records/${record.id}` });
    expect(recordRes.json().record.status).toBe("AVAILABLE");
    expect(recordRes.json().record.activeBorrow).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "RETURN" } })).toBe(1);
  });

  it("คืนซ้ำ → 409 ALREADY_RETURNED", async () => {
    const { borrower, record } = await seedBase();
    const borrowRes = await borrow(record.hn, borrower.id);
    const borrowId = borrowRes.json().borrow.id;
    await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/return`,
      payload: { returnedById: borrower.id },
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/return`,
      payload: { returnedById: borrower.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_RETURNED");
  });

  it("ประวัติแฟ้ม (detail) มีรายการที่คืนแล้ว แม้เป็นรายการล่าสุด", async () => {
    const { borrower, record } = await seedBase();
    const borrowRes = await borrow(record.hn, borrower.id);
    const borrowId = borrowRes.json().borrow.id;
    await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/return`,
      payload: { returnedById: borrower.id },
    });

    const res = await app.inject({ method: "GET", url: `/api/v1/medical-records/${record.id}` });
    const body = res.json();
    expect(body.record.activeBorrow).toBeNull();
    expect(body.record.history).toHaveLength(1);
    expect(body.record.history[0]!.action).toBe("คืนแล้ว");
    expect(body.record.history[0]!.returnedBy).toBe("ผู้ยืมทดสอบ");
  });
});

describe("รายการยืม + overdue", () => {
  // สร้าง borrow เก่าที่เลยกำหนดผ่าน DB ตรงๆ (API บังคับ dueDate อนาคต —
  // overdue เกิดจากเวลาผ่านไปหลังยืม ซึ่งต้องจำลองด้วยการ insert โดยตรง)
  async function seedOverdueBorrow(hn: string) {
    const { borrower, record } = await seedBase();
    await prisma.borrow.create({
      data: {
        medicalRecordId: record.id,
        borrowerId: borrower.id,
        departmentId: borrower.departmentId!,
        reason: "ตรวจสอบประวัติ",
        dueDate: new Date(Date.now() - 10 * DAY),
      },
    });
    await prisma.medicalRecord.update({ where: { id: record.id }, data: { status: "BORROWED" } });
    return { hn: record.hn };
  }

  it("borrow ที่ dueDate เกิน 7 วัน → status OVERDUE ในรายการ", async () => {
    const { hn } = await seedOverdueBorrow("0000000123");

    const list = await app.inject({ method: "GET", url: "/api/v1/borrows?status=OVERDUE" });
    const body = list.json();
    expect(body.borrows).toHaveLength(1);
    expect(body.borrows[0]!.hn).toBe(hn);
    expect(body.borrows[0]!.status).toBe("OVERDUE");
    expect(body.borrows[0]!.statusLabel).toBe("เกินกำหนด");
  });

  it("borrow ปกติไม่ติดสถานะ OVERDUE", async () => {
    const { borrower, record } = await seedBase();
    await borrow(record.hn, borrower.id);

    const list = await app.inject({ method: "GET", url: "/api/v1/borrows?status=OVERDUE" });
    expect(list.json().borrows).toHaveLength(0);
  });
});

describe("GET /api/v1/stats", () => {
  it("นับสถิติถูกต้อง (รวม overdue และคืนวันนี้)", async () => {
    const { borrower, record } = await seedBase();
    // 1 overdue (insert ตรงๆ ผ่าน DB) + 1 ปกติ (ผ่าน API) → ถูกยืม 2 รายการ
    await prisma.borrow.create({
      data: {
        medicalRecordId: record.id,
        borrowerId: borrower.id,
        departmentId: borrower.departmentId!,
        reason: "ตรวจสอบประวัติ",
        dueDate: new Date(Date.now() - 10 * DAY),
      },
    });
    await prisma.medicalRecord.update({ where: { id: record.id }, data: { status: "BORROWED" } });
    const rec2 = await prisma.medicalRecord.create({
      data: { hn: "0000000124", patientName: "ผู้ป่วยทดสอบ 2" },
    });
    const borrow2 = await borrow(rec2.hn, borrower.id);
    expect(borrow2.statusCode).toBe(201);

    // คืน rec2 วันนี้ → returnedToday = 1
    const borrowId2 = borrow2.json().borrow.id;
    await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId2}/return`,
      payload: { returnedById: borrower.id },
    });

    const res = await app.inject({ method: "GET", url: "/api/v1/stats" });
    const { stats } = res.json();
    expect(stats.totalRecords).toBe(2);
    expect(stats.available).toBe(1); // rec2 คืนแล้ว, record1 ยังถูกยืม (overdue)
    expect(stats.borrowed).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.returnedToday).toBe(1);
  });
});
