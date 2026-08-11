import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { authHeaders, createUser, resetDb, seedBase } from "./test/helpers.js";

const DAY = 24 * 60 * 60 * 1000;

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

type Headers = { authorization: string };

async function borrow(
  hn: string,
  borrowerId: number,
  headers: Headers,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/borrows",
    headers,
    payload: {
      hn,
      borrowerId,
      reason: "ตรวจสอบประวัติ",
      dueDate: new Date(Date.now() + 2 * DAY).toISOString(),
      ...overrides,
    },
  });
}

async function returnBorrow(borrowId: number, returnedById: number, headers: Headers) {
  return app.inject({
    method: "POST",
    url: `/api/v1/borrows/${borrowId}/return`,
    headers,
    payload: { returnedById },
  });
}

describe("GET /api/v1/health", () => {
  it("returns ok — ไม่ต้อง auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});

describe("การป้องกัน endpoint (auth + RBAC)", () => {
  const protectedRoutes = [
    { method: "GET" as const, url: "/api/v1/stats" },
    { method: "GET" as const, url: "/api/v1/users" },
    { method: "GET" as const, url: "/api/v1/borrows" },
    { method: "GET" as const, url: "/api/v1/medical-records" },
    { method: "GET" as const, url: "/api/v1/medical-records/1" },
    { method: "POST" as const, url: "/api/v1/borrows" },
    { method: "POST" as const, url: "/api/v1/borrows/1/return" },
  ];

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} ไม่มี token → 401`, async () => {
      const res = await app.inject({ method: route.method, url: route.url });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    });
  }

  it("BORROWER ยืมแฟ้มไม่ได้ → 403 FORBIDDEN", async () => {
    const { borrower, record } = await seedBase();
    const res = await borrow(record.hn, borrower.id, await authHeaders(borrower));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("BORROWER คืนแฟ้มไม่ได้ → 403 FORBIDDEN", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const borrowId = (await borrow(record.hn, borrower.id, staffHeaders)).json().borrow.id;

    const res = await returnBorrow(borrowId, borrower.id, await authHeaders(borrower));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("BORROWER ดูรายการยืมได้ → 200", async () => {
    const { borrower } = await seedBase();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/borrows",
      headers: await authHeaders(borrower),
    });
    expect(res.statusCode).toBe(200);
  });

  it("token ที่ผู้ใช้ถูกลบไปแล้ว → 401", async () => {
    const { staff, staffHeaders } = await seedBase();
    await prisma.user.delete({ where: { id: staff.id } });
    const res = await app.inject({ method: "GET", url: "/api/v1/stats", headers: staffHeaders });
    expect(res.statusCode).toBe(401);
  });
});

describe("ยืมแฟ้ม (POST /api/v1/borrows)", () => {
  it("happy path: ยืมสำเร็จ → 201, แฟ้มเป็น BORROWED, มี audit log ของเจ้าหน้าที่", async () => {
    const { borrower, record, staff, staffHeaders } = await seedBase();

    const res = await borrow(record.hn, borrower.id, staffHeaders);
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.borrow.status).toBe("ACTIVE");
    expect(body.borrow.statusLabel).toBe("อยู่ระหว่างยืม");
    expect(body.borrow.hn).toBe(record.hn);

    const recordRes = await app.inject({
      method: "GET",
      url: `/api/v1/medical-records/${record.id}`,
      headers: staffHeaders,
    });
    expect(recordRes.json().record.status).toBe("BORROWED");
    expect(recordRes.json().record.activeBorrow.borrower).toBe("ผู้ยืมทดสอบ");

    // actor ของ audit log ต้องเป็นเจ้าหน้าที่ที่ล็อกอิน ไม่ใช่ผู้ยืม
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "BORROW" } });
    expect(log.actorId).toBe(staff.id);
  });

  it("ยืมแฟ้มที่ถูกยืมอยู่แล้ว → 409 RECORD_NOT_AVAILABLE", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    await borrow(record.hn, borrower.id, staffHeaders);

    const res = await borrow(record.hn, borrower.id, staffHeaders);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("RECORD_NOT_AVAILABLE");
  });

  it("ยืม HN ที่ไม่มีในระบบ → 404 RECORD_NOT_FOUND", async () => {
    const { borrower, staffHeaders } = await seedBase();
    const res = await borrow("9999999999", borrower.id, staffHeaders);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("RECORD_NOT_FOUND");
  });

  it("reason ว่าง → 400 VALIDATION_ERROR", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const res = await borrow(record.hn, borrower.id, staffHeaders, { reason: "  " });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("dueDate ในอดีต → 400 INVALID_DUE_DATE", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const res = await borrow(record.hn, borrower.id, staffHeaders, {
      dueDate: new Date(Date.now() - DAY).toISOString(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_DUE_DATE");
  });

  // regression: เดิมส่ง AppError instance เข้า reply.send() ตรงๆ
  // JSON.stringify ไม่ serialize `message` ของ Error → frontend ได้แต่ข้อความ fallback
  it("error response ต้องมีข้อความภาษาไทยเสมอ ไม่ใช่แค่ code", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const res = await borrow(record.hn, borrower.id, staffHeaders, {
      dueDate: new Date(Date.now() - DAY).toISOString(),
    });
    const { error } = res.json();
    expect(error.code).toBe("INVALID_DUE_DATE");
    expect(error.message).toBe("กำหนดคืนต้องเป็นวันที่ในอนาคต");
    // ไม่ควรมี field ภายในของ Error หลุดออกไป
    expect(error.name).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
  });

  it("ผู้ยืมไม่มีหน่วยงาน → 400 BORROWER_NO_DEPARTMENT", async () => {
    const { record, staffHeaders } = await seedBase();
    const noDept = await createUser("test-nodept", "BORROWER", { fullName: "ไม่มีหน่วยงาน" });
    const res = await borrow(record.hn, noDept.id, staffHeaders);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BORROWER_NO_DEPARTMENT");
  });
});

describe("คืนแฟ้ม (POST /api/v1/borrows/:id/return)", () => {
  it("คืนผิดคน → 400 WRONG_RETURNER, แฟ้มยัง BORROWED", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const others = await createUser("test-other", "BORROWER", { fullName: "คนอื่น" });
    const borrowId = (await borrow(record.hn, borrower.id, staffHeaders)).json().borrow.id;

    const res = await returnBorrow(borrowId, others.id, staffHeaders);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("WRONG_RETURNER");

    const recordRes = await app.inject({
      method: "GET",
      url: `/api/v1/medical-records/${record.id}`,
      headers: staffHeaders,
    });
    expect(recordRes.json().record.status).toBe("BORROWED");
  });

  it("happy path: คืนโดยผู้ยืม → 200, แฟ้ม AVAILABLE, มี audit log", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const borrowId = (await borrow(record.hn, borrower.id, staffHeaders)).json().borrow.id;

    const res = await returnBorrow(borrowId, borrower.id, staffHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.json().borrow.status).toBe("RETURNED");

    const recordRes = await app.inject({
      method: "GET",
      url: `/api/v1/medical-records/${record.id}`,
      headers: staffHeaders,
    });
    expect(recordRes.json().record.status).toBe("AVAILABLE");
    expect(recordRes.json().record.activeBorrow).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "RETURN" } })).toBe(1);
  });

  it("คืนซ้ำ → 409 ALREADY_RETURNED", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const borrowId = (await borrow(record.hn, borrower.id, staffHeaders)).json().borrow.id;
    await returnBorrow(borrowId, borrower.id, staffHeaders);

    const res = await returnBorrow(borrowId, borrower.id, staffHeaders);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_RETURNED");
  });

  it("ประวัติแฟ้ม (detail) มีรายการที่คืนแล้ว แม้เป็นรายการล่าสุด", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    const borrowId = (await borrow(record.hn, borrower.id, staffHeaders)).json().borrow.id;
    await returnBorrow(borrowId, borrower.id, staffHeaders);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/medical-records/${record.id}`,
      headers: staffHeaders,
    });
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
  async function seedOverdueBorrow() {
    const base = await seedBase();
    await prisma.borrow.create({
      data: {
        medicalRecordId: base.record.id,
        borrowerId: base.borrower.id,
        departmentId: base.borrower.departmentId!,
        reason: "ตรวจสอบประวัติ",
        dueDate: new Date(Date.now() - 10 * DAY),
      },
    });
    await prisma.medicalRecord.update({
      where: { id: base.record.id },
      data: { status: "BORROWED" },
    });
    return base;
  }

  it("borrow ที่ dueDate เกิน 7 วัน → status OVERDUE ในรายการ", async () => {
    const { record, staffHeaders } = await seedOverdueBorrow();

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/borrows?status=OVERDUE",
      headers: staffHeaders,
    });
    const body = list.json();
    expect(body.borrows).toHaveLength(1);
    expect(body.borrows[0]!.hn).toBe(record.hn);
    expect(body.borrows[0]!.status).toBe("OVERDUE");
    expect(body.borrows[0]!.statusLabel).toBe("เกินกำหนด");
  });

  it("borrow ปกติไม่ติดสถานะ OVERDUE", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
    await borrow(record.hn, borrower.id, staffHeaders);

    const list = await app.inject({
      method: "GET",
      url: "/api/v1/borrows?status=OVERDUE",
      headers: staffHeaders,
    });
    expect(list.json().borrows).toHaveLength(0);
  });
});

describe("GET /api/v1/stats", () => {
  it("นับสถิติถูกต้อง (รวม overdue และคืนวันนี้)", async () => {
    const { borrower, record, staffHeaders } = await seedBase();
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
    const borrow2 = await borrow(rec2.hn, borrower.id, staffHeaders);
    expect(borrow2.statusCode).toBe(201);

    // คืน rec2 วันนี้ → returnedToday = 1
    await returnBorrow(borrow2.json().borrow.id, borrower.id, staffHeaders);

    const res = await app.inject({ method: "GET", url: "/api/v1/stats", headers: staffHeaders });
    const { stats } = res.json();
    expect(stats.totalRecords).toBe(2);
    expect(stats.available).toBe(1); // rec2 คืนแล้ว, record1 ยังถูกยืม (overdue)
    expect(stats.borrowed).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.returnedToday).toBe(1);
  });
});
