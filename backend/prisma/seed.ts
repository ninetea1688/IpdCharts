import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

async function main() {
  // Reset demo data (seed is idempotent for dev)
  // ลำดับสำคัญ — ตารางที่อ้างถึงตารางอื่นต้องถูกลบก่อน
  await prisma.auditLog.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.borrow.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  const icu = await prisma.department.create({ data: { name: "หอผู้ป่วยวิกฤติ (ICU)" } });
  const surgery = await prisma.department.create({ data: { name: "ศัลยกรรม" } });
  const pediatric = await prisma.department.create({ data: { name: "กุมารเวช" } });

  const passwordHash = await hash("password123", 10);

  // อีเมลเป็นตัวอย่างในโดเมนสมมติ — ใช้ทดสอบการแจ้งเตือนกับ SMTP ทดสอบ (เช่น MailHog)
  const admin = await prisma.user.create({
    data: {
      username: "mr-admin", passwordHash, fullName: "นางสาวสมหญิง เจ้าหน้าที่เวชระเบียน",
      role: Role.ADMIN, email: "mr-admin@ipdcharts.local",
    },
  });
  const nurse = await prisma.user.create({
    data: {
      username: "nurse-mali", passwordHash, fullName: "นางสาวมาลี พยาบาล",
      role: Role.BORROWER, departmentId: surgery.id, email: "nurse-mali@ipdcharts.local",
    },
  });
  const doctor = await prisma.user.create({
    data: {
      username: "dr-wichai", passwordHash, fullName: "นายแพทย์วิชัย แพทย์",
      role: Role.BORROWER, departmentId: icu.id, email: "dr-wichai@ipdcharts.local",
    },
  });
  const head = await prisma.user.create({
    data: {
      username: "head-somchai", passwordHash, fullName: "นายสมชาย หัวหน้าศัลยกรรม",
      role: Role.DEPARTMENT_HEAD, departmentId: surgery.id, email: "head-somchai@ipdcharts.local",
    },
  });

  const patients = [
    "สมชาย ใจดี", "ประภาพร ศรีสุข", "อนุชา วงศ์เจริญ", "รัตนา คงมั่น",
    "วีระชัย พรหมมา", "กัลยา แสงทอง", "ธนกร บุญมา", "สุภาพร ทองคำ",
    "นภัสสร ลีลาวัฒน์", "ชาญชัย รักไทย", "อรทัย วัฒนะ", "บุญส่ง แก้วกุล",
  ];

  const records = await Promise.all(
    patients.map((name, i) =>
      prisma.medicalRecord.create({
        data: { hn: `000000000${i + 1}`.slice(-10), patientName: name },
      }),
    ),
  );

  // Borrow 1: overdue (dueDate 10 days ago -> overdue after +7 grace)
  await prisma.borrow.create({
    data: {
      medicalRecordId: records[0]!.id,
      borrowerId: doctor.id,
      departmentId: icu.id,
      reason: "ส่งต่อการรักษาผู้ป่วยวิกฤติ",
      dueDate: new Date(now - 10 * DAY),
    },
  });
  await prisma.medicalRecord.update({
    where: { id: records[0]!.id },
    data: { status: "BORROWED" },
  });

  // Borrow 2: active, on time
  await prisma.borrow.create({
    data: {
      medicalRecordId: records[1]!.id,
      borrowerId: nurse.id,
      departmentId: surgery.id,
      reason: "ตรวจสอบประวัติการผ่าตัด",
      dueDate: new Date(now + 3 * DAY),
    },
  });
  await prisma.medicalRecord.update({
    where: { id: records[1]!.id },
    data: { status: "BORROWED" },
  });

  // Borrow 3: already returned
  await prisma.borrow.create({
    data: {
      medicalRecordId: records[2]!.id,
      borrowerId: nurse.id,
      departmentId: surgery.id,
      reason: "สรุปเวชระเบียนก่อนจำหน่าย",
      dueDate: new Date(now - 2 * DAY),
      status: "RETURNED",
      returnedAt: new Date(now - 1 * DAY),
      returnedById: nurse.id,
    },
  });

  // Borrow 4: กรณีพิเศษที่รอหัวหน้าหน่วยงานอนุมัติ (แฟ้มยังไม่ถูกจ่ายออก)
  await prisma.borrow.create({
    data: {
      medicalRecordId: records[3]!.id,
      borrowerId: nurse.id,
      departmentId: surgery.id,
      reason: "ขอนำแฟ้มออกนอกโรงพยาบาลเพื่อประกอบคดี",
      dueDate: new Date(now + 5 * DAY),
      requiresApproval: true,
      status: "PENDING_APPROVAL",
    },
  });

  // Incident: แฟ้มชำรุดที่ยังไม่ปิดเรื่อง
  await prisma.incident.create({
    data: {
      medicalRecordId: records[4]!.id,
      type: "DAMAGED",
      description: "ปกแฟ้มฉีกขาด เอกสารหน้า 3-5 เปียกน้ำ",
      reportedById: admin.id,
    },
  });
  await prisma.medicalRecord.update({
    where: { id: records[4]!.id },
    data: { status: "DAMAGED" },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: "SEED",
        entity: "system",
        detail: { note: "seed demo data" },
      },
      {
        actorId: doctor.id,
        action: "BORROW",
        entity: "Borrow",
        entityId: String(records[0]!.id),
        detail: { hn: records[0]!.hn },
      },
      {
        actorId: nurse.id,
        action: "RETURN",
        entity: "Borrow",
        entityId: String(records[2]!.id),
        detail: { hn: records[2]!.hn },
      },
    ],
  });

  console.log(
    `Seed done: ${await prisma.department.count()} departments, ${await prisma.user.count()} users, ` +
      `${await prisma.medicalRecord.count()} records, ${await prisma.borrow.count()} borrows`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
