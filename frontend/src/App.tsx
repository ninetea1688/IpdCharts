import { NavLink, Route, Routes } from "react-router-dom";
import { ClipboardList, FolderOpen, LayoutDashboard, ScanLine, Undo2 } from "lucide-react";
import { cn } from "./lib/cn";
import Dashboard from "./pages/Dashboard";
import BorrowPage from "./pages/BorrowPage";
import ReturnPage from "./pages/ReturnPage";
import RecordsPage from "./pages/RecordsPage";
import RecordDetailPage from "./pages/RecordDetailPage";

const navItems = [
  { to: "/", label: "หน้าหลัก", icon: LayoutDashboard, end: true },
  { to: "/borrow", label: "ยืมแฟ้ม", icon: ScanLine },
  { to: "/return", label: "คืนแฟ้ม", icon: Undo2 },
  { to: "/records", label: "รายการแฟ้ม", icon: FolderOpen },
];

export default function App() {
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
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {navItems.map((item) => (
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
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/borrow" element={<BorrowPage />} />
            <Route path="/return" element={<ReturnPage />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/records/:id" element={<RecordDetailPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
