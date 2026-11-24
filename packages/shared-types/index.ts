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

/** Signed-in identity enriched by Auth with its own workspace's display name. */
export interface AuthenticatedUser extends User {
  company_name: string | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  /** Access token lifetime in seconds. */
  expires_in: number;
}

export type LoginResponse = TokenPair & { user: AuthenticatedUser };

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
  /** Provider credentials are stored encrypted and never returned; this only says whether any are set. */
  has_credentials: boolean;
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
  /** Write-only secrets for a provider; null removes them. Never put secrets in connection_config. */
  credentials?: Record<string, unknown> | null;
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
  /** Empty for a normal point. null_island = (0, 0); impossible_speed = over 250 km/h from the stored point before it. */
  anomalies: ("null_island" | "impossible_speed")[];
}
export interface GpsGap {
  from: string;
  to: string;
  minutes: number;
}

export type FleetGpsPoint = Pick<GpsLocation,
  "vehicle_id" | "latitude" | "longitude" | "speed_kmh" | "direction_degree" |
  "recorded_at" | "received_at" | "freshness" | "anomalies"
>;

export interface FleetGpsSnapshot {
  company_id: string;
  points: FleetGpsPoint[];
}

// Navigation preview uses road-provider data. Coordinates in GeoJSON are [longitude, latitude].
export interface NavigationPoint {
  latitude: number;
  longitude: number;
}

export interface NavigationPlace extends NavigationPoint {
  id: string;
  label: string;
}

export interface NavigationRouteRequest {
  origin: NavigationPoint;
  destination: NavigationPoint;
}

export interface NavigationRoute {
  provider: "valhalla";
  profile: "auto";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distance_meters: number;
  duration_seconds: number;
  steps: {
    instruction: string;
    distance_meters: number;
    duration_seconds: number;
    begin_shape_index: number;
    end_shape_index: number;
  }[];
}

export type VehicleStatus = "active" | "inactive" | "maintenance";

export interface VehicleRecord {
  vehicle_id: string;
  company_id: string;
  vehicle_code: string;
  license_plate: string;
  vehicle_type_id: string | null;
  current_driver_id: string | null;
  vehicle_status: VehicleStatus;
  created_at: string;
  updated_at: string;
}

export interface VehicleTypeRecord {
  vehicle_type_id: string;
  company_id: string;
  type_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateVehicleRequest {
  /** Platform Admin selects the workspace. Company Admin is scoped to their own workspace. */
  company_id?: string;
  vehicle_code: string;
  license_plate: string;
  vehicle_type_id?: string | null;
  current_driver_id?: string | null;
  vehicle_status?: VehicleStatus;
}

export type UpdateVehicleRequest = Partial<Omit<CreateVehicleRequest, "company_id">>;

export interface CreateVehicleTypeRequest {
  company_id?: string;
  type_name: string;
  description?: string | null;
  is_active?: boolean;
}

export type UpdateVehicleTypeRequest = Partial<Omit<CreateVehicleTypeRequest, "company_id">>;

export type TransportJobStatus = "pending" | "assigned" | "accepted" | "in_progress" | "completed" | "cancelled" | "problem";

export interface TransportJobRecord {
  job_id: string;
  company_id: string;
  job_code: string;
  job_name: string | null;
  pickup_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  delivery_address: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  accepted_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  job_status: TransportJobStatus;
  problem_note: string | null;
  cargo_description: string | null;
  route_snapshot: NavigationRoute | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  vehicle: { vehicle_id: string; vehicle_code: string; license_plate: string; vehicle_type_name: string | null } | null;
  driver: { user_id: string; full_name: string; email: string } | null;
}

export interface CreateTransportJobRequest {
  company_id?: string;
  job_code: string;
  job_name?: string | null;
  pickup_address: string;
  delivery_address: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  cargo_description?: string | null;
  route_snapshot?: NavigationRoute | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  vehicle_id?: string | null;
  driver_id?: string | null;
}

export type UpdateTransportJobRequest = Partial<Omit<CreateTransportJobRequest, "company_id">>;
export interface AssignTransportJobRequest { vehicle_id: string | null; driver_id: string | null }
export interface TransportJobProblemRequest { problem_note: string }

export interface EmployeeDashboardCounts {
  company_id: string;
  total: number;
  by_role: Record<Exclude<Role, "platform_admin">, number>;
  by_status: Record<AccountStatus, number>;
}

export interface VehicleDashboardCounts {
  company_id: string;
  total: number;
  by_status: Record<VehicleStatus, number>;
  by_type: { vehicle_type_id: string | null; type_name: string | null; count: number }[];
}

export interface JobDashboardCounts {
  company_id: string;
  total: number;
  by_status: Record<TransportJobStatus, number>;
}

/** Counts are collected from each owning service; this is not a cross-database transaction. */
export interface CompanyDashboardSummary {
  company_id: string;
  generated_at: string;
  employees: EmployeeDashboardCounts;
  vehicles: VehicleDashboardCounts;
  jobs: JobDashboardCounts;
}
