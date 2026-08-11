import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { recordRoutes } from "./routes/records.js";
import { borrowRoutes } from "./routes/borrows.js";
import { incidentRoutes } from "./routes/incidents.js";
import { userRoutes } from "./routes/users.js";
import { departmentRoutes } from "./routes/departments.js";
import { statsRoutes } from "./routes/stats.js";
import { labelRoutes } from "./routes/labels.js";
import { reportRoutes } from "./routes/reports.js";

/**
 * นโยบาย CORS
 * - ตั้ง CORS_ORIGIN (คั่นด้วย comma) เมื่อ frontend อยู่คนละ origin กับ API
 * - ไม่ตั้งบน production = อนุญาตเฉพาะ same-origin ซึ่งเป็นกรณีปกติของ deploy นี้
 *   (nginx proxy /api ไปหลังบ้าน จึงเป็น origin เดียวกันอยู่แล้ว)
 * - ไม่ตั้งบน dev = อนุญาตทุก origin เพื่อความสะดวก
 */
function corsOrigin(): string[] | boolean {
  const configured = process.env.CORS_ORIGIN?.trim();
  if (configured) {
    return configured
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return process.env.NODE_ENV === "production" ? false : true;
}

/**
 * นับลิมิตล็อกอินแยกตาม "IP + ชื่อผู้ใช้" ไม่ใช่ IP อย่างเดียว
 *
 * โรงพยาบาลออกอินเทอร์เน็ตผ่าน NAT ไม่กี่ IP — ถ้านับต่อ IP ล้วน
 * ช่วงเปลี่ยนเวรที่เจ้าหน้าที่ล็อกอินพร้อมกันหลายคนจะโดนบล็อกทั้งที่ไม่ได้ทำอะไรผิด
 * การผูกกับชื่อผู้ใช้ทำให้ยังกันการเดารหัสผ่านรายบัญชีได้ โดยไม่ล็อกคนทั้งตึกออกจากระบบ
 */
function loginRateLimitKey(request: { ip: string; body?: unknown }): string {
  const body = request.body;
  const username =
    typeof body === "object" && body !== null && "username" in body && typeof body.username === "string"
      ? body.username.trim().toLowerCase()
      : "";
  return `${request.ip}:${username}`;
}

/** สร้าง Fastify app — แยกจาก server.ts เพื่อให้ test inject ได้โดยไม่ต้อง listen */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: true });

  app.register(cors, { origin: corsOrigin() });

  // ลงทะเบียนแบบไม่ global — เปิดใช้เฉพาะ route ที่ประกาศ config.rateLimit (ดู routes/auth.ts)
  // การจัดรูปแบบ response อยู่ที่ error handler ด้านล่าง จะได้มีที่เดียว
  // hook: preHandler จำเป็น — ปริยายคือ onRequest ซึ่ง body ยังไม่ถูก parse
  // ทำให้ keyGenerator อ่าน username ไม่ได้และตกไปนับต่อ IP ล้วน
  app.register(rateLimit, { global: false, hook: "preHandler", keyGenerator: loginRateLimitKey });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    // @fastify/rate-limit โยน error ที่มี statusCode 429 เข้ามาที่นี่
    // ถ้าไม่ดักไว้จะกลายเป็น 500 และผู้ใช้จะไม่รู้ว่าโดนจำกัดจำนวนครั้ง
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
        },
      });
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
    api.register(incidentRoutes);
    api.register(userRoutes);
    api.register(departmentRoutes);
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
