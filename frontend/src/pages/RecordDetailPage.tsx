import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, User } from "lucide-react";
import { api, type RecordDetail } from "../lib/api";
import { formatDateTime } from "../lib/format";
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  PageHeader,
  StatusBadge,
} from "../components/ui";

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const recordId = Number(id);

  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isInteger(recordId) || recordId <= 0) {
      setError("รหัสแฟ้มไม่ถูกต้อง");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .record(recordId)
      .then(setRecord)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [recordId]);

  if (loading) return <div className="text-sm text-slate-500">กำลังโหลด...</div>;
  if (error) {
    return (
      <div>
        <PageHeader title="รายละเอียดแฟ้ม" />
        <ErrorBanner message={error} />
        <Link to="/records" className="text-sm font-medium text-teal-700 hover:underline">
          ← กลับไปรายการแฟ้ม
        </Link>
      </div>
    );
  }
  if (!record) return null;

  const active = record.activeBorrow;

  return (
    <div>
      <Link
        to="/records"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
      >
        <ArrowLeft className="size-4" />
        กลับไปรายการแฟ้ม
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xs text-slate-500">HN {record.hn}</div>
          <h1 className="text-xl font-semibold text-slate-900">{record.patientName}</h1>
        </div>
        <StatusBadge status={record.status} overdue={active?.overdue} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {active ? (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <User className="size-4 text-teal-700" />
              อยู่ระหว่างยืมโดย
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">ผู้ยืม</dt>
                <dd className="text-right font-medium text-slate-900">{active.borrower}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">หน่วยงาน</dt>
                <dd className="text-right text-slate-900">{active.department}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">เหตุผล</dt>
                <dd className="text-right text-slate-900">{active.reason}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">กำหนดคืน</dt>
                <dd className="text-right font-medium tabular-nums text-slate-900">
                  {formatDateTime(active.dueDate)}
                </dd>
              </div>
            </dl>
          </Card>
        ) : (
          <Card className="flex items-center gap-3 p-5">
            <StatusBadge status={record.status} />
            <span className="text-sm text-slate-600">
              {record.status === "AVAILABLE"
                ? "แฟ้มนี้อยู่ที่ห้องเวชระเบียน พร้อมให้ยืม"
                : record.status === "DAMAGED"
                  ? "แฟ้มชำรุด อยู่ระหว่างดำเนินการ — ยืมไม่ได้จนกว่าจะปิดเรื่อง"
                  : record.status === "LOST"
                    ? "แฟ้มสูญหาย อยู่ระหว่างติดตาม"
                    : "ไม่มีรายการยืมที่ยังไม่ปิด"}
            </span>
          </Card>
        )}
      </div>

      {record.incidents.length > 0 ? (
        <>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            เหตุการณ์ชำรุด/สูญหาย ({record.incidents.length})
          </h2>
          <div className="mb-6 space-y-2">
            {record.incidents.map((i) => (
              <Card key={i.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={i.type} />
                  <StatusBadge status={i.status} />
                  <span className="text-xs text-slate-500">
                    รายงานโดย {i.reportedBy} เมื่อ {formatDateTime(i.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{i.description}</p>
                {i.status === "RESOLVED" ? (
                  <p className="mt-1.5 text-xs text-emerald-700">
                    ปิดเรื่องโดย {i.resolvedBy}
                    {i.resolvedAt ? ` เมื่อ ${formatDateTime(i.resolvedAt)}` : ""}
                    {i.resolutionNote ? ` — ${i.resolutionNote}` : ""}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <h2 className="mb-3 text-base font-semibold text-slate-900">
        ประวัติการยืม-คืน ({record.history.length})
      </h2>
      {record.history.length === 0 ? (
        <EmptyState text="ยังไม่มีประวัติการยืม" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">รายการ</th>
                <th className="px-4 py-3 font-medium">ผู้ยืม</th>
                <th className="px-4 py-3 font-medium">หน่วยงาน</th>
                <th className="px-4 py-3 font-medium">เหตุผล</th>
                <th className="px-4 py-3 font-medium">กำหนดคืน</th>
                <th className="px-4 py-3 font-medium">คืนเมื่อ</th>
                <th className="px-4 py-3 font-medium">ผู้รับคืน</th>
              </tr>
            </thead>
            <tbody>
              {record.history.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Badge tone={h.action === "คืนแล้ว" ? "slate" : "sky"}>{h.action}</Badge>
                  </td>
                  <td className="px-4 py-3">{h.borrower}</td>
                  <td className="px-4 py-3">{h.department}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-600" title={h.reason}>
                    {h.reason}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDateTime(h.dueDate)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDateTime(h.returnedAt)}</td>
                  <td className="px-4 py-3">{h.returnedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
