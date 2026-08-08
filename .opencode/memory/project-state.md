# Project State — IpdCharts

> อัปเดตล่าสุด: 2026-08-08 (v1 — backend + frontend MVP พร้อมใช้งาน)

## สถานะปัจจุบัน
- [x] PRD v1.0 อนุมัติเป็นแหล่ง requirements หลัก (`prd/prd.md`)
- [x] git init (branch `main`) + .gitignore (มี `.env` ignore — PDPA)
- [x] โครงพื้นฐาน agent config: AGENTS.md, commands, skills, agents, hooks, memory
- [x] `docker-compose.yml` — PostgreSQL dev (`ipdcharts-postgres`, port 5432)
- [x] `backend/` — Fastify + TS strict + Prisma + Zod
  - Schema: `MedicalRecord`, `Borrow`, `User`, `Department`, `AuditLog` (migration + seed 12 แฟ้ม / 4 users)
  - API `/api/v1/*`: records, records/:id, borrows, borrows/:id/return, users, stats, health
  - Tests: `app.test.ts` 14/14 ผ่าน (test DB `ipdcharts_test`), ใช้ `bun test --preload ./src/test/preload.ts`
- [x] `frontend/` — React 19 + Vite + TS strict + Tailwind v4 (ไม่ใช้ shadcn CLI)
  - หน้า: Dashboard, ยืมแฟ้ม, คืนแฟ้ม, รายการแฟ้ม (search + filter), ประวัติแฟ้ม
  - `bun run typecheck` + `bun run build` ผ่าน
- [x] P0 หลัก verified ในเบราว์เซอร์จริง: ยืม → คืน → ค้นหา → ดูประวัติ → error path (ยืมซ้ำ)
- [ ] P1+: auth/login + RBAC middleware จริง (ตอนนี้ทุก user ผ่านหมด, role มีใน DB)
- [ ] P1+: dashboard เรียลไทม์ (ตอนนี้ poll + ปุ่มรีเฟรช), แจ้งเตือน overdue
- [ ] P1+: scan QR/barcode (ตอนนี้กรอก HN ตัวเลข)
- [ ] P1+: รายงาน/สถิติสำหรับหัวหน้าหน่วยงาน

## งานค้าง / ถัดไป
1. auth + JWT + RBAC middleware (`roles` มีใน schema แล้ว, ยังไม่มี login)
2. scan barcode จากกล้อง
3. real-time (SSE/WebSocket) + notification overdue
4. รายงานหน่วยงาน

## สิ่งที่ยังไม่ตัดสินใจ
- (ว่าง — ดู decisions.md; ความคืบหน้า ADR: D-001..D-011)
