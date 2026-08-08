import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { isOverdue } from "../lib/domain.js";

/** เริ่มต้นวันนี้ตามโซน Asia/Bangkok (UTC+7) */
function startOfTodayBangkok(now: Date = new Date()): Date {
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  bangkokNow.setUTCHours(0, 0, 0, 0);
  return new Date(bangkokNow.getTime() - 7 * 60 * 60 * 1000);
}

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stats", async (_request, reply) => {
    const [totalRecords, available, activeBorrows, returnedToday] = await Promise.all([
      prisma.medicalRecord.count(),
      prisma.medicalRecord.count({ where: { status: "AVAILABLE" } }),
      prisma.borrow.findMany({ where: { status: "ACTIVE" }, select: { dueDate: true } }),
      prisma.borrow.count({ where: { status: "RETURNED", returnedAt: { gte: startOfTodayBangkok() } } }),
    ]);

    const borrowed = activeBorrows.length;
    const overdue = activeBorrows.filter((b) => isOverdue(b.dueDate)).length;

    return reply.send({
      stats: {
        totalRecords,
        available,
        borrowed,
        overdue,
        returnedToday,
      },
    });
  });
}
