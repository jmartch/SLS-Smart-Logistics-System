export type PkgStatus =
  | "REGISTERED"
  | "CLASSIFIED"
  | "PENDING_ASSIGNMENT"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "FAILED"
  | "RETURNED"

export interface Package {
  id: string
  trackingCode: string
  sender: string
  recipient: string
  recipientAddress: string
  recipientPhone: string
  zone: string
  sector: string
  weight: number
  volume: number
  priority: "normal" | "urgent" | "express"
  shipmentType: string
  status: PkgStatus
  createdAt: string
  estimatedDelivery: string
  notes?: string
  history: { status: PkgStatus; at: string; by: string; note?: string }[]
}

export interface Route {
  id: string
  date: string
  shift: "morning" | "afternoon"
  status: "draft" | "prepared" | "in_progress" | "closed"
  courier: string
  courierId: string
  vehicle: string
  packageCount: number
  delivered: number
  totalWeight: number
  zone: string
  stops: Stop[]
}

export interface Stop {
  id: string
  order: number
  packageId: string
  trackingCode: string
  recipient: string
  address: string
  status: "pending" | "delivered" | "failed" | "skipped"
  latitude?: number
  longitude?: number
  note?: string
  evidenceUrl?: string
}

export interface Notification {
  id: string
  title: string
  body: string
  read: boolean
  at: string
  entityType: "package" | "route" | "system"
  entityId?: string
}

export interface FleetResource {
  id: string
  kind: "truck" | "car" | "motorcycle" | "bike"
  label: string
  total: number
  available: number
  active: number
  maintenance: number
}

export interface Worker {
  id: string
  name: string
  email: string
  role: "Administrador" | "Gestor de envíos" | "Operador" | "Solo lectura"
  area: "Operaciones" | "Logística" | "Atención al cliente"
  status: "Activo" | "Invitado"
}

export const COMPANY_ACCOUNT = {
  name: "Soluciones Luna",
  contactName: "Ana Martínez",
  email: "empresa@sls.com",
  password: "demo1234",
}

export const FLEET_RESOURCES: FleetResource[] = [
  { id: "fleet-1", kind: "truck", label: "Camiones", total: 12, available: 7, active: 4, maintenance: 1 },
  { id: "fleet-2", kind: "car", label: "Carros", total: 9, available: 5, active: 3, maintenance: 1 },
  { id: "fleet-3", kind: "motorcycle", label: "Motos", total: 18, available: 10, active: 7, maintenance: 1 },
  { id: "fleet-4", kind: "bike", label: "Bicicletas", total: 14, available: 10, active: 4, maintenance: 0 },
]

export const WORKERS: Worker[] = [
  { id: "worker-1", name: "Ana Martínez", email: "ana@solucionesluna.com", role: "Administrador", area: "Operaciones", status: "Activo" },
  { id: "worker-2", name: "Marco Salas", email: "marco@solucionesluna.com", role: "Gestor de envíos", area: "Logística", status: "Activo" },
  { id: "worker-3", name: "Elena Ríos", email: "elena@solucionesluna.com", role: "Operador", area: "Operaciones", status: "Activo" },
  { id: "worker-4", name: "Tomás Vidal", email: "tomas@solucionesluna.com", role: "Solo lectura", area: "Atención al cliente", status: "Invitado" },
]

const now = new Date()
const d = (offset: number) => {
  const dt = new Date(now)
  dt.setDate(dt.getDate() + offset)
  return dt.toISOString().slice(0, 10)
}
const t = (h: number, m = 0) => {
  const dt = new Date(now)
  dt.setHours(h, m, 0, 0)
  return dt.toISOString()
}

export const PACKAGES: Package[] = [
  {
    id: "pkg-001", trackingCode: "SLS-2026-00141",
    sender: "Almacenes Durán Ltda.", recipient: "Carmen Jiménez",
    recipientAddress: "Av. Los Fresnos 1402, Dpto 3B, Providencia",
    recipientPhone: "+56 9 8821 4433", zone: "Zona Norte", sector: "Sector A",
    weight: 2.4, volume: 0.012, priority: "normal", shipmentType: "Estándar",
    status: "IN_TRANSIT", createdAt: t(8, 15), estimatedDelivery: d(0),
    history: [
      { status: "REGISTERED", at: t(8, 15), by: "Andrea Vega" },
      { status: "CLASSIFIED", at: t(8, 42), by: "Carlos Mora", note: "Coordenadas verificadas" },
      { status: "PENDING_ASSIGNMENT", at: t(9, 5), by: "Sistema" },
      { status: "ASSIGNED", at: t(9, 30), by: "Lucía Paredes", note: "Asignado a ruta RT-2026-054" },
      { status: "IN_TRANSIT", at: t(10, 0), by: "Diego Ruiz" },
    ],
  },
  {
    id: "pkg-002", trackingCode: "SLS-2026-00142",
    sender: "Farmacéutica Bío S.A.", recipient: "Roberto Espinoza",
    recipientAddress: "Calle Las Dalias 88, Las Condes",
    recipientPhone: "+56 9 7714 0022", zone: "Zona Sur", sector: "Sector C",
    weight: 0.8, volume: 0.003, priority: "urgent", shipmentType: "Express",
    status: "CLASSIFIED", createdAt: t(9, 0), estimatedDelivery: d(0),
    history: [
      { status: "REGISTERED", at: t(9, 0), by: "Andrea Vega" },
      { status: "CLASSIFIED", at: t(9, 22), by: "Carlos Mora" },
    ],
  },
  {
    id: "pkg-003", trackingCode: "SLS-2026-00143",
    sender: "TechParts SpA", recipient: "Valentina Torres",
    recipientAddress: "Pasaje Los Olmos 554, Maipú",
    recipientPhone: "+56 9 6630 9981", zone: "Zona Oriente", sector: "Sector B",
    weight: 5.2, volume: 0.038, priority: "normal", shipmentType: "Carga",
    status: "REGISTERED", createdAt: t(10, 30), estimatedDelivery: d(1),
    history: [
      { status: "REGISTERED", at: t(10, 30), by: "Andrea Vega" },
    ],
  },
  {
    id: "pkg-004", trackingCode: "SLS-2026-00144",
    sender: "Editorial Meridional", recipient: "Jorge Castillo",
    recipientAddress: "Av. Irarrázaval 2219, Ñuñoa",
    recipientPhone: "+56 9 5512 3344", zone: "Zona Centro", sector: "Sector D",
    weight: 1.1, volume: 0.007, priority: "normal", shipmentType: "Estándar",
    status: "PENDING_ASSIGNMENT", createdAt: t(7, 45), estimatedDelivery: d(0),
    history: [
      { status: "REGISTERED", at: t(7, 45), by: "Andrea Vega" },
      { status: "CLASSIFIED", at: t(8, 10), by: "Carlos Mora" },
      { status: "PENDING_ASSIGNMENT", at: t(8, 35), by: "Sistema", note: "Sin mensajero disponible para Sector D" },
    ],
  },
  {
    id: "pkg-005", trackingCode: "SLS-2026-00145",
    sender: "Distribuidora El Rápido", recipient: "Claudia Neira",
    recipientAddress: "Los Aromos 1120, La Florida",
    recipientPhone: "+56 9 9904 5566", zone: "Zona Sur", sector: "Sector C",
    weight: 3.7, volume: 0.025, priority: "express", shipmentType: "Express",
    status: "DELIVERED", createdAt: d(-1) + "T08:00:00Z", estimatedDelivery: d(-1),
    history: [
      { status: "REGISTERED", at: d(-1) + "T08:00:00Z", by: "Andrea Vega" },
      { status: "CLASSIFIED", at: d(-1) + "T08:20:00Z", by: "Carlos Mora" },
      { status: "PENDING_ASSIGNMENT", at: d(-1) + "T08:40:00Z", by: "Sistema" },
      { status: "ASSIGNED", at: d(-1) + "T09:00:00Z", by: "Lucía Paredes" },
      { status: "IN_TRANSIT", at: d(-1) + "T10:00:00Z", by: "Diego Ruiz" },
      { status: "DELIVERED", at: d(-1) + "T13:22:00Z", by: "Diego Ruiz", note: "Entregado en mano" },
    ],
  },
  {
    id: "pkg-006", trackingCode: "SLS-2026-00146",
    sender: "Supermercados Norte", recipient: "Pablo Muñoz",
    recipientAddress: "Villa Los Aromos 88, Quilicura",
    recipientPhone: "+56 9 8807 1122", zone: "Zona Norte", sector: "Sector A",
    weight: 12.0, volume: 0.09, priority: "normal", shipmentType: "Carga",
    status: "REGISTERED", createdAt: t(11, 0), estimatedDelivery: d(1),
    notes: "Frágil. Mantener horizontal.",
    history: [
      { status: "REGISTERED", at: t(11, 0), by: "Andrea Vega", note: "Frágil. Mantener horizontal." },
    ],
  },
]

export const ROUTES: Route[] = [
  {
    id: "30000000-0000-4000-8000-000000000001", date: d(0), shift: "morning", status: "prepared",
    courier: "Carlos Mendoza", courierId: "70000000-0000-4000-8000-000000000001", vehicle: "Furgón BAQ-101 · Chevrolet NHR",
    packageCount: 3, delivered: 0, totalWeight: 7.5, zone: "Zona Norte - Alto Prado / Riomar",
    stops: [
      { id: "31000000-0000-4000-8000-000000000001", order: 1, packageId: "90000000-0000-4000-8000-000000000001", trackingCode: "SLS-DEMO-BAQ-0001", recipient: "Ferretería del Norte", address: "Cra 54 # 72-80, El Prado, Barranquilla", status: "pending", latitude: 10.9961, longitude: -74.806 },
      { id: "31000000-0000-4000-8000-000000000002", order: 2, packageId: "90000000-0000-4000-8000-000000000002", trackingCode: "SLS-DEMO-BAQ-0002", recipient: "Clínica Alto Prado", address: "Cra 51B # 80-58, Alto Prado, Barranquilla", status: "pending", latitude: 11.0041, longitude: -74.8152 },
      { id: "31000000-0000-4000-8000-000000000003", order: 3, packageId: "90000000-0000-4000-8000-000000000003", trackingCode: "SLS-DEMO-BAQ-0003", recipient: "Centro Empresarial Buenavista", address: "Calle 98 # 52B-10, Riomar, Barranquilla", status: "pending", latitude: 11.0112, longitude: -74.8265 },
    ],
  },
  {
    id: "rt-001", date: d(0), shift: "morning", status: "in_progress",
    courier: "Diego Ruiz", courierId: "u4", vehicle: "Furgón VAN-032 · Ford Transit",
    packageCount: 8, delivered: 5, totalWeight: 24.3, zone: "Zona Norte",
    stops: [
      { id: "s1", order: 1, packageId: "pkg-001", trackingCode: "SLS-2026-00141", recipient: "Carmen Jiménez", address: "Cra 54 # 72-80, El Prado, Barranquilla", status: "delivered", latitude: 10.9961, longitude: -74.806 },
      { id: "s2", order: 2, packageId: "pkg-006", trackingCode: "SLS-2026-00146", recipient: "Pablo Muñoz", address: "Cra 51B # 80-58, Alto Prado, Barranquilla", status: "pending", latitude: 11.0041, longitude: -74.8152 },
    ],
  },
  {
    id: "rt-002", date: d(0), shift: "afternoon", status: "prepared",
    courier: "Fernanda Ríos", courierId: "u7", vehicle: "Moto MOT-011 · Honda CB",
    packageCount: 12, delivered: 0, totalWeight: 9.8, zone: "Zona Centro",
    stops: [
      { id: "s3", order: 1, packageId: "pkg-004", trackingCode: "SLS-2026-00144", recipient: "Jorge Castillo", address: "Calle 98 # 52B-10, Riomar, Barranquilla", status: "pending", latitude: 11.0112, longitude: -74.8265 },
    ],
  },
  {
    id: "rt-003", date: d(-1), shift: "morning", status: "closed",
    courier: "Diego Ruiz", courierId: "u4", vehicle: "Furgón VAN-032 · Ford Transit",
    packageCount: 10, delivered: 9, totalWeight: 31.1, zone: "Zona Sur",
    stops: [],
  },
]

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", title: "Paquete entregado", body: "SLS-2026-00145 fue entregado exitosamente a Claudia Neira.", read: false, at: d(-1) + "T13:22:00Z", entityType: "package", entityId: "pkg-005" },
  { id: "n2", title: "Paquete sin asignar", body: "SLS-2026-00144 lleva más de 2 horas en estado Pendiente de asignación.", read: false, at: t(10, 45), entityType: "package", entityId: "pkg-004" },
  { id: "n3", title: "Ruta iniciada", body: "Diego Ruiz inició la ruta RT-001 con 8 paradas.", read: true, at: t(10, 0), entityType: "route", entityId: "rt-001" },
  { id: "n4", title: "Nuevo paquete registrado", body: "Se registró el paquete SLS-2026-00146 (12 kg, Frágil).", read: true, at: t(11, 0), entityType: "package", entityId: "pkg-006" },
]

export const STATUS_LABELS: Record<PkgStatus, string> = {
  REGISTERED: "Registrado",
  CLASSIFIED: "Clasificado",
  PENDING_ASSIGNMENT: "Pendiente asignación",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En tránsito",
  DELIVERED: "Entregado",
  FAILED: "Fallido",
  RETURNED: "Devuelto",
}

export const STATUS_COLOR: Record<PkgStatus, string> = {
  REGISTERED: "status--active",
  CLASSIFIED: "status--active",
  PENDING_ASSIGNMENT: "status--pending",
  ASSIGNED: "status--active",
  IN_TRANSIT: "status--active",
  DELIVERED: "status--success",
  FAILED: "status--danger",
  RETURNED: "status--pending",
}
