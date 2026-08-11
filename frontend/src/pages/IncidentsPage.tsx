import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Incident, type IncidentStatus } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useAuth, hasRole } from "../lib/auth";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  SuccessBanner,
} from "../components/ui";

const FILTERS: { value: IncidentStatus | "ALL"; label: string }[] = [
  { value: "OPEN", label: "รอดำเนินการ" },
  { value: "RESOLVED", label: "ปิดเรื่องแล้ว" },
  { value: "ALL", label: "ทั้งหมด" },
];

export default function IncidentsPage() {
  const { user } = useAuth();
  const isAdmin = hasRole(user?.role, ["ADMIN"]);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filter, setFilter] = useState<IncidentStatus | "ALL">("OPEN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [restoreRecord, setRestoreRecord] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ฟอร์มรายงานเหตุการณ์ใหม่
  const [showReport, setShowReport] = useState(false);
  const [reportHn, setReportHn] = useState("");
  const [reportType, setReportType] = useState<"DAMAGED" | "LOST">("DAMAGED");
  const [reportNote, setReportNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setIncidents(await api.incidents(filter === "ALL" ? undefined : { status: filter }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReport() {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await api.createIncident({
        hn: reportHn.trim(),
        type: reportType,
        description: reportNote.trim(),
      });
      setSuccess(`บันทึกเรื่องแฟ้ม ${created.typeLabel} HN ${created.hn} และแจ้งผู้เกี่ยวข้องแล้ว`);
      setShowReport(false);
      setReportHn("");
      setReportNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitResolve(incident: Incident) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.resolveIncident(incident.id, { note: note.trim(), restoreRecord });
      setSuccess(`ปิดเรื่อง HN ${incident.hn} แล้ว`);
      setResolvingId(null);
      setNote("");
      setRestoreRecord(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ปิดเรื่องไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="แฟ้มชำรุด / สูญหาย" subtitle="ติดตามเหตุการณ์และปิดเรื่องเมื่อดำเนินการเสร็จ" />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="w-48">
          <Field label="สถานะ">
            <Select
              value={filter}
              onChange={(e) => setFilter(e.target.value as IncidentStatus | "ALL")}
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {isAdmin ? (
          <Button onClick={() => setShowReport(!showReport)}>รายงานแฟ้มชำรุด/สูญหาย</Button>
        ) : null}
      </div>

      {showReport && isAdmin ? (
        <Card className="mb-5 max-w-xl p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">รายงานเหตุการณ์ใหม่</h2>
          <div className="space-y-4">
            <Field label="HN">
              <Input
                value={reportHn}
                onChange={(e) => setReportHn(e.target.value)}
                placeholder="เช่น 0000000001"
                inputMode="numeric"
                maxLength={10}
                required
              />
            </Field>
            <Field label="ประเภท">
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as "DAMAGED" | "LOST")}
              >
                <option value="DAMAGED">ชำรุด</option>
                <option value="LOST">สูญหาย</option>
              </Select>
            </Field>
            <Field label="รายละเอียด">
              <Input
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                placeholder="อธิบายสภาพแฟ้มหรือสถานการณ์ที่พบ"
                maxLength={300}
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={() => void submitReport()}
                disabled={submitting || !reportHn.trim() || !reportNote.trim()}
              >
                {submitting ? "กำลังบันทึก..." : "บันทึกและแจ้งเตือน"}
              </Button>
              <Button variant="ghost" onClick={() => setShowReport(false)} disabled={submitting}>
                ยกเลิก
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">กำลังโหลด...</div>
      ) : incidents.length === 0 ? (
        <EmptyState text="ไม่มีเหตุการณ์ในสถานะนี้" />
      ) : (
        <div className="space-y-3">
          {incidents.map((i) => (
            <Card key={i.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">HN {i.hn}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-700">{i.patientName}</span>
                    <StatusBadge status={i.type} />
                    <StatusBadge status={i.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{i.description}</p>
                  <p className="mt-1.5 text-xs text-slate-500">
                    รายงานโดย {i.reportedBy} เมื่อ {formatDateTime(i.createdAt)}
                    {i.borrower ? ` · ผู้ยืมล่าสุด ${i.borrower} (${i.department})` : ""}
                  </p>
                  {i.status === "RESOLVED" ? (
                    <p className="mt-1.5 text-xs text-emerald-700">
                      ปิดเรื่องโดย {i.resolvedBy} เมื่อ {i.resolvedAt ? formatDateTime(i.resolvedAt) : "-"}
                      {i.resolutionNote ? ` — ${i.resolutionNote}` : ""}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-2">
                  <Link
                    to={`/records?search=${i.hn}`}
                    className="inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
                  >
                    ดูแฟ้ม
                  </Link>
                  {isAdmin && i.status === "OPEN" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setResolvingId(resolvingId === i.id ? null : i.id);
                        setNote("");
                        setRestoreRecord(false);
                      }}
                    >
                      ปิดเรื่อง
                    </Button>
                  ) : null}
                </div>
              </div>

              {resolvingId === i.id ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <Field label="ผลการดำเนินการ">
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="เช่น ซ่อมปกแฟ้มเรียบร้อย / พบแฟ้มที่หอผู้ป่วย"
                      maxLength={300}
                      required
                    />
                  </Field>
                  <label className="mt-3 flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={restoreRecord}
                      onChange={(e) => setRestoreRecord(e.target.checked)}
                      className="mt-0.5 size-4 accent-teal-700"
                    />
                    <span>
                      <span className="font-medium text-slate-900">คืนแฟ้มกลับสู่สถานะพร้อมยืม</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        ติ๊กเมื่อแฟ้มกลับมาใช้งานได้แล้ว — ถ้ายังมีเรื่องอื่นค้างอยู่ ระบบจะยังไม่คืนสถานะให้
                      </span>
                    </span>
                  </label>
                  <div className="mt-3 flex gap-2">
                    <Button
                      onClick={() => void submitResolve(i)}
                      disabled={submitting || note.trim().length === 0}
                    >
                      ยืนยันปิดเรื่อง
                    </Button>
                    <Button variant="ghost" onClick={() => setResolvingId(null)} disabled={submitting}>
                      ยกเลิก
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
