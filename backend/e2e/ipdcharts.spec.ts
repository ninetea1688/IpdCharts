import { test, expect, Page } from "@playwright/test";

const FRONTEND_URL = "http://localhost:5173";

/** Helper: login แล้วรอ dashboard load */
async function loginAsAdmin(page: Page) {
  await page.goto(FRONTEND_URL);
  await page.getByLabel("ชื่อผู้ใช้").fill("mr-admin");
  await page.getByLabel("รหัสผ่าน").fill("password123");
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("heading", { name: "หน้าหลัก" })).toBeVisible({ timeout: 10000 });
}

test.describe("IpdCharts E2E — Complete Workflow", () => {

  test("1) เปิดหน้า Login — ควรเห็นฟอร์มเข้าสู่ระบบ", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    await expect(page).toHaveURL(FRONTEND_URL);
    
    const heading = page.getByRole("heading", { name: "เข้าสู่ระบบ" });
    await expect(heading).toBeVisible();
    
    await expect(page.getByLabel("ชื่อผู้ใช้")).toBeVisible();
    await expect(page.getByLabel("รหัสผ่าน")).toBeVisible();
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
    
    console.log("✅ Test 1: หน้า Login แสดงผลถูกต้อง");
  });

  test("2) Login เป็น Admin — ควรเข้าสู่หน้า Dashboard", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
    
    await page.getByLabel("ชื่อผู้ใช้").fill("mr-admin");
    await page.getByLabel("รหัสผ่าน").fill("password123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    
    await expect(page.getByRole("heading", { name: "หน้าหลัก" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("นางสาวสมหญิง")).toBeVisible();
    
    console.log("✅ Test 2: Login สำเร็จ — เข้าสู่ Dashboard");
  });

  test("3) Dashboard — ควรแสดงสถิติและรายการเกินกำหนด", async ({ page }) => {
    await loginAsAdmin(page);
    
    // ควรเห็น stat cards
    await expect(page.getByText("แฟ้มทั้งหมด")).toBeVisible();
    await expect(page.getByText("ว่างให้ยืม")).toBeVisible();
    await expect(page.getByText("อยู่ระหว่างยืม")).toBeVisible();
    await expect(page.getByText("เกินกำหนด")).toBeVisible();
    
    // ควรเห็นตารางแฟ้มเกินกำหนด
    await expect(page.getByText(/แฟ้มเกินกำหนด/)).toBeVisible();
    await expect(page.getByRole("button", { name: "รีเฟรช" })).toBeVisible();
    
    console.log("✅ Test 3: Dashboard แสดงสถิติและ overdue ถูกต้อง");
  });

  test("4) ยืมแฟ้ม — สร้างรายการยืมสำเร็จ", async ({ page }) => {
    await loginAsAdmin(page);
    
    // ไปหน้ายืมแฟ้ม
    await page.getByRole("link", { name: "ยืมแฟ้ม" }).click();
    await expect(page.getByRole("heading", { name: "ยืมแฟ้ม" })).toBeVisible();
    
    // กรอกฟอร์ม
    await page.getByLabel("HN").fill("0000000004");
    
    // เลือกผู้ยืม (หา option ที่มีคำว่า nurse ใน username หรือ fullName)
    await page.getByLabel("ผู้ยืม").click();
    await page.getByRole("option", { name: /มาลี|nurse/ }).click();
    
    await page.getByLabel("เหตุผลการยืม").fill("ทบทวนเวชระเบียน");
    
    // กดยืม
    await page.getByRole("button", { name: "ยืมแฟ้ม" }).click();
    
    // ควรเห็นข้อความสำเร็จ
    await expect(page.getByText(/ยืมแฟ้ม.*สำเร็จ/)).toBeVisible({ timeout: 10000 });
    
    console.log("✅ Test 4: ยืมแฟ้มสำเร็จ");
  });

  test("5) หน้ารายการแฟ้ม — เห็นแฟ้มที่ถูกยืม", async ({ page }) => {
    await loginAsAdmin(page);
    
    // ไปหน้ารายการแฟ้ม
    await page.getByRole("link", { name: "รายการแฟ้ม" }).click();
    await expect(page.getByRole("heading", { name: "รายการแฟ้ม" })).toBeVisible();
    
    // ควรเห็นตาราง header
    await expect(page.locator("th").filter({ hasText: "HN" })).toBeVisible();
    await expect(page.locator("th").filter({ hasText: "ผู้ป่วย" })).toBeVisible();
    await expect(page.locator("th").filter({ hasText: "สถานะ" })).toBeVisible();
    
    // ควรเห็นปุ่มค้นหา
    await expect(page.getByPlaceholder("ค้นหา HN หรือชื่อผู้ป่วย")).toBeVisible();
    
    console.log("✅ Test 5: หน้ารายการแฟ้มแสดงผลถูกต้อง");
  });

  test("6) รายละเอียดแฟ้ม — ดูประวัติการยืม", async ({ page }) => {
    await loginAsAdmin(page);
    
    // ไปหน้ารายการแฟ้ม
    await page.getByRole("link", { name: "รายการแฟ้ม" }).click();
    await expect(page.getByRole("heading", { name: "รายการแฟ้ม" })).toBeVisible();
    
    // ควรมีรายการในตาราง (ดูว่า tbody มีแถวหรือไม่)
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10000 });
    
    // คลิกดูประวัติแฟ้มแรก
    const firstDetailLink = page.getByRole("link", { name: "ดูประวัติ" }).first();
    await firstDetailLink.click();
    
    // ควรเห็นหน้ารายละเอียด
    await expect(page.getByText(/ประวัติการยืม-คืน/)).toBeVisible();
    
    console.log("✅ Test 6: ดูรายละเอียดแฟ้มได้");
  });

  test("7) คืนแฟ้ม — เลือกผู้ยืมและดูรายการ", async ({ page }) => {
    await loginAsAdmin(page);
    
    // ไปหน้าคืนแฟ้ม
    await page.getByRole("link", { name: "คืนแฟ้ม" }).click();
    await expect(page.getByRole("heading", { name: "คืนแฟ้ม" })).toBeVisible();
    
    // เลือกผู้ยืม
    const select = page.getByLabel("ผู้ยืม");
    const options = await select.locator("option").all();
    if (options.length > 1) {
      await select.click();
      await page.getByRole("option").first().click();
      await expect(page.getByText(/รายการที่/)).toBeVisible({ timeout: 10000 });
    }
    
    console.log("✅ Test 7: หน้าคืนแฟ้มแสดงผลถูกต้อง");
  });

  test("8) หน้าจัดการระบบ — ดูรายชื่อผู้ใช้งาน", async ({ page }) => {
    await loginAsAdmin(page);
    
    // ไปหน้าจัดการระบบ
    await page.getByRole("link", { name: "จัดการระบบ" }).click();
    await expect(page.getByRole("heading", { name: "จัดการระบบ" })).toBeVisible();
    await expect(page.getByText("ผู้ใช้งานระบบ")).toBeVisible();
    
    // ควรเห็นรายการผู้ใช้ (อย่างน้อยเห็นชื่อ username mr-admin)
    await expect(page.getByText("mr-admin")).toBeVisible();
    
    console.log("✅ Test 8: หน้าจัดการระบบแสดงผลถูกต้อง");
  });

  test("9) Logout — ออกจากระบบและกลับไปหน้า Login", async ({ page }) => {
    await loginAsAdmin(page);
    
    // คลิก Logout
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    
    // ควรกลับมาที่หน้า Login
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible({ timeout: 10000 });
    
    console.log("✅ Test 9: Logout สำเร็จ — กลับไปหน้า Login");
  });

  test("10) ไม่ login เข้าหน้าอื่นไม่ได้ — ถูก redirect ไป login", async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/borrow`);
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible({ timeout: 10000 });
    
    console.log("✅ Test 10: Protected route ทำงานถูกต้อง — redirect ไป login");
  });
});
