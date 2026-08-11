import type { FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "./prisma.js";
import { AppError } from "./errors.js";

/** ผู้ใช้ที่ผ่านการยืนยันตัวตนแล้ว — attach ไว้ที่ request.user โดย authenticate */
export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  departmentId: number | null;
  department: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser;
  }
}

const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 ชั่วโมง

function jwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

interface TokenPayload {
  sub: string;
  role: Role;
  departmentId: number | null;
  fullName: string;
}

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    role: user.role,
    departmentId: user.departmentId,
    fullName: user.fullName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    // jose ตีความ number เป็น Unix timestamp สัมบูรณ์ — ต้องบวกจากเวลาปัจจุบันเอง
    .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
    .sign(jwtSecret());
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ["HS256"] });
  const sub = payload.sub;
  if (!sub) {
    throw new Error("token payload missing subject");
  }
  return {
    sub,
    role: payload.role as Role,
    departmentId: typeof payload.departmentId === "number" ? payload.departmentId : null,
    fullName: typeof payload.fullName === "string" ? payload.fullName : "",
  };
}

/** onRequest hook — ตรวจ Bearer token แล้วโหลด user จาก DB ใส่ request.user */
export async function authenticate(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
  }
  try {
    const payload = await verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      include: { department: true },
    });
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
    }
    request.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department?.name ?? null,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
  }
}

/**
 * preHandler hook — จำกัดสิทธิ์ตามบทบาท (ต้องรันตามหลัง authenticate)
 *
 * ต้องเป็น async: Fastify ส่ง `done` เป็นพารามิเตอร์ที่ 3 เสมอ และจะรอ callback
 * ถ้า hook ไม่คืน promise — hook แบบ sync ที่ผ่านสิทธิ์จะทำให้ request ค้างถาวร
 */
export function requireRoles(...roles: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!roles.includes(request.user.role)) {
      throw new AppError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้");
    }
  };
}
