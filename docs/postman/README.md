# ทดสอบ Backend ด้วย Postman

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
