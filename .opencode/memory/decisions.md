# Decisions — IpdCharts

> บันทึกการตัดสินใจทางเทคนิค (ADR-lite) — เพิ่มเมื่อมีการตัดสินใจใหม่
> Format: วันที่ | เรื่อง | การตัดสินใจ | เหตุผล

---

## D-001 — 2026-08-08 | Monorepo structure
**การตัดสินใจ**: `frontend/` + `backend/` ใน repo เดียว, bun เป็น package manager หลัก
**เหตุผล**: โปรเจคขนาดเล็ก, ทีม dev-ops ง่าย, PRD ไม่ได้กำหนดแยก repo

## D-002 — 2026-08-08 | ภาษา UI
**การตัดสินใจ**: ข้อความที่ผู้ใช้เห็นเป็นภาษาไทยทั้งหมด; ชื่อโค้ด/ตารางเป็นอังกฤษ
**เหตุผล**: ผู้ใช้จริงคือบุคลากรโรงพยาบาลไทย; โค้ดต้องเป็นสากล

## D-003 — 2026-08-08 | Time zone
**การตัดสินใจ**: เก็บ `DateTime` เป็น UTC ใน DB, แปลงเป็น `Asia/Bangkok` ที่ชั้นแสดงผล
**เหตุผล**: หลีกเลี่ยง DST/clock drift, คำนวณ overdue เทียบที่เดียวกัน

## D-004 — 2026-08-08 | สถานะ `overdue` เป็น derived status
**การตัดสินใจ**: ไม่บันทึก `overdue` เป็นคอลัมน์ — คำนวณจาก `now > dueDate + 7 วัน`
ตอน query; ถ้าจำเป็นต้อง cache ให้ sync จาก rule เดียวกัน
**เหตุผล**: ลดความผิดพลาดจาก state ที่ไม่ sync กัน; rule ตาม PRD (เกิน 7 วัน)

## D-005 — 2026-08-08 | Safety hook
**การตัดสินใจ**: `opencode.json` ลง PreToolUse hook `guard-bash.sh` กันคำสั่งทำลายล้าง
(rm -rf root/home, force push, reset --hard, DROP/TRUNCATE, mkfs, dd)
**เหตุผล**: โปรเจคนี้มี data ผู้ป่วย — กันความเสียหายโดยไม่ตั้งใจจาก agent

## D-006 — 2026-08-08 | RBAC ฝั่ง server เท่านั้น
**การตัดสินใจ**: ตรวจสิทธิ์ที่ middleware ทุก request — ไม่ใช่แค่ซ่อนปุ่มใน UI
**เหตุผล**: ข้อมูลเวชระเบียนเป็นข้อมูลละเอียดอ่อน (PDPA); API ต้องป้องกันตัวเอง

## D-007 — 2026-08-08 | องค์ประกอบ UI เขียนเอง ไม่ใช้ shadcn CLI
**การตัดสินใจ**: `frontend/src/components/ui.tsx` — Button/Card/Badge/StatusBadge/Field/Input/Select/Banner/EmptyState เขียนเอง ด้วย clsx + tailwind-merge
**เหตุผล**: ควบคุม look & feel ตรง spec ไทย, ลด dependency tree, component น้อยชิ้นไม่คุ้ม shadcn CLI

## D-008 — 2026-08-08 | datetime-local + แสดงผล th-TH
**การตัดสินใจ**: ฟอร์มรับ `datetime-local` (ค่าเริ่มต้น now+3 วัน), เก็บ ISO UTC ขึ้น API, render ด้วย `Intl.DateTimeFormat("th-TH", {timeZone:"Asia/Bangkok"})`
**เหตุผล**: พ.ศ. ตามผู้ใช้จริง; backend บังคับ dueDate อนาคต (INVALID_DUE_DATE)

## D-009 — 2026-08-08 | Search/filter อยู่ใน URL
**การตัดสินใจ**: หน้า `/records` ใช้ `?search=&status=` (useSearchParams) — คัดลอกลิงก์/refresh คงสภาพ
**เหตุผล**: shareable + back/forward ทำงาน; ตาม D-003 ไม่มี server state เพิ่ม

## D-010 — 2026-08-08 | Error response รูปแบบเดียว
**การตัดสินใจ**: ทุก route error: `{error:{code,message}}` (message เป็นไทย), frontend `api.ts` แปลงเป็น `ApiError` + แสดง banner
**เหตุผล**: UI ไทยทุกกรณี; code ใช้เทสต์ assert ได้ตรงตัว

## D-011 — 2026-08-08 | Dev servers
**การตัดสินใจ**: backend port 3000, frontend 5173 + Vite proxy `/api` → 3000 (ไม่มี CORS ใน dev)
**เหตุผล**: แยก process ตามโครงสร้าง monorepo; prod build ฝาก dist ไว้ก่อน (deploy ยังไม่ตัดสินใจ)
