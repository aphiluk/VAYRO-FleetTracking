// Auth API contracts (/api/v1/auth, /api/v1/users, /api/v1/companies/register).
// Ids are strings: Postgres BIGINT values are not safe as JSON numbers.

export type Role = "platform_admin" | "company_admin" | "dispatcher" | "driver";
export type AccountStatus = "active" | "inactive" | "suspended";
export type WorkspaceStatus = "pending" | "active" | "suspended" | "rejected";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  request_id: string;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: { field: string; message: string }[] };
  request_id: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface User {
  user_id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  role: Role;
  phone: string | null;
  account_status: AccountStatus;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  /** Access token lifetime in seconds. */
  expires_in: number;
}

export type LoginResponse = TokenPair & { user: User };

export interface RefreshRequest {
  refresh_token: string;
}

export interface RegisterCompanyRequest {
  company_name: string;
  /** Data Dictionary: company.contact_name VARCHAR(100). */
  contact_name?: string;
  contact_email: string;
  contact_phone?: string;
  admin_full_name: string;
  admin_email: string;
  /** 10-128 characters. */
  admin_password: string;
}

export interface CreateUserRequest {
  full_name: string;
  email: string;
  /** 10-128 characters. */
  password: string;
  role: Role;
  /** Platform Admin selects a company; company admins may only use their own company. */
  company_id?: string | null;
  phone?: string | null;
}

export interface UpdateUserRequest {
  full_name: string;
  email?: string;
  phone?: string | null;
}

export interface ChangeUserRoleRequest {
  role: Role;
  /** Required when assigning a company role to an existing Platform Admin. */
  company_id?: string | null;
}

export interface ChangeUserStatusRequest {
  account_status: AccountStatus;
}

// GPS contract follows the PDF dictionary; BIGINT ids are JSON strings everywhere.
export type GpsSourceType = "gps_device" | "provider_api" | "driver_mobile_app";
export type GpsConnectionStatus = "connected" | "disconnected" | "error";
export interface GpsDevice {
  gps_device_id: string;
  company_id: string;
  vehicle_id: string;
  device_code: string;
  source_type: GpsSourceType;
  provider_name: string | null;
  connection_config: Record<string, unknown> | null;
  connection_status: GpsConnectionStatus;
  last_received_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface CreateGpsDeviceRequest {
  company_id?: string;
  vehicle_id: string;
  device_code: string;
  source_type: GpsSourceType;
  provider_name?: string | null;
  connection_config?: Record<string, unknown> | null;
}
export type UpdateGpsDeviceRequest = Partial<Omit<CreateGpsDeviceRequest, "company_id">>;
export interface IngestGpsRequest {
  device_code: string;
  external_record_id?: string | null;
  latitude: number;
  longitude: number;
  speed_kmh?: number | null;
  direction_degree?: number | null;
  accuracy_meters?: number | null;
  recorded_at: string;
}
export interface GpsLocation {
  gps_location_id: string;
  company_id: string;
  vehicle_id: string;
  gps_device_id: string | null;
  external_record_id: string | null;
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  direction_degree: number | null;
  accuracy_meters: number | null;
  recorded_at: string;
  received_at: string;
  freshness: "current" | "delayed";
}
