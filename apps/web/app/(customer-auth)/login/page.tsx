import type { Metadata } from "next";
import CustomerAuthForm from "../customer-auth-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบพนักงาน | VAYRO" };

export default function LoginPage() {
  return <CustomerAuthForm mode="login" />;
}
