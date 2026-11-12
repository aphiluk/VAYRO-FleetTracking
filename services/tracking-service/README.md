# Tracking Service

Elysia API สำหรับตั้งค่าอุปกรณ์ GPS และรับ/เรียกดูข้อมูลตำแหน่ง GPS ตัวอย่างนี้
ออกแบบให้ทดลองผ่าน Postman ก่อน โดยเก็บข้อมูลอุปกรณ์และตำแหน่ง GPS ไว้ในหน่วยความจำ
ข้อมูลจะหายเมื่อเริ่ม service ใหม่ ขณะนี้ยังไม่มีการบันทึกลง PostgreSQL
การตรวจสอบ foreign key ของบริษัทหรือรถ และการเชื่อมต่อกับผู้ให้บริการ GPS จริง

## เริ่มใช้งานในเครื่อง

เปิด PowerShell ที่ root ของ repository ตั้งค่า credential แยกสำหรับ admin และ
GPS device แล้วเริ่ม service:

```powershell
$env:TRACKING_API_TOKENS='{"replace-with-admin-token-1234567890":{"role":"company_admin","companyId":1},"replace-with-device-token-1234567890":{"role":"gps_device","companyId":1,"deviceIdentifier":"device-demo-001"}}'
$env:PORT=3003
bun run dev:tracking
```

```cmd
set "TRACKING_API_TOKENS={"admin-demo-token-change-this-123456":{"role":"company_admin","companyId":1},"device-demo-token-change-this-123456":{"role":"gps_device","companyId":1,"deviceIdentifier":"device-demo-001"}}"
set "PORT=3003"
bun run dev:tracking
```

แทนที่ token ตัวอย่างทั้งสองด้วยค่าลับที่มีความยาวอย่างน้อย 24 ตัวอักษร
ห้าม commit หรือบันทึก token จริงลง log ค่า `TRACKING_API_TOKENS` เป็น JSON object
ที่ใช้ token เป็น key โดยรองรับ role ดังนี้:

- `platform_admin`: อ่านข้อมูลได้ทุกบริษัท และต้องระบุ `company_id` เมื่อสร้างอุปกรณ์
- `company_admin`: จัดการอุปกรณ์ได้เฉพาะบริษัทที่กำหนดไว้ใน token
- `dispatcher`: อ่านข้อมูลอุปกรณ์และประวัติตำแหน่งได้เฉพาะบริษัทที่กำหนดไว้ใน token
- `gps_device`: ส่งตำแหน่งได้เฉพาะ `companyId` และ `deviceIdentifier` ที่กำหนดไว้ใน token
  ต้องลงทะเบียนอุปกรณ์ด้วยบริษัทและรหัสอุปกรณ์ที่ตรงกัน พร้อมกำหนดรถก่อนส่งข้อมูล

หากไม่ได้กำหนด token จะเรียก API routes ไม่ได้ (401) แต่ยังเรียก `/` เพื่อตรวจสอบสถานะ
service ในเครื่องได้

## การทดลองผ่าน Postman

นำเข้าตั้ง `baseUrl` เป็น `http://localhost:3003` แล้วกำหนด `adminToken` และ `deviceToken` ค่า `deviceCode`
และ `companyId` แบบตัวเลขต้องตรงกับ credential ของ GPS device และอุปกรณ์ที่ลงทะเบียนไว้
ให้สร้างอุปกรณ์ GPS ก่อนส่งข้อมูลตำแหน่ง โดย collection จะสร้าง `external_record_id`
ที่ไม่ซ้ำและกำหนด `recorded_at` เป็นเวลาปัจจุบันในแต่ละ request

response เมื่อสำเร็จใช้รูปแบบ `{ "data": ... }` ส่วน error ใช้รูปแบบ
`{ "error": { "code": "...", "message": "..." } }`.

| Method | Endpoint | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/v1/gps-devices` | แสดงรายการอุปกรณ์ในขอบเขตที่มีสิทธิ์ |
| GET | `/api/v1/gps-devices/:id` | อ่านข้อมูลอุปกรณ์ |
| POST | `/api/v1/gps-devices` | ลงทะเบียนอุปกรณ์ |
| PUT | `/api/v1/gps-devices/:id` | แก้ไขการตั้งค่าอุปกรณ์ |
| DELETE | `/api/v1/gps-devices/:id` | ลบอุปกรณ์ |
| GET | `/api/v1/gps-devices/:id/status` | อ่านสถานะการเชื่อมต่อและเวลาที่ได้รับข้อมูลล่าสุด |
| POST | `/api/v1/gps/ingest` | รับข้อมูลตำแหน่ง GPS หนึ่งรายการ |
| GET | `/api/v1/gps/vehicles/:vehicleId/locations` | อ่านประวัติตำแหน่ง (`from`, `to`, `limit` เป็นตัวเลือก) |
| GET | `/api/v1/gps/vehicles/:vehicleId/latest` | อ่านตำแหน่งล่าสุดโดยอ้างอิงเวลาจากอุปกรณ์ |

## พจนานุกรมข้อมูลอุปกรณ์ GPS

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
