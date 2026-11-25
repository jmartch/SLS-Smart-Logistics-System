import { createBrowserRouter, Navigate } from "react-router"
import HomePage from "./HomePage"
import { AppShell } from "./app/AppShell"
import { AdminTenantsPage } from "./app/admin/empresas/AdminTenantsPage"
import { AdminUsersPage } from "./app/admin/usuarios/AdminUsersPage"
import { AdminVehiclesPage } from "./app/admin/vehiculos/AdminVehiclesPage"
import { AdminCouriersPage } from "./app/admin/mensajeros/AdminCouriersPage"
import { ClassificationPage } from "./app/clasificacion/ClassificationPage"
import { MyRoutePage } from "./app/mi-ruta/MyRoutePage"
import { StopPage } from "./app/mi-ruta/paradas/[stopId]/StopPage"
import { NotificationsPage } from "./app/notificaciones/NotificationsPage"
import { PackagesListPage } from "./app/paquetes/PackagesListPage"
import { PackageDetailPage } from "./app/paquetes/[packageId]/PackageDetailPage"
import { NewPackagePage } from "./app/paquetes/nuevo/NewPackagePage"
import { PendingAssignmentsPage } from "./app/pendientes/PendingAssignmentsPage"
import { PlanningPage } from "./app/planificacion/PlanningPage"
import { RoutesListPage } from "./app/rutas/RoutesListPage"
import { RouteDetailPage } from "./app/rutas/[routeId]/RouteDetailPage"
import { LoginPage } from "./login/LoginPage"
import { CompanyLogin } from "./login/empresa/CompanyLogin"
import { CompanyDashboard } from "./empresa/CompanyDashboard"
import { CompanyLayout } from "./empresa/CompanyLayout"
import { CompanyPackages } from "./empresa/paquetes/CompanyPackages"
import { CompanyPackageDetail } from "./empresa/paquetes/[packageId]/CompanyPackageDetail"
import { CompanyPackageRegistration } from "./empresa/paquetes/nuevo/CompanyPackageRegistration"
import { CompanyResources } from "./empresa/recursos/CompanyResources"
import { CompanyResourceRegistration } from "./empresa/recursos/nuevo/CompanyResourceRegistration"
import { CompanyWorkers } from "./empresa/trabajadores/CompanyWorkers"
import { WorkerRegistration } from "./empresa/trabajadores/nuevo/WorkerRegistration"
import { CompanyRegistration } from "./registro/empresa/CompanyRegistration"
import { UserRegistration } from "./registro/usuario/UserRegistration"
import { TrackingPage } from "./seguimiento/TrackingPage"
import { NotFound } from "./shared/ui/NotFound"
import { PublicTrackingPage } from "./track/PublicTrackingPage"

export const router = createBrowserRouter([
  // Public
  { path: "/", Component: HomePage },
  { path: "/seguimiento", Component: TrackingPage },
  { path: "/track", Component: PublicTrackingPage },
  { path: "/login", Component: LoginPage },

  // Demo empresarial con datos locales
  { path: "/login/empresa", Component: CompanyLogin },
  { path: "/registro/usuario", Component: UserRegistration },
  { path: "/registro/empresa", Component: CompanyRegistration },
  {
    path: "/empresa",
    Component: CompanyLayout,
    children: [
      { index: true, Component: CompanyDashboard },
      { path: "paquetes", Component: CompanyPackages },
      { path: "paquetes/nuevo", Component: CompanyPackageRegistration },
      { path: "paquetes/:packageId", Component: CompanyPackageDetail },
      { path: "trabajadores", Component: CompanyWorkers },
      { path: "trabajadores/nuevo", Component: WorkerRegistration },
      { path: "recursos", Component: CompanyResources },
      { path: "recursos/nuevo", Component: CompanyResourceRegistration },
    ],
  },

  // New authenticated app shell
  {
    path: "/app",
    Component: AppShell,
    children: [
      { index: true, element: <Navigate to="/app/paquetes" replace /> },
      { path: "paquetes", Component: PackagesListPage },
      { path: "paquetes/nuevo", Component: NewPackagePage },
      { path: "paquetes/:packageId", Component: PackageDetailPage },
      { path: "clasificacion", Component: ClassificationPage },
      { path: "pendientes", Component: PendingAssignmentsPage },
      { path: "planificacion", Component: PlanningPage },
      { path: "rutas", Component: RoutesListPage },
      { path: "rutas/:routeId", Component: RouteDetailPage },
      { path: "mi-ruta", Component: MyRoutePage },
      { path: "mi-ruta/paradas/:stopId", Component: StopPage },
      { path: "notificaciones", Component: NotificationsPage },
      { path: "admin/usuarios", Component: AdminUsersPage },
      { path: "admin/vehiculos", Component: AdminVehiclesPage },
      { path: "admin/mensajeros", Component: AdminCouriersPage },
      { path: "admin/empresas", Component: AdminTenantsPage },
    ],
  },

  { path: "*", Component: NotFound },
])
