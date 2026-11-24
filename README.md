# VAYRO FleetTracking

โครงเริ่มต้นของระบบติดตามรถหลายบริษัท ใช้ Next.js, Elysia และ Bun workspaces
Compose ชุดหลักรัน Auth, Company, User, Vehicle, GPS Device, GPS Data, Route History, Transport, Alert, Reporting, Integration และ Navigation บริการเจ้าของข้อมูลใช้ PostgreSQL แยกฐานต่อบริการผ่าน Prisma ส่วนโครง Vehicle Tracking เปิดผ่านโปรไฟล์ `scaffold`
ดู [โครงสร้างและเจ้าของข้อมูล](docs/PROJECT_STRUCTURE.md), [Auth](docs/AUTH.md), [User](docs/USER.md), [ฐานข้อมูล](docs/DATABASE.md), [สัญญาข้อมูล API](docs/API_DATA_CONTRACT.md) และ [ประวัติเวอร์ชัน](CHANGELOG.md)

หน้าเว็บส่งคำขอเปิด Workspace และเข้าสู่ระบบผ่าน Gateway บัญชีผู้ดูแลคนแรกจะเข้าสู่ระบบได้เมื่อ Workspace เปิดใช้งานแล้ว ส่วน Dashboard โหลดทะเบียนรถ งาน และยอดสรุปจากฐานข้อมูลของบริษัท

## รันด้วย Docker

Existing installs (old shared `vayro` database): follow "Existing install" in docs/DATABASE.md to move the data into the per-service databases. New volumes set everything up automatically. Do not reset the volume to upgrade.

ติดตั้งและเปิด Docker Desktop (Linux containers) พร้อม Docker Compose v2 แล้วรัน:

```sh
git clone --branch vayro-frontend https://github.com/EzLeoPop-Dev/VAYRO-FleetTracking.git
cd VAYRO-FleetTracking
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
docker compose up --build -d --wait
```

| บริการ | URL บนเครื่อง |
| --- | --- |
| หน้าแนะนำ VAYRO | http://localhost:3000 |
| Web dashboard | http://localhost:3000/dashboard |
| Gateway | http://localhost:3001 |

Web และ Gateway เปิดพอร์ตเฉพาะ localhost ส่วนบริการภายในและ PostgreSQL อยู่ในเครือข่าย Compose Gateway ส่งต่อ prefix ที่เปิดใช้งานตาม [ตารางเส้นทาง](gateway/src/app.ts) และกัน `/internal/*` ไว้ให้บริการติดต่อกันภายใน

แต่ละ container ใช้พอร์ต 3000 ภายในและ bind host port เฉพาะ localhost
Compose มี PostgreSQL (ไม่เปิดพอร์ตออกเครื่อง) ที่สร้างฐานข้อมูลต่อ service จาก `infra/database/init/` ตอนสร้าง volume ครั้งแรก ส่วนตารางสร้างโดย Prisma migration ของแต่ละ service ตอน container เริ่มทำงาน
ต้องมี `.env` (`POSTGRES_PASSWORD`, `DB_PASSWORD_<SERVICE>` ของแต่ละฐาน 9 ตัว, `JWT_SECRET`, `INTERNAL_API_TOKEN`) ก่อนรัน แต่ละ service ได้รหัสของฐานตัวเองเท่านั้น ไม่รู้รหัสแอดมินของ Postgres ไม่มีข้อมูล GPS จริงในชุดนี้
gateway ส่งทุก path ใน /api/v1 ไป service ที่เป็นเจ้าของตามตาราง route ใน `gateway/src/app.ts`; service เรียกกันเองผ่าน /internal/* (gateway ไม่ส่งต่อ)
health check ตรวจ HTTP `/` ของแต่ละบริการ ไม่ได้ตรวจฟังก์ชันธุรกิจ

```sh
docker compose ps
docker compose logs -f
docker compose down
```

หากพอร์ตชน ให้เปลี่ยน `WEB_PORT` หรือ `GATEWAY_PORT` ใน `.env`
จากนั้นรัน `docker compose up -d --wait` ใหม่ ห้าม commit `.env` หรือ credentials
การ build ครั้งแรกต้องใช้อินเทอร์เน็ตเพื่อดึง image และ packages
Docker ใช้ Bun 1.3.14 และ root `bun.lock` ด้วย `--frozen-lockfile`

เมื่อต้องการทดสอบ Auth, User, GPS Data หรือ Navigation แบบเรียกตรง ให้เพิ่ม override ที่เปิดพอร์ต localhost 3002, 3003, 3004 และ 3014 ตามลำดับ เมื่อตรวจเสร็จให้รันคำสั่งชุดหลักอีกครั้งเพื่อเอาพอร์ตทดสอบออก

```sh
docker compose -f compose.yaml -f compose.debug.yaml up --build -d --wait
```

## พัฒนาโดยไม่ใช้ Docker

ติดตั้ง Bun 1.3.14 แล้วรัน:

```sh
bun install --frozen-lockfile
bun run db:generate   # สร้าง Prisma client ของแต่ละ service
bun run dev:web
```

เปิด [หน้าเข้าสู่ระบบ](http://localhost:3000/login) แล้วใช้บัญชีที่เปิดใช้งานเพื่อเข้า Dashboard ดูข้อมูลรถของบริษัทบนแผนที่กรุงเทพฯ และปริมณฑล เว็บบนเครื่องเรียก Gateway ที่ `http://127.0.0.1:3001` โดยค่าเริ่มต้น หากใช้พอร์ตอื่นให้กำหนด `API_URL` ใน environment ของเว็บ [ดูวิธีเตรียมบัญชีและทดสอบ Login](docs/AUTH.md#web-appsweb)
หน้าเริ่มต้นแสดงทะเบียนรถจริงและสถานะ active/inactive/maintenance พร้อมรายละเอียดคนขับและงาน เมื่อมีพิกัด GPS ที่ใช้ได้ จะแสดงตำแหน่งล่าสุดบนแผนที่และเวลาในรายละเอียดรถ ดู [วิธีทดสอบ GPS จาก Android APK](docs/APK_GPS_TEST.md) กด **ดูเดโม 3D** เพื่อเปิดรถจำลอง แล้วกด **กลับข้อมูลจริง** เพื่อกลับมาข้อมูลบริษัท
แผนที่เต็มหน้าจอพร้อมแผงรายการรถด้านขวาและรายละเอียดรถที่เลือกด้านซ้ายล่าง บนมือถือกดปุ่มรายการรถเพื่อเปิดแผง
Bottom Bar ทรงแคปซูลใช้สลับระหว่างแผนที่ รถ คนขับ งาน และเพิ่มเติม ส่วนเมนูจัดหน้าจอด้านขวาใช้เปิดหรือปิดแผงบนแผนที่
เมนูรถเปิดหน้าต่างจัดการรถเหนือแผนที่ ค้นหาทะเบียนหรือคนขับและกรองตามประเภทรถได้ ลากแถบชื่อเพื่อย้ายหน้าต่างบนเดสก์ท็อป หรือใช้ปุ่มบนแถบชื่อเพื่อปิด ย่อ และขยาย
Company Admin ใช้ **Manage → เพิ่มรถ** ใน Bottom Bar เพื่อบันทึกรถ ประเภท สถานะ และคนขับประจำรถผ่าน Gateway ลงฐานข้อมูลจริง โดยยังไม่ต้องตั้งค่า GPS รายการและการแก้ไขคงอยู่หลังรีเฟรช
Company Admin กดโปรไฟล์ที่มุมซ้ายบนของแผนที่หรือเปิด **เพิ่มเติม → TestRole** เพื่อสลับมุมมองจำลองระหว่าง Dispatch และ Admin ของบริษัท Dispatch ใช้แผนที่ งาน และเพิ่มเติม ส่วน Admin มีเมนูภาพรวม รถ และคนขับเพิ่ม ตัวเลือกนี้มีผลกับหน้าจอเดโมในแท็บปัจจุบัน
บนแผนที่ เปิด **จัดหน้าจอแผนที่ → แจ้งเตือน** เพื่อดูงานสถานะ problem ที่ Driver แจ้งผ่าน Transport พร้อมรถและรายละเอียดปัญหา กดรายการเพื่อดูรายละเอียดรถ การแจ้งเตือนความเร็ว/ออกนอกเส้นทางยังต้องเชื่อม GPS; เหตุการณ์ตัวอย่างแสดงเฉพาะโหมดเดโม
ปุ่ม **จัดหน้าจอแผนที่** เปิดเมนูวงกลมกลางจอสำหรับเปิดหรือซ่อนแผง กดปุ่มกลางวงหรือ Escape เพื่อปิดเมนู
แผงแจ้งเตือนและรายการรถเปิดพร้อมกันได้ ลากตัวจับหกจุดเพื่อย้ายแผงสรุปสถานะ รายการรถ รายละเอียดรถ หรือแจ้งเตือน กดปุ่มลูกศรบนหัวแผงเพื่อย่อหรือขยายข้อมูล เมื่อโฟกัสที่ตัวจับ ใช้ปุ่มลูกศรบนคีย์บอร์ดเพื่อขยับแผงและกด Home เพื่อคืนตำแหน่งเริ่มต้น
ลากสัญลักษณ์เส้นเฉียงที่มุมแผงเพื่อปรับความกว้างและความสูง เมื่อโฟกัสที่สัญลักษณ์ ใช้ปุ่มลูกศรปรับขนาดและกด Home เพื่อคืนขนาดกับตำแหน่งเริ่มต้น
เมนู **ภาพรวม** เปิดหน้าต่างลอยเหนือแผนที่ สรุปพนักงาน รถ และงานจากฐานข้อมูลจริงของบริษัทผ่าน Reporting/Gateway แยกตามบทบาท สถานะ และประเภทรถ พร้อมเวลาอัปเดตและปุ่มโหลดใหม่ สถานะกำลังวิ่ง/จอดยังต้องเชื่อมข้อมูล GPS เพิ่มเติม
แผนที่ใช้ MapLibre GL JS กับ [OpenFreeMap](https://openfreemap.org/) ซึ่งไม่ต้องใช้ API key สำหรับ public instance
เบราว์เซอร์ต้องเข้าถึงบริการแผนที่และรองรับ WebGL เพื่อดูแผนที่ถนนแบบโต้ตอบ

เปิด terminal เพิ่มสำหรับแต่ละ API (ตัวอย่าง PowerShell):

```powershell
$env:PORT=3001
bun run dev:gateway
```

```powershell
$env:PORT=3002
bun run dev:auth
```

บน macOS/Linux ใช้ `PORT=3001 bun run dev:gateway` และ `PORT=3002 bun run dev:auth`
การรัน service เดี่ยว ๆ ต้องตั้ง `DATABASE_URL`, `INTERNAL_API_TOKEN` และ URL ของ service ที่มันเรียก (ดู `compose.yaml`)

อ่าน [โครงสร้างและขอบเขตโครงการ](docs/PROJECT_STRUCTURE.md) และ [คู่มือสำหรับ agent](AGENTS.md) ก่อนพัฒนาต่อ
ชุดนี้เตรียมสำหรับรันในเครื่อง ยังต้องพัฒนา business logic อื่นและตรวจความปลอดภัยก่อนใช้งานจริง

Company Admin ใช้ **Manage → จัดการงาน** เพื่อสร้างและมอบหมายงานจริงให้ Driver โดยเลือกจุดรับ–ส่งจากการค้นหาสถานที่และคำนวณเส้นทางถนน คนขับ Login เข้า /driver เพื่อรับงาน เริ่มงาน แจ้งปัญหา ทำงานต่อ จบงาน และดูประวัติ สถานะเก็บใน PostgreSQL การนำทางรอบนี้เป็นเส้นทางถนนให้เลือกดูเอง ยังไม่ใช้ GPS หรือตรวจระยะใกล้ปลายทาง และยังไม่รองรับข้อจำกัดรถบรรทุกโดยเฉพาะ
