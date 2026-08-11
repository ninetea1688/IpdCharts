/**
 * สร้างบัญชีผู้ดูแลระบบคนแรกสำหรับ production — ปลอดภัยกับข้อมูลที่มีอยู่
 *
 * ต่างจาก `db:seed` ที่ลบข้อมูลทั้งหมดก่อนใส่ข้อมูลตัวอย่าง (ใช้ได้เฉพาะ dev)
 * สคริปต์นี้จะไม่แตะข้อมูลเดิมเลย และจะไม่ทำอะไรถ้ามีผู้ใช้อยู่แล้ว
 * จึงรันซ้ำได้โดยไม่มีผลข้างเคียง
 *
 * ใช้:  BOOTSTRAP_ADMIN_PASSWORD=... bun run db:bootstrap
 */

import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 8;

async function main() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || "admin";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "ผู้ดูแลระบบ";
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || null;

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`[bootstrap] มีผู้ใช้ในระบบอยู่แล้ว ${existingUsers} คน — ไม่ทำอะไร`);
    return;
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `[bootstrap] ต้องตั้ง BOOTSTRAP_ADMIN_PASSWORD ยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร ` +
        "เพื่อสร้างบัญชีผู้ดูแลระบบคนแรก",
    );
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      email,
      role: Role.ADMIN,
      passwordHash: await hash(password, 10),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "USER_CREATE",
      entity: "User",
      entityId: String(user.id),
      detail: { username: user.username, role: user.role, via: "bootstrap" },
    },
  });

  console.log(`[bootstrap] สร้างบัญชีผู้ดูแลระบบ "${username}" เรียบร้อย — กรุณาเปลี่ยนรหัสผ่านหลังเข้าใช้ครั้งแรก`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
