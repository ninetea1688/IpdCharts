import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Users, Building2, Key } from "lucide-react";
import { api, type User, type Role } from "../lib/api";
import { Card, EmptyState, ErrorBanner, PageHeader, Button, Badge } from "../components/ui";

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "เจ้าหน้าที่เวชระเบียน",
  BORROWER: "ผู้ยืม",
  DEPARTMENT_HEAD: "หัวหน้าหน่วยงาน",
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.users());
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <div>
      <PageHeader title="จัดการระบบ" subtitle="จัดการผู้ใช้งาน หน่วยงาน และสิทธิ์" />

      {error && <ErrorBanner message={error} onRetry={() => void loadUsers()} />}

      {/* User Management Card */}
      <Card className="mb-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-teal-700" />
            <h2 className="text-base font-semibold text-slate-900">ผู้ใช้งานระบบ</h2>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="size-4" />
            เพิ่มผู้ใช้งาน
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">กำลังโหลด...</div>
        ) : users.length === 0 ? (
          <EmptyState text="ยังไม่มีผู้ใช้งานในระบบ" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-3 font-medium">ชื่อผู้ใช้</th>
                  <th className="px-3 py-3 font-medium">ชื่อ-สกุล</th>
                  <th className="px-3 py-3 font-medium">บทบาท</th>
                  <th className="px-3 py-3 font-medium">หน่วยงาน</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{u.username}</td>
                    <td className="px-3 py-3">{u.fullName}</td>
                    <td className="px-3 py-3">
                      <Badge tone={u.role === "ADMIN" ? "teal" : u.role === "DEPARTMENT_HEAD" ? "amber" : "sky"}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{u.department ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stats overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Key className="size-4 text-teal-700" />
            บทบาทผู้ใช้งาน
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => {
              const count = users.filter((u) => u.role === role).length;
              return (
                <div key={role} className="flex justify-between">
                  <dt className="text-slate-500">{ROLE_LABELS[role]}</dt>
                  <dd className="font-medium tabular-nums">{count}</dd>
                </div>
              );
            })}
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="size-4 text-teal-700" />
            ลิงก์ด่วน
          </div>
          <div className="mt-3 space-y-2">
            <Link to="/records" className="block text-sm text-teal-700 hover:underline">
              ดูรายการแฟ้มเวชระเบียน
            </Link>
            <Link to="/" className="block text-sm text-teal-700 hover:underline">
              กลับหน้า Dashboard
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
