import type { Metadata } from "next";
import CustomerAuthForm from "../customer-auth-form";

export const metadata: Metadata = { title: "ขอเปิด Workspace | VAYRO" };

export default function RegisterPage() {
  return <CustomerAuthForm mode="register" />;
}
