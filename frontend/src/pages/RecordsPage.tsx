import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { api, type RecordListItem, type RecordStatus } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Card, EmptyState, ErrorBanner, Input, PageHeader, StatusBadge } from "../components/ui";
import { cn } from "../lib/cn";

const filters: { value: RecordStatus | ""; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "AVAILABLE", label: "ว่าง" },
  { value: "BORROWED", label: "ถูกยืม" },
  { value: "DAMAGED", label: "ชำรุด" },
  { value: "LOST", label: "สูญหาย" },
];

export default function RecordsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const status = (searchParams.get("status") as RecordStatus | null) ?? "";

  const [input, setInput] = useState(search);
  const [records, setRecords] = useState<RecordListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (q: string, st: RecordStatus | "") => {
      setLoading(true);
      setError(null);
      try {
        setRecords(await api.records({ search: q || undefined, status: st || undefined }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "โหลดรายการแฟ้มไม่สำเร็จ");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(search, status);
  }, [load, search, status]);

  function applyFilter(nextStatus: RecordStatus | "") {
    const next = new URLSearchParams(searchParams);
    if (nextStatus) next.set("status", nextStatus);
    else next.delete("status");
    setSearchParams(next);
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (input.trim()) next.set("search", input.trim());
    else next.delete("search");
    setSearchParams(next);
  }

  return (
    <div>
      <PageHeader title="รายการแฟ้ม" subtitle="ค้นหาแฟ้มเวชระเบียนตาม HN หรือชื่อผู้ป่วย" />

      <form onSubmit={submitSearch} className="mb-4 flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ค้นหา HN หรือชื่อผู้ป่วย"
            className="pl-9"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          ค้นหา
        </button>
      </form>

      <div className="mb-4 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => applyFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              status === f.value
                ? "bg-teal-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load(search, status)} /> : null}

      {loading ? (
        <div className="text-sm text-slate-500">กำลังโหลด...</div>
      ) : records.length === 0 ? (
        <EmptyState text="ไม่พบแฟ้มที่ตรงกับเงื่อนไข" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">HN</th>
                <th className="px-4 py-3 font-medium">ผู้ป่วย</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">ผู้ยืมปัจจุบัน</th>
                <th className="px-4 py-3 font-medium">หน่วยงาน</th>
                <th className="px-4 py-3 font-medium">กำหนดคืน</th>
                <th className="px-4 py-3 text-right font-medium">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.hn}</td>
                  <td className="px-4 py-3">{r.patientName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} overdue={r.activeBorrow?.overdue} />
                  </td>
                  <td className="px-4 py-3">{r.activeBorrow?.borrower ?? "—"}</td>
                  <td className="px-4 py-3">{r.activeBorrow?.department ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.activeBorrow ? formatDateTime(r.activeBorrow.dueDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/records/${r.id}`}
                      className="font-medium text-teal-700 hover:underline"
                    >
                      ดูประวัติ
                    </Link>
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
