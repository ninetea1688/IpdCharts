---
description: เริ่ม dev environment — PostgreSQL (docker) + backend + frontend
---

# Dev Environment

## 1. Database (ครั้งแรก)
```bash
docker compose up -d               # PostgreSQL
bunx prisma migrate dev            # สร้าง schema
bunx prisma db seed                # seed ข้อมูลทดสอบ
```

## 2. Backend + Frontend
```bash
bun install                        # ครั้งแรก
bun run dev                        # ทั้งสอง (หลัง scaffold)
```

## 3. ตรวจ
- Backend: `http://localhost:3000/api/v1/health`
- Frontend: `http://localhost:5173`
- DB UI: `bunx prisma studio`

## Troubleshooting
- port ซ้ำ → ดู `docker compose ps` / เปลี่ยน port ใน `.env`
- migration conflict → อย่า `migrate reset` คนเดียว ปรึกษาก่อน (ลบ data ทิ้ง)
