/** ประเภทข้อมูลจาก backend `/api/v1/*` — ต้องตรงกับ shape จริง (ดู backend/src/routes) */

export type Role = "ADMIN" | "BORROWER" | "HEAD";

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  department: string | null;
}

export type RecordStatus = "AVAILABLE" | "BORROWED";

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

export interface RecordDetail {
  id: number;
  hn: string;
  patientName: string;
  status: RecordStatus;
  activeBorrow: ActiveBorrowInfo | null;
  history: HistoryItem[];
}

export type BorrowStatus = "ACTIVE" | "RETURNED" | "OVERDUE";

export interface BorrowListItem {
  id: number;
  hn: string;
  patientName: string;
  borrower: string;
  department: string;
  reason: string;
  dueDate: string;
  status: BorrowStatus;
  statusLabel: string;
  returnedAt: string | null;
}

export interface Stats {
  totalRecords: number;
  available: number;
  borrowed: number;
  overdue: number;
  returnedToday: number;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      headers: init?.body != null ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้", "NETWORK_ERROR", 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      body?.error?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่",
      body?.error?.code ?? "UNKNOWN",
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  stats(): Promise<Stats> {
    return request<{ stats: Stats }>("/stats").then((r) => r.stats);
  },

  users(): Promise<User[]> {
    return request<{ users: User[] }>("/users").then((r) => r.users);
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
  }): Promise<BorrowListItem> {
    return request<{ borrow: BorrowListItem }>("/borrows", {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.borrow);
  },

  returnBorrow(id: number, returnedById: number): Promise<BorrowListItem> {
    return request<{ borrow: BorrowListItem }>(`/borrows/${id}/return`, {
      method: "POST",
      body: JSON.stringify({ returnedById }),
    }).then((r) => r.borrow);
  },
};
