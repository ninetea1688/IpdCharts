import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { authHeaders, createUser, resetDb, seedBase } from "./test/helpers.js";
import { scanOverdueAndNotify } from "./lib/overdue-scanner.js";

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

function futureDue(days = 2): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

async function createBorrow(
  headers: Headers,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: any }> {
  const res = await app.inject({ method: "POST", url: "/api/v1/borrows", headers, payload });
  return { statusCode: res.statusCode, body: res.json() };
}

async function recordStatus(id: number): Promise<string> {
  return (await prisma.medicalRecord.findUniqueOrThrow({ where: { id } })).status;
}

// ---------------------------------------------------------------------------
// FR-03 — Workflow อนุมัติกรณีพิเศษ
// ---------------------------------------------------------------------------

describe("FR-03 อนุมัติคำขอยืมกรณีพิเศษ", () => {
  async function seedPending() {
    const base = await seedBase();
    const head = await createUser("test-head", "DEPARTMENT_HEAD", {
      fullName: "หัวหน้าทดสอบ",
      departmentId: base.dept.id,
    });
    const created = await createBorrow(base.staffHeaders, {
      hn: base.record.hn,
      borrowerId: base.borrower.id,
      reason: "ยืมออกนอกโรงพยาบาล",
      dueDate: futureDue(),
      requiresApproval: true,
    });
    return { ...base, head, headHeaders: await authHeaders(head), borrowId: created.body.borrow.id };
  }

  it("คำขอที่ต้องอนุมัติ → PENDING_APPROVAL และแฟ้มยังไม่ถูกจ่ายออก", async () => {
    const { record, borrowId } = await seedPending();

    const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id: borrowId } });
    expect(borrow.status).toBe("PENDING_APPROVAL");
    expect(borrow.requiresApproval).toBe(true);
    // แฟ้มต้องยังว่างอยู่ เพราะยังไม่ได้จ่ายให้ผู้ยืม
    expect(await recordStatus(record.id)).toBe("AVAILABLE");
  });

  it("แฟ้มที่มีคำขอค้างอยู่ ยืมซ้ำไม่ได้ → 409", async () => {
    const { record, borrower, staffHeaders } = await seedPending();

    const res = await createBorrow(staffHeaders, {
      hn: record.hn,
      borrowerId: borrower.id,
      reason: "ยืมปกติ",
      dueDate: futureDue(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe("RECORD_NOT_AVAILABLE");
  });

  it("หัวหน้าหน่วยงานอนุมัติ → ACTIVE, แฟ้มเป็น BORROWED, มีผู้อนุมัติ", async () => {
    const { record, borrowId, headHeaders, head } = await seedPending();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/approve`,
      headers: headHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().borrow.status).toBe("ACTIVE");
    expect(res.json().borrow.approvedBy).toBe("หัวหน้าทดสอบ");

    expect(await recordStatus(record.id)).toBe("BORROWED");
    const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id: borrowId } });
    expect(borrow.approvedById).toBe(head.id);
    expect(borrow.approvedAt).not.toBeNull();
  });

  it("ผู้ยืมทั่วไปอนุมัติไม่ได้ → 403", async () => {
    const { borrowId, borrower } = await seedPending();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/approve`,
      headers: await authHeaders(borrower),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
  });

  it("หัวหน้าหน่วยงานอื่นอนุมัติไม่ได้ → 403 APPROVER_WRONG_DEPARTMENT", async () => {
    const { borrowId } = await seedPending();
    const otherDept = await prisma.department.create({ data: { name: "อายุรกรรม (test)" } });
    const otherHead = await createUser("test-head2", "DEPARTMENT_HEAD", {
      departmentId: otherDept.id,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/approve`,
      headers: await authHeaders(otherHead),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("APPROVER_WRONG_DEPARTMENT");
  });

  it("ไม่อนุมัติ → REJECTED พร้อมเหตุผล และแฟ้มยังว่าง", async () => {
    const { record, borrowId, headHeaders } = await seedPending();

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/reject`,
      headers: headHeaders,
      payload: { reason: "ไม่มีเอกสารรับรอง" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().borrow.status).toBe("REJECTED");
    expect(res.json().borrow.rejectedReason).toBe("ไม่มีเอกสารรับรอง");
    expect(await recordStatus(record.id)).toBe("AVAILABLE");
  });

  it("ไม่อนุมัติโดยไม่ระบุเหตุผล → 400", async () => {
    const { borrowId, headHeaders } = await seedPending();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/reject`,
      headers: headHeaders,
      payload: { reason: "  " },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("กรุณาระบุเหตุผลที่ไม่อนุมัติ");
  });

  it("อนุมัติซ้ำ → 409 NOT_PENDING_APPROVAL", async () => {
    const { borrowId, headHeaders } = await seedPending();
    await app.inject({ method: "POST", url: `/api/v1/borrows/${borrowId}/approve`, headers: headHeaders });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/approve`,
      headers: headHeaders,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_PENDING_APPROVAL");
  });

  it("คืนแฟ้มที่ยังไม่อนุมัติ → 409 NOT_APPROVED", async () => {
    const { borrowId, borrower, staffHeaders } = await seedPending();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${borrowId}/return`,
      headers: staffHeaders,
      payload: { returnedById: borrower.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("NOT_APPROVED");
  });

  it("กรองรายการด้วย status=PENDING_APPROVAL ได้", async () => {
    const { staffHeaders } = await seedPending();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/borrows?status=PENDING_APPROVAL",
      headers: staffHeaders,
    });
    expect(res.json().borrows).toHaveLength(1);
    expect(res.json().borrows[0].statusLabel).toBe("รออนุมัติ");
  });
});

// ---------------------------------------------------------------------------
// FR-05 — แฟ้มชำรุด / สูญหาย
// ---------------------------------------------------------------------------

describe("FR-05 แฟ้มชำรุด/สูญหาย", () => {
  it("รายงานแฟ้มสูญหาย → แฟ้มเป็น LOST และเปิดเรื่องไว้", async () => {
    const { record, staffHeaders } = await seedBase();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "LOST", description: "หาที่หอผู้ป่วยแล้วไม่พบ" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().incident.type).toBe("LOST");
    expect(res.json().incident.statusLabel).toBe("รอดำเนินการ");
    expect(await recordStatus(record.id)).toBe("LOST");
  });

  it("แฟ้มที่ชำรุด/สูญหายยืมไม่ได้ → 409 RECORD_UNUSABLE", async () => {
    const { record, borrower, staffHeaders } = await seedBase();
    await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "LOST", description: "หาไม่พบ" },
    });

    const res = await createBorrow(staffHeaders, {
      hn: record.hn,
      borrowerId: borrower.id,
      reason: "ตรวจสอบประวัติ",
      dueDate: futureDue(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe("RECORD_UNUSABLE");
    expect(res.body.error.message).toContain("สูญหาย");
  });

  it("รับคืนสภาพชำรุด → ปิดรายการยืม, แฟ้มเป็น DAMAGED, เปิดเรื่องอัตโนมัติ", async () => {
    const { record, borrower, staffHeaders } = await seedBase();
    const created = await createBorrow(staffHeaders, {
      hn: record.hn,
      borrowerId: borrower.id,
      reason: "ตรวจสอบประวัติ",
      dueDate: futureDue(),
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${created.body.borrow.id}/return`,
      headers: staffHeaders,
      payload: { returnedById: borrower.id, condition: "DAMAGED", damageNote: "ปกฉีกขาด" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().borrow.status).toBe("RETURNED");
    expect(await recordStatus(record.id)).toBe("DAMAGED");

    const incident = await prisma.incident.findFirstOrThrow({ where: { medicalRecordId: record.id } });
    expect(incident.type).toBe("DAMAGED");
    expect(incident.description).toBe("ปกฉีกขาด");
    expect(incident.borrowId).toBe(created.body.borrow.id);
  });

  it("รับคืนสภาพชำรุดโดยไม่ระบุรายละเอียด → 400", async () => {
    const { record, borrower, staffHeaders } = await seedBase();
    const created = await createBorrow(staffHeaders, {
      hn: record.hn,
      borrowerId: borrower.id,
      reason: "ตรวจสอบประวัติ",
      dueDate: futureDue(),
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/borrows/${created.body.borrow.id}/return`,
      headers: staffHeaders,
      payload: { returnedById: borrower.id, condition: "DAMAGED" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("กรุณาระบุรายละเอียดความชำรุด");
  });

  it("ปิดเรื่องพร้อมคืนสถานะ → แฟ้มกลับมาว่างและรายการยืมที่ค้างถูกปิด", async () => {
    const { record, borrower, staffHeaders } = await seedBase();
    const created = await createBorrow(staffHeaders, {
      hn: record.hn,
      borrowerId: borrower.id,
      reason: "ตรวจสอบประวัติ",
      dueDate: futureDue(),
    });
    const reported = await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "LOST", description: "หาไม่พบ" },
    });
    const incidentId = reported.json().incident.id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/incidents/${incidentId}/resolve`,
      headers: staffHeaders,
      payload: { note: "พบแฟ้มที่ห้องประชุม", restoreRecord: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().incident.status).toBe("RESOLVED");
    expect(await recordStatus(record.id)).toBe("AVAILABLE");

    const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id: created.body.borrow.id } });
    expect(borrow.status).toBe("RETURNED");
  });

  it("ยังมีเรื่องอื่นค้างอยู่ → ไม่คืนสถานะแฟ้มให้", async () => {
    const { record, staffHeaders } = await seedBase();
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "DAMAGED", description: "ปกฉีก" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "DAMAGED", description: "หน้า 5 หาย" },
    });

    await app.inject({
      method: "POST",
      url: `/api/v1/incidents/${first.json().incident.id}/resolve`,
      headers: staffHeaders,
      payload: { note: "ซ่อมปกแล้ว", restoreRecord: true },
    });

    expect(await recordStatus(record.id)).toBe("DAMAGED");
  });

  it("ปิดเรื่องซ้ำ → 409", async () => {
    const { record, staffHeaders } = await seedBase();
    const reported = await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "DAMAGED", description: "ปกฉีก" },
    });
    const id = reported.json().incident.id;
    const payload = { note: "ซ่อมแล้ว", restoreRecord: false };
    await app.inject({ method: "POST", url: `/api/v1/incidents/${id}/resolve`, headers: staffHeaders, payload });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/incidents/${id}/resolve`,
      headers: staffHeaders,
      payload,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INCIDENT_ALREADY_RESOLVED");
  });

  it("ผู้ยืมทั่วไปรายงานเหตุการณ์ไม่ได้ → 403", async () => {
    const { record, borrower } = await seedBase();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: await authHeaders(borrower),
      payload: { hn: record.hn, type: "LOST", description: "หาไม่พบ" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("รายละเอียดแฟ้มแสดงเหตุการณ์ที่เกี่ยวข้อง", async () => {
    const { record, staffHeaders } = await seedBase();
    await app.inject({
      method: "POST",
      url: "/api/v1/incidents",
      headers: staffHeaders,
      payload: { hn: record.hn, type: "DAMAGED", description: "ปกฉีก" },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/medical-records/${record.id}`,
      headers: staffHeaders,
    });
    expect(res.json().record.incidents).toHaveLength(1);
    expect(res.json().record.incidents[0].typeLabel).toBe("ชำรุด");
    expect(res.json().record.statusLabel).toBe("ชำรุด");
  });
});

// ---------------------------------------------------------------------------
// FR-11 — จัดการผู้ใช้งาน
// ---------------------------------------------------------------------------

describe("FR-11 จัดการผู้ใช้งาน", () => {
  const newUser = {
    username: "new-nurse",
    password: "strongpass123",
    fullName: "พยาบาลใหม่",
    role: "BORROWER" as const,
  };

  async function login(username: string, password: string) {
    return app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
  }

  it("เพิ่มผู้ใช้ → 201 ไม่ส่ง passwordHash ออกไป และล็อกอินได้ทันที", async () => {
    const { dept, staffHeaders } = await seedBase();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: staffHeaders,
      payload: { ...newUser, departmentId: dept.id, email: "new-nurse@hospital.local" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.username).toBe("new-nurse");
    expect(body.user.email).toBe("new-nurse@hospital.local");
    expect(body.user.active).toBe(true);
    expect(body.user.passwordHash).toBeUndefined();

    expect((await login("new-nurse", "strongpass123")).statusCode).toBe(200);
  });

  it("ชื่อผู้ใช้ซ้ำ → 409", async () => {
    const { staffHeaders } = await seedBase();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: staffHeaders,
      payload: { ...newUser, username: "test-borrower" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("USERNAME_TAKEN");
  });

  it("รหัสผ่านสั้นเกินไป → 400", async () => {
    const { staffHeaders } = await seedBase();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: staffHeaders,
      payload: { ...newUser, password: "sh0rt" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
  });

  it("หน่วยงานไม่มีอยู่จริง → 404", async () => {
    const { staffHeaders } = await seedBase();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: staffHeaders,
      payload: { ...newUser, departmentId: 999999 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("DEPARTMENT_NOT_FOUND");
  });

  it("แก้ไขบทบาทและอีเมลได้", async () => {
    const { borrower, staffHeaders } = await seedBase();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${borrower.id}`,
      headers: staffHeaders,
      payload: { role: "DEPARTMENT_HEAD", email: "boss@hospital.local" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe("DEPARTMENT_HEAD");
    expect(res.json().user.email).toBe("boss@hospital.local");
  });

  it("รีเซ็ตรหัสผ่านแล้วใช้รหัสใหม่ล็อกอินได้ และ audit log ไม่เก็บรหัสผ่าน", async () => {
    const { borrower, staffHeaders } = await seedBase();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${borrower.id}`,
      headers: staffHeaders,
      payload: { password: "brandnewpass99" },
    });
    expect(res.statusCode).toBe(200);
    expect((await login("test-borrower", "brandnewpass99")).statusCode).toBe(200);
    expect((await login("test-borrower", "password123")).statusCode).toBe(401);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "USER_UPDATE" } });
    expect(JSON.stringify(log.detail)).not.toContain("brandnewpass99");
  });

  it("ปิดใช้งานบัญชี → ล็อกอินไม่ได้ และ token เดิมใช้ไม่ได้", async () => {
    const { borrower, staffHeaders } = await seedBase();
    const borrowerHeaders = await authHeaders(borrower);

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${borrower.id}`,
      headers: staffHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.active).toBe(false);

    expect((await login("test-borrower", "password123")).statusCode).toBe(401);

    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: borrowerHeaders });
    expect(me.statusCode).toBe(401);
  });

  it("ปิดใช้งานบัญชีตัวเองไม่ได้ → 400", async () => {
    const { staff, staffHeaders } = await seedBase();
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${staff.id}`,
      headers: staffHeaders,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("CANNOT_DELETE_SELF");
  });

  it("ปิดใช้งานผู้ที่ยังมีแฟ้มค้างคืนไม่ได้ → 409", async () => {
    const { record, borrower, staffHeaders } = await seedBase();
    await createBorrow(staffHeaders, {
      hn: record.hn,
      borrowerId: borrower.id,
      reason: "ตรวจสอบประวัติ",
      dueDate: futureDue(),
    });

    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/users/${borrower.id}`,
      headers: staffHeaders,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("USER_HAS_ACTIVE_BORROWS");
  });

  it("รายชื่อผู้ใช้ปริยายไม่รวมบัญชีที่ปิดใช้งาน", async () => {
    const { borrower, staffHeaders } = await seedBase();
    await app.inject({ method: "DELETE", url: `/api/v1/users/${borrower.id}`, headers: staffHeaders });

    const active = await app.inject({ method: "GET", url: "/api/v1/users", headers: staffHeaders });
    expect(active.json().users.some((u: { id: number }) => u.id === borrower.id)).toBe(false);

    const all = await app.inject({
      method: "GET",
      url: "/api/v1/users?includeInactive=true",
      headers: staffHeaders,
    });
    expect(all.json().users.some((u: { id: number }) => u.id === borrower.id)).toBe(true);
  });

  it("ผู้ยืมทั่วไปสร้างผู้ใช้ไม่ได้ → 403", async () => {
    const { borrower } = await seedBase();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: await authHeaders(borrower),
      payload: newUser,
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /departments คืนรายชื่อพร้อมจำนวนผู้ใช้", async () => {
    const { dept, staffHeaders } = await seedBase();
    const res = await app.inject({ method: "GET", url: "/api/v1/departments", headers: staffHeaders });
    expect(res.statusCode).toBe(200);
    const found = res.json().departments.find((d: { id: number }) => d.id === dept.id);
    expect(found.userCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// FR-07 — Overdue scanner
// ---------------------------------------------------------------------------

describe("FR-07 overdue scanner", () => {
  /** สร้างรายการยืมที่เกินกำหนดโดยตรง (API บังคับ dueDate อนาคต) */
  async function seedOverdue(daysAgo: number, borrowerId: number, medicalRecordId: number, departmentId: number) {
    return prisma.borrow.create({
      data: {
        medicalRecordId,
        borrowerId,
        departmentId,
        reason: "ตรวจสอบประวัติ",
        dueDate: new Date(Date.now() - daysAgo * DAY),
      },
    });
  }

  it("ไม่มีช่องทางติดต่อ → นับเป็นส่งไม่ได้ ไม่ใช่ส่งสำเร็จ", async () => {
    const { borrower, record, dept } = await seedBase();
    await seedOverdue(10, borrower.id, record.id, dept.id);
    await prisma.medicalRecord.update({ where: { id: record.id }, data: { status: "BORROWED" } });

    const result = await scanOverdueAndNotify();
    expect(result.newAlerts).toBe(0);
    expect(result.undeliverable).toBe(1);
    // ไม่ควรบันทึก audit ว่าแจ้งเตือนแล้ว ทั้งที่ส่งไม่ออก
    expect(await prisma.auditLog.count({ where: { action: "OVERDUE_NOTIFICATION" } })).toBe(0);
  });

  it("ข้ามแฟ้มที่แจ้งชำรุด/สูญหายไปแล้ว", async () => {
    const { borrower, record, dept } = await seedBase();
    await prisma.user.update({ where: { id: borrower.id }, data: { email: "b@test.local" } });
    await seedOverdue(10, borrower.id, record.id, dept.id);
    await prisma.medicalRecord.update({ where: { id: record.id }, data: { status: "LOST" } });

    const result = await scanOverdueAndNotify();
    expect(result.newAlerts).toBe(0);
    expect(result.undeliverable).toBe(0);
  });

  it("รายการที่รออนุมัติไม่ถือว่าเกินกำหนด", async () => {
    const { borrower, record, dept } = await seedBase();
    await prisma.borrow.create({
      data: {
        medicalRecordId: record.id,
        borrowerId: borrower.id,
        departmentId: dept.id,
        reason: "ยืมออกนอกโรงพยาบาล",
        dueDate: new Date(Date.now() - 30 * DAY),
        requiresApproval: true,
        status: "PENDING_APPROVAL",
      },
    });

    const result = await scanOverdueAndNotify();
    expect(result.newAlerts).toBe(0);
    expect(result.undeliverable).toBe(0);
  });

  it("ไม่มีรายการเกินกำหนด → ไม่ทำอะไร", async () => {
    await seedBase();
    expect(await scanOverdueAndNotify()).toEqual({ newAlerts: 0, escalated: 0, undeliverable: 0 });
  });
});

// ---------------------------------------------------------------------------
// Hardening
// ---------------------------------------------------------------------------

describe("Hardening", () => {
  it("อ่านรายละเอียดแฟ้ม → บันทึก audit log RECORD_VIEW", async () => {
    const { record, staff, staffHeaders } = await seedBase();

    await app.inject({
      method: "GET",
      url: `/api/v1/medical-records/${record.id}`,
      headers: staffHeaders,
    });

    // audit เขียนแบบไม่ block คำตอบ — รอให้ promise ทำงานเสร็จก่อนตรวจ
    await new Promise((resolve) => setTimeout(resolve, 150));

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "RECORD_VIEW" } });
    expect(log.actorId).toBe(staff.id);
    expect(JSON.stringify(log.detail)).toContain(record.hn);
  });

  it("ค้นหาแฟ้ม → บันทึก audit log RECORD_SEARCH พร้อมคำค้น", async () => {
    const { staffHeaders } = await seedBase();

    await app.inject({
      method: "GET",
      url: "/api/v1/medical-records?search=0000000123",
      headers: staffHeaders,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "RECORD_SEARCH" } });
    expect(JSON.stringify(log.detail)).toContain("0000000123");
  });

  it("ล็อกอินถี่เกินลิมิต → 429 พร้อมข้อความไทย", async () => {
    // สร้าง app แยกที่ตั้งลิมิตต่ำ เพื่อไม่ให้กระทบเทสต์อื่นที่ล็อกอินหลายครั้ง
    process.env.AUTH_RATE_LIMIT_MAX = "3";
    const limited = buildApp();
    await limited.ready();
    try {
      await seedBase();
      const attempt = () =>
        limited.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { username: "test-staff", password: "wrong-password" },
        });

      for (let i = 0; i < 3; i++) {
        expect((await attempt()).statusCode).toBe(401);
      }

      const blocked = await attempt();
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().error.code).toBe("TOO_MANY_REQUESTS");
      expect(blocked.json().error.message).toContain("บ่อยเกินไป");
    } finally {
      await limited.close();
      process.env.AUTH_RATE_LIMIT_MAX = "0";
    }
  });
});
