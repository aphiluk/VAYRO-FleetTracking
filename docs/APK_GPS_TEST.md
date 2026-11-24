# ทดสอบ GPS จาก Android APK

จากโฟลเดอร์โปรเจกต์ ตั้งค่า `.env` ตาม [วิธีรันด้วย Docker](../README.md#รันด้วย-docker) แล้วอัปเดต Gateway, GPS Data และหน้าเว็บด้วย `docker compose up --build -d --wait`

เปิด [Dashboard](http://localhost:3000/dashboard) ด้วย Company Admin หรือ Dispatcher ของ Workspace ทดสอบ ใช้โหมดข้อมูลจริง คนทดสอบ APK ใช้บัญชี Driver ของ Workspace เดียวกัน

1. เตรียมรถสถานะ `active` และกำหนด Driver เป็นคนขับประจำรถ จากนั้นมอบหมายงานให้ Driver กับรถคันเดียวกัน
2. จาก **Manage → แหล่ง GPS** เลือกรถ เลือก **มือถือคนขับ (Android APK)** ตั้งรหัสที่ไม่ซ้ำใน Workspace เช่น `PHONE-TEST-01` แล้วกด **ลงทะเบียนแหล่ง GPS** คัดลอกรหัสที่บันทึกไว้ให้ทีม APK หากทดสอบผ่าน API ให้ใช้ access token ของ Company Admin เรียก `POST /api/v1/gps-devices` โดยส่ง ID รถจริง ตัวอย่าง body:

   ```json
   {"vehicle_id":"123","device_code":"PHONE-TEST-01","source_type":"driver_mobile_app"}
   ```

3. ทีม APK ใช้ Gateway base URL ของสภาพแวดล้อมทดสอบและ Login ผ่าน `POST /api/v1/auth/login` ด้วยบัญชี Driver เก็บ access token ในแอป แยกแต่ละเครื่องด้วย session ของตัวเอง ให้ Driver รับและเริ่มงานจนสถานะเป็น `in_progress` ผ่านหน้า Driver หรือ Transport API
4. APK ส่งพิกัดจาก Android Location ไปที่ `POST /api/v1/gps/ingest` พร้อม `Authorization: Bearer <driver-access-token>` และ `Content-Type: application/json` โครงสร้าง body:

   ```json
   {
     "device_code": "PHONE-TEST-01",
     "external_record_id": "<unique ID of this fix>",
     "recorded_at": "<ISO 8601 time from the location fix>",
     "latitude": 13.7563,
     "longitude": 100.5018,
     "speed_kmh": null,
     "direction_degree": null,
     "accuracy_meters": null
   }
   ```

   ตัวเลขในตัวอย่างเป็นพิกัดทดสอบ APK ใช้ค่าจากโทรศัพท์และส่งเฉพาะช่วงทำงาน ฟิลด์ความเร็วเป็น กม./ชม. และทิศทางเป็นจำนวนเต็ม 0–359 องศา ถ้าไม่มีค่าให้ส่ง `null` ใช้ ID เดิมเมื่อส่งพิกัดเดิมซ้ำเพื่อป้องกันการบันทึกซ้ำ
5. เมื่อ Gateway ตอบ `201` ให้เปิด **Manage → แหล่ง GPS** ดูเวลารับพิกัดล่าสุดของอุปกรณ์ แล้วดูหมุดบน Dashboard และเลือกทะเบียนรถเพื่อตรวจพิกัด เวลาที่บันทึก และเวลาที่เซิร์ฟเวอร์ได้รับ หน้าเว็บอ่านพิกัดล่าสุดทุก 5 วินาทีขณะเปิดแท็บ พิกัดเก่ากว่า 5 นาทีแสดงเป็นหมุดสีเทา พิกัดผิดปกติแสดงสถานะในรายละเอียดรถโดยไม่วางหมุด

Gateway ใน Compose เปิดที่ `127.0.0.1:3001` โดยค่าเริ่มต้น ใช้ Gateway HTTPS ของระบบทดสอบสำหรับมือถือจริง เมื่อทดสอบจากมือถือบนเครือข่ายทดสอบเดียวกันแบบตั้งใจ ให้ตั้ง `GATEWAY_BIND_IP` ใน `.env` เป็น IP ฝั่ง LAN ของเครื่อง และสร้าง container Gateway ใหม่ ทีม APK ใช้ IP หรือ URL ที่มือถือเข้าถึงได้ ค่า `localhost` บนมือถืออ้างถึงตัวมือถือเอง ถ้า APK กำหนดให้ใช้ HTTPS ให้ใช้ URL ทดสอบที่มี HTTPS

หากได้ `401` ให้ตรวจ token หรือเข้าสู่ระบบใหม่ หากได้ `403` ให้ตรวจ Workspace, `device_code`, สถานะรถ, คนขับประจำรถ และงาน `in_progress` หากได้ `409 DUPLICATE_RECORD` แปลว่าจุดที่ใช้ ID เดิมถูกบันทึกไปแล้ว

ตัวตรวจข้อมูลสำหรับ Company Admin และ Dispatcher คือ `GET /api/v1/gps/fleet/latest?vehicle_ids=123` เรียกผ่าน Gateway ได้ครั้งละไม่เกิน 100 ID ระบบใช้ Workspace จากบัญชีที่เข้าสู่ระบบ
