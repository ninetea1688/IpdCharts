import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // รายชื่อผู้ใช้ สำหรับ dropdown ในแบบฟอร์ม
  app.get("/users", async (_request, reply) => {
    const users = await prisma.user.findMany({
      include: { department: true },
      orderBy: { fullName: "asc" },
    });
    return reply.send({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        department: u.department?.name ?? null,
      })),
    });
  });
}
