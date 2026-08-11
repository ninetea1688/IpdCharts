import type { Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, signAccessToken } from "../lib/auth.js";

export async function resetDb(): Promise<void> {
  // ลำดับสำคัญ — ตารางที่อ้างถึงตารางอื่นต้องถูกลบก่อน
  await prisma.auditLog.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.borrow.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
}

/** สร้าง Authorization header จาก user จริงใน DB — ใช้ token เส้นทางเดียวกับ production */
export async function authHeaders(user: User): Promise<{ authorization: string }> {
  const token = await signAccessToken({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    departmentId: user.departmentId,
    department: null,
  });
  return { authorization: `Bearer ${token}` };
}

export async function createUser(
  username: string,
  role: Role,
  overrides: { fullName?: string; departmentId?: number | null } = {},
): Promise<User> {
  return prisma.user.create({
    data: {
      username,
      fullName: overrides.fullName ?? username,
      role,
      departmentId: overrides.departmentId ?? null,
      passwordHash: await hashPassword("password123"),
    },
  });
}

/**
 * ข้อมูลตั้งต้นของ test: หน่วยงาน 1, ผู้ยืม 1, แฟ้ม 1
 * และเจ้าหน้าที่ ADMIN 1 คน (`staff`) พร้อม header สำหรับเรียก API ที่ต้องสิทธิ์ ADMIN
 */
export async function seedBase() {
  const dept = await prisma.department.create({ data: { name: "ศัลยกรรม (test)" } });
  const borrower = await createUser("test-borrower", "BORROWER", {
    fullName: "ผู้ยืมทดสอบ",
    departmentId: dept.id,
  });
  const record = await prisma.medicalRecord.create({
    data: { hn: "0000000123", patientName: "ผู้ป่วยทดสอบ" },
  });
  const staff = await createUser("test-staff", "ADMIN", { fullName: "เจ้าหน้าที่ทดสอบ" });
  return { dept, borrower, record, staff, staffHeaders: await authHeaders(staff) };
}
