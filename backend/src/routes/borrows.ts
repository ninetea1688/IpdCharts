import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import {
  BORROW_STATUS_LABEL,
  RECORD_STATUS_LABEL,
  isRecordBorrowable,
  toBorrowView,
} from "../lib/domain.js";
import { authenticate, requireRoles } from "../lib/auth.js";

const borrowBodySchema = z.object({
  hn: z.string().regex(/^\d{8,10}$/, "HN ต้องเป็นตัวเลข 8-10 หลัก"),
  borrowerId: z.number().int().positive(),
  reason: z.string().trim().min(1, "กรุณาระบุเหตุผลการยืม").max(200),
  dueDate: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
  /** กรณีพิเศษ เช่น ยืมออกนอกโรงพยาบาล — ต้องให้หัวหน้าหน่วยงานอนุมัติก่อนจ่ายแฟ้ม */
  requiresApproval: z.boolean().default(false),
});

const returnBodySchema = z
  .object({
    returnedById: z.number().int().positive(),
    /** สภาพแฟ้มตอนรับคืน — "DAMAGED" จะเปิด incident ให้อัตโนมัติ (FR-05) */
    condition: z.enum(["NORMAL", "DAMAGED"]).default("NORMAL"),
    damageNote: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.condition !== "DAMAGED" || (v.damageNote && v.damageNote.length > 0), {
    message: "กรุณาระบุรายละเอียดความชำรุด",
    path: ["damageNote"],
  });

const rejectBodySchema = z.object({
  reason: z.string().trim().min(1, "กรุณาระบุเหตุผลที่ไม่อนุมัติ").max(200),
});

const listQuerySchema = z.object({
  status: z.enum(["PENDING_APPROVAL", "ACTIVE", "RETURNED", "REJECTED", "OVERDUE"]).optional(),
  search: z.string().trim().max(50).optional(),
});

const borrowParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const borrowInclude = {
  medicalRecord: true,
  borrower: { include: { department: true } },
  department: true,
  approvedBy: true,
} as const;

type BorrowWithRelations = Prisma.BorrowGetPayload<{ include: typeof borrowInclude }>;

function serializeBorrow(b: BorrowWithRelations) {
  const view = toBorrowView(b);
  return {
    id: b.id,
    hn: b.medicalRecord.hn,
    patientName: b.medicalRecord.patientName,
    borrower: b.borrower.fullName,
    borrowerId: b.borrowerId,
    department: b.department.name,
    reason: b.reason,
    dueDate: b.dueDate,
    status: view.status,
    statusLabel: BORROW_STATUS_LABEL[view.status],
    returnedAt: b.returnedAt,
    requiresApproval: b.requiresApproval,
    approvedBy: b.approvedBy?.fullName ?? null,
    approvedAt: b.approvedAt,
    rejectedReason: b.rejectedReason,
  };
}

/** อนุมัติได้เฉพาะ ADMIN หรือหัวหน้าของหน่วยงานที่ยื่นคำขอ */
function assertCanApprove(user: { role: string; departmentId: number | null }, departmentId: number): void {
  if (user.role === "ADMIN") return;
  if (user.departmentId !== departmentId) throw Errors.approverWrongDepartment();
}

export async function borrowRoutes(app: FastifyInstance): Promise<void> {
  // ยืมแฟ้ม — เฉพาะ ADMIN (เจ้าหน้าที่เวชระเบียน)
  app.post("/borrows", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const body = borrowBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      });
    }
    const { hn, borrowerId, reason, dueDate, requiresApproval } = body.data;
    if (dueDate.getTime() <= Date.now()) {
      throw Errors.invalidDueDate();
    }

    const borrower = await prisma.user.findUnique({ where: { id: borrowerId } });
    if (!borrower) {
      throw Errors.borrowerNotFound();
    }
    const borrowerDepartmentId = borrower.departmentId;
    if (borrowerDepartmentId == null) {
      throw Errors.borrowerNoDepartment();
    }

    const actorId = request.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.medicalRecord.findUnique({ where: { hn } });
      if (!record) throw Errors.recordNotFound(hn);
      if (record.status === "DAMAGED" || record.status === "LOST") {
        throw Errors.recordUnusable(RECORD_STATUS_LABEL[record.status]);
      }
      if (!isRecordBorrowable(record.status)) throw Errors.recordNotAvailable();

      // มีคำขอที่รออนุมัติสำหรับแฟ้มนี้อยู่แล้ว ถือว่าไม่ว่าง
      const pending = await tx.borrow.count({
        where: { medicalRecordId: record.id, status: "PENDING_APPROVAL" },
      });
      if (pending > 0) throw Errors.recordNotAvailable();

      const borrow = await tx.borrow.create({
        data: {
          medicalRecordId: record.id,
          borrowerId,
          departmentId: borrowerDepartmentId,
          reason,
          dueDate,
          requiresApproval,
          status: requiresApproval ? "PENDING_APPROVAL" : "ACTIVE",
        },
      });

      // คำขอที่รออนุมัติยังไม่จ่ายแฟ้ม สถานะแฟ้มจึงยังไม่เปลี่ยน
      if (!requiresApproval) {
        await tx.medicalRecord.update({ where: { id: record.id }, data: { status: "BORROWED" } });
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: requiresApproval ? "BORROW_REQUEST" : "BORROW",
          entity: "Borrow",
          entityId: String(borrow.id),
          detail: { hn: record.hn, medicalRecordId: record.id, requiresApproval },
        },
      });
      return borrow;
    });

    const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id: result.id }, include: borrowInclude });
    return reply.status(201).send({ borrow: serializeBorrow(borrow) });
  });

  // อนุมัติคำขอยืมกรณีพิเศษ (FR-03) — หัวหน้าหน่วยงานหรือ ADMIN
  app.post(
    "/borrows/:id/approve",
    { preHandler: [authenticate, requireRoles("DEPARTMENT_HEAD", "ADMIN")] },
    async (request, reply) => {
      const params = borrowParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "รหัสรายการไม่ถูกต้อง" } });
      }
      const { id } = params.data;

      const existing = await prisma.borrow.findUnique({ where: { id } });
      if (!existing) throw Errors.borrowNotFound();
      if (existing.status !== "PENDING_APPROVAL") throw Errors.notPendingApproval();
      assertCanApprove(request.user, existing.departmentId);

      const actorId = request.user.id;

      await prisma.$transaction(async (tx) => {
        // แฟ้มอาจถูกคนอื่นยืมไประหว่างรออนุมัติ — ต้องเช็คซ้ำก่อนจ่าย
        const record = await tx.medicalRecord.findUniqueOrThrow({
          where: { id: existing.medicalRecordId },
        });
        if (record.status === "DAMAGED" || record.status === "LOST") {
          throw Errors.recordUnusable(RECORD_STATUS_LABEL[record.status]);
        }
        if (!isRecordBorrowable(record.status)) throw Errors.recordNotAvailable();

        await tx.borrow.update({
          where: { id },
          data: { status: "ACTIVE", approvedById: actorId, approvedAt: new Date() },
        });
        await tx.medicalRecord.update({ where: { id: record.id }, data: { status: "BORROWED" } });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "BORROW_APPROVE",
            entity: "Borrow",
            entityId: String(id),
            detail: { hn: record.hn },
          },
        });
      });

      const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id }, include: borrowInclude });
      return reply.send({ borrow: serializeBorrow(borrow) });
    },
  );

  // ไม่อนุมัติคำขอยืม
  app.post(
    "/borrows/:id/reject",
    { preHandler: [authenticate, requireRoles("DEPARTMENT_HEAD", "ADMIN")] },
    async (request, reply) => {
      const params = borrowParamsSchema.safeParse(request.params);
      const body = rejectBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: body.success ? "รหัสรายการไม่ถูกต้อง" : body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
          },
        });
      }
      const { id } = params.data;

      const existing = await prisma.borrow.findUnique({ where: { id } });
      if (!existing) throw Errors.borrowNotFound();
      if (existing.status !== "PENDING_APPROVAL") throw Errors.notPendingApproval();
      assertCanApprove(request.user, existing.departmentId);

      const actorId = request.user.id;

      await prisma.$transaction(async (tx) => {
        await tx.borrow.update({
          where: { id },
          data: { status: "REJECTED", rejectedReason: body.data.reason, approvedById: actorId, approvedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "BORROW_REJECT",
            entity: "Borrow",
            entityId: String(id),
            detail: { reason: body.data.reason },
          },
        });
      });

      const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id }, include: borrowInclude });
      return reply.send({ borrow: serializeBorrow(borrow) });
    },
  );

  // คืนแฟ้ม — เฉพาะ ADMIN
  app.post(
    "/borrows/:id/return",
    { preHandler: [authenticate, requireRoles("ADMIN")] },
    async (request, reply) => {
      const params = borrowParamsSchema.safeParse(request.params);
      const body = returnBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: body.success ? "ข้อมูลไม่ถูกต้อง" : body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
          },
        });
      }
      const { id } = params.data;
      const { returnedById, condition, damageNote } = body.data;

      const borrow = await prisma.borrow.findUnique({
        where: { id },
        include: { medicalRecord: true },
      });
      if (!borrow) {
        throw Errors.borrowNotFound();
      }
      if (borrow.status === "RETURNED") {
        throw Errors.alreadyReturned();
      }
      if (borrow.status !== "ACTIVE") {
        throw Errors.notApproved();
      }
      if (returnedById !== borrow.borrowerId) {
        throw Errors.wrongReturner();
      }

      const actorId = request.user.id;

      const damaged = condition === "DAMAGED";

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.borrow.update({
          where: { id },
          data: { status: "RETURNED", returnedAt: new Date(), returnedById },
        });
        // แฟ้มชำรุดกลับเข้าชั้นไม่ได้ ต้องพักไว้จนกว่าจะปิด incident
        await tx.medicalRecord.update({
          where: { id: borrow.medicalRecordId },
          data: { status: damaged ? "DAMAGED" : "AVAILABLE" },
        });
        if (damaged) {
          await tx.incident.create({
            data: {
              medicalRecordId: borrow.medicalRecordId,
              borrowId: id,
              type: "DAMAGED",
              description: damageNote ?? "",
              reportedById: actorId,
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId,
            action: "RETURN",
            entity: "Borrow",
            entityId: String(id),
            detail: { hn: borrow.medicalRecord.hn, condition },
          },
        });
        return updated;
      });

      const full = await prisma.borrow.findUniqueOrThrow({
        where: { id: result.id },
        include: borrowInclude,
      });
      return reply.send({ borrow: serializeBorrow(full) });
    },
  );

  // รายการยืม — ทุก role ที่ auth แล้ว
  app.get("/borrows", { preHandler: [authenticate] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ไม่ถูกต้อง" },
      });
    }
    const { status, search } = query.data;

    // OVERDUE เป็น derived status — ต้องดึง ACTIVE มาแล้วกรองด้วย dueDate ทีหลัง
    const statusFilter =
      status === undefined || status === "OVERDUE"
        ? status === "OVERDUE"
          ? { status: "ACTIVE" as const }
          : {}
        : { status };

    const borrows = await prisma.borrow.findMany({
      where: {
        ...statusFilter,
        ...(search
          ? {
              OR: [
                { medicalRecord: { hn: { contains: search } } },
                { medicalRecord: { patientName: { contains: search } } },
                { borrower: { fullName: { contains: search } } },
              ],
            }
          : {}),
      },
      include: borrowInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const views = borrows.map(serializeBorrow).filter((b) => !status || b.status === status);
    return reply.send({ borrows: views });
  });
}
