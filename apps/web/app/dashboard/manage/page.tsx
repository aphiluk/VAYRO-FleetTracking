import DashboardWindow from "../_components/dashboard-window";
import AddVehicleForm from "./add-vehicle-form";
import ManageSections from "./manage-sections";

export const metadata = { title: "Manage | VAYRO" };

export default function ManagePage() {
  return (
    <DashboardWindow title="Manage" size="large">
      <ManageSections>
        <AddVehicleForm />
      </ManageSections>
    </DashboardWindow>
  );
}
