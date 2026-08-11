import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Role } from "@prisma/client";
import { buildApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { hashPassword } from "./lib/auth.js";
import { resetDb } from "./test/helpers.js";

const app = buildApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function seedUser(overrides = {}) {
  const passwordHash = await hashPassword("password123");
  return prisma.user.create({
    data: {
      username: "test-admin",
      fullName: "Test Admin",
      role: Role.ADMIN,
      passwordHash,
      ...overrides,
    },
  });
}

async function login(username: string, password: string) {
  return app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { username, password },
  });
}

describe("POST /api/v1/auth/login", () => {
  it("login success - returns token and user", async () => {
    await seedUser();
    const res = await login("test-admin", "password123");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(20);
    expect(body.user.username).toBe("test-admin");
    expect(body.user.role).toBe("ADMIN");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("wrong password returns 401", async () => {
    await seedUser();
    const res = await login("test-admin", "wrong-password");
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("unknown user returns 401", async () => {
    await seedUser();
    const res = await login("no-such-user", "password123");
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("empty username returns 400", async () => {
    const res = await login(" ", "password123");
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("user without passwordHash cannot login", async () => {
    await prisma.user.create({
      data: { username: "legacy-user", fullName: "Legacy", role: "ADMIN" },
    });
    const res = await login("legacy-user", "password123");
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("login creates audit log", async () => {
    await seedUser();
    await login("test-admin", "password123");
    expect(await prisma.auditLog.count({ where: { action: "LOGIN" } })).toBe(1);
  });

  // regression: setExpirationTime(number) ใน jose = Unix timestamp สัมบูรณ์
  // เคยส่ง 43200 ตรงๆ ทำให้ token หมดอายุตั้งแต่วินาทีที่ออก (exp = 1970-01-01)
  it("token ที่ออกใหม่ต้องยังไม่หมดอายุ (exp อยู่ในอนาคต)", async () => {
    await seedUser();
    const res = await login("test-admin", "password123");
    const token: string = res.json().token;
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as {
      exp: number;
      iat: number;
    };
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(nowSeconds);
    expect(payload.exp - payload.iat).toBe(12 * 60 * 60);
  });
});

describe("GET /api/v1/auth/me", () => {
  async function authedUser() {
    const user = await seedUser();
    const res = await login("test-admin", "password123");
    return { user, token: res.json().token };
  }

  it("valid token returns user", async () => {
    const { user, token } = await authedUser();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(user.id);
    expect(res.json().user.username).toBe("test-admin");
    expect(res.json().user.fullName).toBe("Test Admin");
  });

  it("no token returns 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("fake token returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("deleted user token returns 401", async () => {
    const { user, token } = await authedUser();
    await prisma.user.delete({ where: { id: user.id } });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });
});
