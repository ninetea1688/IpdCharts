import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, type BorrowListItem } from "../lib/api";
import { formatDateTime } from "../lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  SuccessBanner,
} from "../components/ui";

export default function ApprovalsPage() {
  const [pending, setPending] = useState<BorrowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPending(await api.borrows({ status: "PENDING_APPROVAL" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดคำขอไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(borrow: BorrowListItem) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.approveBorrow(borrow.id);
      setSuccess(`อนุมัติคำขอยืมแฟ้ม ${borrow.hn} แล้ว — จ่ายแฟ้มได้`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function reject(borrow: BorrowListItem) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.rejectBorrow(borrow.id, rejectReason.trim());
      setSuccess(`ไม่อนุมัติคำขอยืมแฟ้ม ${borrow.hn} แล้ว`);
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="อนุมัติคำขอยืม"
        subtitle="คำขอยืมกรณีพิเศษที่รอการอนุมัติก่อนจ่ายแฟ้ม"
      />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      {loading ? (
        <div className="text-sm text-slate-500">กำลังโหลด...</div>
      ) : pending.length === 0 ? (
        <EmptyState text="ไม่มีคำขอที่รออนุมัติ" />
      ) : (
        <div className="space-y-3">
          {pending.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">HN {b.hn}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-700">{b.patientName}</span>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <dt className="text-slate-500">ผู้ยืม:</dt>
                      <dd className="text-slate-900">{b.borrower}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-slate-500">หน่วยงาน:</dt>
                      <dd className="text-slate-900">{b.department}</dd>
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <dt className="shrink-0 text-slate-500">เหตุผล:</dt>
                      <dd className="text-slate-900">{b.reason}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-slate-500">กำหนดคืน:</dt>
                      <dd className="tabular-nums text-slate-900">{formatDateTime(b.dueDate)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button onClick={() => void approve(b)} disabled={submitting}>
                    <CheckCircle2 className="size-4" />
                    อนุมัติ
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejectingId(rejectingId === b.id ? null : b.id);
                      setRejectReason("");
                    }}
                    disabled={submitting}
                  >
                    ไม่อนุมัติ
                  </Button>
                </div>
              </div>

              {rejectingId === b.id ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <Field label="เหตุผลที่ไม่อนุมัติ">
                    <Input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="เช่น ไม่มีเอกสารรับรองจากผู้บริหาร"
                      maxLength={200}
                      required
                    />
                  </Field>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      onClick={() => void reject(b)}
                      disabled={submitting || rejectReason.trim().length === 0}
                    >
                      ยืนยันไม่อนุมัติ
                    </Button>
                    <Button variant="ghost" onClick={() => setRejectingId(null)} disabled={submitting}>
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
