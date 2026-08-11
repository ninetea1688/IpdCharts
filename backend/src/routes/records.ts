import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { isOverdue, RECORD_STATUS_LABEL } from "../lib/domain.js";
import { authenticate } from "../lib/auth.js";

const recordQuerySchema = z.object({
  search: z.string().trim().max(50).optional(),
  status: z.enum(["AVAILABLE", "BORROWED"]).optional(),
});

const recordParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const recordWithBorrow = {
  borrows: {
    where: { status: "ACTIVE" },
    include: {
      borrower: { include: { department: true } },
      department: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

export async function recordRoutes(app: FastifyInstance): Promise<void> {
  app.get("/medical-records", { preHandler: [authenticate] }, async (request, reply) => {
    const query = recordQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: query.error.issues[0]?.message ?? "พารามิเตอร์ไม่ถูกต้อง" },
      });
    }
    const { search, status } = query.data;
    const records = await prisma.medicalRecord.findMany({
      where: {
        ...(search ? { OR: [{ hn: { contains: search } }, { patientName: { contains: search } }] } : {}),
        ...(status ? { status } : {}),
      },
      include: recordWithBorrow,
      orderBy: { hn: "asc" },
      take: 200,
    });

    return reply.send({
      records: records.map((r) => {
        const activeBorrow = r.borrows[0] ?? null;
        return {
          id: r.id,
          hn: r.hn,
          patientName: r.patientName,
          status: r.status,
          statusLabel: RECORD_STATUS_LABEL[r.status],
          activeBorrow: activeBorrow
            ? {
                id: activeBorrow.id,
                borrower: activeBorrow.borrower.fullName,
                department: activeBorrow.department.name,
                dueDate: activeBorrow.dueDate,
                reason: activeBorrow.reason,
                overdue: isOverdue(activeBorrow.dueDate),
              }
            : null,
        };
      }),
    });
  });

  app.get("/medical-records/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const params = recordParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "รหัสแฟ้มไม่ถูกต้อง" },
      });
    }

    const record = await prisma.medicalRecord.findUnique({
      where: { id: params.data.id },
      include: {
        borrows: {
          include: { borrower: true, returnedBy: true, department: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!record) {
      return reply.status(404).send({ error: { code: "RECORD_NOT_FOUND", message: "ไม่พบแฟ้มเวชระเบียน" } });
    }
    const activeBorrow = record.borrows.find((b) => b.status === "ACTIVE") ?? null;
    const history = record.borrows.filter((b) => b.status !== "ACTIVE");

    return reply.send({
      record: {
        id: record.id,
        hn: record.hn,
        patientName: record.patientName,
        status: record.status,
        activeBorrow: activeBorrow
          ? {
              id: activeBorrow.id,
              borrower: activeBorrow.borrower.fullName,
              department: activeBorrow.department.name,
              dueDate: activeBorrow.dueDate,
              reason: activeBorrow.reason,
              overdue: isOverdue(activeBorrow.dueDate),
            }
          : null,
        history: history.map((b) => ({
          id: b.id,
          action: b.status === "RETURNED" ? "คืนแล้ว" : "ถูกยืม",
          borrower: b.borrower.fullName,
          department: b.department.name,
          reason: b.reason,
          dueDate: b.dueDate,
          returnedAt: b.returnedAt,
          returnedBy: b.returnedBy?.fullName ?? null,
        })),
      },
    });
  });
}
