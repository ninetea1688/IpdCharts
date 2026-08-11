import { useCallback, useEffect } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ClipboardList,
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Stamp,
  Undo2,
  Users,
} from "lucide-react";
import { cn } from "./lib/cn";
import { useAuth, hasRole } from "./lib/auth";
import type { Role } from "./lib/api";
import Dashboard from "./pages/Dashboard";
import BorrowPage from "./pages/BorrowPage";
import ReturnPage from "./pages/ReturnPage";
import RecordsPage from "./pages/RecordsPage";
import RecordDetailPage from "./pages/RecordDetailPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import IncidentsPage from "./pages/IncidentsPage";
import ReportsPage from "./pages/ReportsPage";
import { Button } from "./components/ui";

const ALL_ROLES: Role[] = ["ADMIN", "BORROWER", "DEPARTMENT_HEAD"];

const navItems = [
  { to: "/", label: "หน้าหลัก", icon: LayoutDashboard, end: true },
  { to: "/borrow", label: "ยืมแฟ้ม", icon: ScanLine, roles: ["ADMIN"] as Role[] },
  { to: "/return", label: "คืนแฟ้ม", icon: Undo2, roles: ["ADMIN"] as Role[] },
  { to: "/approvals", label: "อนุมัติคำขอ", icon: Stamp, roles: ["ADMIN", "DEPARTMENT_HEAD"] as Role[] },
  { to: "/records", label: "รายการแฟ้ม", icon: FolderOpen, roles: ALL_ROLES },
  { to: "/incidents", label: "ชำรุด/สูญหาย", icon: AlertTriangle, roles: ALL_ROLES },
  { to: "/reports", label: "รายงาน", icon: FileSpreadsheet, roles: ["ADMIN"] as Role[] },
  { to: "/admin", label: "จัดการระบบ", icon: Users, roles: ["ADMIN"] as Role[] },
];

/** Wrapper ที่เช็ค auth — ถ้ายังไม่ login จะ redirect ไป /login */
function ProtectedRoute({ children, requiredRoles }: { children: React.ReactNode; requiredRoles?: Role[] }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    } else if (!loading && user && requiredRoles && !hasRole(user.role, requiredRoles)) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate, requiredRoles]);

  if (loading || !user) return null;
  if (requiredRoles && !hasRole(user.role, requiredRoles)) return null;
  return <>{children}</>;
}

/** Layout หลักของแอป — sidebar + main content */
function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || hasRole(user?.role ?? null, item.roles),
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — md+ แนวตั้ง, มือถือเป็นแถบบน */}
      <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:w-60 md:min-h-screen md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4 md:px-5">
          <ClipboardList className="size-6 text-teal-700" />
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">ระบบยืม-คืนเวชระเบียน</div>
            <div className="text-xs text-slate-500">ผู้ป่วยใน (IPD)</div>
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
            <div className="size-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold">
              {user.fullName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-slate-900">{user.fullName}</div>
              <div className="truncate text-[10px] text-slate-500">{user.department ?? user.role}</div>
            </div>
          </div>
        )}

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-50 text-teal-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout button */}
        <div className="mt-auto p-3 md:px-5">
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start gap-2">
            <LogOut className="size-4" />
            ออกจากระบบ
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">
          <Routes>
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/borrow" element={<ProtectedRoute requiredRoles={["ADMIN"]}><BorrowPage /></ProtectedRoute>} />
            <Route path="/return" element={<ProtectedRoute requiredRoles={["ADMIN"]}><ReturnPage /></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute requiredRoles={["ADMIN", "DEPARTMENT_HEAD"]}><ApprovalsPage /></ProtectedRoute>} />
            <Route path="/records" element={<ProtectedRoute requiredRoles={ALL_ROLES}><RecordsPage /></ProtectedRoute>} />
            <Route path="/records/:id" element={<ProtectedRoute><RecordDetailPage /></ProtectedRoute>} />
            <Route path="/incidents" element={<ProtectedRoute requiredRoles={ALL_ROLES}><IncidentsPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute requiredRoles={["ADMIN"]}><ReportsPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requiredRoles={["ADMIN"]}><AdminPage /></ProtectedRoute>} />
            <Route path="*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        กำลังโหลด...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <AppLayout /> : <LoginPage />} />
      <Route path="/*" element={user ? <AppLayout /> : <LoginPage />} />
    </Routes>
  );
}
