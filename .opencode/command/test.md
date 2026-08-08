---
description: รัน tests + typecheck — bun test / bun run typecheck / เฉพาะไฟล์
---

# Test Runner

รันตามขอบเขตที่ระบุ:

```bash
# ทั้งหมด (ค่าเริ่มต้น)
bun test
bun run typecheck

# เฉพาะไฟล์ (ระบุ path)
bun test backend/src/borrow/borrow.service.test.ts
```

## ถ้า test fail
1. อ่าน error จริง — ห้ามลบ/disable test เพื่อให้ผ่าน
2. แก้ที่ root cause (โค้ดผิด ไม่ใช่ test ผิด)
3. รันซ้ำจนผ่าน

## Coverage ที่ต้องการ
- happy path + error path
- กรณี: ยืมแฟ้มไม่อยู่, คืนผิดคน, overdue alert, RBAC denied
