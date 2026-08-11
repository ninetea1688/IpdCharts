import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { authenticate, requireRoles } from "../lib/auth.js";

const nameSchema = z
  .string()
  .trim()
  .min(2, "ชื่อหน่วยงานต้องยาวอย่างน้อย 2 ตัวอักษร")
  .max(100, "ชื่อหน่วยงานยาวเกินไป");

const createBodySchema = z.object({ name: nameSchema });
const updateBodySchema = z.object({ name: nameSchema });
const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

interface DepartmentCounts {
  id: number;
  name: string;
  _count: { users: number; borrows: number };
}

function serializeDepartment(d: DepartmentCounts) {
  return {
    id: d.id,
    name: d.name,
    userCount: d._count.users,
    borrowCount: d._count.borrows,
    /** ลบได้ก็ต่อเมื่อไม่มีอะไรอ้างถึง — ใช้ปิดปุ่มลบใน UI ล่วงหน้า */
    deletable: d._count.users === 0 && d._count.borrows === 0,
  };
}

const withCounts = { _count: { select: { users: true, borrows: true } } } as const;

export async function departmentRoutes(app: FastifyInstance): Promise<void> {
  // รายชื่อหน่วยงาน — ใช้เติม dropdown ตอนสร้าง/แก้ไขผู้ใช้
  app.get("/departments", { preHandler: [authenticate] }, async (_request, reply) => {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: withCounts,
    });
    return reply.send({ departments: departments.map(serializeDepartment) });
  });

  app.post("/departments", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const body = createBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      });
    }
    const { name } = body.data;

    if ((await prisma.department.count({ where: { name } })) > 0) {
      throw Errors.departmentNameTaken();
    }

    const department = await prisma.department.create({ data: { name }, include: withCounts });

    await prisma.auditLog.create({
      data: {
        actorId: request.user.id,
        action: "DEPARTMENT_CREATE",
        entity: "Department",
        entityId: String(department.id),
        detail: { name },
      },
    });

    return reply.status(201).send({ department: serializeDepartment(department) });
  });

  app.patch(
    "/departments/:id",
    { preHandler: [authenticate, requireRoles("ADMIN")] },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = updateBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: body.success ? "รหัสหน่วยงานไม่ถูกต้อง" : body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
          },
        });
      }
      const { id } = params.data;
      const { name } = body.data;

      const existing = await prisma.department.findUnique({ where: { id } });
      if (!existing) throw Errors.departmentNotFound();

      const clash = await prisma.department.findFirst({ where: { name, id: { not: id } } });
      if (clash) throw Errors.departmentNameTaken();

      const department = await prisma.department.update({
        where: { id },
        data: { name },
        include: withCounts,
      });

      await prisma.auditLog.create({
        data: {
          actorId: request.user.id,
          action: "DEPARTMENT_UPDATE",
          entity: "Department",
          entityId: String(id),
          detail: { from: existing.name, to: name },
        },
      });

      return reply.send({ department: serializeDepartment(department) });
    },
  );

  /**
   * ลบหน่วยงาน — ลบได้จริงเฉพาะหน่วยงานที่ไม่มีอะไรอ้างถึง
   * ต่างจากผู้ใช้ที่เลือกปิดใช้งานแทนลบ เพราะหน่วยงานที่ยังมีประวัติการยืมอ้างอยู่
   * จะถูกกันไม่ให้ลบตั้งแต่ต้น ประวัติจึงไม่ขาดหาย
   */
  app.delete(
    "/departments/:id",
    { preHandler: [authenticate, requireRoles("ADMIN")] },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "รหัสหน่วยงานไม่ถูกต้อง" } });
      }
      const { id } = params.data;

      const existing = await prisma.department.findUnique({ where: { id }, include: withCounts });
      if (!existing) throw Errors.departmentNotFound();

      if (existing._count.users > 0 || existing._count.borrows > 0) {
        throw Errors.departmentInUse(existing._count.users, existing._count.borrows);
      }

      await prisma.department.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          actorId: request.user.id,
          action: "DEPARTMENT_DELETE",
          entity: "Department",
          entityId: String(id),
          detail: { name: existing.name },
        },
      });

      return reply.send({ deleted: { id, name: existing.name } });
    },
  );
}
