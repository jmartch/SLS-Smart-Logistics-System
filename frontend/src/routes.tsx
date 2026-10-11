import { createBrowserRouter, Navigate } from "react-router"
import HomePage from "./HomePage"
import {
  CompanyDashboard,
  CompanyLayout,
  CompanyLogin,
  CompanyPackageDetail,
  CompanyPackages,
  CompanyPackageRegistration,
  CompanyRegistration,
  CompanyResourceRegistration,
  CompanyResources,
  CompanyWorkers,
  NotFound,
  TrackingPage,
  WorkerRegistration,
} from "./PortalPages"
import { AppShell } from "./AppShell"
import {
  AdminTenantsPage,
  AdminUsersPage,
  AdminVehiclesPage,
  ClassificationPage,
  LoginPage,
  MyRoutePage,
  NewPackagePage,
  NotificationsPage,
  PackageDetailPage,
  PackagesListPage,
  PendingAssignmentsPage,
  PlanningPage,
  PublicTrackingPage,
  RouteDetailPage,
  RoutesListPage,
  StopPage,
} from "./AppPages"

export const router = createBrowserRouter([
  // Public
  { path: "/", Component: HomePage },
  { path: "/login/empresa", Component: CompanyLogin },
  { path: "/registro/usuario", element: <Navigate to="/login/empresa" replace /> },
  { path: "/registro/empresa", Component: CompanyRegistration },
  { path: "/seguimiento", Component: TrackingPage },
  { path: "/track", Component: PublicTrackingPage },
  { path: "/login", Component: LoginPage },

  // Legacy company app
  {
    path: "/empresa",
    Component: CompanyLayout,
    children: [
      { index: true, Component: CompanyDashboard },
      { path: "recursos", Component: CompanyResources },
      { path: "recursos/nuevo", Component: CompanyResourceRegistration },
      { path: "paquetes", Component: CompanyPackages },
      { path: "paquetes/nuevo", Component: CompanyPackageRegistration },
      { path: "paquetes/:packageId", Component: CompanyPackageDetail },
      { path: "trabajadores", Component: CompanyWorkers },
      { path: "trabajadores/nuevo", Component: WorkerRegistration },
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
      { path: "admin/empresas", Component: AdminTenantsPage },
    ],
  },

  { path: "*", Component: NotFound },
])
