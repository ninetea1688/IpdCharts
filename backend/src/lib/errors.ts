/** Error แบบมี HTTP status + code — message เป็นภาษาไทยสำหรับแสดงให้ผู้ใช้ */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  validation: (message = "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง") =>
    new AppError(400, "VALIDATION_ERROR", message),
  recordNotFound: (hn?: string) =>
    new AppError(404, "RECORD_NOT_FOUND", hn ? `ไม่พบแฟ้มเวชระเบียน HN ${hn}` : "ไม่พบแฟ้มเวชระเบียน"),
  recordNotAvailable: () => new AppError(409, "RECORD_NOT_AVAILABLE", "แฟ้มนี้ถูกยืมอยู่แล้ว ไม่สามารถยืมซ้ำได้"),
  borrowNotFound: () => new AppError(404, "BORROW_NOT_FOUND", "ไม่พบรายการยืมนี้"),
  alreadyReturned: () => new AppError(409, "ALREADY_RETURNED", "แฟ้มนี้คืนไปแล้ว"),
  wrongReturner: () => new AppError(400, "WRONG_RETURNER", "ไม่สามารถคืนได้ — ผู้คืนไม่ตรงกับผู้ยืม"),
  borrowerNotFound: () => new AppError(404, "BORROWER_NOT_FOUND", "ไม่พบผู้ยืมในระบบ"),
  borrowerNoDepartment: () => new AppError(400, "BORROWER_NO_DEPARTMENT", "ผู้ยืมไม่มีหน่วยงาน — กรุณาติดต่อเจ้าหน้าที่เวชระเบียน"),
  invalidDueDate: () => new AppError(400, "INVALID_DUE_DATE", "กำหนดคืนต้องเป็นวันที่ในอนาคต"),
  userNotFound: () => new AppError(404, "USER_NOT_FOUND", "ไม่พบผู้ใช้งานในระบบ"),
  invalidCredentials: () => new AppError(401, "INVALID_CREDENTIALS", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"),
  unauthorized: () => new AppError(401, "UNAUTHORIZED", "กรุณาเข้าสู่ระบบก่อนใช้งาน"),
  forbidden: () => new AppError(403, "FORBIDDEN", "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้"),
} as const;
