import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceFleet, vehicleCategory, jobProblemAlerts } from '../app/dashboard/_data/workspace-fleet.ts';
const vehicle = { vehicle_id: '1', company_id: '1', vehicle_code: 'REAL-001', license_plate: 'ทะเบียนจริง', vehicle_type_id: '10', current_driver_id: '20', vehicle_status: 'active', created_at: '2026-11-19T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' };
const type = { vehicle_type_id: '10', company_id: '1', type_name: 'รถบรรทุก', description: null, is_active: true, created_at: '', updated_at: '' };
const driver = { user_id: '20', company_id: '1', full_name: 'คนขับจริง', email: 'driver@example.test', role: 'driver', phone: null, account_status: 'active' };
const job = { job_id: '30', job_code: 'REAL-JOB', vehicle_id: '1', job_status: 'problem', problem_note: 'รอจุดรับสินค้าเปิด', updated_at: '2026-11-19T01:00:00Z', driver: { user_id: '20', full_name: 'คนขับจากงาน', email: 'driver@example.test' }, vehicle: { vehicle_id: '1', license_plate: 'ทะเบียนจริง', vehicle_code: 'REAL-001', vehicle_type_name: 'รถบรรทุก' } };
test('workspace rows preserve database identity, type and permanent driver without inventing GPS fields', () => {
  const [row] = workspaceFleet([vehicle], [type], [driver], []);
  assert.equal(row.id, '1'); assert.equal(row.plate, 'ทะเบียนจริง'); assert.equal(row.code, 'REAL-001'); assert.equal(row.driverName, 'คนขับจริง'); assert.equal(row.category, 'truck'); assert.strictEqual(row.record, vehicle);
  for (const field of ['position', 'speed', 'heading', 'route']) assert.equal(Object.hasOwn(row, field), false);
});
test('missing metadata and unknown custom types are explicit, with no fabricated driver or vehicle category', () => {
  const [row] = workspaceFleet([{ ...vehicle, vehicle_type_id: null, current_driver_id: null }], [], [], []);
  assert.equal(row.category, null); assert.equal(row.typeName, 'ยังไม่ระบุประเภท'); assert.equal(row.driverName, 'ยังไม่กำหนดคนขับประจำรถ');
  assert.equal(vehicleCategory('ประเภทพิเศษ'), null); assert.equal(vehicleCategory('มอเตอร์ไซค์'), 'motorcycle'); assert.equal(vehicleCategory('รถยนต์'), 'car');
});
test('job metadata can name a known driver when the account cannot read the employee directory', () => {
  const [row] = workspaceFleet([vehicle], [type], [], [job]); assert.equal(row.driverName, 'คนขับจากงาน');
  const [unknown] = workspaceFleet([vehicle], [type], [], []); assert.equal(unknown.driverName, 'ผู้ใช้ #20');
});
test('only current problem jobs become real alerts; historical notes on completed work are not active incidents', () => {
  const alerts = jobProblemAlerts([job, { ...job, job_id: '31', job_status: 'completed' }, { ...job, job_id: '32', vehicle_id: null }]);
  assert.equal(alerts.length, 1); assert.equal(alerts[0].kind, 'problem'); assert.equal(alerts[0].id, 'job:30'); assert.equal(alerts[0].vehicle.id, '1'); assert.match(alerts[0].detail, /REAL-JOB/); assert.match(alerts[0].detail, /รอจุดรับสินค้าเปิด/); assert.equal(alerts[0].time, Date.parse(job.updated_at));
});
test('empty company data stays empty and invalid event times stay unavailable', () => {
  assert.deepEqual(workspaceFleet([], [], [], []), []); assert.deepEqual(jobProblemAlerts([]), []); assert.equal(jobProblemAlerts([{ ...job, updated_at: 'invalid' }])[0].time, null);
});
test('workspace display does not truncate a company with more than 100 vehicles', () => {
  const records = Array.from({ length: 105 }, (_, i) => ({ ...vehicle, vehicle_id: String(i + 1) })); const rows = workspaceFleet(records, [type], [driver], []); assert.equal(rows.length, 105); assert.equal(rows.at(-1).id, '105');
});
