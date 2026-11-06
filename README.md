# VAYRO FleetTracking

โครงเริ่มต้นของระบบติดตามรถหลายบริษัท ใช้ Next.js, Elysia และ Bun workspaces
ขณะนี้เว็บเป็นหน้าเริ่มต้น และ gateway/auth-service ตอบ `Hello Elysia` เท่านั้น
ยังไม่มีระบบ login, GPS, ฐานข้อมูล หรือการเชื่อมต่อระหว่างบริการ

## รันด้วย Docker

ติดตั้งและเปิด Docker Desktop (Linux containers) พร้อม Docker Compose v2 แล้วรัน:

```sh
git clone https://github.com/aphiluk/VAYRO-FleetTracking.git
cd VAYRO-FleetTracking
docker compose up --build -d --wait
```

| บริการ | URL บนเครื่อง |
| --- | --- |
| Web | http://localhost:3000 |
| Gateway | http://localhost:3001 |
| Auth service | http://localhost:3002 |

แต่ละ container ใช้พอร์ต 3000 ภายในและ bind host port เฉพาะ localhost
ไม่มีฐานข้อมูลหรือข้อมูล GPS จริงในชุด Compose นี้
บริการไม่ได้เรียกหากันใน scaffold ปัจจุบัน จึงยังไม่กำหนดลำดับเริ่มต้น
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
ชุดนี้เตรียมสำหรับรัน scaffold ในเครื่อง ยังต้องพัฒนาการยืนยันตัวตนและ business logic ก่อนใช้งานจริง
