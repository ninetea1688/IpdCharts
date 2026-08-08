# AGENTS.md — IpdCharts

ระบบยืม-คืนเวชระเบียนผู้ป่วยใน (IPD Medical Record Borrow-Return Tracking System)

เอกสารอ้างอิงหลัก:
- **PRD**: [prd/prd.md](prd/prd.md) — แหล่ง requirements เพียงหนึ่งเดียว (เวอร์ชัน 1.0)
- **โดเมน**: `.opencode/skills/ipd-domain/SKILL.md` — entities, สถานะ, นโยบาย
- **Memory**: `.opencode/memory/` — project-state, decisions, glossary

---

## ภาพรวม

ระบบติดตามการยืม-คืนแฟ้มเวชระเบียนผู้ป่วยใน (IPD) เพื่อแทนที่การจดสมุด/Excel
ด้วย **QR/Barcode scan + Dashboard เรียลไทม์ + แจ้งเตือนแฟ้มเกินกำหนด**

เป้าหมาย (จาก PRD):
- ลดแฟ้มสูญหาย ≥ 80%
- ค้นหาว่าแฟ้มอยู่กับใครได้ใน < 10 วินาที
- อัตราคืนตรงเวลา ≥ 90%
- Adoption 100% ภายในเดือนแรก

## Tech Stack

| ชั้น | เทคโนโลยี |
|---|---|
| Frontend | React (Vite) + TypeScript + TailwindCSS (components เขียนเอง) |
| Backend | Node.js + Fastify + TypeScript |
| Data | Prisma ORM + PostgreSQL |
| Scan | QR/Barcode (กล้องมือถือ/สแกนเนอร์) |

## โครงสร้าง Repository (เป้าหมาย)

```
IpdCharts/
├── prd/prd.md                  # PRD (อ่านก่อนเสมอ)
├── AGENTS.md                   # ไฟล์นี้
├── .opencode/
│   ├── command/                # Slash commands
│   ├── skills/ipd-domain/      # Domain skill
│   ├── agent/                  # Subagents
│   ├── hooks/                  # PreToolUse hooks
│   └── memory/                 # Project memory
├── frontend/                   # React + Vite + TS + Tailwind + shadcn/ui
├── backend/                    # Fastify + TS + Prisma
└── docker-compose.yml          # PostgreSQL (dev)
```

> หมายเหตุ: `frontend/` + `backend/` สร้างแล้ว (v1) — โครงสร้างตรงตามข้างบน; UI components เขียนเอง ไม่ใช้ shadcn CLI (ดู decisions.md D-007)

## คำสั่งที่ใช้บ่อย

```bash
# ---- Dev ----
bun install                        # ติดตั้ง dependencies (bun เป็น package manager หลัก)
bun run dev                        # dev server (ทั้ง frontend/backend หลัง scaffold)
bun run build                      # build production
bun run typecheck                  # tsc --noEmit

# ---- Database ----
bunx prisma migrate dev            # สร้าง migration + apply (dev)
bunx prisma migrate deploy         # apply migration (prod)
bunx prisma studio                 # เปิด UI ดูข้อมูล
bunx prisma generate               # regenerate client
bunx prisma db seed                # seed ข้อมูลทดสอบ

# ---- Test ----
bun test                           # unit/integration tests
```

## ข้อตกลง (Conventions)

### โค้ด
- **TypeScript strict mode เสมอ** — ห้าม `any`, `@ts-ignore`, `@ts-expect-error`
- **ภาษา UI = ไทย** — ข้อความที่ผู้ใช้เห็น (ปุ่ม, label, toast, error) ภาษาไทย
  ชื่อตัวแปร/ฟังก์ชัน/ตาราง = อังกฤษ (PascalCase ไฟล์คอมโพเนนต์, camelCase ฟังก์ชัน)
- **Time zone = `Asia/Bangkok`** — คำนวณ overdue โดยใช้ UTC เก็บใน DB, แปลงโซนที่ render
- API endpoints: REST, `/api/v1/*`, snake_case ใน Prisma schema
- Error handling: ทุก route มี validation (Zod หรือ schema) + error response แบบเดียวกัน
- ไม่มี `console.log` ตกค้างในโค้ดที่ส่ง PR

### โดเมน (สรุปย่อ — รายละเอียดใน skill `ipd-domain`)
- **แฟ้มเวชระเบียน (MedicalRecord)**: มี barcode เลขประจำตัวผู้ป่วย (HN)
- **การยืม (Borrow)**: บังคับมีผู้ยืม + หน่วยงาน + เหตุผล + **กำหนดคืน (dueDate)**
- **สถานะหลัก**: `available` → `borrowed` → `returned` (หรือ `overdue` ถ้าเกิน dueDate)
- **เกินกำหนด**: dueDate + 7 วัน ตาม PRD (ระบบเตือนก่อน/หลังครบกำหนด)
- **สิทธิ์ (Roles)**: เจ้าหน้าที่เวชระเบียน (admin), แพทย์/พยาบาล (ผู้ยืม), หัวหน้าหน่วยงาน (ดูรายงาน)

## Definition of Done

ทุก feature/PR ต้อง:
1. ผ่าน `bun run typecheck` และ `bun test`
2. ครอบคลุม test สำหรับ: happy path + error path (ยืมแฟ้มที่ไม่อยู่, คืนผิดคน, overdue alert)
3. ลง migration ให้เรียบร้อย (ถ้าแตะ schema) และอัปเดต skill `ipd-domain` ถ้าโดเมนเปลี่ยน
4. อัปเดต `.opencode/memory/decisions.md` เมื่อมีการตัดสินใจทางเทคนิคใหม่
5. ไม่มี TODO/FIXME ค้าง

## ความปลอดภัย (PDPA / ข้อมูลผู้ป่วย)

- **ห้าม** ข้อมูลผู้ป่วย (ชื่อ, HN, วินิจฉัย) ใน commit message / PR description / screenshot
- `.env` ต้องไม่เข้า git — ใช้ `.env.example` เสมอ
- ทุก action (ยืม/คืน/แก้) ต้องมี **audit log** (ใคร, เมื่อไหร่, ทำอะไร)
- RBAC: middleware ตรวจสิทธิ์ทุกระดับ, ไม่ใช่แค่ซ่อนปุ่มหน้าบ้าน

## วิธีทำงานกับ Agent

- งานใหม่ → ใช้ `/feature` (อ่าน PRD user story → plan → implement → test)
- ตรวจโค้ด → `/review`
- แตะ DB → `/db`
- อยากรู้ศัพท์โดเมน → โหลด skill `ipd-domain` ก่อนเขียนโค้ด
- ดูสถานะโปรเจค → `.opencode/memory/project-state.md`
