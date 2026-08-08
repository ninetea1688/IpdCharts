import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type User } from "../lib/api";
import { defaultDueDateValue, formatDateTime } from "../lib/format";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select, SuccessBanner } from "../components/ui";

export default function BorrowPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [hn, setHn] = useState("");
  const [borrowerId, setBorrowerId] = useState("");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDateValue);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .users()
      .then((all) => setUsers(all.filter((u) => u.role === "BORROWER")))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "โหลดผู้ยืมไม่สำเร็จ"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedBorrowerId = Number(borrowerId);
    if (!Number.isInteger(parsedBorrowerId) || parsedBorrowerId <= 0) {
      setError("กรุณาเลือกผู้ยืม");
      return;
    }

    setSubmitting(true);
    try {
      const borrow = await api.createBorrow({
        hn: hn.trim(),
        borrowerId: parsedBorrowerId,
        reason: reason.trim(),
        dueDate: new Date(dueDate).toISOString(),
      });
      setSuccess(`ยืมแฟ้ม ${borrow.hn} (${borrow.patientName}) สำเร็จ — กำหนดคืน ${formatDateTime(borrow.dueDate)}`);
      setHn("");
      setBorrowerId("");
      setReason("");
      setDueDate(defaultDueDateValue());
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "ยืมแฟ้มไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="ยืมแฟ้ม" subtitle="สแกนหรือกรอก HN แล้วระบุผู้ยืม เหตุผล และกำหนดคืน" />

      {loadError ? <ErrorBanner message={loadError} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <Card className="max-w-xl p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="HN (เลขประจำตัวผู้ป่วย)" hint="ตัวเลข 8-10 หลัก เช่น 0000000001">
            <Input
              value={hn}
              onChange={(e) => setHn(e.target.value)}
              placeholder="0000000001"
              inputMode="numeric"
              maxLength={10}
              required
              autoFocus
            />
          </Field>

          <Field label="ผู้ยืม">
            <Select value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)} required>
              <option value="" disabled>
                -- เลือกผู้ยืม --
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.department ?? "ไม่มีหน่วยงาน"})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="เหตุผลการยืม">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น นำส่งห้องผ่าตัด, ทบทวนเวชระเบียน"
              maxLength={200}
              required
            />
          </Field>

          <Field label="กำหนดคืน" hint="ระบบจะแจ้งเตือนเมื่อเกินกำหนด (ตามนโยบาย dueDate + 7 วัน)">
            <Input
              type="datetime-local"
              value={dueDate}
              min={defaultDueDateValue()}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </Field>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={submitting || users.length === 0}>
              {submitting ? "กำลังบันทึก..." : "ยืมแฟ้ม"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
