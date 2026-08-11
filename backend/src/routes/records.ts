import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  isOverdue,
  RECORD_STATUS_LABEL,
} from "../lib/domain.js";
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

/**
 * บันทึกการเข้าถึงข้อมูลผู้ป่วย — NFR ด้าน PDPA กำหนดให้ audit ทุกการเข้าถึง
 * เขียนแบบไม่ block คำตอบ: ถ้า audit ล้มเหลวไม่ควรทำให้ผู้ใช้ดูข้อมูลไม่ได้
 * แต่ต้องเห็นใน log ว่าพลาด
 */
function auditRead(
  actorId: number,
  action: "RECORD_SEARCH" | "RECORD_VIEW",
  detail: Prisma.InputJsonValue,
): void {
  void prisma.auditLog
    .create({ data: { actorId, action, entity: "MedicalRecord", detail } })
    .catch((err: unknown) => console.error(`[audit] บันทึก ${action} ไม่สำเร็จ:`, err));
}

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

    auditRead(request.user.id, "RECORD_SEARCH", {
      search: search ?? null,
      status: status ?? null,
      resultCount: records.length,
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
        incidents: {
          include: { reportedBy: true, resolvedBy: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!record) {
      return reply.status(404).send({ error: { code: "RECORD_NOT_FOUND", message: "ไม่พบแฟ้มเวชระเบียน" } });
    }

    auditRead(request.user.id, "RECORD_VIEW", { hn: record.hn, medicalRecordId: record.id });

    const activeBorrow = record.borrows.find((b) => b.status === "ACTIVE") ?? null;
    const history = record.borrows.filter((b) => b.status !== "ACTIVE");

    return reply.send({
      record: {
        id: record.id,
        hn: record.hn,
        patientName: record.patientName,
        status: record.status,
        statusLabel: RECORD_STATUS_LABEL[record.status],
        incidents: record.incidents.map((i) => ({
          id: i.id,
          type: i.type,
          typeLabel: INCIDENT_TYPE_LABEL[i.type],
          status: i.status,
          statusLabel: INCIDENT_STATUS_LABEL[i.status],
          description: i.description,
          reportedBy: i.reportedBy.fullName,
          resolvedBy: i.resolvedBy?.fullName ?? null,
          resolvedAt: i.resolvedAt,
          resolutionNote: i.resolutionNote,
          createdAt: i.createdAt,
        })),
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
