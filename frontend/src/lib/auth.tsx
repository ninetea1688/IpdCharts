import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type JSX,
} from "react";
import type { User, Role } from "./api";
import { ApiError } from "./api";

const AUTH_KEY = "ipdcharts_auth";

interface StoredAuth {
  token: string;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed.token && parsed.user) return parsed;
    return null;
  } catch {
    return null;
  }
}

function setStoredAuth(token: string, user: User): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, user }));
}

function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function getCurrentToken(): string | null {
  return getStoredAuth()?.token ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setToken(stored.token);
      setUser(stored.user);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new ApiError(
        body?.error?.message ?? "เข้าสู่ระบบไม่สำเร็จ",
        "LOGIN_FAILED",
        res.status,
      );
    }

    const data = (await res.json()) as { token: string; user: User };
    setToken(data.token);
    setUser(data.user);
    setStoredAuth(data.token, data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearStoredAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function hasRole(userRole: Role | null | undefined, requiredRoles: Role[]): boolean {
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}
