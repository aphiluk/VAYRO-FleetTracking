export type DriverJobStatus = "assigned" | "accepted" | "in_progress" | "completed";
export type RouteCoordinate = [longitude: number, latitude: number];

type RouteStop = {
  name: string;
  address: string;
  time: string;
  coordinate: RouteCoordinate;
};

type DriverVehicle = {
  code: string;
  name: string;
  plate: string;
  image: string;
};

export type DriverJob = {
  code: string;
  name: string;
  scheduledOn: string;
  completedAt?: string;
  vehicle: DriverVehicle;
  pickup: RouteStop;
  delivery: RouteStop;
  via: RouteCoordinate[];
  distanceKm: number;
  cargo: { name: string; quantity: number; unit: string }[];
};

const boxTruck: DriverVehicle = {
  code: "VY-014",
  name: "รถบรรทุกตู้ทึบ 6 ล้อ",
  plate: "70-8254 กรุงเทพมหานคร",
  image: "/driver/box-truck.jpg",
};

export const demoDate = { label: "วันพุธที่ 18 พฤศจิกายน 2569", iso: "2026-11-18" };

export const demoDriver = {
  name: "ณัฐพล เมืองดี",
  initials: "ณม",
  code: "DRV-014",
  workspace: "VAYRO Logistics",
};

export const demoJobs: readonly DriverJob[] = [
  {
    code: "JOB-0241",
    name: "ส่งสินค้าเข้าคลังวังน้อย",
    scheduledOn: demoDate.iso,
    vehicle: boxTruck,
    pickup: {
      name: "ศูนย์กระจายสินค้า บางนา",
      address: "บางพลี จ.สมุทรปราการ",
      time: "08:30",
      coordinate: [100.688, 13.648],
    },
    delivery: {
      name: "คลังสินค้า วังน้อย",
      address: "วังน้อย จ.พระนครศรีอยุธยา",
      time: "10:30",
      coordinate: [100.749, 14.224],
    },
    via: [[100.67, 13.694], [100.693, 13.76], [100.73, 13.829], [100.747, 13.925], [100.797, 13.998], [100.801, 14.093], [100.769, 14.172]],
    distanceKm: 86,
    cargo: [
      { name: "เครื่องดื่มบรรจุขวด", quantity: 8, unit: "พาเลต" },
      { name: "สินค้าบรรจุกล่อง", quantity: 24, unit: "กล่อง" },
      { name: "บรรจุภัณฑ์เปล่า", quantity: 12, unit: "ลัง" },
    ],
  },
  {
    code: "JOB-0248",
    name: "ส่งบรรจุภัณฑ์ไปรังสิต",
    scheduledOn: demoDate.iso,
    vehicle: boxTruck,
    pickup: {
      name: "คลังสินค้า วังน้อย",
      address: "วังน้อย จ.พระนครศรีอยุธยา",
      time: "13:00",
      coordinate: [100.749, 14.224],
    },
    delivery: {
      name: "ศูนย์กระจายสินค้า รังสิต",
      address: "ธัญบุรี จ.ปทุมธานี",
      time: "14:30",
      coordinate: [100.739, 14.014],
    },
    via: [[100.769, 14.172], [100.802, 14.099], [100.805, 14.056], [100.772, 14.028]],
    distanceKm: 42,
    cargo: [
      { name: "กล่องกระดาษพับ", quantity: 16, unit: "มัด" },
      { name: "ฟิล์มพันพาเลต", quantity: 10, unit: "กล่อง" },
    ],
  },
  {
    code: "JOB-0234",
    name: "ส่งอุปกรณ์เข้าคลังลาดกระบัง",
    scheduledOn: "2026-11-17",
    completedAt: "2026-11-17T11:45:00+07:00",
    vehicle: boxTruck,
    pickup: {
      name: "ศูนย์กระจายสินค้า บางนา",
      address: "บางพลี จ.สมุทรปราการ",
      time: "10:00",
      coordinate: [100.688, 13.648],
    },
    delivery: {
      name: "คลังสินค้า ลาดกระบัง",
      address: "ลาดกระบัง กรุงเทพมหานคร",
      time: "12:00",
      coordinate: [100.793, 13.729],
    },
    via: [[100.711, 13.65], [100.75, 13.668], [100.777, 13.694]],
    distanceKm: 35,
    cargo: [{ name: "อุปกรณ์จัดเก็บสินค้า", quantity: 12, unit: "ลัง" }],
  },
];
