# Project State — IpdCharts

> อัปเดตล่าสุด: 2026-08-08 (v0 — เริ่มโปรเจค)

## สถานะปัจจุบัน
- [x] PRD v1.0 อนุมัติเป็นแหล่ง requirements หลัก (`prd/prd.md`)
- [x] git init (branch `main`) + .gitignore
- [x] โครงพื้นฐาน agent config: AGENTS.md, commands, skills, agents, hooks, memory
- [ ] Scaffold `frontend/` (React+Vite+TS+Tailwind+shadcn/ui)
- [ ] Scaffold `backend/` (Fastify+TS+Prisma)
- [ ] `docker-compose.yml` (PostgreSQL dev)
- [ ] Prisma schema เริ่มต้น + migration + seed
- [ ] P0 features (ดู PRD — 12 user stories, เริ่ม P0)

## งานค้าง / ถัดไป
1. Scaffold backend: Fastify + TS + Prisma + Zod + tests
2. Scaffold frontend: Vite + Tailwind + shadcn/ui + react-router
3. Schema แรก: MedicalRecord, Borrow, User, Department, AuditLog
4. P0: ยืม-คืนผ่าน barcode scan + dashboard เรียลไทม์

## สิ่งที่ยังไม่ตัดสินใจ
- (ว่าง — ดู decisions.md สำหรับเรื่องที่ตัดสินแล้ว)
