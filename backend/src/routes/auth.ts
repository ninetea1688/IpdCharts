import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import { authenticate, signAccessToken, verifyPassword } from "../lib/auth.js";

const loginBodySchema = z.object({
  username: z.string().trim().min(1, "กรุณาระบุชื่อผู้ใช้").max(50),
  password: z.string().min(1, "กรุณาระบุรหัสผ่าน").max(100),
});

function serializeUser(u: {
  id: number;
  username: string;
  fullName: string;
  role: string;
  department: { name: string } | null;
}) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    department: u.department?.name ?? null,
  };
}

/**
 * จำกัดจำนวนครั้งการล็อกอินต่อ IP — กัน brute-force รหัสผ่าน
 * ปิดได้ด้วย AUTH_RATE_LIMIT_MAX=0
 * อ่านค่าตอน buildApp() ไม่ใช่ตอน import เพื่อให้ test สร้าง app ที่มีลิมิตต่างกันได้
 */
function loginRateLimitConfig(): { max: number; timeWindow: string } | false {
  const max = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
  if (!Number.isFinite(max) || max <= 0) return false;
  return { max, timeWindow: process.env.AUTH_RATE_LIMIT_WINDOW ?? "1 minute" };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // เข้าสู่ระบบ — ได้ token + ข้อมูลผู้ใช้
  app.post("/auth/login", { config: { rateLimit: loginRateLimitConfig() } }, async (request, reply) => {
    const body = loginBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: body.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" },
      });
    }
    const { username, password } = body.data;

    const user = await prisma.user.findUnique({ where: { username }, include: { department: true } });
    const passwordOk =
      user && user.active && user.passwordHash !== "" ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !passwordOk) {
      // ข้อความเดียวกันทั้งกรณีไม่พบผู้ใช้/รหัสผิด — ป้องกัน user enumeration
      throw Errors.invalidCredentials();
    }

    const authUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department?.name ?? null,
    };
    const token = await signAccessToken(authUser);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "LOGIN",
        entity: "User",
        entityId: String(user.id),
        detail: { username: user.username },
      },
    });

    return reply.send({ token, user: serializeUser(user) });
  });

  // ข้อมูลผู้ใช้ปัจจุบัน (ใช้ตรวจ token ตอนเปิดแอป)
  app.get("/auth/me", { preHandler: authenticate }, async (request, reply) => {
    return reply.send({ user: request.user });
  });
}
