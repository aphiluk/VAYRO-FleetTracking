# VAYRO FleetTracking

This branch delivers Backend APIs only. The web prototype previously tested locally is not included in this Backend change; the committed web remains the original Next.js scaffold. Frontend integration is owned separately.

โครงเริ่มต้นของระบบติดตามรถหลายบริษัท ใช้ Next.js, Elysia และ Bun workspaces
ขณะนี้เว็บมี Login, สมัครบริษัท, Dashboard และจัดการผู้ใช้; Authentication Service ทำ Login/Refresh/Logout ส่วน User API แยกรันใน user-service
(ดู [docs/AUTH.md](docs/AUTH.md)) ผ่าน gateway และ PostgreSQL ยังไม่มี GPS tracking หรือ business logic อื่น

## รันด้วย Docker

ติดตั้งและเปิด Docker Desktop (Linux containers) พร้อม Docker Compose v2 แล้วรัน:

```sh
git clone https://github.com/aphiluk/VAYRO-FleetTracking.git
cd VAYRO-FleetTracking
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
docker compose up --build -d --wait
```

| บริการ | URL บนเครื่อง |
| --- | --- |
| Web | http://localhost:3000 (เริ่มที่ `/login` หรือ `/register`) |
| Gateway | http://localhost:3001 |
| Authentication service | http://localhost:3002 |
| User service | http://localhost:3003 |

แต่ละ container ใช้พอร์ต 3000 ภายในและ bind host port เฉพาะ localhost
Compose มี PostgreSQL (ไม่เปิดพอร์ตออกเครื่อง) ที่สร้างตารางจาก `infra/database/*.sql` ตอนสร้าง volume ครั้งแรก
ต้องมี `.env` (`POSTGRES_PASSWORD`, `JWT_SECRET`) ก่อนรัน ไม่มีข้อมูล GPS จริงในชุดนี้
gateway ส่ง /api/v1/auth ไป Authentication Service และ /api/v1/users ไป User Service โดยทั้งสองใช้ PostgreSQL เดียวกัน
health check ตรวจ HTTP `/` ของแต่ละบริการ ไม่ได้ตรวจฟังก์ชันธุรกิจ

```sh
docker compose ps
docker compose logs -f
docker compose down
```

หากพอร์ตชน ให้คัดลอก `.env.example` เป็น `.env` แล้วเปลี่ยน `WEB_PORT`, `GATEWAY_PORT` หรือ `AUTH_PORT`
จากนั้นรัน `docker compose up -d --wait` ใหม่ ห้าม commit `.env` หรือ credentials
การ build ครั้งแรกต้องใช้อินเทอร์เน็ตเพื่อดึง image, packages และ Google Fonts ของหน้าเว็บเริ่มต้น
Docker ใช้ Bun 1.3.14 และ root `bun.lock` ด้วย `--frozen-lockfile`

## พัฒนาโดยไม่ใช้ Docker

ติดตั้ง Bun 1.3.14 แล้วรัน:

```sh
bun install --frozen-lockfile
bun run dev:web
```

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
ไม่ควรเรียก `dev:vehicle`, `dev:tracking` หรือ `dev:notification` เพราะยังไม่มี service เหล่านั้น

อ่าน [โครงสร้างและขอบเขตโครงการ](docs/PROJECT_STRUCTURE.md) และ [คู่มือสำหรับ agent](AGENTS.md) ก่อนพัฒนาต่อ
ชุดนี้เตรียมสำหรับรันในเครื่อง ยังต้องพัฒนา business logic อื่นและตรวจความปลอดภัยก่อนใช้งานจริง
