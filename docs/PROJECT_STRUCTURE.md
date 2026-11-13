# VAYRO Fleet Tracking: Project and System Structure

Backend branch note: web prototype details in this local inventory are reference only. Frontend prototype changes are excluded from the Backend commit; the committed web is the original scaffold.

เอกสารนี้อธิบายทั้งโครงสร้างที่มีอยู่จริงใน repository และโครงสร้างเป้าหมายสำหรับพัฒนาต่อ แยกสองส่วนนี้ไว้ชัดเจนเพื่อไม่ให้เข้าใจว่าโฟลเดอร์หรือฟีเจอร์ที่ยังไม่ได้สร้างมีอยู่แล้ว

## 1. ภาพรวมโครงการ

แพลตฟอร์ม B2B สำหรับติดตามรถของหลายบริษัท รับตำแหน่งจาก GPS ของผู้ให้บริการหรือจากโทรศัพท์พนักงานขับรถ จัดเก็บประวัติ แสดงรถและงานขนส่งบน Dashboard แจ้งเหตุการณ์ และจัดทำรายงาน

ข้อกำหนดจากเอกสารโครงงานประกอบด้วยการแยกข้อมูลตามบริษัท บทบาท Platform Admin, Company Admin, Dispatcher และ Driver การจัดการรถ/ผู้ขับ/งาน การตรวจสอบคุณภาพข้อมูล GPS การติดตามปัจจุบันและย้อนหลัง การแจ้งเตือน รายงาน และ API สำหรับระบบภายนอก

บริบทเพิ่มเติมจากเจ้าของโครงการ: ทำ GPS demo โดยรับ Location จากโทรศัพท์ ส่งผ่าน Server และต้องการนำเสนอ UI ในรูปแบบ 3D

## 2. เทคโนโลยีที่กำหนด

| ส่วน | เทคโนโลยี | หน้าที่ |
| --- | --- | --- |
| Web dashboard | Next.js + TypeScript | หน้าบริหารแพลตฟอร์มและบริษัท, ตารางรถ/งาน, รายงาน และมุมมองติดตาม |
| Backend/API | Elysia + Bun | ยืนยันตัวตนและสิทธิ์, API ของผลิตภัณฑ์, รับข้อมูลตำแหน่ง และประสานงานกับข้อมูล |
| Database | PostgreSQL | จัดเก็บข้อมูลบริษัท รถ งาน ตำแหน่ง ประวัติ แจ้งเตือน และกิจกรรม |
| Data API | PostgREST | เปิด endpoint สำหรับข้อมูล PostgreSQL ให้ backend ใช้ตามความเหมาะสม; ไม่ใช่ตัวฐานข้อมูล |
| 3D UI | Three.js | แสดงฉาก/รถ/เส้นทางใน dashboard โดยอิงข้อมูลพิกัดและสถานะจริงที่มี |
| Container | Docker / Docker Compose | เตรียมสภาพแวดล้อมสำหรับรันบริการและฐานข้อมูลร่วมกัน |
| Driver GPS demo | Android APK | ส่งตำแหน่งโทรศัพท์ผ่าน Elysia API ตามการยืนยันตัวตนและช่วงเวลางาน |

**ยังไม่กำหนด:** framework ที่ใช้สร้าง APK, ผู้ให้บริการแผนที่/tiles, รูปแบบ protocol ของ GPS ภายนอก และค่าความถี่ส่งตำแหน่งจริง ให้เลือกเมื่อมี requirement หรือแหล่งข้อมูลพร้อม

## 3. โครงสร้างปัจจุบันใน repository

รายการด้านล่างสะท้อนสิ่งที่พบใน repository ตอนจัดทำเอกสารนี้เท่านั้น

```text
.
├── apps/
│   └── web/                         # มี: Next.js app scaffold
│       ├── app/                     # มี: login, register, dashboard, users, session/refresh, actions.ts
│       ├── lib/, components/        # มี: session/api helper (server-only), UI พื้นฐาน
│       ├── public/                  # มี: assets เริ่มต้นของ Next.js
│       ├── AGENTS.md                # มี: กฎเฉพาะ Next.js (ให้คง generated block ไว้)
│       ├── next.config.ts
│       └── package.json
├── gateway/
│   ├── src/index.ts                 # Gateway routes auth to auth-service, users to user-service
│   ├── package.json
│   └── README.md
├── services/
│   ├── user-service/                # User API: separate process, host port 3003
│   └── auth-service/                # Authentication and existing company registration module
│       ├── src/                     # index, config, db, security, http, guard, audit, routes/*
│       ├── package.json
│       └── README.md
├── packages/
│   └── shared-types/                # มี: package TypeScript เริ่มต้น
│       ├── index.ts
│       └── package.json
├── AGENTS.md                        # คู่มือสำหรับ Codex ที่ root
├── infra/database/001_auth.sql      # มี: ตาราง company, users, auth_sessions, system_log
├── docs/PROJECT_STRUCTURE.md        # เอกสารโครงสร้างนี้
├── docs/AUTH.md                     # มี: สัญญา API และกฎของ auth
├── package.json                     # Bun workspaces และสคริปต์ dev บางส่วน
├── Dockerfile                       # มี: build targets สำหรับ web และ APIs
├── compose.yaml                     # มี: web, gateway, auth-service, user-service และ health checks
├── .dockerignore                    # กัน dependencies, build output และ secrets ออกจาก image
├── .env.example                     # ตัวอย่างพอร์ตสำหรับ local Docker
└── bun.lock
```

### สถานะจริงที่ควรรู้

- Root ใช้ Bun workspaces ครอบ `apps/*`, `gateway`, `services/*`, `packages/*`.
- หน้าเว็บมี login/สมัครบริษัท/แดชบอร์ดบัญชี/จัดการผู้ใช้ (ยังไม่มีหน้า tracking); auth-service และ gateway มีระบบ auth ฝั่งบริษัทแล้ว (ทดสอบ flow ผ่าน Docker แล้ว ดู docs/AUTH.md); business logic ของระบบติดตามยังไม่ได้เริ่ม
- มี Dockerfile และ Compose สำหรับรัน web, gateway, auth-service และ user-service พร้อม health checks; ดูวิธีรันใน root README.md
- มี PostgreSQL ใน Compose (auth-service ต่อผ่าน `Bun.sql` ตรง); ยังไม่พบ `vehicle-service`, `tracking-service`, `notification-service`, แอป Android/APK, PostgREST หรือ Three.js
- สคริปต์ root มี `dev:vehicle`, `dev:tracking`, `dev:notification` ซึ่งชี้ไปยัง service folders ที่ยังไม่มี ควรสร้าง service ที่เกี่ยวข้องก่อนใช้สคริปต์นั้น
- มี `AGENTS.md` ใน `apps/web`; ให้ปฏิบัติตามกฎนั้นควบคู่กับ root `AGENTS.md` เมื่อแก้หน้าเว็บ โดยเฉพาะข้อให้อ่านเอกสาร Next.js ที่ติดตั้งอยู่ก่อนเปลี่ยน API

## 4. โครงสร้างเป้าหมายที่แนะนำ

นี่คือแนวทางการจัดวางโค้ดเมื่อเริ่มเพิ่มความสามารถ ไม่ใช่รายการไฟล์ที่มีอยู่แล้ว และสามารถปรับให้เข้ากับ implementation จริงได้

```text
.
├── apps/
│   ├── web/                         # Next.js: Admin, Dispatcher, dashboard 3D
│   └── driver-android/              # เป้าหมาย: แอป Driver และ APK demo (ยังไม่เลือก framework)
├── gateway/                         # Elysia: API entry, auth, validation, routing
├── services/
│   ├── auth-service/                # บัญชี, session/token, role และ membership
│   ├── vehicle-service/             # บริษัท, รถ, ประเภทรถ และการมอบหมายผู้ขับ
│   ├── tracking-service/            # ingest GPS, normalize, validate, history, freshness
│   ├── transport-service/           # งานขนส่ง, จุดรับ/ส่ง, สถานะงาน
│   ├── notification-service/        # กฎแจ้งเตือนและสถานะการจัดการ
│   └── reporting-service/           # รายงาน/aggregation เมื่อมีความจำเป็น
├── packages/
│   └── shared-types/                # DTO/API contracts และชนิดข้อมูลร่วม
├── infra/
│   ├── docker/                      # Dockerfiles/config เฉพาะบริการเมื่อจำเป็น
│   └── database/                    # migrations, schema และ seed สำหรับ local demo
├── docs/
│   ├── PROJECT_STRUCTURE.md
│   └── api/                         # สัญญา API เมื่อเริ่มกำหนด endpoint
├── docker-compose.yml               # เป้าหมาย: รัน stack สำหรับ dev/demo
└── .env.example                     # ตัวอย่างชื่อตัวแปรเท่านั้น ไม่มี secret จริง
```

เริ่มจากโมดูล/บริการที่จำเป็นต่อ vertical slice แรก อย่าสร้าง microservice แยกทุกโดเมนล่วงหน้าโดยไม่มีเหตุผลด้านการ deploy หรือการ scale รองรับ ชื่อในโครงสร้างนี้เป็นขอบเขตเชิงตรรกะที่แนะนำ; อาจคง deployment รวมกันได้

## 5. การไหลของข้อมูล

```text
Android APK (demo) ─┐
                    ├─> Elysia API / Gateway ─> ตรวจตัวตนและสิทธิ์
GPS provider ───────┘                           │
                                                ├─> PostgreSQL (ผ่าน backend/PostgREST ตามขอบเขต)
                                                └─> ส่งข้อมูลที่อนุญาตให้ Web dashboard
                                                      ├─> รายการรถและสถานะข้อมูล
                                                      ├─> เส้นทางย้อนหลัง/รายงาน
                                                      └─> Three.js 3D presentation
```

หลักการสำคัญ:

1. Web และ APK ส่ง request ไป backend เท่านั้น; ห้ามฝัง database credential หรือเรียกฐานข้อมูลโดยตรงจาก client
2. Backend ตรวจสิทธิ์และ company/workspace scope ทุกครั้งก่อนอ่านหรือเขียนข้อมูล
3. Adapter ของแต่ละแหล่ง GPS แปลงข้อมูลเข้าแบบข้อมูลกลางเดียวกัน
4. เก็บ `sourceTimestamp` (เวลาที่อุปกรณ์วัดตำแหน่ง) และ `receivedAt` (เวลาที่ server ได้รับ) แยกกัน เพื่อวัดความล่าช้าและทำเครื่องหมายข้อมูลเก่า
5. Three.js แสดงข้อมูลที่ API ส่งให้ ไม่เป็นผู้คำนวณหรือยืนยันความถูกต้องของ GPS เอง

## 6. โดเมนข้อมูลหลัก

| กลุ่ม | ข้อมูลสำคัญ | ข้อสังเกต |
| --- | --- | --- |
| Company / Workspace | รหัส, ชื่อ, สถานะ | ทุกข้อมูลธุรกิจต้องอยู่ใต้ tenant ที่ระบุชัด |
| User / Membership | ผู้ใช้, บริษัท, role, account status | ผู้ใช้อาจมีสิทธิ์ตาม membership; ตรวจสิทธิ์ฝั่ง server |
| Vehicle | รหัสรถ, ทะเบียน, ประเภท, สถานะ, บริษัท | ไม่เชื่อมกับ Driver ถาวรหากมีการมอบหมายเป็นรายงาน |
| GPS Source / Device | รหัสอุปกรณ์/แหล่ง, provider, สถานะการเชื่อมต่อ | รองรับทั้งอุปกรณ์จริงและโทรศัพท์ demo ผ่าน adapter |
| GPS Position | รถ/แหล่ง, latitude, longitude, speed, heading, sourceTimestamp, receivedAt | ค่า sensor ที่ไม่มีแหล่งรองรับต้องเป็น unknown/null ไม่สร้างเป็นค่าจริง |
| Transport Job | งาน, จุดรับ/ส่ง, รถ/Driver ที่มอบหมาย, สถานะ | เก็บวงจรเริ่มงาน/จบงานและเหตุขัดข้อง |
| Route History | รถ, ช่วงเวลา, GPS points | สร้างจากตำแหน่งที่เก็บ; คำนึงถึงการกรองข้อมูลผิดปกติ |
| Alert | ประเภท, รายละเอียด, เวลา, สถานะจัดการ, บริษัท/รถที่เกี่ยวข้อง | สร้างเฉพาะจากเงื่อนไขที่ระบบรองรับและเปิดใช้ |
| API Client | บริษัท, credential reference, scope, status, usage history | เก็บ secret แบบปลอดภัย; แสดง secret เต็มเฉพาะตอนสร้างถ้าจำเป็น |
| Audit Event | ผู้กระทำ, action, เวลา, ผลลัพธ์ | บันทึกการเปลี่ยนแปลงสำคัญโดยไม่ใส่ token/secret |

ชื่อข้างต้นเป็นแนวคิดโดเมน ไม่ใช่ข้อกำหนดชื่อ table หรือ schema จนกว่าจะออกแบบ migration จริง

## 7. ขอบเขตตามบทบาท

- **Platform Admin:** อนุมัติ/จัดการบริษัทและ Workspace, ดูสถานะการเชื่อมต่อระดับแพลตฟอร์ม, บริหารบัญชีกลาง, dashboard ภาพรวม และ audit
- **Company Admin:** จัดการผู้ใช้/สิทธิ์ รถ GPS/API connection การมอบหมายงาน และ dashboard/รายงานของบริษัทตัวเอง
- **Dispatcher:** ติดตามตำแหน่ง/สถานะ/คุณภาพข้อมูล GPS ดูเส้นทางและงาน ประสาน Driver และจัดการเหตุการณ์ตามสิทธิ์
- **Driver:** ดูงานของตน เริ่ม/จบงาน ส่งตำแหน่งจากมือถือ แจ้งสถานะหรือปัญหา และดูประวัติงานที่อนุญาต
- **External API Client:** client credential ที่มี scope และผูกกับบริษัท ไม่ใช่บทบาทหน้าจอของผู้ใช้

## 8. ข้อจำกัดของ demo และข้อมูลรถ

- โทรศัพท์เป็นแหล่งข้อมูล GPS สำหรับ demo เท่านั้น; ให้เก็บ `sourceType` ชัดเจนเพื่อแยกจาก GPS hardware/vendor
- ความถี่และความแม่นยำขึ้นกับการอนุญาต Location, OS, แบตเตอรี่, เครือข่าย และพฤติกรรมแอป โทรศัพท์อาจหยุดส่งเมื่ออยู่เบื้องหลังหรือ offline
- “เรียลไทม์” หมายถึงข้อมูลล่าสุดที่ได้รับตามรอบส่งและเครือข่าย ไม่รับประกันการอัปเดตต่อเนื่อง
- การระบุความเร็วเกินกำหนดทำได้เมื่อมีข้อมูลความเร็ว/กฎที่กำหนด; การวิเคราะห์พฤติกรรมต้องมีข้อมูลและเกณฑ์ที่รองรับ
- สภาพเครื่องยนต์/ชิ้นส่วนต้องอาศัย sensor, OBD หรือ provider ที่รองรับ พิกัด GPS ไม่พอสำหรับสรุปสุขภาพรถ
- หากไม่มีแผนที่/route provider ที่เลือกไว้ ให้แสดงฉาก 3D demo ที่ติดป้ายชัดเจน ไม่กล่าวอ้างว่าเป็นถนนหรือระยะทางที่แม่นยำ

## 9. ลำดับทำงานที่เข้ากับแผนโครงงาน

1. **พื้นฐาน:** กำหนด schema/migrations, company/workspace, auth/roles, รถ/Driver, GPS provider contract และ endpoint รับตำแหน่ง demo
2. **ปฏิบัติงาน:** หน้า tracking และ route history, Driver APK/demo, งานขนส่ง/assignment, alert, report และตรวจคุณภาพข้อมูล
3. **ขยายระบบ:** geofence, analytics/driver behavior ที่มีข้อมูลรองรับ, API สำหรับลูกค้าองค์กร, dashboard/report เชิงลึก และ hardening ด้านประสิทธิภาพ/ความปลอดภัย

ลำดับนี้อิงแผนใน brief แต่ผู้ใช้สามารถจัดลำดับใหม่ได้ หากเริ่มงานเฉพาะ feature ให้ทำ end-to-end slice ที่เล็กที่สุดและรักษา tenant isolation ตั้งแต่ต้น

## 10. แนวทางให้ Codex ทำงานต่อ

- เริ่มอ่าน root `AGENTS.md`, เอกสารนี้ และ `AGENTS.md` ของโฟลเดอร์ที่จะแก้
- สำรวจไฟล์จริงและ scripts ก่อนแก้; อย่าสมมติว่า target structure มีอยู่แล้ว
- สำหรับงาน UI ให้อ่าน `apps/web/AGENTS.md` และคู่มือ Next.js ใน dependency ที่ติดตั้งอยู่ก่อนแก้ API/framework behavior
- ระบุข้อมูลว่าเป็น live, delayed, unavailable หรือ demo ให้ชัดใน API และ UI
- รักษาการแยกข้อมูลบริษัทที่ API boundary; อย่าส่ง GPS ของบริษัทหนึ่งให้ผู้ใช้อีกบริษัท
- ไม่เพิ่มการเชื่อมต่อผู้ให้บริการ, การเปิดเผยข้อมูล, หรือการใช้ location เกินที่ผู้ใช้อนุญาต
- อัปเดตเอกสารนี้เมื่อมีการสร้าง/ย้าย service หรือเมื่อ target architecture ถูกตัดสินใจจริง

## 11. แหล่งอ้างอิงและหมายเหตุ

เอกสารนี้สรุปจากเอกสารโครงงาน GPS ที่ผู้ใช้แนบ และข้อกำหนดเพิ่มเติมของเจ้าของโครงการเรื่อง Next.js/TypeScript, Elysia, PostgreSQL/PostgREST, Bun, Three.js, Docker และ Android APK สำหรับ demo

Markdown ต้นฉบับมีข้อความบาง bullet ที่แสดงอักขระผิด encoding (mojibake) จึงไม่ถอดความบรรทัดที่อ่านไม่ได้เป็น requirement ใหม่; ให้ยึดหัวข้อและเนื้อหาที่อ่านได้ รวมถึงข้อจำกัดที่ระบุชัดในเอกสาร หากต้องตีความ bullet ที่เสียหาย ให้ตรวจต้นฉบับที่อ่านได้หรือถามเจ้าของโครงการก่อน
