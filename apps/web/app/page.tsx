import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "./landing.css";

export const metadata: Metadata = {
  title: "VAYRO | ระบบติดตามรถและจัดการงานขนส่ง",
  description: "ติดตามตำแหน่ง GPS จัดรถและคนขับ และดูความคืบหน้าของงานขนส่งใน Workspace ของบริษัท",
};

const sections = [
  { href: "#tracking", label: "ติดตามรถ" },
  { href: "#dispatch", label: "จัดการงาน" },
  { href: "#plans", label: "แพ็กเกจ" },
  { href: "#workspace", label: "เริ่มใช้งาน" },
];

const plans = [
  {
    name: "Free",
    price: "฿0",
    billing: "ใช้งานฟรี",
    audience: "สำหรับทีมเล็กที่เริ่มติดตามรถ",
    features: ["ดูตำแหน่ง GPS ล่าสุด", "จัดการทะเบียนรถและแหล่ง GPS"],
  },
  {
    name: "Pro",
    price: "รายเดือน",
    billing: "รอประกาศราคา",
    audience: "สำหรับทีมที่จัดรถและมอบหมายงานทุกวัน",
    features: ["ฟีเจอร์ใน Free", "มอบหมายรถและคนขับ พร้อมติดตามสถานะงาน"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "ราคาองค์กร",
    billing: "แพ็กเกจระดับสูงสุด",
    audience: "สำหรับบริษัทใหญ่ที่จัดการรถหลายคันและต้องใช้ข้อมูลข้ามทีม",
    features: ["ฟีเจอร์ใน Pro", "ภาพรวมบริษัทและส่งออกรายงาน CSV ผ่าน API"],
  },
];

const steps = [
  { title: "ขอเปิด Workspace", text: "กรอกข้อมูลบริษัทและผู้ดูแลคนแรกเพื่อส่งคำขอเปิดใช้งาน" },
  { title: "เตรียมรถและคนขับ", text: "เพิ่มรถ จัดบัญชีคนขับ และลงทะเบียนมือถือหรืออุปกรณ์ที่ส่งพิกัด" },
  { title: "มอบหมายงาน", text: "เลือกจุดรับ–ส่ง แล้วติดตามตำแหน่งรถและสถานะงานบน Dashboard" },
];

function Brand() {
  return (
    <Link href="/" className="vayro-landing-brand" aria-label="VAYRO หน้าหลัก">
      <span className="vayro-landing-mark" aria-hidden="true">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 5 8 14 8-14M8.5 5l3.5 6 3.5-6" />
        </svg>
      </span>
      VAYRO
    </Link>
  );
}

function RoutePreview() {
  return (
    <figure className="vayro-landing-routePreview">
      <svg className="vayro-landing-map" viewBox="0 0 560 306" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="landing-grid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0v26" fill="none" stroke="#dbe3ec" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="560" height="306" fill="#eaf0f5" />
        <rect width="560" height="306" fill="url(#landing-grid)" />
        <path d="M409-20c-77 64-77 113-25 166s28 98-58 180" fill="none" stroke="#c5dbe8" strokeWidth="40" />
        <path d="M-10 110h171l61-49h133m-380 164h121l52-48h168l75 43h185M154-10v96l46 44v180M299-10v65l-32 39v221M483-10v92l-35 54v175M-10 70h143m89 176h108m89-139h151m-58 44H333" fill="none" stroke="#f9fbfd" strokeWidth="9" strokeLinejoin="round" />
        <path d="M96 225h29l53-48h89v-47l44-45h63l55 44h54" fill="none" stroke="#eb5757" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="96" cy="225" r="8" fill="white" stroke="#eb5757" strokeWidth="4" />
        <circle cx="483" cy="129" r="8" fill="white" stroke="#eb5757" strokeWidth="4" />
        <circle cx="311" cy="85" r="19" fill="#eb5757" opacity=".18" />
        <circle cx="311" cy="85" r="9" fill="#eb5757" stroke="white" strokeWidth="3" />
      </svg>
      <figcaption><span className="vayro-landing-signal" /> ตัวอย่างตำแหน่งรถบนแผนที่</figcaption>
    </figure>
  );
}

function DispatchPreview() {
  return (
    <div className="vayro-landing-manifest" aria-label="ตัวอย่างงานขนส่ง">
      <div className="vayro-landing-manifestHeader">
        <div><p>ตัวอย่างงานขนส่ง</p><strong>ส่งสินค้าเข้าคลัง</strong></div>
        <span>กำลังทำงาน</span>
      </div>
      <ol className="vayro-landing-stops">
        <li><span aria-hidden="true">A</span><div><strong>จุดรับสินค้า</strong><small>คลังต้นทาง · บางนา</small></div></li>
        <li><span aria-hidden="true">B</span><div><strong>จุดส่งสินค้า</strong><small>ศูนย์กระจายสินค้า · ลาดกระบัง</small></div></li>
      </ol>
      <div className="vayro-landing-manifestFooter"><span>รถบรรทุก</span><span>มอบหมายคนขับแล้ว</span></div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="vayro-landing-page">
      <a className="vayro-landing-skip" href="#main-content">ข้ามไปเนื้อหา</a>
      <header className="vayro-landing-header">
        <div className="vayro-landing-wrap vayro-landing-headerInner">
          <Brand />
          <nav aria-label="เมนูหลัก" className="vayro-landing-nav">
            {sections.map(({ href, label }) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <Link className="vayro-landing-login" href="/login">เข้าสู่ระบบ</Link>
        </div>
      </header>

      <main id="main-content" className="vayro-landing-wrap">
        <section className="vayro-landing-hero" aria-labelledby="landing-title">
          <div className="vayro-landing-heroCopy">
            <h1 id="landing-title">ติดตามรถและงานขนส่ง<br className="vayro-landing-desktopBreak" />ในหน้าเดียว</h1>
            <p>VAYRO รวมตำแหน่ง GPS ทะเบียนรถ และสถานะการส่งสินค้าไว้ใน Workspace ของบริษัท ให้ทีมจัดรถ มอบหมายงาน และติดตามได้จากข้อมูลชุดเดียวกัน</p>
            <div className="vayro-landing-actions">
              <Link href="/register" className="vayro-landing-primary">ขอเปิด Workspace</Link>
              <a href="#tracking" className="vayro-landing-secondary">ดูความสามารถ</a>
            </div>
          </div>
          <figure className="vayro-landing-heroVisual">
            <Image src="/landing/logistics-depot.jpg" alt="รถบรรทุกวิ่งผ่านทางโค้งภายในศูนย์กระจายสินค้า" fill preload sizes="(max-width: 767px) 94vw, (max-width: 1300px) 54vw, 660px" />
            <div className="vayro-landing-heroRoute" aria-hidden="true">
              <svg viewBox="0 0 180 76" width="106" height="45" fill="none">
                <path d="M10 56h29c13 0 20-7 31-18l12-12c10-10 17-13 31-13h55" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray="5 8" />
                <circle cx="10" cy="56" r="6" fill="white" stroke="currentColor" strokeWidth="4" />
                <circle cx="168" cy="13" r="6" fill="white" stroke="currentColor" strokeWidth="4" />
              </svg>
              <span>ติดตามจากพิกัด GPS</span>
            </div>
          </figure>
        </section>

        <section id="tracking" className="vayro-landing-feature">
          <RoutePreview />
          <div className="vayro-landing-featureCopy">
            <h2>เห็นว่ารถอยู่ที่ไหน</h2>
            <p>ดูตำแหน่งล่าสุดบนแผนที่ 2D หรือ 3D แล้วเลือกทะเบียนเพื่อดูคนขับ ความเร็วที่รายงาน และเวลาที่ได้รับพิกัด</p>
            <ul>
              <li>แยกพิกัดล่าสุดจากพิกัดเก่า</li>
              <li>ลงทะเบียนอุปกรณ์ GPS หรือมือถือคนขับกับรถแต่ละคัน</li>
            </ul>
          </div>
        </section>

        <section id="dispatch" className="vayro-landing-feature vayro-landing-dispatch">
          <div className="vayro-landing-featureCopy">
            <h2>จัดงานจากจุดรับถึงจุดส่ง</h2>
            <p>ระบุจุดรับ–ส่ง ดูระยะทางจากเส้นทางบนถนน แล้วมอบหมายรถกับคนขับสำหรับแต่ละงาน</p>
            <ul>
              <li>คนขับรับงาน เริ่มงาน แจ้งปัญหา และจบงานได้</li>
              <li>ผู้ดูแลดูยอดรถ พนักงาน และงานของบริษัทได้ในหน้าภาพรวม</li>
            </ul>
          </div>
          <DispatchPreview />
        </section>

        <section id="plans" className="vayro-landing-plans" aria-labelledby="landing-plans-title">
          <div className="vayro-landing-featureCopy">
            <h2 id="landing-plans-title">แพ็กเกจสำหรับทีมขนส่ง</h2>
            <p>เริ่มติดตามรถฟรี ขยับเป็น Pro เมื่อทีมต้องจัดงานทุกวัน หรือใช้ Enterprise สำหรับการดูแลกองรถในบริษัทใหญ่</p>
            <p className="vayro-landing-plansNote">ตัวอย่างระดับบริการ ราคาแพ็กเกจแบบชำระเงินและจำนวนรถที่รองรับอยู่ระหว่างกำหนด</p>
            <a href="#workspace" className="vayro-landing-secondary">ดูขั้นตอนเริ่มใช้งาน</a>
          </div>
          <ul className="vayro-landing-planList">
            {plans.map(({ name, price, billing, audience, features, featured }) => (
              <li key={name} className={featured ? "vayro-landing-planFeatured" : undefined}>
                <div>
                  <h3>{name}</h3>
                  <p>{audience}</p>
                </div>
                <div>
                  <p className="vayro-landing-planPrice"><strong>{price}</strong><span>{billing}</span></p>
                  <ul>
                    {features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="workspace" className="vayro-landing-workspace">
          <div className="vayro-landing-workspaceIntro">
            <h2>เริ่มใช้งานกับบริษัทของคุณ</h2>
            <p>รถ พนักงาน และงานขนส่งอยู่ใน Workspace ของแต่ละบริษัท ผู้ใช้เข้าถึงข้อมูลตามบทบาทที่ได้รับ</p>
            <Link href="/register" className="vayro-landing-primary">ขอเปิด Workspace</Link>
          </div>
          <ol className="vayro-landing-steps">
            {steps.map(({ title, text }, index) => (
              <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="vayro-landing-footer">
        <div className="vayro-landing-wrap vayro-landing-footerInner">
          <Brand />
          <span>ระบบติดตามรถและจัดการงานขนส่ง</span>
          <Link href="/login">เข้าสู่ระบบพนักงาน</Link>
        </div>
      </footer>
    </div>
  );
}
