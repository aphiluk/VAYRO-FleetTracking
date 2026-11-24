import { AdminPage, FleetDirectory } from "../_components/admin-directory";

export const metadata = { title: "คนขับ | VAYRO" };

export default function DriversPage() {
  return (
    <AdminPage title="คนขับ" description="รายชื่อคนขับและรถที่รับผิดชอบในข้อมูลจำลอง">
      <FleetDirectory byDriver />
    </AdminPage>
  );
}
