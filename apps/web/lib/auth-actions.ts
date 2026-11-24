"use server";

import { redirect } from "next/navigation";
import { createEmployeeSession, destroySession, registerCompany } from "./auth-gateway";

type RegistrationState = { ok: true; companyName: string } | { ok: false; message: string } | null;

export async function registerWorkspace(_previous: RegistrationState, formData: FormData): Promise<RegistrationState> {
  const companyField = formData.get("company");
  const nameField = formData.get("contact");
  const emailField = formData.get("email");
  const password = formData.get("password");
  const company = typeof companyField === "string" ? companyField.trim() : "";
  const name = typeof nameField === "string" ? nameField.trim() : "";
  const email = typeof emailField === "string" ? emailField.trim().toLowerCase() : "";

  if (!company || company.length > 150 || !name || name.length > 100 ||
      email.length > 150 || !/^[^\s@]+@[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 10 || password.length > 128) {
    return { ok: false, message: "กรุณาตรวจสอบชื่อบริษัท ชื่อผู้ดูแล อีเมล และรหัสผ่านอย่างน้อย 10 อักขระ" };
  }

  const result = await registerCompany({
    company_name: company,
    contact_name: name,
    contact_email: email,
    admin_full_name: name,
    admin_email: email,
    admin_password: password,
  });
  if (result.ok) return { ok: true, companyName: company };
  if (result.code === "CONFLICT") {
    return { ok: false, message: "อีเมลนี้มีบัญชีหรือคำขอเปิด Workspace อยู่แล้ว หากเพิ่งส่งคำขอ โปรดรอการอนุมัติ" };
  }
  if (result.code === "VALIDATION_ERROR") {
    return { ok: false, message: "ข้อมูลในฟอร์มไม่ถูกต้อง กรุณาตรวจสอบแล้วส่งอีกครั้ง" };
  }
  return { ok: false, message: "ยังยืนยันผลการส่งคำขอไม่ได้ กรุณาลองอีกครั้งในภายหลัง" };
}

export async function login(_previousMessage: string, formData: FormData): Promise<string> {
  const emailField = formData.get("email");
  const password = formData.get("password");
  const email = typeof emailField === "string" ? emailField.trim().toLowerCase() : "";

  if (email.length > 150 || !/^[^\s@]+@[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length === 0 || password.length > 128) {
    return "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง";
  }

  const result = await createEmployeeSession({ email, password });
  if (result.ok) redirect(result.destination);

  switch (result.code) {
    case "INVALID_CREDENTIALS":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "ACCOUNT_INACTIVE":
      return "บัญชีนี้ยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแล";
    case "WORKSPACE_NOT_ACTIVE":
      return "Workspace ของบริษัทยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแล";
    case "EMPLOYEE_ACCOUNT_REQUIRED":
      return "หน้านี้สำหรับบัญชีพนักงานบริษัท กรุณาติดต่อทีม VAYRO เพื่อเข้าพื้นที่ผู้ดูแลแพลตฟอร์ม";
    case "VALIDATION_ERROR":
      return "กรุณาตรวจสอบอีเมลและรหัสผ่าน";
    default:
      return "เชื่อมต่อระบบเข้าสู่ระบบไม่ได้ กรุณาลองใหม่อีกครั้ง";
  }
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
