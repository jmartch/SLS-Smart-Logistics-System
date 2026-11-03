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
import { TrackingPage } from "./seguimiento/TrackingPage"
import { LegacyPackageDetailRedirect } from "./shared/routing/LegacyPackageDetailRedirect"
import { NotFound } from "./shared/ui/NotFound"
import { PublicTrackingPage } from "./track/PublicTrackingPage"

export const router = createBrowserRouter([
  // Public
  { path: "/", Component: HomePage },
  { path: "/seguimiento", Component: TrackingPage },
  { path: "/track", Component: PublicTrackingPage },
  { path: "/login", Component: LoginPage },

  // Legacy URLs (mock-data demo retired) -> real auth + app shell
  { path: "/login/empresa", element: <Navigate to="/login" replace /> },
  { path: "/registro/usuario", element: <Navigate to="/login" replace /> },
  { path: "/registro/empresa", element: <Navigate to="/login" replace /> },
  {
    path: "/empresa",
    children: [
      { index: true, element: <Navigate to="/app" replace /> },
      { path: "paquetes", element: <Navigate to="/app/paquetes" replace /> },
      { path: "paquetes/nuevo", element: <Navigate to="/app/paquetes/nuevo" replace /> },
      { path: "paquetes/:packageId", Component: LegacyPackageDetailRedirect },
      { path: "trabajadores", element: <Navigate to="/app/admin/usuarios" replace /> },
      { path: "trabajadores/nuevo", element: <Navigate to="/app/admin/usuarios" replace /> },
      { path: "recursos", element: <Navigate to="/app/admin/vehiculos" replace /> },
      { path: "recursos/nuevo", element: <Navigate to="/app/admin/vehiculos" replace /> },
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
