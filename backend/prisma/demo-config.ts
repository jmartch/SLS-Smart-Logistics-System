export const DEMO_IDS = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  tenantSlug: 'demo-barranquilla',
  adminUserId: '20000000-0000-4000-8000-000000000001',
  receptionUserId: '20000000-0000-4000-8000-000000000002',
  activeCourierUserId: '20000000-0000-4000-8000-000000000003',
  candidateCourierUserId: '30000000-0000-4000-8000-0000000000a1',
  adminRoleId: '21000000-0000-4000-8000-000000000001',
  receptionRoleId: '21000000-0000-4000-8000-000000000002',
  courierRoleId: '21000000-0000-4000-8000-000000000003',
  zoneId: '08d92a06-4921-4989-92ff-f1917240779c',
  sectorId: '2ef99933-082e-4d24-b1a1-b5c574ca6aa5',
  shipmentTypeId: 'b268c5c7-b2b5-411d-b734-07746ae7e6e6',
} as const;

export const DEMO_CREDENTIALS = {
  tenantSlug: DEMO_IDS.tenantSlug,
  adminEmail: 'admin@demo-baq.co',
  receptionEmail: 'recepcion@demo-baq.co',
  courierEmail: 'mensajero.ruta@demo-baq.co',
  candidateCourierEmail: 'mensajero.candidato@demo-baq.co',
  password: 'DemoPassword123!',
} as const;
