---
description: สร้าง/implement feature จาก PRD user story — อ่าน PRD → plan → implement → test
---

# Feature Workflow

อ่าน [prd/prd.md](../prd/prd.md) ก่อนเสมอ แล้วทำตามขั้นตอน:

## 1. หา User Story
- ระบุ user story ที่ต้องการ implement (จาก epic/priority)
- โหลด skill `ipd-domain` เพื่อยืนยันศัพท์โดเมนและนโยบาย

## 2. วางแผน (สั้นๆ)
- เขียนรายการงานย่อย (todo list) ก่อนเริ่ม
- ถ้าแตะ schema → ออกแบบ Prisma model ก่อน

## 3. Implement
- Backend: route `/api/v1/*` + Zod validation + error response มาตรฐาน
- Frontend: component + UI ภาษาไทย
- ใช้ agent เฉพาะทาง: `backend-dev`, `frontend-dev`, `schema-architect` ตามงาน

## 4. Test
- happy path + error path:
  - ยืมแฟ้มที่ไม่อยู่ → error
  - คืนผิดคน/แฟ้มไม่ใช่ของที่ยืม → error
  - overdue alert ทำงานถูกต้อง
- ผ่าน `bun run typecheck` + `bun test`

## 5. Definition of Done
- [ ] typecheck + tests ผ่าน
- [ ] migration ลงแล้ว (ถ้าแตะ schema) + อัปเดต skill `ipd-domain`
- [ ] อัปเดต `decisions.md` ถ้ามีการตัดสินใจใหม่
- [ ] ไม่มี TODO/FIXME ค้าง
- [ ] ไม่มีข้อมูลผู้ป่วยใน commit/PR
