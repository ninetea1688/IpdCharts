import { test, expect, type Page } from "@playwright/test";

/**
 * E2E ยิงผ่านเบราว์เซอร์จริงใส่ระบบที่รันอยู่ (ดู baseURL ใน playwright.config.ts)
 *
 * ต้องรัน `bun run db:seed` ก่อน — เทสต์อ้างอิงข้อมูลตัวอย่างจาก seed:
 *   HN 0000000001 = ถูกยืมและเกินกำหนด (dr-wichai)
 *   HN 0000000002 = ถูกยืมอยู่ ปกติ (nurse-mali)
 *   HN 0000000004 = คำขอยืมที่รออนุมัติ (nurse-mali, หน่วยงานศัลยกรรม)
 *   HN 0000000005 = แฟ้มชำรุด มีเรื่องเปิดค้างอยู่
 *   HN 0000000006 ขึ้นไป = ว่าง พร้อมยืม
 */

const ACCOUNTS = {
  admin: { username: "mr-admin", password: "password123", name: "นางสาวสมหญิง" },
  head: { username: "head-somchai", password: "password123", name: "นายสมชาย" },
  nurse: { username: "nurse-mali", password: "password123", name: "นางสาวมาลี" },
};

async function loginAs(page: Page, account: { username: string; password: string }) {
  await page.goto("/");
  await page.getByLabel("ชื่อผู้ใช้").fill(account.username);
  await page.getByLabel("รหัสผ่าน").fill(account.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await expect(page.getByRole("heading", { name: "หน้าหลัก" })).toBeVisible({ timeout: 15_000 });
}

const loginAsAdmin = (page: Page) => loginAs(page, ACCOUNTS.admin);

/** ไปหน้าจากเมนูด้านข้าง แล้วรอ heading ของหน้านั้น */
async function navigateTo(page: Page, linkName: string, headingName: string) {
  // exact: true จำเป็น — แถบงานค้างบน Dashboard ก็เป็นลิงก์ที่มีข้อความคล้ายเมนู
  await page.getByRole("link", { name: linkName, exact: true }).click();
  await expect(page.getByRole("heading", { name: headingName })).toBeVisible({ timeout: 15_000 });
}

/** รอให้หน้าคืนแฟ้มโหลดรายการของผู้ยืมที่เลือกเสร็จ */
async function expectBorrowerListLoaded(page: Page) {
  await expect(page.getByRole("heading", { name: /รายการที่/ })).toBeVisible({ timeout: 15_000 });
}

/**
 * เลือก <option> จากข้อความบางส่วน — value เป็น id ที่เปลี่ยนทุกครั้งที่ seed
 * (selectOption รับ label เป็น string เท่านั้น ใช้ regex ไม่ได้)
 */
async function selectByText(page: Page, label: string, text: string) {
  const select = page.getByLabel(label);
  const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
  if (!value) throw new Error(`ไม่พบตัวเลือกที่มีข้อความ "${text}" ใน dropdown "${label}"`);
  await select.selectOption(value);
}

/** ค้นหาในหน้ารายการแฟ้ม แล้วรอจนตารางกรองเสร็จจริง */
async function searchRecords(page: Page, hn: string) {
  await page.getByPlaceholder("ค้นหา HN หรือชื่อผู้ป่วย").fill(hn);
  await page.keyboard.press("Enter");
  const rows = page.locator("tbody tr");
  // ต้องรอให้เหลือแถวเดียวก่อน ไม่งั้นจะกดลิงก์ของผลลัพธ์ชุดเดิมที่ยังค้างอยู่
  await expect(rows).toHaveCount(1, { timeout: 15_000 });
  return rows;
}

// ---------------------------------------------------------------------------
// การเข้าสู่ระบบและสิทธิ์
// ---------------------------------------------------------------------------

test.describe("การเข้าสู่ระบบและสิทธิ์", () => {
  test("หน้า Login แสดงฟอร์มครบ", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
    await expect(page.getByLabel("ชื่อผู้ใช้")).toBeVisible();
    await expect(page.getByLabel("รหัสผ่าน")).toBeVisible();
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
  });

  test("รหัสผ่านผิด → เห็นข้อความภาษาไทย ไม่ผ่านเข้าระบบ", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่อผู้ใช้").fill(ACCOUNTS.admin.username);
    await page.getByLabel("รหัสผ่าน").fill("wrong-password");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();

    await expect(page.getByText("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible();
  });

  test("Login เป็นเจ้าหน้าที่เวชระเบียน → เข้า Dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText(ACCOUNTS.admin.name)).toBeVisible();
  });

  test("ยังไม่ login เข้าหน้าอื่นไม่ได้ → ถูกส่งกลับหน้า login", async ({ page }) => {
    await page.goto("/borrow");
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible({ timeout: 15_000 });
  });

  test("token เสียตั้งแต่ต้น → ไม่ค้างสถานะล็อกอิน เด้งไปหน้า login", async ({ page }) => {
    // จำลอง token หมดอายุที่ค้างอยู่ใน localStorage — แอปต้องตรวจกับ /auth/me ตอนเปิด
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem(
        "ipdcharts_auth",
        JSON.stringify({
          token: "not-a-valid-token",
          user: { id: 1, username: "ghost", fullName: "ผี", role: "ADMIN", department: null },
        }),
      );
    });
    await page.goto("/records");
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible({ timeout: 15_000 });
  });

  test("ผู้ยืมทั่วไปไม่เห็นเมนูของเจ้าหน้าที่", async ({ page }) => {
    await loginAs(page, ACCOUNTS.nurse);
    await expect(page.getByRole("link", { name: "รายการแฟ้ม" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ยืมแฟ้ม" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "จัดการระบบ" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "รายงาน" })).toHaveCount(0);
  });

  test("Logout → กลับหน้า login", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page.getByRole("heading", { name: "เข้าสู่ระบบ" })).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Dashboard และการค้นหา
// ---------------------------------------------------------------------------

test.describe("Dashboard และรายการแฟ้ม", () => {
  test("Dashboard แสดงสถิติและงานค้างที่ต้องลงมือ", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByText("แฟ้มทั้งหมด")).toBeVisible();
    await expect(page.getByText("ว่างให้ยืม")).toBeVisible();
    await expect(page.getByText("อยู่ระหว่างยืม")).toBeVisible();
    await expect(page.getByRole("button", { name: "รีเฟรช" })).toBeVisible();

    // seed มีคำขอรออนุมัติ 1 และเรื่องชำรุด 1 → แถบงานค้างต้องขึ้น
    await expect(page.getByRole("link", { name: /คำขอยืมรออนุมัติ/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /ชำรุด\/สูญหายที่ยังไม่ปิด/ })).toBeVisible();
  });

  test("ค้นหาแฟ้มด้วย HN แล้วเปิดดูประวัติได้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "รายการแฟ้ม", "รายการแฟ้ม");

    await searchRecords(page, "0000000001");
    await page.getByRole("link", { name: "ดูประวัติ" }).click();
    await expect(page.getByText(/ประวัติการยืม-คืน/)).toBeVisible({ timeout: 15_000 });
  });

  test("แฟ้มชำรุดแสดงสถานะและเหตุการณ์ในหน้ารายละเอียด", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "รายการแฟ้ม", "รายการแฟ้ม");

    await searchRecords(page, "0000000005");
    await page.getByRole("link", { name: "ดูประวัติ" }).click();

    await expect(page.getByText(/เหตุการณ์ชำรุด\/สูญหาย/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ปกแฟ้มฉีกขาด เอกสารหน้า 3-5 เปียกน้ำ")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ยืม-คืน
// ---------------------------------------------------------------------------

test.describe("ยืมและคืนแฟ้ม", () => {
  test("ยืมแฟ้มว่างสำเร็จ แล้วรับคืนได้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "ยืมแฟ้ม", "ยืมแฟ้ม");

    await page.getByLabel("HN").fill("0000000006");
    await selectByText(page, "ผู้ยืม", "มาลี");
    await page.getByLabel("เหตุผลการยืม").fill("ทบทวนเวชระเบียน (e2e)");
    await page.getByRole("button", { name: "ยืมแฟ้ม", exact: true }).click();

    await expect(page.getByText(/ยืมแฟ้ม 0000000006.*สำเร็จ/)).toBeVisible({ timeout: 15_000 });

    // คืนกลับเพื่อให้ข้อมูลกลับสู่สภาพเดิม
    await navigateTo(page, "คืนแฟ้ม", "คืนแฟ้ม");
    await selectByText(page, "ผู้ยืม", "มาลี");
    await expectBorrowerListLoaded(page);

    const row = page.locator("tbody tr").filter({ hasText: "0000000006" });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "รับคืน" }).click();
    await page.getByRole("button", { name: "ยืนยัน", exact: true }).click();

    await expect(page.getByText(/คืนแฟ้ม 0000000006.*สำเร็จ/)).toBeVisible({ timeout: 15_000 });
  });

  test("ยืมแฟ้มที่ถูกยืมอยู่แล้ว → เห็นข้อความปฏิเสธเป็นภาษาไทย", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "ยืมแฟ้ม", "ยืมแฟ้ม");

    await page.getByLabel("HN").fill("0000000002");
    await selectByText(page, "ผู้ยืม", "มาลี");
    await page.getByLabel("เหตุผลการยืม").fill("ทดสอบยืมซ้ำ");
    await page.getByRole("button", { name: "ยืมแฟ้ม", exact: true }).click();

    await expect(page.getByText("แฟ้มนี้ถูกยืมอยู่แล้ว ไม่สามารถยืมซ้ำได้")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("ยืมแฟ้มที่ชำรุด → ถูกปฏิเสธพร้อมบอกสถานะ", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "ยืมแฟ้ม", "ยืมแฟ้ม");

    await page.getByLabel("HN").fill("0000000005");
    await selectByText(page, "ผู้ยืม", "มาลี");
    await page.getByLabel("เหตุผลการยืม").fill("ทดสอบยืมแฟ้มชำรุด");
    await page.getByRole("button", { name: "ยืมแฟ้ม", exact: true }).click();

    await expect(page.getByText(/มีสถานะ "ชำรุด" จึงยืมไม่ได้/)).toBeVisible({ timeout: 15_000 });
  });

  test("แฟ้มที่เกินกำหนดต้องขึ้นในหน้าคืนแฟ้ม", async ({ page }) => {
    // regression: เดิมหน้านี้กรองด้วย status=ACTIVE ซึ่งไม่รวม OVERDUE
    // ทำให้แฟ้มที่เลยกำหนด — แฟ้มที่ต้องเร่งรับคืนที่สุด — หายไปจากหน้าจอ
    await loginAsAdmin(page);
    await navigateTo(page, "คืนแฟ้ม", "คืนแฟ้ม");

    await selectByText(page, "ผู้ยืม", "วิชัย");
    await expectBorrowerListLoaded(page);

    const row = page.locator("tbody tr").filter({ hasText: "0000000001" });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("เกินกำหนด")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// FR-03 — อนุมัติคำขอ
// ---------------------------------------------------------------------------

test.describe("อนุมัติคำขอยืม (FR-03)", () => {
  test("เจ้าหน้าที่เห็นคำขอที่รออนุมัติพร้อมรายละเอียด", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "อนุมัติคำขอ", "อนุมัติคำขอยืม");

    const card = page.getByText("HN 0000000004");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ขอนำแฟ้มออกนอกโรงพยาบาลเพื่อประกอบคดี")).toBeVisible();
    await expect(page.getByRole("button", { name: "อนุมัติ", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ไม่อนุมัติ" })).toBeVisible();
  });

  test("ไม่อนุมัติต้องระบุเหตุผลก่อนจึงกดยืนยันได้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "อนุมัติคำขอ", "อนุมัติคำขอยืม");
    await expect(page.getByText("HN 0000000004")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "ไม่อนุมัติ" }).click();
    const confirm = page.getByRole("button", { name: "ยืนยันไม่อนุมัติ" });
    await expect(confirm).toBeDisabled();

    await page.getByLabel("เหตุผลที่ไม่อนุมัติ").fill("ไม่มีเอกสารรับรอง");
    await expect(confirm).toBeEnabled();
  });

  test("หัวหน้าหน่วยงานอนุมัติแล้วแฟ้มถูกจ่ายออก", async ({ page }) => {
    await loginAs(page, ACCOUNTS.head);
    await navigateTo(page, "อนุมัติคำขอ", "อนุมัติคำขอยืม");

    await expect(page.getByText("HN 0000000004")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "อนุมัติ", exact: true }).click();

    await expect(page.getByText(/อนุมัติคำขอยืมแฟ้ม 0000000004 แล้ว/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ไม่มีคำขอที่รออนุมัติ")).toBeVisible();

    // แฟ้มต้องเปลี่ยนเป็นถูกยืมแล้ว
    await navigateTo(page, "รายการแฟ้ม", "รายการแฟ้ม");
    await page.getByPlaceholder("ค้นหา HN หรือชื่อผู้ป่วย").fill("0000000004");
    await page.keyboard.press("Enter");
    const row = page.locator("tbody tr").filter({ hasText: "0000000004" });
    await expect(row.getByText("ถูกยืม")).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// FR-05 — แฟ้มชำรุด / สูญหาย
// ---------------------------------------------------------------------------

test.describe("แฟ้มชำรุด/สูญหาย (FR-05)", () => {
  test("หน้าเหตุการณ์แสดงเรื่องที่ยังไม่ปิด", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "ชำรุด/สูญหาย", "แฟ้มชำรุด / สูญหาย");

    await expect(page.getByText("HN 0000000005")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ปกแฟ้มฉีกขาด เอกสารหน้า 3-5 เปียกน้ำ")).toBeVisible();
  });

  test("รายงานแฟ้มสูญหายแล้วปิดเรื่องพร้อมคืนสถานะได้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "ชำรุด/สูญหาย", "แฟ้มชำรุด / สูญหาย");

    await page.getByRole("button", { name: "รายงานแฟ้มชำรุด/สูญหาย" }).click();
    await page.getByLabel("HN").fill("0000000007");
    await page.getByLabel("ประเภท").selectOption("LOST");
    await page.getByLabel("รายละเอียด").fill("ค้นที่หอผู้ป่วยแล้วไม่พบ (e2e)");
    await page.getByRole("button", { name: "บันทึกและแจ้งเตือน" }).click();

    await expect(page.getByText(/บันทึกเรื่องแฟ้ม.*0000000007/)).toBeVisible({ timeout: 15_000 });

    // ปิดเรื่องและคืนแฟ้มเข้าชั้น เพื่อให้ข้อมูลกลับสู่สภาพเดิม
    // เจาะการ์ดใบที่มีทั้งข้อความของเรื่องนี้และปุ่มปิดเรื่อง แล้วเอาใบในสุด
    const card = page
      .locator("div")
      .filter({ hasText: "ค้นที่หอผู้ป่วยแล้วไม่พบ (e2e)" })
      .filter({ has: page.getByRole("button", { name: "ปิดเรื่อง", exact: true }) })
      .last();
    await card.getByRole("button", { name: "ปิดเรื่อง", exact: true }).click();
    await page.getByLabel("ผลการดำเนินการ").fill("พบแฟ้มแล้ว (e2e)");
    await page.getByText("คืนแฟ้มกลับสู่สถานะพร้อมยืม").click();
    await page.getByRole("button", { name: "ยืนยันปิดเรื่อง" }).click();

    await expect(page.getByText(/ปิดเรื่อง HN 0000000007 แล้ว/)).toBeVisible({ timeout: 15_000 });
  });

  test("ผู้ยืมทั่วไปดูได้แต่รายงานเหตุการณ์ไม่ได้", async ({ page }) => {
    await loginAs(page, ACCOUNTS.nurse);
    await navigateTo(page, "ชำรุด/สูญหาย", "แฟ้มชำรุด / สูญหาย");

    await expect(page.getByText("HN 0000000005")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "รายงานแฟ้มชำรุด/สูญหาย" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ปิดเรื่อง", exact: true })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// FR-09 / FR-12 — รายงานและป้ายแฟ้ม
// ---------------------------------------------------------------------------

test.describe("รายงานและป้ายแฟ้ม (FR-09 / FR-12)", () => {
  test("ดาวน์โหลดรายงาน Excel ได้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "รายงาน", "รายงานและป้ายแฟ้ม");

    const download = page.waitForEvent("download", { timeout: 20_000 });
    await page.getByRole("button", { name: "ดาวน์โหลด Excel" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test("สร้างตัวอย่าง label QR ได้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "รายงาน", "รายงานและป้ายแฟ้ม");

    await page.getByLabel("HN").fill("0000000001");
    await page.getByLabel("รูปแบบ").selectOption("qrcode");
    await page.getByRole("button", { name: "แสดงตัวอย่าง" }).click();

    const img = page.getByAltText("label 0000000001");
    await expect(img).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "ดาวน์โหลด PNG" })).toBeVisible();
  });

  test("HN ที่ไม่มีในระบบ → เห็นข้อความไม่พบแฟ้ม", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "รายงาน", "รายงานและป้ายแฟ้ม");

    await page.getByLabel("HN").fill("9999999999");
    await page.getByRole("button", { name: "แสดงตัวอย่าง" }).click();

    await expect(page.getByText("ไม่พบแฟ้มเวชระเบียน")).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// FR-11 — จัดการผู้ใช้งานและหน่วยงาน
// ---------------------------------------------------------------------------

test.describe("จัดการผู้ใช้งานและหน่วยงาน (FR-11)", () => {
  test("เพิ่มผู้ใช้ แก้ไข แล้วปิดใช้งานได้ครบวงจร", async ({ page }) => {
    const username = `e2e-user-${Date.now()}`;
    await loginAsAdmin(page);
    await navigateTo(page, "จัดการระบบ", "จัดการระบบ");

    // ปุ่มเปิดฟอร์มกับปุ่ม submit ชื่อเดียวกัน — แยกด้วยการเจาะเข้าไปใน <form>
    const userForm = page.locator("form");
    await page.getByRole("button", { name: "เพิ่มผู้ใช้งาน" }).first().click();
    await page.getByLabel("ชื่อผู้ใช้").fill(username);
    await page.getByLabel("ชื่อ-สกุล").fill("ผู้ใช้ทดสอบ e2e");
    await page.getByLabel("บทบาท").selectOption("BORROWER");
    await page.getByLabel("อีเมล").fill("e2e@hospital.local");
    await page.getByLabel("รหัสผ่าน").fill("e2epassword123");
    await userForm.getByRole("button", { name: "เพิ่มผู้ใช้งาน" }).click();

    await expect(page.getByText("เพิ่มผู้ใช้ ผู้ใช้ทดสอบ e2e เรียบร้อย")).toBeVisible({ timeout: 15_000 });

    const row = page.locator("tbody tr").filter({ hasText: username });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("e2e@hospital.local")).toBeVisible();

    // แก้ไขชื่อ
    await row.getByRole("button", { name: "แก้ไข" }).click();
    await page.getByLabel("ชื่อ-สกุล").fill("ผู้ใช้ทดสอบ e2e (แก้ไข)");
    await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    await expect(page.getByText(/บันทึกข้อมูล ผู้ใช้ทดสอบ e2e \(แก้ไข\) เรียบร้อย/)).toBeVisible({
      timeout: 15_000,
    });

    // ปิดใช้งาน
    await page.locator("tbody tr").filter({ hasText: username }).getByRole("button", { name: "ปิดใช้งาน" }).click();
    await expect(page.getByText(/ปิดใช้งานบัญชี .* แล้ว/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("tbody tr").filter({ hasText: username })).toHaveCount(0);

    // ติ๊กแสดงบัญชีที่ปิดใช้งานแล้วต้องเห็นอีกครั้ง
    await page.getByText("แสดงบัญชีที่ปิดใช้งาน").click();
    await expect(page.locator("tbody tr").filter({ hasText: username })).toHaveCount(1);
  });

  test("ปิดใช้งานบัญชีตัวเองไม่ได้ — ไม่มีปุ่มให้กด", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "จัดการระบบ", "จัดการระบบ");

    const ownRow = page.locator("tbody tr").filter({ hasText: ACCOUNTS.admin.username });
    await expect(ownRow).toHaveCount(1);
    await expect(ownRow.getByRole("button", { name: "ปิดใช้งาน" })).toHaveCount(0);
  });

  test("เพิ่ม แก้ชื่อ แล้วลบหน่วยงานได้", async ({ page }) => {
    const deptName = `หน่วยงาน e2e ${Date.now()}`;
    await loginAsAdmin(page);
    await navigateTo(page, "จัดการระบบ", "จัดการระบบ");

    await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    await page.getByLabel("ชื่อหน่วยงานใหม่").fill(deptName);
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByText(`เพิ่มหน่วยงาน ${deptName} เรียบร้อย`)).toBeVisible({ timeout: 15_000 });

    const item = page.locator("li").filter({ hasText: deptName });
    await expect(item).toHaveCount(1);
    await expect(item.getByText("0 คน · ประวัติการยืม 0 รายการ")).toBeVisible();

    // แก้ชื่อ
    const renamed = `${deptName} (แก้ไข)`;
    await item.getByRole("button", { name: "แก้ไข" }).click();
    await page.getByLabel("แก้ชื่อหน่วยงาน").fill(renamed);
    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByText(`เปลี่ยนชื่อหน่วยงานเป็น ${renamed} เรียบร้อย`)).toBeVisible({
      timeout: 15_000,
    });

    // ลบ
    await page.locator("li").filter({ hasText: renamed }).getByRole("button", { name: "ลบ" }).click();
    await expect(page.getByText(`ลบหน่วยงาน ${renamed} เรียบร้อย`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li").filter({ hasText: renamed })).toHaveCount(0);
  });

  test("หน่วยงานที่มีผู้ใช้อยู่ ปุ่มลบต้องถูกปิดไว้", async ({ page }) => {
    await loginAsAdmin(page);
    await navigateTo(page, "จัดการระบบ", "จัดการระบบ");

    const inUse = page.locator("li").filter({ hasText: "ศัลยกรรม" }).first();
    await expect(inUse).toBeVisible({ timeout: 15_000 });
    await expect(inUse.getByRole("button", { name: "ลบ" })).toBeDisabled();
  });
});
