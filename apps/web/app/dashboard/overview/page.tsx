import DashboardWindow from "../_components/dashboard-window";
import CompanyOverview from "./company-overview";

export const metadata = { title: "ภาพรวม | VAYRO" };

export default function OverviewPage() {
  return <DashboardWindow title="ภาพรวมการขนส่ง"><CompanyOverview /></DashboardWindow>;
}
