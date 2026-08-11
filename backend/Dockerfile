# build context = repo root (ดู docker-compose.yml) เพราะ bun.lock อยู่ที่ root ของ workspace

# ---- Build stage ----
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# ติดตั้ง dependencies ก่อน (layer caching) — ต้องมี package.json ของทุก workspace
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN bun install --frozen-lockfile

# Prisma client ต้อง generate ก่อน tsc ไม่งั้น type ของ model จะไม่มี
COPY backend/prisma ./backend/prisma/
RUN bunx prisma generate --schema backend/prisma/schema.prisma

COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src/
RUN bun run --cwd backend build

# ---- Production stage ----
FROM oven/bun:1-alpine

WORKDIR /app

# ยก node_modules มาทั้งก้อน — รวม Prisma client ที่ generate แล้ว
# และ prisma CLI ที่ต้องใช้รัน migrate deploy ตอน container start
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY package.json bun.lock ./
COPY backend/package.json ./backend/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# ต้องใช้ 127.0.0.1 ไม่ใช่ localhost — ในอิมเมจนี้ localhost resolve เป็น ::1 (IPv6)
# แต่ Fastify listen ที่ 0.0.0.0 ซึ่งเป็น IPv4 เท่านั้น healthcheck จึงถูกปฏิเสธตลอด
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1

# apply migration ก่อนเสมอ — DB ใหม่จะได้มีตารางครบก่อน API รับ request
CMD ["sh", "-c", "bunx prisma migrate deploy --schema backend/prisma/schema.prisma && bun run backend/dist/server.js"]
