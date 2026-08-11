import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRoles } from "../lib/auth.js";
import bwipjs from "bwip-js";

const labelParamsSchema = z.object({
  hn: z.string().trim().min(1, "กรุณาระบุ HN"),
  type: z.enum(["barcode", "qrcode"]).default("barcode"),
});

export async function labelRoutes(app: FastifyInstance): Promise<void> {
  // Generate barcode/QR label PNG
  app.get("/labels", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const query = labelParamsSchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: query.error.issues[0]?.message ?? "พารามิเตอร์ไม่ถูกต้อง" },
      });
    }

    const { hn, type } = query.data;

    // Verify record exists
    const record = await prisma.medicalRecord.findUnique({ where: { hn } });
    if (!record) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "ไม่พบแฟ้มเวชระเบียน" } });
    }

    const bcid = type === "qrcode" ? "qrcode" : "code128";

    try {
      const png = await bwipjs.toBuffer({
        bcid,
        text: hn,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: "center",
      });

      return reply
        .header("Content-Type", "image/png")
        .header("Content-Disposition", `inline; filename="label-${hn}.png"`)
        .send(png);
    } catch (err) {
      return reply.status(500).send({
        error: { code: "LABEL_ERROR", message: "สร้างป้ายไม่สำเร็จ" },
      });
    }
  });

  // Print labels for multiple records
  app.post("/labels/batch", { preHandler: [authenticate, requireRoles("ADMIN")] }, async (request, reply) => {
    const body = z.object({ hns: z.array(z.string()) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "กรุณาระบุ HN ให้ถูกต้อง" },
      });
    }

    const labels: { hn: string; url: string }[] = [];
    for (const hn of body.data.hns) {
      const record = await prisma.medicalRecord.findUnique({ where: { hn } });
      if (record) {
        labels.push({ hn, url: `/api/v1/labels?hn=${hn}` });
      }
    }

    return reply.send({ labels });
  });
}
