---
description: ทำงานกับ database — prisma migrate/studio/seed (ห้ามใช้ destructive ต่อ prod)
---

# Database Operations

คำสั่งที่รองรับ:

```bash
bunx prisma migrate dev            # สร้าง migration + apply (dev)
bunx prisma migrate deploy         # apply migration (prod)
bunx prisma generate               # regenerate client
bunx prisma studio                 # เปิด UI ดูข้อมูล
bunx prisma db seed                # seed ข้อมูลทดสอบ
```

## ข้อห้าม
- **ห้าม** `DROP TABLE` / `DROP DATABASE` / `TRUNCATE` ต่อ production
- เปลี่ยน schema → สร้าง migration ใหม่ (ไม่แก้ migration เก่า)
- หลังเปลี่ยน schema → `prisma generate` + อัปเดต skill `ipd-domain` ถ้าโดเมนเปลี่ยน
- `.env` ใช้สำหรับ connection string — ห้าม hardcode

## หลัง migrate
- รัน `bun test` ให้ผ่าน
- อัปเดต `project-state.md` ถ้าโครงสร้าง DB เปลี่ยน
