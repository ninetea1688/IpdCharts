import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { BORROW_STATUS_LABEL, toBorrowView } from "../lib/domain.js";
import { authenticate, requireRoles } from "../lib/auth.js";

const borrowBodySchema = z.object({
  hn: z.string().regex(/^\d{8,10}$/, "HN ต้องเป็นตัวเลข 8-10 หลัก"),
  borrowerId: z.number().int().positive(),
  reason: z.string().trim().min(1, "กรุณาระบุเหตุผลการยืม").max(200),
  dueDate: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
});

const returnBodySchema = z.object({
  returnedById: z.number().int().positive(),
});

const listQuerySchema = z.object({
  status: z.enum(["ACTIVE", "RETURNED", "OVERDUE"]).optional(),
  search: z.string().trim().max(50).optional(),
});

const borrowParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const borrowInclude = {
  medicalRecord: true,
  borrower: { include: { department: true } },
  department: true,
} as const;

type BorrowWithRelations = Prisma.BorrowGetPayload<{ include: typeof borrowInclude }>;

function serializeBorrow(b: BorrowWithRelations) {
  const view = toBorrowView(b);
  return {
    id: b.id,
    hn: b.medicalRecord.hn,
    patientName: b.medicalRecord.patientName,
    borrower: b.borrower.fullName,
    department: b.department.name,
    reason: b.reason,
    dueDate: b.dueDate,
    status: view.status,
    statusLabel: BORROW_STATUS_LABEL[view.status],
    returnedAt: b.returnedAt,
  };
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
    const { hn, borrowerId, reason, dueDate } = body.data;
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
      if (record.status !== "AVAILABLE") throw Errors.recordNotAvailable();

      const borrow = await tx.borrow.create({
        data: {
          medicalRecordId: record.id,
          borrowerId,
          departmentId: borrowerDepartmentId,
          reason,
          dueDate,
        },
      });
      await tx.medicalRecord.update({
        where: { id: record.id },
        data: { status: "BORROWED" },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "BORROW",
          entity: "Borrow",
          entityId: String(borrow.id),
          detail: { hn: record.hn, medicalRecordId: record.id },
        },
      });
      return borrow;
    });

    const borrow = await prisma.borrow.findUniqueOrThrow({ where: { id: result.id }, include: borrowInclude });
    return reply.status(201).send({ borrow: serializeBorrow(borrow) });
  });

  // คืนแฟ้ม — เฉพาะ ADMIN
  app.post(
    "/borrows/:id/return",
    { preHandler: [authenticate, requireRoles("ADMIN")] },
    async (request, reply) => {
      const params = borrowParamsSchema.safeParse(request.params);
      const body = returnBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: "ข้อมูลไม่ถูกต้อง" },
        });
      }
      const { id } = params.data;
      const { returnedById } = body.data;

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
      if (returnedById !== borrow.borrowerId) {
        throw Errors.wrongReturner();
      }

      const actorId = request.user.id;

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.borrow.update({
          where: { id },
          data: { status: "RETURNED", returnedAt: new Date(), returnedById },
        });
        await tx.medicalRecord.update({
          where: { id: borrow.medicalRecordId },
          data: { status: "AVAILABLE" },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "RETURN",
            entity: "Borrow",
            entityId: String(id),
            detail: { hn: borrow.medicalRecord.hn },
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

    const borrows = await prisma.borrow.findMany({
      where: {
        ...(status === "RETURNED" ? { status: "RETURNED" as const } : {}),
        ...(status === "ACTIVE" || status === "OVERDUE" ? { status: "ACTIVE" as const } : {}),
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
