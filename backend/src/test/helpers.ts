import { prisma } from "../lib/prisma.js";

export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.borrow.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
}

export async function seedBase() {
  const dept = await prisma.department.create({ data: { name: "ศัลยกรรม (test)" } });
  const borrower = await prisma.user.create({
    data: {
      username: "test-borrower",
      fullName: "ผู้ยืมทดสอบ",
      role: "BORROWER",
      departmentId: dept.id,
    },
  });
  const record = await prisma.medicalRecord.create({
    data: { hn: "0000000123", patientName: "ผู้ป่วยทดสอบ" },
  });
  return { dept, borrower, record };
}
