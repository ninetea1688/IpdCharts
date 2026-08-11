import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { recordRoutes } from "./routes/records.js";
import { borrowRoutes } from "./routes/borrows.js";
import { userRoutes } from "./routes/users.js";
import { statsRoutes } from "./routes/stats.js";
import { labelRoutes } from "./routes/labels.js";
import { reportRoutes } from "./routes/reports.js";

/** สร้าง Fastify app — แยกจาก server.ts เพื่อให้ test inject ได้โดยไม่ต้อง listen */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      const message = err.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง";
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลที่ต้องการ" } });
    }
    reqLog(err);
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่" },
    });
  });

  app.register(async (api) => {
    api.register(healthRoutes);
    api.register(authRoutes);
    api.register(recordRoutes);
    api.register(borrowRoutes);
    api.register(userRoutes);
    api.register(statsRoutes);
    api.register(labelRoutes);
    api.register(reportRoutes);
  }, { prefix: "/api/v1" });

  return app;
}

function reqLog(err: unknown): void {
  // eslint-disable-next-line no-console
  console.error("[unhandled]", err);
}
