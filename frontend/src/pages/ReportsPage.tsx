import { useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { api, downloadBlob, type RecordListItem } from "../lib/api";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  SuccessBanner,
} from "../components/ui";

const REPORT_STATUSES = [
  { value: "ALL", label: "ทุกสถานะ" },
  { value: "ACTIVE", label: "อยู่ระหว่างยืม" },
  { value: "OVERDUE", label: "เกินกำหนด" },
  { value: "RETURNED", label: "คืนแล้ว" },
];

/** แปลงค่าจาก <input type="date"> เป็น ISO ที่ backend รับ (ต้องมี offset) */
function toIso(dateValue: string, endOfDay: boolean): string | undefined {
  if (!dateValue) return undefined;
  const time = endOfDay ? "23:59:59" : "00:00:00";
  return new Date(`${dateValue}T${time}+07:00`).toISOString();
}

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("ALL");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ---- พิมพ์ label ----
  const [labelHn, setLabelHn] = useState("");
  const [labelType, setLabelType] = useState<"barcode" | "qrcode">("barcode");
  const [labelUrl, setLabelUrl] = useState<string | null>(null);
  const [labelRecord, setLabelRecord] = useState<RecordListItem | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  async function downloadReport() {
    setDownloading(true);
    setError(null);
    setSuccess(null);
    try {
      const blob = await api.reportBlob({
        from: toIso(from, false),
        to: toIso(to, true),
        status,
      });
      const today = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `รายงานการยืม-คืน-${today}.xlsx`);
      setSuccess("ดาวน์โหลดรายงานเรียบร้อย");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  }

  async function previewLabel() {
    const hn = labelHn.trim();
    if (!hn) return;
    setLabelLoading(true);
    setLabelError(null);
    try {
      const [blob, records] = await Promise.all([
        api.labelBlob(hn, labelType),
        api.records({ search: hn }),
      ]);
      if (labelUrl) URL.revokeObjectURL(labelUrl);
      setLabelUrl(URL.createObjectURL(blob));
      setLabelRecord(records.find((r) => r.hn === hn) ?? null);
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : "สร้าง label ไม่สำเร็จ");
      setLabelUrl(null);
      setLabelRecord(null);
    } finally {
      setLabelLoading(false);
    }
  }

  async function downloadLabel() {
    const hn = labelHn.trim();
    if (!hn) return;
    try {
      const blob = await api.labelBlob(hn, labelType);
      downloadBlob(blob, `label-${hn}-${labelType}.png`);
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : "ดาวน์โหลด label ไม่สำเร็จ");
    }
  }

  return (
    <div>
      <PageHeader title="รายงานและป้ายแฟ้ม" subtitle="ออกรายงาน Excel และพิมพ์ label QR/Barcode" />

      <Card className="mb-6 max-w-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-teal-700" />
          <h2 className="text-base font-semibold text-slate-900">รายงานการยืม-คืน (Excel)</h2>
        </div>

        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ตั้งแต่วันที่">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="ถึงวันที่">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="สถานะ">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {REPORT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          เว้นว่างช่องวันที่ไว้เพื่อออกรายงานทั้งหมด — รายงานมีสรุปจำนวนรายการและไฮไลต์แถวที่เกินกำหนด
        </p>

        <div className="mt-4">
          <Button onClick={() => void downloadReport()} disabled={downloading}>
            <Download className="size-4" />
            {downloading ? "กำลังสร้างรายงาน..." : "ดาวน์โหลด Excel"}
          </Button>
        </div>
      </Card>

      <Card className="max-w-2xl p-5">
        <div className="mb-4 flex items-center gap-2">
          <Printer className="size-5 text-teal-700" />
          <h2 className="text-base font-semibold text-slate-900">พิมพ์ label QR / Barcode</h2>
        </div>

        {labelError ? <ErrorBanner message={labelError} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="HN">
            <Input
              value={labelHn}
              onChange={(e) => setLabelHn(e.target.value)}
              placeholder="เช่น 0000000001"
              inputMode="numeric"
              maxLength={10}
            />
          </Field>
          <Field label="รูปแบบ">
            <Select
              value={labelType}
              onChange={(e) => setLabelType(e.target.value as "barcode" | "qrcode")}
            >
              <option value="barcode">Barcode (Code128)</option>
              <option value="qrcode">QR Code</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={() => void previewLabel()} disabled={labelLoading || !labelHn.trim()}>
            {labelLoading ? "กำลังสร้าง..." : "แสดงตัวอย่าง"}
          </Button>
          {labelUrl ? (
            <>
              <Button variant="outline" onClick={() => void downloadLabel()}>
                <Download className="size-4" />
                ดาวน์โหลด PNG
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                พิมพ์
              </Button>
            </>
          ) : null}
        </div>

        {labelUrl ? (
          <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-center">
            {labelRecord ? (
              <div className="mb-2 text-sm font-medium text-slate-900">{labelRecord.patientName}</div>
            ) : null}
            <img src={labelUrl} alt={`label ${labelHn}`} className="mx-auto max-w-full" />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
