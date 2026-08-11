import { buildApp } from "./app.js";
import { scanOverdueAndNotify, generateDailySummary } from "./lib/overdue-scanner.js";
import cron from "node-cron";

const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";

/**
 * ตรวจ config ที่จำเป็นก่อน listen — ถ้าขาด ให้ตายทันทีพร้อมข้อความชัดเจน
 * ดีกว่าปล่อยให้ start สำเร็จแล้วไปพังตอนผู้ใช้กด login (500 โดยไม่รู้สาเหตุ)
 */
const MIN_SECRET_LENGTH = 32;
const jwtSecret = process.env.JWT_SECRET ?? "";
if (jwtSecret.length < MIN_SECRET_LENGTH) {
  console.error(
    jwtSecret.length === 0
      ? "[config] ไม่ได้ตั้งค่า JWT_SECRET — กำหนดใน .env ก่อนเริ่มระบบ (ดู .env.example)"
      : `[config] JWT_SECRET สั้นเกินไป (${jwtSecret.length} ตัวอักษร) — ต้องยาวอย่างน้อย ${MIN_SECRET_LENGTH} ตัวอักษร`,
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[config] ไม่ได้ตั้งค่า DATABASE_URL — กำหนดใน .env ก่อนเริ่มระบบ (ดู .env.example)");
  process.exit(1);
}

const app = buildApp();

try {
  await app.listen({ port, host });
  console.log(`API พร้อมใช้งานที่ http://localhost:${port}/api/v1`);

  // ---- Cron Jobs ----

  // ทุก 1 ชั่วโมง — สแกน overdue + ส่ง LINE Notify
  if (process.env.NODE_ENV !== "test") {
    cron.schedule("0 * * * *", async () => {
      try {
        const result = await scanOverdueAndNotify();
        if (result.newAlerts > 0 || result.escalated > 0) {
          console.log(
            `[overdue-scanner] แจ้งเตือน ${result.newAlerts} รายการ, escalated ${result.escalated} รายการ`,
          );
        }
      } catch (err) {
        console.error("[overdue-scanner] Error:", err);
      }
    });

    // ทุกวัน 08:00 — สรุปประจำวัน
    cron.schedule("0 8 * * *", async () => {
      try {
        const summary = await generateDailySummary();
        console.log(`[daily-summary] ${summary}`);
      } catch (err) {
        console.error("[daily-summary] Error:", err);
      }
    });

    console.log("[cron] Overdue scanner และ daily summary เปิดใช้งานแล้ว");
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
