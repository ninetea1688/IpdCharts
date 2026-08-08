---
description: ตรวจโค้ดตาม Definition of Done — typecheck, tests, conventions, security
---

# Code Review

ตรวจตาม 2 แกน:

## 1. Standards (ตาม AGENTS.md)
- TypeScript strict — ไม่มี `any`, `@ts-ignore`, `@ts-expect-error`
- UI เป็นภาษาไทย, ชื่อตัวแปร/ตารางเป็นอังกฤษ
- Time zone `Asia/Bangkok` ถูกต้อง (UTC เก็บ, แปลงที่ render)
- Error handling: ทุก route มี validation + error response รูปแบบเดียวกัน
- ไม่มี `console.log` ตกค้าง, ไม่มี TODO/FIXME

## 2. Spec (ตรงตาม PRD)
- ตรงกับ user story ใน PRD หรือไม่
- Business rules ถูกต้อง (ยืม/คืน/overdue/สิทธิ์)

## 3. Security (PDPA)
- ไม่มีข้อมูลผู้ป่วย (ชื่อ, HN, วินิจฉัย) ใน commit/PR/screenshot
- ไม่มี secret ในโค้ด — `.env` เท่านั้น
- RBAC ตรวจฝั่ง server (ไม่ใช่แค่ซ่อนปุ่ม)
- มี audit log ทุก action

## Output
รายงานผล: ✅ ผ่าน / ⚠️ ต้องแก้ / ❌ ไม่ผ่าน พร้อม file:line และเหตุผล
