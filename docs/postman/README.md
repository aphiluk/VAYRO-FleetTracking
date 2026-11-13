# ทดสอบ Backend ด้วย Postman

ฐานข้อมูล local ปัจจุบันมีครบ 14 ตารางตาม Data Dictionary แล้ว สำหรับฐานเดิมให้รัน migrations 002 และ 003 ตาม ../DATABASE.md ก่อนใช้ GPS ส่วน API ของ Vehicle/Job/Alert และโมดูลอื่นยังไม่ได้ทำในงานนี้

1. รัน `docker compose up --build -d --wait postgres auth-service user-service gateway` จาก root (ไม่ต้องรันเว็บ)
2. Import `VAYRO.postman_collection.json` และ `local.postman_environment.json` ใน Postman
3. เลือก environment `VAYRO Local (fill credentials locally)`
4. ใส่ `login_email`, `login_password` ของ Company Admin ทดสอบที่บัญชีและ Workspace เป็น active และตั้ง `new_user_password` เป็นรหัสทดสอบ 10-128 ตัวอักษร
5. กด Send ตามหมายเลข 01-15 หรือใช้ Collection Runner; Login/Refresh จะเก็บ token ลง environment ให้อัตโนมัติ

ใช้ฐานข้อมูล local และบัญชีทดสอบเท่านั้น: ชุดนี้แก้ชื่อบัญชีที่ Login, สร้างพนักงานใหม่, เปลี่ยน role และระงับพนักงานทดสอบ โดยไม่ลบข้อมูลหลังรัน
การสมัครบริษัทและอนุมัติ Workspace เป็น Company Service จึงไม่รวมใน collection นี้; สำหรับ local สามารถสร้างข้อมูลทดสอบและตรวจระบบเดิมด้วย `node services/auth-service/test/e2e.mjs` หรือตั้งบัญชีผ่านผู้ดูแลฐานข้อมูล

`user_id` ใช้เฉพาะพนักงานที่สร้างในขั้น 09; หากขั้นนั้นล้มเหลวให้แก้สาเหตุก่อนเรียกขั้น 10-13 อย่าแทนด้วยบัญชีจริง
Token ที่แก้ไขในขั้น 04 เป็น negative test: ผลที่ถูกต้องคือ HTTP 401 เพราะลายเซ็นไม่ถูกต้อง ไม่ใช่การออก token ปลอมให้ใช้งาน
หลัง Logout ขั้น 15 ต้องได้ 401 เช่นกัน ส่วน Company Admin จัดการคนต่างบริษัทต้องได้ 404; Driver/Dispatcher จัดการผู้ใช้อื่นต้องได้ 403 (ตรวจใน E2E เพิ่มเติม)

ห้าม export/share environment ที่กรอก password หรือ token แล้ว ตรวจและล้างค่าก่อนนำไฟล์ขึ้น Git; ไฟล์ตัวอย่างใน repo ไม่มี secret จริง
User API รองรับ Platform Admin และ Company Admin แล้ว ดูสัญญา API และคำสั่งตั้ง Platform Admin คนแรกใน ../USER.md


## Platform Admin

Import VAYRO.Platform.postman_collection.json พร้อม environment เดิม ตั้ง platform_email, platform_password, company_id ของ Workspace ที่มีอยู่ และ new_user_password แล้วรันชุดนี้แยกจากชุด Company Admin ระบบจะใช้ platform_access_token / platform_refresh_token / platform_user_id แยกกัน

ชุดนี้มี 12 requests และจะแก้โปรไฟล์บัญชีทดสอบ สร้างและระงับพนักงานทดสอบในบริษัทที่เลือก POST /users ตอบ 201 ตามเอกสาร


## GPS Device / GPS Data (PostgreSQL)

Import VAYRO.GPS.postman_collection.json และใช้ environment เดิม ไฟล์ตัวอย่างไม่มีรหัสผ่านหรือ token จริง

1. ตั้ง login_email/login_password ของ Company Admin ทดสอบที่ Workspace active แล้ว Login เพื่อดู company_id ของตน
2. ต้องมีรถในบริษัทนั้นจริง เพราะฐานข้อมูลตรวจ Foreign Key แล้ว ขณะนี้ Vehicle API ยังไม่ได้สร้าง ผู้ดูแล local สามารถเตรียมรถทดสอบผ่าน SQL ได้ โดยเปลี่ยน 123 เป็น company_id จริงก่อนรัน:

```powershell
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U vayro -d vayro -c "INSERT INTO vehicles(company_id,vehicle_code,license_plate) VALUES (123,'DEMO-001','DEMO-001') RETURNING vehicle_id;"
```

3. ตั้ง vehicle_id ใน Postman เป็น ID ที่ได้ (ชนิด string) และ device_code เป็นรหัสทดสอบ เช่น gps-postman-local
4. ตั้ง TRACKING_API_TOKENS ใน environment ส่วนตัวหรือ .env ที่ไม่ขึ้น Git ให้มี token สุ่มส่วนตัวอย่างน้อย 24 ตัวอักษร โดย value เป็น {"role":"gps_device","company_id":"123","device_code":"gps-postman-local"} เปลี่ยน company_id ให้ตรงกับบัญชีทดสอบ ชื่อ companyId/deviceIdentifier แบบเดิมใช้ไม่ได้แล้ว
5. Recreate Tracking เพื่อโหลดค่า แล้วใส่ token เดียวกันในตัวแปร device_token ของ Postman ห้ามนำ token จริงไปใส่ collection หรือไฟล์ตัวอย่าง
6. เรียกตามลำดับ 01-10: สร้าง/อ่าน/แก้อุปกรณ์ ส่งพิกัด อ่านล่าสุด/ย้อนหลัง และตรวจว่าปิดการเชื่อมต่อโดยไม่ลบประวัติ

POST สร้างอุปกรณ์ที่ device_code ซ้ำในบริษัทเดิมจะได้ 409 ถ้าเคยสร้างแล้วให้ GET รายการ เลือก gps_device_id ของอุปกรณ์ทดสอบตัวเดิม และข้ามขั้น 02; ห้ามแทนด้วยอุปกรณ์จริง GPS external_record_id ใช้ GUID ใหม่ต่อ request เพื่อไม่ชนของเดิม

GPS ใช้ speed_kmh, direction_degree, accuracy_meters, gps_location_id และ ID แบบ string ตามเอกสาร ฟิลด์ sensor ที่ไม่มีค่าเป็น null ได้; ชื่อ speed_kph/heading/accuracy_m เดิมถูกปฏิเสธ ไม่มี alias ที่ทำให้ชื่อข้อมูลต่างกันเงียบ ๆ

ชุดทดสอบ restart จริงที่ไม่ต้องเตรียม device token เอง ใช้ Driver JWT กับรถ/งานที่มอบหมาย และเตรียม fixture เฉพาะ local ให้อัตโนมัติ:

```sh
node services/tracking-service/test/e2e.mjs
```

คำสั่งนี้สร้างข้อมูลทดสอบและ restart เฉพาะ Tracking Service แล้วตรวจว่าอุปกรณ์/พิกัดยังอยู่ใน PostgreSQL ไม่ลบข้อมูลหลังรัน
