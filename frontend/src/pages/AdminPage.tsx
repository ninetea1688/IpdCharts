import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, KeyRound, Plus, Users } from "lucide-react";
import { api, type Department, type Role, type User } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  PageHeader,
  Select,
  SuccessBanner,
} from "../components/ui";

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "เจ้าหน้าที่เวชระเบียน",
  BORROWER: "ผู้ยืม",
  DEPARTMENT_HEAD: "หัวหน้าหน่วยงาน",
};

interface FormState {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  departmentId: string;
  email: string;
}

const emptyForm: FormState = {
  username: "",
  password: "",
  fullName: "",
  role: "BORROWER",
  departmentId: "",
  email: "",
};

export default function AdminPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [mode, setMode] = useState<"none" | "create" | { editing: User }>("none");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, d] = await Promise.all([api.users(includeInactive), api.departments()]);
      setUsers(u);
      setDepartments(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setMode("create");
    setForm(emptyForm);
    setError(null);
  }

  function startEdit(u: User) {
    setMode({ editing: u });
    setForm({
      username: u.username,
      password: "",
      fullName: u.fullName,
      role: u.role,
      departmentId: u.departmentId ? String(u.departmentId) : "",
      email: u.email ?? "",
    });
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const departmentId = form.departmentId ? Number(form.departmentId) : null;
    const email = form.email.trim() || null;

    try {
      if (mode === "create") {
        const created = await api.createUser({
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          departmentId,
          email,
        });
        setSuccess(`เพิ่มผู้ใช้ ${created.fullName} เรียบร้อย`);
      } else if (mode !== "none") {
        await api.updateUser(mode.editing.id, {
          fullName: form.fullName.trim(),
          role: form.role,
          departmentId,
          email,
          ...(form.password ? { password: form.password } : {}),
        });
        setSuccess(`บันทึกข้อมูล ${form.fullName} เรียบร้อย`);
      }
      setMode("none");
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: User) {
    setError(null);
    setSuccess(null);
    try {
      if (u.active) {
        await api.deactivateUser(u.id);
        setSuccess(`ปิดใช้งานบัญชี ${u.fullName} แล้ว`);
      } else {
        await api.updateUser(u.id, { active: true });
        setSuccess(`เปิดใช้งานบัญชี ${u.fullName} แล้ว`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    }
  }

  const editing = mode !== "none" && mode !== "create" ? mode.editing : null;
  const showForm = mode !== "none";

  return (
    <div>
      <PageHeader title="จัดการระบบ" subtitle="จัดการผู้ใช้งาน หน่วยงาน และสิทธิ์" />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {success ? <SuccessBanner message={success} /> : null}

      {showForm ? (
        <Card className="mb-6 max-w-2xl p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            {editing ? `แก้ไขผู้ใช้: ${editing.username}` : "เพิ่มผู้ใช้งาน"}
          </h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            {editing ? null : (
              <Field label="ชื่อผู้ใช้" hint="ใช้ได้เฉพาะ a-z 0-9 . _ - อย่างน้อย 3 ตัวอักษร">
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  maxLength={50}
                  required
                />
              </Field>
            )}

            <Field label="ชื่อ-สกุล">
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                maxLength={100}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="บทบาท">
                <Select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="หน่วยงาน" hint="ผู้ยืมต้องมีหน่วยงานจึงจะยืมแฟ้มได้">
                <Select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                >
                  <option value="">— ไม่ระบุ —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="อีเมล" hint="ใช้รับแจ้งเตือนแฟ้มเกินกำหนด — ถ้าไม่ระบุจะไม่ได้รับแจ้งเตือน">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@hospital.local"
                maxLength={200}
              />
            </Field>

            <Field
              label={editing ? "ตั้งรหัสผ่านใหม่" : "รหัสผ่าน"}
              hint={editing ? "เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน" : "อย่างน้อย 8 ตัวอักษร"}
            >
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={editing ? undefined : 8}
                maxLength={100}
                required={!editing}
                autoComplete="new-password"
              />
            </Field>

            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้งาน"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMode("none")} disabled={submitting}>
                ยกเลิก
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-teal-700" />
            <h2 className="text-base font-semibold text-slate-900">ผู้ใช้งานระบบ</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="size-4 accent-teal-700"
              />
              แสดงบัญชีที่ปิดใช้งาน
            </label>
            <Button size="sm" onClick={startCreate}>
              <Plus className="size-4" />
              เพิ่มผู้ใช้งาน
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500">กำลังโหลด...</div>
        ) : users.length === 0 ? (
          <EmptyState text="ยังไม่มีผู้ใช้งานในระบบ" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-3 font-medium">ชื่อผู้ใช้</th>
                  <th className="px-3 py-3 font-medium">ชื่อ-สกุล</th>
                  <th className="px-3 py-3 font-medium">บทบาท</th>
                  <th className="px-3 py-3 font-medium">หน่วยงาน</th>
                  <th className="px-3 py-3 font-medium">อีเมล</th>
                  <th className="px-3 py-3 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${
                      u.active ? "" : "opacity-60"
                    }`}
                  >
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">{u.username}</td>
                    <td className="px-3 py-3">
                      {u.fullName}
                      {u.active ? null : <span className="ml-2 text-xs text-slate-400">(ปิดใช้งาน)</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={u.role === "ADMIN" ? "teal" : u.role === "DEPARTMENT_HEAD" ? "amber" : "sky"}
                      >
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{u.department ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {u.email ?? <span className="text-amber-600">ยังไม่ระบุ</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(u)}>
                          แก้ไข
                        </Button>
                        {u.id === currentUser?.id ? null : (
                          <Button size="sm" variant="outline" onClick={() => void toggleActive(u)}>
                            {u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="size-4 text-teal-700" />
            บทบาทผู้ใช้งาน
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <div key={role} className="flex justify-between">
                <dt className="text-slate-500">{ROLE_LABELS[role]}</dt>
                <dd className="font-medium tabular-nums">
                  {users.filter((u) => u.role === role && u.active).length}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="size-4 text-teal-700" />
            หน่วยงาน
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            {departments.length === 0 ? (
              <div className="text-slate-500">ยังไม่มีหน่วยงาน</div>
            ) : (
              departments.map((d) => (
                <div key={d.id} className="flex justify-between">
                  <dt className="text-slate-500">{d.name}</dt>
                  <dd className="font-medium tabular-nums">{d.userCount} คน</dd>
                </div>
              ))
            )}
          </dl>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Link to="/reports" className="text-sm text-teal-700 hover:underline">
              ไปที่หน้ารายงานและป้ายแฟ้ม
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
