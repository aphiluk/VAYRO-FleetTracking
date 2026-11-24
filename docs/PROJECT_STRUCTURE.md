# โครงสร้าง VAYRO Fleet Tracking

VAYRO เป็นแพลตฟอร์มติดตามรถสำหรับหลายบริษัท แต่ละ Workspace จัดการรถ คนขับ งานขนส่ง และแหล่ง GPS ของตนเอง เว็บให้บริการผู้ดูแลและ Dispatcher ส่วนคนขับมีเว็บต้นแบบสำหรับรับและดำเนินงาน แอป Android สำหรับส่งตำแหน่งจริงยังอยู่ในแผนและยังไม่ได้เลือกเฟรมเวิร์ก

โครงสร้างนี้อิงขอบเขตงานจากเอกสารโครงงานและหลักการใน `deep-research-report.md` ได้แก่ แบ่งตามความสามารถทางธุรกิจ ให้บริการเจ้าของข้อมูลควบคุมการอ่านเขียน และเปิดให้เรียกเฉพาะ API ที่พร้อมใช้ โครงการใช้ Bun workspaces, Next.js App Router, Elysia บน Bun และ PostgreSQL ผ่าน Prisma ส่วน MapLibre แสดงแผนที่ถนนและ Three.js ใช้แสดงเดโม 3D โค้ดปัจจุบันเข้าฐานข้อมูลผ่าน Prisma ในบริการเจ้าของข้อมูล หากเพิ่ม PostgREST ให้ใช้อยู่หลัง API ภายในขอบเขตของเจ้าของข้อมูล

## 1. เส้นทางคำขอ

```text
Browser ──> Next.js UI / BFF ──> Elysia Gateway ──> Elysia domain services
Android (ตามแผน) / GPS client ──> Elysia Gateway ──┘          │
                                                             ├──> ฐานข้อมูล PostgreSQL ของบริการ
                                                             └──> /internal/* ของบริการเจ้าของข้อมูล
```

- **Next.js BFF** แสดงหน้าเว็บ จัดการ session cookie แบบ HttpOnly และส่ง bearer token ไป Gateway จากฝั่งเซิร์ฟเวอร์ ตัวอย่างเส้นทางคือ `/api/fleet/*`, `/api/transport/*`, `/api/navigation/*` และ `/api/dashboard/company` ตั้ง `COOKIE_SECURE=true` เมื่อให้บริการด้วย HTTPS
- **พิกัดบน Dashboard** ใช้ `/api/fleet/gps/latest` → Gateway → `GET /api/v1/gps/fleet/latest` ใน GPS Data สำหรับ Company Admin และ Dispatcher โหลดเป็นชุดตามทะเบียนใน Workspace ทุก 5 วินาทีขณะแท็บเปิด แสดงเวลาที่บันทึกและเวลาที่ได้รับ โดยแยกพิกัดเก่ากับพิกัดผิดปกติ ดู [วิธีทดสอบด้วย Android APK](APK_GPS_TEST.md)
- **Manage → แหล่ง GPS** ให้ Company Admin ลงทะเบียนและแก้ไขแหล่งพิกัดของรถ คัดลอก `device_code` และเปิดหรือปิดการรับพิกัดผ่าน `/api/fleet/gps-devices` → Gateway → GPS Device Service แสดงสถานะและเวลาที่รับล่าสุด ตรวจรายการใหม่ทุก 15 วินาทีขณะเปิดเมนู การปิดรับพิกัดเก็บทะเบียนและประวัติเดิมไว้
- **Gateway** ใช้รายการ prefix ใน [gateway/src/app.ts](../gateway/src/app.ts) ส่งคำขอสาธารณะตามขอบเขต API `/api/v1` โดยไม่ส่งต่อ `/internal/*` กำหนดเวลาให้ upstream 12 วินาทีตั้งแต่ส่งคำขอจนอ่าน response ครบ ให้ `504 UPSTREAM_TIMEOUT` เมื่อหมดเวลา และ `502 UPSTREAM_UNAVAILABLE` เมื่อการเชื่อมต่อล้มเหลวหรือ upstream ส่ง redirect Gateway ไม่ส่งคำขอซ้ำ คำขอเขียนที่หมดเวลาอาจบันทึกไปแล้ว ผู้เรียกควรตรวจสถานะก่อนส่งใหม่
- **บริการเจ้าของโดเมน** ตรวจ schema, บทบาท สิทธิ์ต่อทรัพยากร และ Workspace ก่อนใช้ข้อมูล Auth ตรวจ token, session และสถานะบัญชี/บริษัทล่าสุด เส้นทางภายในใช้ `INTERNAL_API_TOKEN` และระบุขอบเขตบริษัทตามสัญญาของ endpoint `packages/service-kit` ให้ตัวช่วย HTTP และ client ภายในซึ่งมี timeout เริ่มต้น 3 วินาที
- **ไคลเอนต์อุปกรณ์** ใช้ credential ของอุปกรณ์เพื่อส่ง GPS ผ่าน Gateway ส่วน Driver ใช้ตัวตนของบัญชีและต้องมีงานที่กำลังทำอยู่ตรงกับรถที่ได้รับมอบหมาย ทั้งเว็บและอุปกรณ์ใช้ API โดยไม่มีสิทธิ์เชื่อมฐานข้อมูล

## 2. ขอบเขตธุรกิจและเจ้าของข้อมูล

Compose ชุดหลักรันบริการที่มี API พร้อม Web, Gateway และ PostgreSQL ส่วน Vehicle Tracking เปิดด้วยโปรไฟล์ `scaffold`

| ขอบเขต | บริการ | ฐานข้อมูลและข้อมูลหลัก | ความสามารถปัจจุบัน |
| --- | --- | --- | --- |
| ตัวตนและ Workspace | `auth-service` | `auth_db` · `auth_sessions` | Login, refresh, logout, me และ internal introspection |
| ตัวตนและ Workspace | `company-service` | `company_db` · `company` | สมัคร Workspace สถานะ pending และอ่านสถานะภายใน การอนุมัติผ่าน API ยังอยู่ในแผน |
| ตัวตนและ Workspace | `user-service` | `user_db` · `users` | จัดการบัญชี โปรไฟล์ บทบาท และสถานะ |
| ทะเบียนรถและแหล่ง GPS | `vehicle-service` | `vehicle_db` · `vehicles`, `vehicle_types` | จัดการรถ ประเภท สถานะ และคนขับประจำรถ |
| ทะเบียนรถและแหล่ง GPS | `gps-device-service` | `gps_device_db` · `gps_devices` | จัดการและปิดการเชื่อมต่ออุปกรณ์ เก็บ credential ผู้ให้บริการแบบเข้ารหัสเมื่อมีคีย์ |
| ตำแหน่งและประวัติ | `gps-data-service` | `gps_data_db` · `gps_locations` | รับตำแหน่ง อ่านจุดล่าสุด และอ่านประวัติรายรถ |
| งานขนส่ง | `transport-service` | `transport_db` · `transport_jobs` | จัดการและมอบหมายงาน บันทึกเส้นทางที่เลือก และเปลี่ยนสถานะตามสิทธิ์ |
| งานขนส่ง | `navigation-service` | ไม่มี | ค้นหาจุดด้วย Photon และคำนวณเส้นทางรถยนต์ด้วย Valhalla |
| ภาพรวม | `reporting-service` | ไม่มี | Dashboard ของ Platform และบริษัท รายงาน CSV และ `GET /api/v1/dashboard/company/summary` สำหรับยอดรวมที่เว็บใช้ |
| ตำแหน่งและประวัติ | `tracking-service`, `route-history-service` | ไม่มี | Route History อ่านจุดและสรุปเส้นทางจาก GPS Data ส่วน Vehicle Tracking ยังเป็นโครง |
| การแจ้งเตือน | `alert-service` | `alert_db` · `alert_rules`, `geofences`, `alerts` | API จัดการกฎ พื้นที่ และเหตุการณ์ พร้อมประมวลผลตำแหน่ง GPS |
| การเชื่อมต่อภายนอก | `integration-service` | `integration_db` · `api_integrations`, `api_request_logs`, `system_log` | API จัดการคีย์และดู log ส่วนการบังคับใช้คีย์ผ่าน Gateway อยู่ระหว่างพัฒนา |

PostgreSQL ชุดพัฒนาใช้เซิร์ฟเวอร์เดียวและแยก database กับ login role ตามเจ้าของข้อมูล บริการเรียก API ของเจ้าของข้อมูลเมื่อต้องใช้ข้อมูลข้ามโดเมน โดยเก็บ ID อ้างอิงข้ามบริการเป็นค่า BIGINT และไม่สร้าง foreign key ข้ามฐานข้อมูล บริการที่บันทึก audit เก็บ `system_log` ในฐานข้อมูลของตัวเองตามรูปแบบที่ใช้ในบริการนั้น Compose ใช้รหัสผ่านแยกตามบริการ ดู [การจัดการฐานข้อมูลและ migrations](DATABASE.md) และ [สัญญาข้อมูล API](API_DATA_CONTRACT.md) สำหรับชื่อฟิลด์ BIGINT string และเวลา UTC ISO 8601

## 3. โฟลเดอร์และวิธีรัน

```text
apps/web/                  Next.js UI, Route Handlers และ server-side clients
  app/api/                 BFF สำหรับ Dashboard, Fleet, Transport และ Navigation
  app/dashboard/           แผนที่ ภาพรวม ทะเบียนรถ คนขับ งาน และ Manage
  app/driver/              เว็บสำหรับ Driver
  lib/                     การเรียก Gateway และจัดการ session ฝั่งเว็บ
gateway/src/
  app.ts                   ประกอบ Elysia app และกำหนดเส้นทางสาธารณะ
  index.ts                 เริ่ม HTTP server
gateway/test/              ทดสอบการส่งต่อคำขอและพฤติกรรมเมื่อ upstream ล้มเหลว
services/*-service/        หน่วย deploy ของ backend ใน workspace เดียวกัน
packages/shared-types/     DTO และชนิดข้อมูลที่แชร์ข้ามขอบเขต
packages/service-kit/       ตัวช่วย HTTP, internal client, auth, ID และ audit
infra/database/
  init/                    สร้างฐานข้อมูลและ role เมื่อเริ่มจาก volume ใหม่
  split-legacy.sh          ย้ายข้อมูลจากฐานข้อมูลรวมรุ่นเก่า
  legacy/                  SQL เดิมสำหรับอ้างอิง
compose.yaml               ชุดพัฒนาและโปรไฟล์ scaffold
compose.debug.yaml         override สำหรับพอร์ตทดสอบบน localhost
Dockerfile                 เป้าหมาย build สำหรับ API และ Web
```

บริการส่วนใหญ่ประกอบปลั๊กอินใน `src/app.ts` และเริ่ม server ใน `src/index.ts` ภายในโดเมนให้ route แปลงและตรวจ HTTP input ให้ service/use case รับผิดชอบกติกากับการทำธุรกรรม ให้ repository เข้าถึง Prisma และให้ adapter ครอบการเรียกบริการอื่นหรือผู้ให้บริการภายนอก ยึดรูปแบบเดิมของแต่ละบริการ เช่น GPS Data ใช้ `routes/`, `application/`, `domain/` และ `infrastructure/`; Transport ใช้ `modules/jobs/` บริการที่มีฐานข้อมูลเก็บ migration ของตนใน `prisma/migrations/` และสร้าง Prisma client ลง `src/generated/` ตอน build หรือ `bun run db:generate`

Compose เปิด Web ที่ `127.0.0.1:3000` และ Gateway ที่ `127.0.0.1:3001` สำหรับการรันแบบปกติ บริการภายในและฐานข้อมูลเข้าถึงผ่านเครือข่าย Compose เปิดโปรไฟล์ `scaffold` เมื่อพัฒนาโครง Vehicle Tracking ส่วน direct-service E2E ใช้ override `compose.debug.yaml` health check HTTP `/` ตรวจว่า process ตอบได้ บริการฐานข้อมูลจะรัน Prisma migration ก่อนเริ่ม server และ readiness ที่ตรวจ dependency แยกจาก liveness เป็นงานสำหรับการ deploy จริง ดู [คำสั่งรันใน README](../README.md)

## 4. การไหลของงานสำคัญ

**หน้าแนะนำ VAYRO** · `/` เปิดได้ก่อนเข้าสู่ระบบ แนะนำการติดตามรถ การจัดงาน และวิธีเปิด Workspace พร้อมลิงก์ไป `/login` และ `/register` หลังเข้าสู่ระบบ ผู้ใช้เข้า Dashboard หรือหน้า Driver ตามบทบาทของบัญชี

**สมัครและเข้าระบบ** · Company สร้าง Workspace pending แล้วเรียก User เพื่อสร้าง Company Admin คนแรก หากขั้นหลังล้มเหลว Company พยายามลบ Workspace ชดเชย เวลาตอบกลับหมดหลัง User บันทึกสำเร็จหรือ process หยุดกลางทางอาจทิ้งสถานะไม่ครบ การอนุมัติ Workspace ยังต้องใช้ขั้นตอนสำหรับผู้ดูแลในการทดสอบ Login ตรวจ User และสถานะ Workspace ก่อนสร้าง session

**จัดรถและดำเนินงาน** · Company Admin จัดการรถ ประเภท คนขับประจำรถ และสร้างหรือมอบหมายงาน Transport ตรวจรถและ Driver กับบริการเจ้าของข้อมูล ก่อนบันทึกการเปลี่ยนสถานะและ audit ใน transaction ฝั่งคนขับจำกัดรายการงานตามบัญชีและ Workspace สถานะหลักคือ `pending → assigned → accepted → in_progress → completed` งานที่รับแล้วหรือกำลังทำรายงานปัญหาและกลับมาทำต่อได้ และผู้มีสิทธิ์ยกเลิกงานที่ยังไม่จบ Transport ป้องกันรถหรือ Driver มีงานที่รับแล้วหรือกำลังทำซ้อนกัน การค้นหาและคำนวณถนนใช้ Navigation และเก็บผลที่เลือกเป็น snapshot ใน Transport

**ตำแหน่ง GPS** · GPS Data ตรวจตัวตนและอ้างอิงอุปกรณ์ รถ และงานจากบริการเจ้าของข้อมูล จากนั้นเก็บ `recorded_at` กับ `received_at` แยกกัน รองรับตรวจข้อมูลซ้ำต่ออุปกรณ์ด้วย `external_record_id` ทำเครื่องหมายความผิดปกติและช่องว่างในประวัติ เส้นทางย้อนหลังต้องมาจากจุดที่เก็บจริง พร้อมระบุข้อมูลล่าช้าหรือไม่มีสัญญาณในหน้าติดตามที่จะพัฒนา การส่งเหตุการณ์ที่ตั้งผ่าน `GPS_EVENT_SUBSCRIBERS` เป็น HTTP แบบ best-effort และยังไม่มีตัวรับใน repository

**Dashboard** · เว็บโหลดทะเบียนรถ คนขับประจำรถ งาน และปัญหางานของบริษัทผ่าน BFF ภาพรวม Company Admin เรียก Reporting ให้ขอยอดพนักงาน รถ และงานจากเจ้าของข้อมูลพร้อมกัน นับครบโดยไม่อิง pagination ของรายการ หากโหลดล้มเหลว UI แสดงข้อผิดพลาดและบอกเมื่อใช้ข้อมูลชุดล่าสุดที่เคยโหลดได้ แผงแจ้งเตือนจริงแสดงปัญหางานจาก Transport ส่วนรายชื่อคนขับเต็มหน้า คำเชิญพนักงาน และ TestRole ยังมีส่วนที่ใช้เพื่อทดลอง UI

## 5. บทบาทและสถานะข้อมูล

**แชตแจ้งเตือนรถ (ต้นแบบ)** · Dispatch และ Company Admin เปิดแชตจากรายละเอียดรถหรือเมนูแจ้งเตือนใน Bottom Bar ได้ รายการแยกรถใน Workspace กับรถจำลอง ผู้รับอ้างอิงคนขับจากงานปัจจุบันหรือคนขับประจำรถ ฝั่ง Driver มีเมนูข้อความ จำนวนข้อความใหม่ และช่องตอบกลับ ทั้งสองหน้าทดลองโต้ตอบกันได้เมื่อเปิดพร้อมกันในโปรไฟล์เบราว์เซอร์และ origin เดียวกัน โดยจับคู่ตาม Workspace และบัญชีคนขับผ่าน BroadcastChannel ข้อความจะหายเมื่อรีเฟรช ส่วนโหมดสลับบทบาทของ Dispatch และข้อความตัวอย่างของ Driver ทดสอบแยกได้ในแต่ละหน้า

- **Platform Admin** ดูแล Workspace และบัญชีระดับแพลตฟอร์มตามสิทธิ์ของ endpoint หน้าอนุมัติบริษัทและหน้าบริหารแพลตฟอร์มยังอยู่ในแผน
- **Company Admin** จัดการบัญชี รถ แหล่ง GPS และงานภายในบริษัท และดูภาพรวมบริษัท
- **Dispatcher** ดูรถและงานของบริษัท API ของ Transport รองรับการจัดการงานตามสิทธิ์ ส่วนหน้า Manage ปัจจุบันเปิดให้ Company Admin
- **Driver** ดูและเปลี่ยนสถานะงานของตัวเอง เบื้องต้นใช้เว็บ `/driver` ซึ่งแสดงเส้นทางถนนและให้ผู้ขับเลือกขั้นตอนหรือยืนยันจบงานเอง API รับ GPS จาก Driver ได้เมื่อรถและงานผ่านเงื่อนไข แอปที่ส่งพิกัดอัตโนมัติยังอยู่ในแผน
- **External API Client** เป็น credential แบบมี scope และผูก Workspace ตามแผน Integration แยกจาก bearer token ของบัญชีและ credential ปัจจุบันของอุปกรณ์ GPS

แผนที่จริงแสดงทะเบียนรถโดยไม่มีพิกัดจำลอง ส่วนรถและเส้นทาง 3D อยู่ในโหมดเดโม เส้นทางที่ Navigation คำนวณเป็นการประมาณสำหรับรถยนต์และยังไม่มีข้อจำกัดเฉพาะรถบรรทุก เมื่อเพิ่มการส่งตำแหน่งจากมือถือ ให้ขอสิทธิ์เท่าที่ใช้และส่งเฉพาะช่วงงานที่ได้รับมอบหมายและกำลังทำอยู่ ความถี่ขึ้นกับสิทธิ์ สัญญาณ ระบบปฏิบัติการ และแบตเตอรี่ การแจ้งเตือนต้องอิงข้อมูลที่มีและกฎที่ตั้งไว้ สภาพเครื่องยนต์และพฤติกรรมการขับต้องอาศัยอุปกรณ์หรือข้อมูลที่รองรับและแสดงว่าไม่พร้อมใช้เมื่อข้อมูลขาด

## 6. ขอบเขตงานพัฒนาต่อ

1. **GPS จากมือถือถึงแผนที่จริง** · ทดสอบ Driver ที่มีงานกำลังทำให้ส่งจุดผ่าน Gateway แล้วอ่านกลับจาก GPS Data แสดงเวลาของจุดและสถานะความสดบน Dashboard ใช้จุดชุดเดียวกันทำประวัติรายรถ พัฒนา API ภาพรวมกองรถและการสรุปประวัติเป็น read model แล้วตัดสินใจแยก deployment เมื่อมีเหตุผลเรื่องโหลดหรือการออกเวอร์ชัน
2. **แจ้งเตือนและรายงาน** · ใช้จุดที่บันทึกแล้วกับกฎและ geofence ของบริษัท หากผู้บริโภคต้องได้รับเหตุการณ์ครบ ให้บันทึกเหตุการณ์ใน transactional outbox ของเจ้าของข้อมูลและให้ผู้บริโภคจัดการ event ซ้ำได้ จัดทำ API สำหรับรายงานและ integration ตาม scope ที่อนุญาต
3. **ความทนทานของงานข้ามบริการและการ deploy** · ออกแบบ registration ให้มีสถานะที่ตรวจสอบ/กู้ต่อได้และทำ idempotency ก่อน retry การเขียน เพิ่มการจำกัดคำขอ health/readiness, logs/metrics/traces ที่ไม่บันทึก secrets หรือพิกัดละเอียดเกินจำเป็น และตรวจ API contract กับ migration ใน CI ก่อนปล่อย image ตามเวอร์ชัน แยก secrets ต่อบริการและเตรียม HTTPS ที่ Gateway/เว็บเมื่อจะให้เครื่องจริงเข้าถึง

อ่าน [สถานะ API และกติกาการเชื่อมบริการ](INTEGRATION.md), [Auth](AUTH.md) และ README ของบริการก่อนเพิ่ม endpoint สำหรับการพัฒนาใน repository ให้ทำตาม [AGENTS.md](../AGENTS.md) และอัปเดตเอกสารนี้เมื่อเปลี่ยนขอบเขตบริการ เส้นทาง API หรือชุด deploy
