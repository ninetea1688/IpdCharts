import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { authenticate, hashPassword, requireRoles } from "../lib/auth.js";

const ROLES = ["ADMIN", "BORROWER", "DEPARTMENT_HEAD"] as const;

const listQuerySchema = z.object({
  /** ปริยายแสดงเฉพาะบัญชีที่ใช้งานอยู่ — ส่ง includeInactive=true เพื่อดูทั้งหมด */
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const createBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "ชื่อผู้ใช้ต้องยาวอย่างน้อย 3 ตัวอักษร")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - เท่านั้น"),
  password: z.string().min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร").max(100),
  fullName: z.string().trim().min(1, "กรุณาระบุชื่อ-สกุล").max(100),
  role: z.enum(ROLES),
  departmentId: z.number().int().positive().nullable().optional(),
  email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง").max(200).nullable().optional(),
  lineUserId: z.string().trim().max(100).nullable().optional(),
});

const updateBodySchema = z
  .object({
    fullName: z.string().trim().min(1, "กรุณาระบุชื่อ-สกุล").max(100).optional(),
    role: z.enum(ROLES).optional(),
    departmentId: z.number().int().positive().nullable().optional(),
    email: z.string().trim().email("รูปแบบอีเมลไม่ถูกต้อง").max(200).nullable().optional(),
    lineUserId: z.string().trim().max(100).nullable().optional(),
    active: z.boolean().optional(),
    password: z.string().min(8, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร").max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "ไม่มีข้อมูลที่จะแก้ไข" });

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

const userInclude = { department: true } as const;
type UserWithDepartment = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/** ไม่ส่ง passwordHash ออกไปเด็ดขาด */
function serializeUser(u: UserWithDepartment) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    departmentId: u.departmentId,
    department: u.department?.name ?? null,
    email: u.email,
    lineUserId: u.lineUserId,
    active: u.active,
  };
}

/** หน่วยงานต้องมีอยู่จริงก่อนผูกกับผู้ใช้ */
async function assertDepartmentExists(departmentId: number | null | undefined): Promise<void> {
  if (departmentId == null) return;
  const found = await prisma.department.count({ where: { id: departmentId } });
  if (found === 0) throw Errors.departmentNotFound();
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users", { preHandler: [authenticate] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ไม่ถูกต้อง" } });
    }

    const users = await prisma.user.findMany({
      where: query.data.includeInactive ? {} : { active: true },
      include: userInclude,
      orderBy: { fullName: "asc" },
    });
    return reply.send({ users: users.map(serializeUser) });
  });

  // เพิ่มผู้ใช้งาน (FR-11)
  app.post("/users", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const body = createBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      });
    }
    const { password, ...data } = body.data;
    await assertDepartmentExists(data.departmentId);

    const taken = await prisma.user.count({ where: { username: data.username } });
    if (taken > 0) throw Errors.usernameTaken();

    const user = await prisma.user.create({
      data: {
        username: data.username,
        fullName: data.fullName,
        role: data.role,
        departmentId: data.departmentId ?? null,
        email: data.email ?? null,
        lineUserId: data.lineUserId ?? null,
        passwordHash: await hashPassword(password),
      },
      include: userInclude,
    });

    await prisma.auditLog.create({
      data: {
        actorId: request.user.id,
        action: "USER_CREATE",
        entity: "User",
        entityId: String(user.id),
        detail: { username: user.username, role: user.role },
      },
    });

    return reply.status(201).send({ user: serializeUser(user) });
  });

  // แก้ไขผู้ใช้งาน / รีเซ็ตรหัสผ่าน / เปิด-ปิดใช้งาน
  app.patch("/users/:id", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = updateBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: body.success ? "รหัสผู้ใช้ไม่ถูกต้อง" : body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
        },
      });
    }
    const { id } = params.data;
    const { password, ...fields } = body.data;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw Errors.userNotFound();
    await assertDepartmentExists(fields.departmentId);

    if (fields.active === false) {
      if (id === request.user.id) throw Errors.cannotDeleteSelf();
      const outstanding = await prisma.borrow.count({
        where: { borrowerId: id, status: { in: ["ACTIVE", "PENDING_APPROVAL"] } },
      });
      if (outstanding > 0) throw Errors.userHasActiveBorrows();
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...fields,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
      include: userInclude,
    });

    await prisma.auditLog.create({
      data: {
        actorId: request.user.id,
        action: "USER_UPDATE",
        entity: "User",
        entityId: String(id),
        // ไม่บันทึกรหัสผ่านลง audit log — เก็บแค่ว่ามีการเปลี่ยนหรือไม่
        detail: { fields: Object.keys(fields), passwordChanged: password !== undefined },
      },
    });

    return reply.send({ user: serializeUser(user) });
  });

  /**
   * ปิดใช้งานผู้ใช้ — ไม่ลบจริงเพราะ audit log และประวัติการยืมอ้างถึงผู้ใช้อยู่
   * (ลบจริงจะทำให้ตรวจสอบย้อนหลังไม่ได้ ซึ่งขัดกับข้อกำหนด PDPA)
   */
  app.delete("/users/:id", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "รหัสผู้ใช้ไม่ถูกต้อง" } });
    }
    const { id } = params.data;
    if (id === request.user.id) throw Errors.cannotDeleteSelf();

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw Errors.userNotFound();

    const outstanding = await prisma.borrow.count({
      where: { borrowerId: id, status: { in: ["ACTIVE", "PENDING_APPROVAL"] } },
    });
    if (outstanding > 0) throw Errors.userHasActiveBorrows();

    const user = await prisma.user.update({
      where: { id },
      data: { active: false },
      include: userInclude,
    });

    await prisma.auditLog.create({
      data: {
        actorId: request.user.id,
        action: "USER_DEACTIVATE",
        entity: "User",
        entityId: String(id),
        detail: { username: user.username },
      },
    });

    return reply.send({ user: serializeUser(user) });
  });

  // หน่วยงาน — ใช้เติม dropdown ตอนสร้าง/แก้ไขผู้ใช้
  app.get("/departments", { preHandler: [authenticate] }, async (_request, reply) => {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true } } },
    });
    return reply.send({
      departments: departments.map((d) => ({ id: d.id, name: d.name, userCount: d._count.users })),
    });
  });
}
