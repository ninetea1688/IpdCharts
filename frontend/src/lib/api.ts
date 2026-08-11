/** ประเภทข้อมูลจาก backend `/api/v1/*` — ต้องตรงกับ shape จริง (ดู backend/src/routes) */

export type Role = "ADMIN" | "BORROWER" | "DEPARTMENT_HEAD";

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  departmentId: number | null;
  department: string | null;
  email: string | null;
  lineUserId: string | null;
  active: boolean;
}

export interface Department {
  id: number;
  name: string;
  userCount: number;
}

export type RecordStatus = "AVAILABLE" | "BORROWED" | "DAMAGED" | "LOST";

export interface ActiveBorrowInfo {
  id: number;
  borrower: string;
  department: string;
  dueDate: string;
  reason: string;
  overdue: boolean;
}

export interface RecordListItem {
  id: number;
  hn: string;
  patientName: string;
  status: RecordStatus;
  statusLabel: string;
  activeBorrow: ActiveBorrowInfo | null;
}

export interface HistoryItem {
  id: number;
  action: string;
  borrower: string;
  department: string;
  reason: string;
  dueDate: string;
  returnedAt: string | null;
  returnedBy: string | null;
}

export type IncidentType = "DAMAGED" | "LOST";
export type IncidentStatus = "OPEN" | "RESOLVED";

export interface RecordIncident {
  id: number;
  type: IncidentType;
  typeLabel: string;
  status: IncidentStatus;
  statusLabel: string;
  description: string;
  reportedBy: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface Incident extends RecordIncident {
  hn: string;
  patientName: string;
  borrower: string | null;
  department: string | null;
}

export interface RecordDetail {
  id: number;
  hn: string;
  patientName: string;
  status: RecordStatus;
  statusLabel: string;
  activeBorrow: ActiveBorrowInfo | null;
  incidents: RecordIncident[];
  history: HistoryItem[];
}

export type BorrowStatus = "PENDING_APPROVAL" | "ACTIVE" | "RETURNED" | "REJECTED" | "OVERDUE";

export interface BorrowListItem {
  id: number;
  hn: string;
  patientName: string;
  borrower: string;
  borrowerId: number;
  department: string;
  reason: string;
  dueDate: string;
  status: BorrowStatus;
  statusLabel: string;
  returnedAt: string | null;
  requiresApproval: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
}

export interface Stats {
  totalRecords: number;
  available: number;
  borrowed: number;
  overdue: number;
  returnedToday: number;
  pendingApproval: number;
  openIncidents: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const AUTH_STORAGE_KEY = "ipdcharts_auth";

/**
 * เรียกเมื่อ API ตอบ 401 — ให้ AuthProvider ล้าง state ตามไปด้วย
 * ไม่งั้น UI จะค้างสถานะ "ล็อกอินอยู่" ทั้งที่ token ใช้ไม่ได้แล้ว
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { token: string }).token;
  } catch {
    return null;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  return new ApiError(
    body?.error?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่",
    body?.error?.code ?? "UNKNOWN",
    res.status,
  );
}

interface RequestOptions extends RequestInit {
  /** ไม่ต้องเรียก onUnauthorized เมื่อ 401 (ใช้ตอนตรวจ token ครั้งแรก) */
  silent401?: boolean;
}

async function rawRequest(path: string, init?: RequestOptions): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้", "NETWORK_ERROR", 0);
  }

  if (res.status === 401 && !init?.silent401) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    onUnauthorized?.();
  }
  return res;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const res = await rawRequest(path, init);
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

/** ดาวน์โหลดไฟล์ไบนารี (รายงาน Excel / label PNG) */
async function requestBlob(path: string): Promise<Blob> {
  const res = await rawRequest(path);
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<{ token: string; user: User }> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<{ token: string; user: User }>;
}

/** ตรวจว่า token ที่เก็บไว้ยังใช้ได้ — เรียกตอนเปิดแอป */
export async function apiMe(): Promise<User> {
  return request<{ user: User }>("/auth/me", { silent401: true }).then((r) => r.user);
}

export const api = {
  stats(): Promise<Stats> {
    return request<{ stats: Stats }>("/stats").then((r) => r.stats);
  },

  users(includeInactive = false): Promise<User[]> {
    return request<{ users: User[] }>(
      `/users${buildQuery({ includeInactive: includeInactive ? "true" : undefined })}`,
    ).then((r) => r.users);
  },

  createUser(body: {
    username: string;
    password: string;
    fullName: string;
    role: Role;
    departmentId: number | null;
    email: string | null;
  }): Promise<User> {
    return request<{ user: User }>("/users", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.user,
    );
  },

  updateUser(
    id: number,
    body: Partial<{
      fullName: string;
      role: Role;
      departmentId: number | null;
      email: string | null;
      active: boolean;
      password: string;
    }>,
  ): Promise<User> {
    return request<{ user: User }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.user);
  },

  deactivateUser(id: number): Promise<User> {
    return request<{ user: User }>(`/users/${id}`, { method: "DELETE" }).then((r) => r.user);
  },

  departments(): Promise<Department[]> {
    return request<{ departments: Department[] }>("/departments").then((r) => r.departments);
  },

  records(params?: { search?: string; status?: RecordStatus }): Promise<RecordListItem[]> {
    return request<{ records: RecordListItem[] }>(
      `/medical-records${buildQuery({ search: params?.search, status: params?.status })}`,
    ).then((r) => r.records);
  },

  record(id: number): Promise<RecordDetail> {
    return request<{ record: RecordDetail }>(`/medical-records/${id}`).then((r) => r.record);
  },

  borrows(params?: { status?: BorrowStatus; search?: string }): Promise<BorrowListItem[]> {
    return request<{ borrows: BorrowListItem[] }>(
      `/borrows${buildQuery({ status: params?.status, search: params?.search })}`,
    ).then((r) => r.borrows);
  },

  createBorrow(body: {
    hn: string;
    borrowerId: number;
    reason: string;
    dueDate: string;
    requiresApproval?: boolean;
  }): Promise<BorrowListItem> {
    return request<{ borrow: BorrowListItem }>("/borrows", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.borrow);
  },

  returnBorrow(
    id: number,
    body: { returnedById: number; condition?: "NORMAL" | "DAMAGED"; damageNote?: string },
  ): Promise<BorrowListItem> {
    return request<{ borrow: BorrowListItem }>(`/borrows/${id}/return`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.borrow);
  },

  approveBorrow(id: number): Promise<BorrowListItem> {
    return request<{ borrow: BorrowListItem }>(`/borrows/${id}/approve`, { method: "POST" }).then(
      (r) => r.borrow,
    );
  },

  rejectBorrow(id: number, reason: string): Promise<BorrowListItem> {
    return request<{ borrow: BorrowListItem }>(`/borrows/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }).then((r) => r.borrow);
  },

  incidents(params?: { status?: IncidentStatus; type?: IncidentType }): Promise<Incident[]> {
    return request<{ incidents: Incident[] }>(
      `/incidents${buildQuery({ status: params?.status, type: params?.type })}`,
    ).then((r) => r.incidents);
  },

  createIncident(body: { hn: string; type: IncidentType; description: string }): Promise<Incident> {
    return request<{ incident: Incident }>("/incidents", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.incident);
  },

  resolveIncident(id: number, body: { note: string; restoreRecord: boolean }): Promise<Incident> {
    return request<{ incident: Incident }>(`/incidents/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.incident);
  },

  reportBlob(params: { from?: string; to?: string; status?: string }): Promise<Blob> {
    return requestBlob(`/reports/borrows${buildQuery(params)}`);
  },

  labelBlob(hn: string, type: "barcode" | "qrcode"): Promise<Blob> {
    return requestBlob(`/labels${buildQuery({ hn, type })}`);
  },
};

/** ช่วยดาวน์โหลด blob เป็นไฟล์ในเบราว์เซอร์ */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
