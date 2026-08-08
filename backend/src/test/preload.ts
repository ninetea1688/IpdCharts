// รันก่อนทุกไฟล์ test (--preload) — ตั้งค่า DATABASE_URL ชี้ไป test DB ก่อนที่ PrismaClient จะถูกสร้าง
// ถ้า script test ใน package.json ตั้งค่าไว้แล้ว ข้ามขั้นตอนนี้
process.env.DATABASE_URL ??= "postgresql://ipd:ipd_dev_password@localhost:5432/ipdcharts_test?schema=public";
