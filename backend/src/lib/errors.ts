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
  recordUnusable: (label: string) =>
    new AppError(409, "RECORD_UNUSABLE", `แฟ้มนี้มีสถานะ "${label}" จึงยืมไม่ได้ กรุณาติดต่อหน่วยงานเวชระเบียน`),
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

  // ---- อนุมัติการยืม (FR-03) ----
  notPendingApproval: () =>
    new AppError(409, "NOT_PENDING_APPROVAL", "รายการนี้ไม่ได้อยู่ระหว่างรออนุมัติ"),
  notApproved: () =>
    new AppError(409, "NOT_APPROVED", "รายการนี้ยังไม่ได้รับอนุมัติ จึงยังจ่ายแฟ้มไม่ได้"),
  approverWrongDepartment: () =>
    new AppError(403, "APPROVER_WRONG_DEPARTMENT", "อนุมัติได้เฉพาะคำขอของหน่วยงานตนเองเท่านั้น"),

  // ---- แฟ้มชำรุด/สูญหาย (FR-05) ----
  incidentNotFound: () => new AppError(404, "INCIDENT_NOT_FOUND", "ไม่พบเหตุการณ์นี้"),
  incidentAlreadyResolved: () =>
    new AppError(409, "INCIDENT_ALREADY_RESOLVED", "เหตุการณ์นี้ปิดเรื่องไปแล้ว"),

  // ---- จัดการผู้ใช้งาน (FR-11) ----
  usernameTaken: () => new AppError(409, "USERNAME_TAKEN", "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว"),
  departmentNotFound: () => new AppError(404, "DEPARTMENT_NOT_FOUND", "ไม่พบหน่วยงานที่ระบุ"),
  cannotDeleteSelf: () => new AppError(400, "CANNOT_DELETE_SELF", "ไม่สามารถปิดใช้งานบัญชีของตนเองได้"),
  userHasActiveBorrows: () =>
    new AppError(409, "USER_HAS_ACTIVE_BORROWS", "ผู้ใช้นี้ยังมีแฟ้มค้างคืน กรุณาให้คืนแฟ้มก่อน"),
} as const;
