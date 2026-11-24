import { internalToken, required } from "@vayro/service-kit";

export const config = {
  databaseUrl: required("DATABASE_URL"), authServiceUrl: required("AUTH_SERVICE_URL"), internalToken: internalToken(),
  userServiceUrl: required("USER_SERVICE_URL"), vehicleServiceUrl: required("VEHICLE_SERVICE_URL"), companyServiceUrl: required("COMPANY_SERVICE_URL"),
  alertServiceUrl: process.env.ALERT_SERVICE_URL || null,
};
