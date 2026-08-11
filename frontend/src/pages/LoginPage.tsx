import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Button, Card, Field, Input, PageHeader } from "../components/ui";
import { ClipboardList, Lock, User } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-lg">
            <ClipboardList className="size-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            ระบบยืม-คืนเวชระเบียน
          </h1>
          <p className="mt-1 text-sm text-slate-500">ผู้ป่วยใน (IPD)</p>
        </div>

        <Card className="p-6 shadow-xl">
          <PageHeader title="เข้าสู่ระบบ" />

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="ชื่อผู้ใช้">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="เช่น mr-admin"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>
            </Field>

            <Field label="รหัสผ่าน">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="รหัสผ่าน"
                  autoComplete="current-password"
                  required
                />
              </div>
            </Field>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !username || !password}
            >
              {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            ติดต่อเจ้าหน้าที่เวชระเบียนหากไม่มีบัญชีผู้ใช้
          </p>
        </Card>
      </div>
    </div>
  );
}
