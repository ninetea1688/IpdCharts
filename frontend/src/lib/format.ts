const BANGKOK = "Asia/Bangkok";

/** แปลงเวลา UTC → เวลาประเทศไทย (พุทธศักราชตาม locale th-TH) */
export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK,
    dateStyle: "medium",
  }).format(new Date(iso));
}

/** ค่าเริ่มต้นของ input datetime-local = ตอนนี้ + 3 วัน (กำหนดคืน) */
export function defaultDueDateValue(): string {
  const d = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
