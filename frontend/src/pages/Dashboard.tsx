import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { api, type BorrowListItem, type Stats } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Card, EmptyState, ErrorBanner, PageHeader, StatusBadge } from "../components/ui";

const statCards: { key: keyof Stats; label: string; tone: string }[] = [
  { key: "totalRecords", label: "แฟ้มทั้งหมด", tone: "text-slate-900" },
  { key: "available", label: "ว่างให้ยืม", tone: "text-emerald-600" },
  { key: "borrowed", label: "อยู่ระหว่างยืม", tone: "text-sky-600" },
  { key: "overdue", label: "เกินกำหนด", tone: "text-red-600" },
  { key: "returnedToday", label: "คืนวันนี้", tone: "text-teal-600" },
];

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [overdue, setOverdue] = useState<BorrowListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, overdueData] = await Promise.all([api.stats(), api.borrows({ status: "OVERDUE" })]);
      setStats(statsData);
      setOverdue(overdueData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title="หน้าหลัก" subtitle="ภาพรวมการยืม-คืนเวชระเบียนผู้ป่วยใน" />

      <div className="mb-2 flex items-center justify-end">
        <button
          className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800"
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
          รีเฟรช
        </button>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {stats ? (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {statCards.map((card) => (
            <Card key={card.key} className="px-4 py-4">
              <div className="text-xs font-medium text-slate-500">{card.label}</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${card.tone}`}>
                {stats[card.key]}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        !error && <div className="mb-8 text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
      )}

      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
        <AlertTriangle className="size-4 text-red-600" />
        แฟ้มเกินกำหนด ({overdue.length})
      </h2>

      {loading && !stats ? (
        <div className="text-sm text-slate-500">กำลังโหลด...</div>
      ) : overdue.length === 0 ? (
        <EmptyState text="ไม่มีแฟ้มเกินกำหนด — ดีมาก!" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">HN</th>
                <th className="px-4 py-3 font-medium">ผู้ป่วย</th>
                <th className="px-4 py-3 font-medium">ผู้ยืม</th>
                <th className="px-4 py-3 font-medium">หน่วยงาน</th>
                <th className="px-4 py-3 font-medium">กำหนดคืน</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/records?search=${encodeURIComponent(b.hn)}`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      {b.hn}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{b.patientName}</td>
                  <td className="px-4 py-3">{b.borrower}</td>
                  <td className="px-4 py-3">{b.department}</td>
                  <td className="px-4 py-3 tabular-nums">{formatDateTime(b.dueDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status="OVERDUE" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
