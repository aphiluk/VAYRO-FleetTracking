import { ApiError, internalClient } from "@vayro/service-kit";
import { config } from "../config/env";

export interface DriverInfo {
  user_id: string;
  company_id: string | null;
  role: string;
  account_status: string;
}

export interface Directories {
  findUser(id: string): Promise<DriverInfo | null>;
  companyExists(id: string): Promise<boolean>;
}

export function httpDirectories(): Directories {
  const users = internalClient(config.userServiceUrl, config.internalToken);
  const companies = internalClient(config.companyServiceUrl, config.internalToken);
  return {
    async findUser(id) {
      const { status, body } = await users("GET", `/internal/users/${id}`);
      if (status === 404) return null;
      if (status !== 200 || !body?.data) throw new ApiError(502, "UPSTREAM_ERROR", "User service returned an unexpected response");
      return body.data;
    },
    async companyExists(id) {
      const { status } = await companies("GET", `/internal/companies/${id}`);
      if (status === 404) return false;
      if (status !== 200) throw new ApiError(502, "UPSTREAM_ERROR", "Company service returned an unexpected response");
      return true;
    },
  };
}
