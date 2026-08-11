import { defineConfig } from "@playwright/test";

/**
 * ปลายทางที่จะยิงเทสต์ — ตั้งผ่าน E2E_BASE_URL
 * - dev server (vite):        http://localhost:5173  (ค่าปริยาย)
 * - frontend container/nginx: http://localhost       (docker compose up -d)
 *
 * การยิงใส่ container จะได้ทดสอบ artifact จริงที่จะ deploy รวมถึง nginx proxy /api ด้วย
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  // เทสต์เขียนและอ่านข้อมูลชุดเดียวกัน รันขนานกันจะชนกันเอง
  workers: 1,
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { outputFolder: "../playwright-report", open: "never" }]],
});
