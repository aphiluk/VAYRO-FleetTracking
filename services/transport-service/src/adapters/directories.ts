import { ApiError, internalClient } from "@vayro/service-kit";
import { config } from "../config/env";

export interface DriverInfo { user_id: string; company_id: string | null; role: string; account_status: string; full_name: string; email: string }
export interface VehicleInfo { vehicle_id: string; company_id: string; vehicle_status: string; vehicle_code: string; license_plate: string; vehicle_type_name: string | null }
export interface Directories {
  findUser(id: string): Promise<DriverInfo | null>;
  findVehicle(id: string, companyId: string): Promise<VehicleInfo | null>;
  companyExists(id: string): Promise<boolean>;
}
export function httpDirectories(): Directories {
  const users = internalClient(config.userServiceUrl, config.internalToken);
  const vehicles = internalClient(config.vehicleServiceUrl, config.internalToken);
  const companies = internalClient(config.companyServiceUrl, config.internalToken);
  async function lookup(client: ReturnType<typeof internalClient>, path: string) {
    const { status, body } = await client("GET", path);
    if (status === 404) return null;
    if (status !== 200 || !body?.data) throw new ApiError(502, "UPSTREAM_ERROR", "Directory service returned an unexpected response");
    return body.data;
  }
  return {
    findUser: (id) => lookup(users, `/internal/users/${id}`),
    findVehicle: (id, companyId) => lookup(vehicles, `/internal/vehicles/${id}?company_id=${companyId}`),
    companyExists: async (id) => (await lookup(companies, `/internal/companies/${id}`)) !== null,
  };
}
