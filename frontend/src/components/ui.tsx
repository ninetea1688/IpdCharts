import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn";

type ButtonVariant = "primary" | "outline" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-teal-700 text-white hover:bg-teal-800 focus-visible:outline-teal-700 disabled:bg-teal-300",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-teal-700",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600",
  ghost: "text-teal-700 hover:bg-teal-50 focus-visible:outline-teal-700",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

type BadgeTone = "emerald" | "sky" | "red" | "amber" | "slate" | "teal";

const badgeTones: Record<BadgeTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20",
};

export function Badge({
  tone = "slate",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) return <Badge tone="red">เกินกำหนด</Badge>;
  if (status === "AVAILABLE") return <Badge tone="emerald">ว่าง</Badge>;
  if (status === "BORROWED") return <Badge tone="sky">ถูกยืม</Badge>;
  if (status === "RETURNED") return <Badge tone="slate">คืนแล้ว</Badge>;
  if (status === "OVERDUE") return <Badge tone="red">เกินกำหนด</Badge>;
  return <Badge tone="slate">{status}</Badge>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputBase, "bg-white", className)} {...props} />;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{message}</span>
      {onRetry ? (
        <button className="font-medium underline underline-offset-2" onClick={onRetry}>
          ลองใหม่
        </button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {message}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
