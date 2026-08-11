import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../lib/auth.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users", { preHandler: [authenticate] }, async (_request, reply) => {
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
