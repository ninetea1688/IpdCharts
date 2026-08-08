import { useCallback, useEffect, useState } from "react";
import { api, type BorrowListItem, type User } from "../lib/api";
import { formatDateTime } from "../lib/format";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  StatusBadge,
  SuccessBanner,
} from "../components/ui";

export default function ReturnPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [borrows, setBorrows] = useState<BorrowListItem[]>([]);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadBorrows = useCallback(async (borrowerId: number) => {
    setLoading(true);
    setError(null);
    try {
      const all = await api.borrows({ status: "ACTIVE" });
      setBorrows(all.filter((b) => b.borrower === users.find((u) => u.id === borrowerId)?.fullName));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายการยืมไม่สำเร็จ");
      setBorrows([]);
    } finally {
      setLoading(false);
    }
  }, [users]);

  useEffect(() => {
    api
      .users()
      .then((all) => setUsers(all.filter((u) => u.role === "BORROWER")))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "โหลดผู้ยืมไม่สำเร็จ"));
  }, []);

  function handleSelect(userId: string) {
    setSelectedId(userId);
    setConfirmingId(null);
    setSuccess(null);
    if (userId) void loadBorrows(Number(userId));
  }

  async function handleReturn(borrow: BorrowListItem, returnedById: number) {
    setError(null);
    setSuccess(null);
    try {
      await api.returnBorrow(borrow.id, returnedById);
      setSuccess(`คืนแฟ้ม ${borrow.hn} (${borrow.patientName}) สำเร็จ`);
      setConfirmingId(null);
      if (selectedId) void loadBorrows(Number(selectedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "คืนแฟ้มไม่สำเร็จ");
      setConfirmingId(null);
    }
  }

  const selectedUser = users.find((u) => u.id === Number(selectedId));

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

      {selectedId ? (
        <>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            รายการที่ {selectedUser?.fullName ?? ""} ถืออยู่ ({borrows.length})
          </h2>
          {loading ? (
            <div className="text-sm text-slate-500">กำลังโหลด...</div>
          ) : borrows.length === 0 ? (
            <EmptyState text="ไม่มียืมที่ยังไม่คืนสำหรับผู้ยืมนี้" />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">HN</th>
                    <th className="px-4 py-3 font-medium">ผู้ป่วย</th>
                    <th className="px-4 py-3 font-medium">เหตุผล</th>
                    <th className="px-4 py-3 font-medium">กำหนดคืน</th>
                    <th className="px-4 py-3 font-medium">สถานะ</th>
                    <th className="px-4 py-3 text-right font-medium">คืน</th>
                  </tr>
                </thead>
                <tbody>
                  {borrows.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{b.hn}</td>
                      <td className="px-4 py-3">{b.patientName}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-600" title={b.reason}>
                        {b.reason}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatDateTime(b.dueDate)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} overdue={b.status === "OVERDUE"} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {confirmingId === b.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-slate-500">ยืนยันคืน?</span>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void handleReturn(b, Number(selectedId))}
                            >
                              ยืนยัน
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmingId(null)}>
                              ยกเลิก
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setConfirmingId(b.id)}>
                            คืนแฟ้ม
                          </Button>
                        )}
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
