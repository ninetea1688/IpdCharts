import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL } from "../lib/domain.js";
import { authenticate, requireRoles } from "../lib/auth.js";
import { formatIncidentMessage, notify } from "../lib/notifications.js";

const createBodySchema = z.object({
  hn: z.string().regex(/^\d{8,10}$/, "HN ต้องเป็นตัวเลข 8-10 หลัก"),
  type: z.enum(["DAMAGED", "LOST"]),
  description: z.string().trim().min(1, "กรุณาระบุรายละเอียด").max(300),
});

const listQuerySchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]).optional(),
  type: z.enum(["DAMAGED", "LOST"]).optional(),
});

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });

const resolveBodySchema = z.object({
  note: z.string().trim().min(1, "กรุณาระบุผลการดำเนินการ").max(300),
  /** คืนแฟ้มกลับสู่สถานะพร้อมยืมหรือไม่ (เช่น ซ่อมเสร็จ / พบแฟ้มแล้ว) */
  restoreRecord: z.boolean().default(false),
});

const incidentInclude = {
  medicalRecord: true,
  reportedBy: true,
  resolvedBy: true,
  borrow: { include: { borrower: true, department: true } },
} as const;

type IncidentWithRelations = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

function serializeIncident(i: IncidentWithRelations) {
  return {
    id: i.id,
    hn: i.medicalRecord.hn,
    patientName: i.medicalRecord.patientName,
    type: i.type,
    typeLabel: INCIDENT_TYPE_LABEL[i.type],
    status: i.status,
    statusLabel: INCIDENT_STATUS_LABEL[i.status],
    description: i.description,
    reportedBy: i.reportedBy.fullName,
    borrower: i.borrow?.borrower.fullName ?? null,
    department: i.borrow?.department.name ?? null,
    resolvedBy: i.resolvedBy?.fullName ?? null,
    resolvedAt: i.resolvedAt,
    resolutionNote: i.resolutionNote,
    createdAt: i.createdAt,
  };
}

/** แจ้งผู้เกี่ยวข้อง: เจ้าหน้าที่เวชระเบียนทุกคน + หัวหน้าหน่วยงานของผู้ยืม (ถ้ามี) */
async function notifyStakeholders(params: {
  hn: string;
  patientName: string;
  type: "DAMAGED" | "LOST";
  description: string;
  reportedBy: string;
  departmentId: number | null;
}): Promise<string[]> {
  const receivers = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: "ADMIN" },
        ...(params.departmentId != null
          ? [{ role: "DEPARTMENT_HEAD" as const, departmentId: params.departmentId }]
          : []),
      ],
    },
  });

  const message = formatIncidentMessage(params);
  const delivered: string[] = [];
  for (const receiver of receivers) {
    const result = await notify(
      { fullName: receiver.fullName, email: receiver.email, lineUserId: receiver.lineUserId },
      message,
    );
    if (result.channels.length > 0) delivered.push(receiver.username);
  }
  return delivered;
}

export async function incidentRoutes(app: FastifyInstance): Promise<void> {
  // รายงานแฟ้มชำรุด/สูญหาย (FR-05)
  app.post("/incidents", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const body = createBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      });
    }
    const { hn, type, description } = body.data;
    const actorId = request.user.id;

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.medicalRecord.findUnique({ where: { hn } });
      if (!record) throw Errors.recordNotFound(hn);

      // ผูกกับรายการยืมที่ยังไม่ปิด ถ้ามี — แฟ้มสูญหายมักเกิดตอนอยู่กับผู้ยืม
      const activeBorrow = await tx.borrow.findFirst({
        where: { medicalRecordId: record.id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });

      const incident = await tx.incident.create({
        data: {
          medicalRecordId: record.id,
          borrowId: activeBorrow?.id ?? null,
          type,
          description,
          reportedById: actorId,
        },
      });

      await tx.medicalRecord.update({ where: { id: record.id }, data: { status: type } });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "INCIDENT_REPORT",
          entity: "Incident",
          entityId: String(incident.id),
          detail: { hn: record.hn, type, borrowId: activeBorrow?.id ?? null },
        },
      });

      return { incident, record, departmentId: activeBorrow?.departmentId ?? null };
    });

    // แจ้งเตือนนอก transaction — การส่งอีเมลช้าและล้มเหลวได้ ไม่ควรทำให้บันทึกล้มตาม
    const delivered = await notifyStakeholders({
      hn: created.record.hn,
      patientName: created.record.patientName,
      type,
      description,
      reportedBy: request.user.fullName,
      departmentId: created.departmentId,
    });

    const full = await prisma.incident.findUniqueOrThrow({
      where: { id: created.incident.id },
      include: incidentInclude,
    });
    return reply.status(201).send({ incident: serializeIncident(full), notified: delivered });
  });

  // รายการเหตุการณ์
  app.get("/incidents", { preHandler: [authenticate] }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ไม่ถูกต้อง" } });
    }
    const { status, type } = query.data;

    const incidents = await prisma.incident.findMany({
      where: { ...(status ? { status } : {}), ...(type ? { type } : {}) },
      include: incidentInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return reply.send({ incidents: incidents.map(serializeIncident) });
  });

  // ปิดเรื่อง
  app.post(
    "/incidents/:id/resolve",
    { preHandler: [authenticate, requireRoles("ADMIN")] },
    async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      const body = resolveBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: body.success ? "รหัสเหตุการณ์ไม่ถูกต้อง" : body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
          },
        });
      }
      const { id } = params.data;
      const { note, restoreRecord } = body.data;
      const actorId = request.user.id;

      const existing = await prisma.incident.findUnique({ where: { id } });
      if (!existing) throw Errors.incidentNotFound();
      if (existing.status === "RESOLVED") throw Errors.incidentAlreadyResolved();

      await prisma.$transaction(async (tx) => {
        await tx.incident.update({
          where: { id },
          data: { status: "RESOLVED", resolvedById: actorId, resolvedAt: new Date(), resolutionNote: note },
        });

        if (restoreRecord) {
          // เหลือ incident ที่ยังเปิดอยู่อีกไหม — ถ้ายังมี อย่าเพิ่งคืนแฟ้มเข้าชั้น
          const stillOpen = await tx.incident.count({
            where: { medicalRecordId: existing.medicalRecordId, status: "OPEN", id: { not: id } },
          });
          if (stillOpen === 0) {
            await tx.medicalRecord.update({
              where: { id: existing.medicalRecordId },
              data: { status: "AVAILABLE" },
            });
            // แฟ้มที่สูญหายแล้วพบ ต้องปิดรายการยืมที่ค้างอยู่ด้วย
            await tx.borrow.updateMany({
              where: { medicalRecordId: existing.medicalRecordId, status: "ACTIVE" },
              data: { status: "RETURNED", returnedAt: new Date() },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            actorId,
            action: "INCIDENT_RESOLVE",
            entity: "Incident",
            entityId: String(id),
            detail: { note, restoreRecord },
          },
        });
      });

      const full = await prisma.incident.findUniqueOrThrow({ where: { id }, include: incidentInclude });
      return reply.send({ incident: serializeIncident(full) });
    },
  );
}
