# Tracking Service (integrated demo)

Combines the GPS Device and GPS Data module supplied in PR #1 with Authentication/User. Human requests use a real Login JWT; static admin/user tokens are rejected at startup. Device ingestion still uses a separate scoped credential from TRACKING_API_TOKENS. Device credentials must reference an existing active company.

Run from the repository root:

```sh
docker compose up --build -d --wait postgres auth-service user-service tracking-service gateway
docker compose exec -T tracking-service bun test
```

Gateway: http://localhost:3001/api/v1/gps-devices and /api/v1/gps/...
Direct local service: http://localhost:3004 (TRACKING_PORT); User Service stays on 3003.

Use POST /api/v1/auth/login and Authorization: Bearer <access_token> for human calls. Platform Admin/Company Admin manage GPS devices, Dispatcher reads, and Driver currently has no GPS device management access. Role/account/workspace/session checks reuse Authentication, so logout and suspension apply immediately.

For device ingestion, set TRACKING_API_TOKENS locally to a JSON object mapping an unpredictable token of at least 24 characters to {"role":"gps_device","companyId":<existing company number>,"deviceIdentifier":"<registered device_code>"}. No example credential is enabled in Git. Restart/recreate Tracking after changing its configured credentials. Never commit real device tokens. Each device credential can ingest only its own registered device code and company, and cannot list/manage devices. Configuration is checked at startup and the active company is checked on requests.

Responses use the common success/data/message/request_id envelope and error codes. The JSON GPS payload fields below are kept compatible with the submitted demo; they are not yet normalized to the complete Data Dictionary contract.

## Remaining GPS work before a production/spec-complete merge

- Devices, positions and duplicate detection are still in process memory: restarting Tracking loses them. PostgreSQL is currently used only to validate Authentication and company status.
- Vehicle foreign keys and vehicle/company ownership are not checked because this demo has no vehicle database/service integration. Only company identity/workspace is checked.
- No real provider connection, encrypted provider credential storage, persistent migration or Driver mobile assignment flow is implemented.
- GPS IDs still use safe JavaScript integers, unlike Auth/User BIGINT strings. Companies outside the safe integer range are rejected rather than rounded. Endpoint/payload names retain the submitted prototype's names and may need reconciliation with the PDF before GPS is complete.
- Deleting a device does not yet enforce persistent history/reference protection. Data capacity is not bounded beyond per-query limits.

These are explicit limitations of the incoming GPS demo. This branch makes the services interoperable for local testing; it does not claim the GPS modules are complete or production ready.

## Device dictionary and existing GPS behavior

| Field | Type | ยอมรับค่า null | ค่าเริ่มต้น / การทำงาน |
| --- | --- | --- | --- |
| `gps_device_id` | BIGINT (ตัวอย่างใช้ safe integer) | NO | เพิ่มค่าอัตโนมัติภายใน process ของ service และเริ่มนับใหม่เมื่อ restart |
| `company_id` | BIGINT | NO | Company Admin ใช้ค่าจาก token ส่วน Platform Admin ต้องส่งค่านี้มา |
| `vehicle_id` | BIGINT | NO | จำเป็นต้องระบุ; ยังตรวจสอบ foreign key หรือความสัมพันธ์กับบริษัทไม่ได้หากไม่มี vehicle service/database |
| `device_code` | VARCHAR(100) | NO | ต้องไม่ซ้ำเมื่อใช้ร่วมกับ `company_id` แต่ซ้ำกันได้ระหว่างคนละบริษัท |
| `source_type` | ENUM | NO | `gps_device`, `provider_api` หรือ `driver_mobile_app` |
| `provider_name` | VARCHAR(120) | YES | ค่าเริ่มต้นเป็น `null` |
| `connection_config` | JSON object | YES | ค่าเริ่มต้นเป็น `null`; ห้ามใส่ credential ใน field นี้ |
| `credentials_encrypted` | TEXT | YES | เป็น `null` เสมอในตัวอย่างนี้; API ปฏิเสธ field ที่ใช้ส่ง credential |
| `connection_status` | ENUM | NO | เริ่มต้นเป็น `disconnected`; เมื่อรับข้อมูลสำเร็จจะเป็น `connected`; หากไม่มีข้อมูลใหม่ภายในห้านาที สถานะที่อ่านได้จะเป็น `disconnected` |
| `last_received_at` | ISO timestamp | YES | เป็น `null` จนกว่าจะรับข้อมูลสำเร็จ จากนั้นใช้เวลาที่ server ได้รับข้อมูล |
| `created_at` | ISO timestamp | NO | กำหนดโดย service |
| `updated_at` | ISO timestamp | NO | กำหนดโดย service เมื่อสร้าง แก้ไข หรือรับข้อมูล |

การทำงานแบบ in-memory จำลองข้อกำหนด `UNIQUE(company_id, device_code)` ได้
แต่ไม่สามารถบังคับใช้ BIGINT foreign key จริงของ `company.company_id` /
`vehicles.vehicle_id` หรือตรวจสอบว่ารถอยู่ในบริษัทดังกล่าวได้ เมื่อมี persistence
และข้อมูลรถแล้ว ควรย้ายการตรวจสอบเหล่านี้ไปไว้ที่ database/service boundary
ระบบไม่รับหรือบันทึก credential; หากจะรองรับใน production ต้องมี encryption key
ที่ backend จัดการ และจัดเก็บข้อมูลแบบ encrypted-at-rest

### body สำหรับส่งข้อมูล GPS

```json
{
  "device_code": "device-demo-001",
  "external_record_id": "provider-point-123",
  "recorded_at": "2026-11-11T10:00:00.000Z",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "speed_kph": 35,
  "heading": 120,
  "accuracy_m": 8
}
```

request สำหรับ ingest ไม่รับ `company_id` และ `vehicle_id` โดย server จะตรวจสอบ
GPS-device token และดึงค่าทั้งสองจากอุปกรณ์ที่ลงทะเบียนไว้ หากระบุ
`external_record_id` ค่านั้นต้องไม่ซ้ำภายในอุปกรณ์เดียวกัน; รายการซ้ำจะได้ response
`409` ระบบตรวจสอบช่วงค่าของพิกัดและค่า speed/heading/accuracy ที่เป็นตัวเลือก
timestamp ที่อยู่ในอนาคตเกิน 30 วินาทีจะถูกปฏิเสธ ระบบเก็บเวลา `recorded_at`
จากอุปกรณ์และ `received_at` จาก server แยกจากกัน จุดที่เก่ากว่าห้านาทีจะระบุ
`freshness: "delayed"` แทนการแสดงว่าเป็นข้อมูลปัจจุบัน ประวัติเรียงจากเก่าไปใหม่
และส่งกลับได้ไม่เกิน 500 รายการ (ค่าเริ่มต้น 100 รายการ) ส่วน latest เลือกค่า
`recorded_at` ที่ใหม่ที่สุด ดังนั้นข้อมูลที่ส่งมาล่าช้าจะไม่แทนที่ตำแหน่งจากอุปกรณ์
ที่มี timestamp ใหม่กว่า

ระบบไม่รับหรือส่งคืน provider credentials ขณะนี้ service ยังไม่เชื่อมต่อกับ provider
และไม่ยืนยันว่าอุปกรณ์มีการเชื่อมต่อกับ provider อยู่จริง

## การทดสอบ

```powershell
cd services\tracking-service
bun test
```
