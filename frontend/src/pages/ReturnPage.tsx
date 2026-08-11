import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api, type BorrowListItem, type User } from "../lib/api";
import { formatDateTime } from "../lib/format";
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

type PendingAction =
  | { kind: "return"; borrow: BorrowListItem }
  | { kind: "damaged"; borrow: BorrowListItem }
  | { kind: "lost"; borrow: BorrowListItem };

export default function ReturnPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [borrows, setBorrows] = useState<BorrowListItem[]>([]);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBorrows = useCallback(async (borrowerId: number) => {
    setLoading(true);
    setError(null);
    try {
      // ไม่กรอง status ที่ API เพราะ ACTIVE ไม่รวมรายการที่เกินกำหนด (OVERDUE เป็น derived status)
      // ถ้ากรองจะทำให้แฟ้มที่เลยกำหนด — ซึ่งเป็นแฟ้มที่ต้องเร่งรับคืนที่สุด — ไม่ขึ้นในหน้านี้
      const all = await api.borrows();
      setBorrows(
        all.filter(
          (b) => b.borrowerId === borrowerId && (b.status === "ACTIVE" || b.status === "OVERDUE"),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายการยืมไม่สำเร็จ");
      setBorrows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .users()
      .then((all) => setUsers(all.filter((u) => u.role !== "ADMIN")))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "โหลดผู้ยืมไม่สำเร็จ"));
  }, []);

  function handleSelect(userId: string) {
    setSelectedId(userId);
    setAction(null);
    setNote("");
    setSuccess(null);
    if (userId) void loadBorrows(Number(userId));
  }

  function startAction(next: PendingAction) {
    setAction(next);
    setNote("");
    setError(null);
  }

  async function submitAction() {
    if (!action) return;
    const { borrow } = action;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (action.kind === "return") {
        await api.returnBorrow(borrow.id, { returnedById: borrow.borrowerId });
        setSuccess(`คืนแฟ้ม ${borrow.hn} (${borrow.patientName}) สำเร็จ`);
      } else if (action.kind === "damaged") {
        await api.returnBorrow(borrow.id, {
          returnedById: borrow.borrowerId,
          condition: "DAMAGED",
          damageNote: note,
        });
        setSuccess(`รับคืนแฟ้ม ${borrow.hn} พร้อมเปิดเรื่องแฟ้มชำรุดแล้ว`);
      } else {
        await api.createIncident({ hn: borrow.hn, type: "LOST", description: note });
        setSuccess(`บันทึกแฟ้ม ${borrow.hn} สูญหาย และแจ้งผู้เกี่ยวข้องแล้ว`);
      }
      setAction(null);
      setNote("");
      if (selectedId) void loadBorrows(Number(selectedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedUser = users.find((u) => u.id === Number(selectedId));
  const noteRequired = action?.kind === "damaged" || action?.kind === "lost";

  return (
    <div>
      <PageHeader title="คืนแฟ้ม" subtitle="เลือกรายการที่ผู้ยืมถืออยู่ แล้วยืนยันการคืน" />

      {loadError ? <ErrorBanner message={loadError} /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      <Card className="mb-5 max-w-xl p-5">
        <Field label="ผู้ยืม">
          <Select value={selectedId} onChange={(e) => handleSelect(e.target.value)} required>
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
      </Card>

      {action ? (
        <Card className="mb-5 max-w-xl border-amber-300 bg-amber-50/60 p-5">
          <div className="mb-3 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {action.kind === "return" ? "ยืนยันการรับคืน" : null}
                {action.kind === "damaged" ? "รับคืนแฟ้มสภาพชำรุด" : null}
                {action.kind === "lost" ? "รายงานแฟ้มสูญหาย" : null}
              </div>
              <div className="text-xs text-slate-600">
                HN {action.borrow.hn} — {action.borrow.patientName}
              </div>
            </div>
          </div>

          {noteRequired ? (
            <Field
              label={action.kind === "damaged" ? "รายละเอียดความชำรุด" : "รายละเอียดการสูญหาย"}
            >
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  action.kind === "damaged"
                    ? "เช่น ปกฉีกขาด เอกสารหน้า 3 เปียกน้ำ"
                    : "เช่น ค้นหาที่หอผู้ป่วยแล้วไม่พบ"
                }
                maxLength={300}
                required
              />
            </Field>
          ) : null}

          {action.kind === "lost" ? (
            <p className="mt-2 text-xs text-slate-600">
              แฟ้มจะถูกตั้งสถานะ "สูญหาย" และระบบจะหยุดแจ้งเตือนทวงคืนรายการนี้
              โดยติดตามผ่านเรื่องที่เปิดไว้แทน
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button
              variant={action.kind === "return" ? "primary" : "danger"}
              onClick={() => void submitAction()}
              disabled={submitting || (noteRequired && note.trim().length === 0)}
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
            </Button>
            <Button variant="ghost" onClick={() => setAction(null)} disabled={submitting}>
              ยกเลิก
            </Button>
          </div>
        </Card>
      ) : null}

      {selectedId ? (
        <>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            รายการที่ {selectedUser?.fullName ?? ""} ถืออยู่ ({borrows.length})
          </h2>
          {loading ? (
            <div className="text-sm text-slate-500">กำลังโหลด...</div>
          ) : borrows.length === 0 ? (
            <EmptyState text="ไม่มีแฟ้มที่ยังไม่คืนสำหรับผู้ยืมนี้" />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">HN</th>
                    <th className="px-4 py-3 font-medium">ผู้ป่วย</th>
                    <th className="px-4 py-3 font-medium">เหตุผล</th>
                    <th className="px-4 py-3 font-medium">กำหนดคืน</th>
                    <th className="px-4 py-3 font-medium">สถานะ</th>
                    <th className="px-4 py-3 text-right font-medium">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody>
                  {borrows.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{b.hn}</td>
                      <td className="px-4 py-3">{b.patientName}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-600" title={b.reason}>
                        {b.reason}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatDateTime(b.dueDate)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" onClick={() => startAction({ kind: "return", borrow: b })}>
                            รับคืน
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startAction({ kind: "damaged", borrow: b })}
                          >
                            ชำรุด
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startAction({ kind: "lost", borrow: b })}
                          >
                            สูญหาย
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
