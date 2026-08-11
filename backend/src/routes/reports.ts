import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRoles } from "../lib/auth.js";
import { isOverdue } from "../lib/domain.js";
import ExcelJS from "exceljs";

const reportQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["ACTIVE", "RETURNED", "OVERDUE", "ALL"]).default("ALL"),
});

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  // Export Excel — borrow records report
  app.get("/reports/borrows", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const query = reportQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "พารามิเตอร์ไม่ถูกต้อง" },
      });
    }

    const { from, to, status } = query.data;

    const borrows = await prisma.borrow.findMany({
      where: {
        ...(from ? { createdAt: { gte: new Date(from) } } : {}),
        ...(to ? { createdAt: { lte: new Date(to) } } : {}),
        ...(status !== "ALL" ? { status: status === "OVERDUE" ? "ACTIVE" : (status as "ACTIVE" | "RETURNED") } : {}),
      },
      include: {
        medicalRecord: true,
        borrower: { include: { department: true } },
        department: true,
        returnedBy: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("รายงานการยืม-คืนเวชระเบียน");

    // Header style
    const headerStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" }, size: 12 },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F7672" } },
      alignment: { horizontal: "center" as const, vertical: "middle" as const },
      border: {
        top: { style: "thin" as const },
        bottom: { style: "thin" as const },
        left: { style: "thin" as const },
        right: { style: "thin" as const },
      },
    };

    const dataStyle = {
      border: {
        top: { style: "thin" as const },
        bottom: { style: "thin" as const },
        left: { style: "thin" as const },
        right: { style: "thin" as const },
      },
    };

    // Columns
    const columns = [
      { header: "ลำดับ", key: "no", width: 8 },
      { header: "HN", key: "hn", width: 14 },
      { header: "ชื่อผู้ป่วย", key: "patientName", width: 25 },
      { header: "ผู้ยืม", key: "borrower", width: 25 },
      { header: "หน่วยงาน", key: "department", width: 20 },
      { header: "เหตุผล", key: "reason", width: 35 },
      { header: "วันที่ยืม", key: "borrowDate", width: 18 },
      { header: "กำหนดคืน", key: "dueDate", width: 18 },
      { header: "วันที่คืน", key: "returnDate", width: 18 },
      { header: "สถานะ", key: "status", width: 14 },
      { header: "เกินกำหนด", key: "overdue", width: 10 },
    ];

    sheet.columns = columns;

    // Style header row
    sheet.getRow(1).eachCell((cell) => {
      Object.assign(cell, headerStyle);
    });

    // Format dates
    const fmtThai = (d: Date | null) => {
      if (!d) return "—";
      return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    };

    // Add data rows
    let filteredCount = 0;
    borrows.forEach((b, idx) => {
      const statusView = b.status === "ACTIVE" && isOverdue(b.dueDate) ? "OVERDUE" : b.status;

      // Filter by computed status if needed
      if (status === "OVERDUE" && statusView !== "OVERDUE") return;

      filteredCount++;
      const row = sheet.addRow({
        no: filteredCount,
        hn: b.medicalRecord.hn,
        patientName: b.medicalRecord.patientName,
        borrower: b.borrower.fullName,
        department: b.department.name,
        reason: b.reason,
        borrowDate: fmtThai(b.createdAt),
        dueDate: fmtThai(b.dueDate),
        returnDate: b.returnedAt ? fmtThai(b.returnedAt) : "—",
        status: statusView === "OVERDUE" ? "เกินกำหนด" : statusView === "ACTIVE" ? "อยู่ระหว่างยืม" : "คืนแล้ว",
        overdue: statusView === "OVERDUE" ? `เกิน ${Math.ceil((Date.now() - b.dueDate.getTime()) / 86400000)} วัน` : "—",
      });

      // Style data rows
      row.eachCell((cell) => {
        Object.assign(cell, dataStyle);
      });

      // Highlight overdue rows
      if (statusView === "OVERDUE") {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F0" } };
        });
      }
    });

    // Summary
    const summaryRow = sheet.addRow([]);
    summaryRow.getCell(1).value = `สรุป: ทั้งหมด ${filteredCount} รายการ`;
    summaryRow.getCell(1).font = { bold: true, size: 12 };

    const generatedAt = new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date());

    const summaryRow2 = sheet.addRow([]);
    summaryRow2.getCell(1).value = `สร้างรายงานเมื่อ: ${generatedAt}`;
    summaryRow2.getCell(1).font = { italic: true, size: 11, color: { argb: "FF888888" } };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="borrow-report-${new Date().toISOString().split("T")[0]}.xlsx"`)
      .send(buffer);
  });
}
