import {
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  Package,
  Route,
  Truck,
  Users,
  X,
  Building2,
  ClipboardList,
  Clock,
  MapPin,
} from "lucide-react"
import { useState } from "react"
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router"

import { useAuth, Role, type User } from "../auth"
import { NOTIFICATIONS } from "../mockData"

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand--compact" : "brand"} to="/" aria-label="SLS inicio">
      <span className="brand-mark" aria-hidden="true">
        <Route size={compact ? 18 : 22} strokeWidth={2.4} />
      </span>
      <span className="brand-name">SLS</span>
    </Link>
  )
}

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
}

function navForRole(role: Role): NavItem[] {
  switch (role) {
    case "reception":
      return [
        { to: "/app/paquetes/nuevo", label: "Nuevo paquete", icon: <PackagePlus size={17} /> },
        { to: "/app/paquetes", label: "Paquetes", icon: <Package size={17} /> },
        { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
      ]
    case "classification":
      return [
        { to: "/app/clasificacion", label: "Clasificación", icon: <ClipboardList size={17} /> },
        { to: "/app/paquetes", label: "Paquetes", icon: <Package size={17} /> },
        { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
      ]
    case "coordinator":
      return [
        { to: "/app/planificacion", label: "Planificación", icon: <LayoutDashboard size={17} /> },
        { to: "/app/pendientes", label: "Pendientes", icon: <Clock size={17} /> },
        { to: "/app/rutas", label: "Rutas", icon: <Route size={17} /> },
        { to: "/app/paquetes", label: "Paquetes", icon: <Package size={17} /> },
        { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
      ]
    case "courier":
      return [
        { to: "/app/mi-ruta", label: "Mi ruta", icon: <MapPin size={17} /> },
        { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
      ]
    case "admin":
      return [
        { to: "/app/paquetes", label: "Paquetes", icon: <Package size={17} /> },
        { to: "/app/paquetes/nuevo", label: "Nuevo paquete", icon: <PackagePlus size={17} /> },
        { to: "/app/rutas", label: "Rutas", icon: <Route size={17} /> },
        { to: "/app/admin/usuarios", label: "Usuarios", icon: <Users size={17} /> },
        { to: "/app/admin/vehiculos", label: "Vehículos", icon: <Truck size={17} /> },
        { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
      ]
    case "superadmin":
      return [
        { to: "/app/admin/empresas", label: "Empresas", icon: <Building2 size={17} /> },
        { to: "/app/admin/usuarios", label: "Usuarios", icon: <Users size={17} /> },
        { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
      ]
  }
}

function navForUser(user: User): NavItem[] {
  if (user.kind === "PLATFORM_ADMIN" || user.role === "superadmin") {
    return [
      { to: "/app/admin/empresas", label: "Empresas", icon: <Building2 size={17} /> },
      { to: "/app/notificaciones", label: "Notificaciones", icon: <Bell size={17} /> },
    ]
  }

  const perms = new Set(user.permissions)
  if (perms.size === 0) {
    return navForRole(user.role)
  }

  const items: NavItem[] = []
  if (
    perms.has("REGISTER_PACKAGES") ||
    perms.has("CLASSIFY_PACKAGES") ||
    perms.has("COORDINATE_ROUTES") ||
    perms.has("MANAGE_TENANT")
  ) {
    items.push({
      to: "/app/paquetes",
      label: "Paquetes",
      icon: <Package size={17} />,
    })
  }
  if (perms.has("REGISTER_PACKAGES")) {
    items.push({
      to: "/app/paquetes/nuevo",
      label: "Nuevo paquete",
      icon: <PackagePlus size={17} />,
    })
  }
  if (perms.has("CLASSIFY_PACKAGES")) {
    items.push({
      to: "/app/clasificacion",
      label: "Clasificación",
      icon: <ClipboardList size={17} />,
    })
  }
  if (perms.has("COORDINATE_ROUTES")) {
    items.push(
      {
        to: "/app/planificacion",
        label: "Planificación",
        icon: <LayoutDashboard size={17} />,
      },
      {
        to: "/app/pendientes",
        label: "Pendientes",
        icon: <Clock size={17} />,
      },
      {
        to: "/app/rutas",
        label: "Rutas",
        icon: <Route size={17} />,
      },
    )
  }
  if (perms.has("OPERATE_DELIVERIES") && !perms.has("MANAGE_TENANT")) {
    items.push({
      to: "/app/mi-ruta",
      label: "Mi ruta",
      icon: <MapPin size={17} />,
    })
  }
  if (perms.has("MANAGE_EMPLOYEES")) {
    items.push({
      to: "/app/admin/usuarios",
      label: "Usuarios",
      icon: <Users size={17} />,
    })
  }
  if (perms.has("MANAGE_TENANT")) {
    items.push({
      to: "/app/admin/vehiculos",
      label: "Vehículos",
      icon: <Truck size={17} />,
    })
  }
  items.push({
    to: "/app/notificaciones",
    label: "Notificaciones",
    icon: <Bell size={17} />,
  })

  return items
}

function topbarTitle(role: Role): string {
  switch (role) {
    case "reception": return "Portal de Recepción"
    case "classification": return "Portal de Clasificación"
    case "coordinator": return "Portal de Coordinación"
    case "courier": return "Portal del Mensajero"
    case "admin": return "Administración"
    case "superadmin": return "Superadministrador"
  }
}

export function AppShell() {
  const { user, initializing, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (initializing) {
    return (
      <div
        style={{
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          color: "var(--navy)",
          fontWeight: 700,
        }}
      >
        Verificando sesión...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const navItems = navForUser(user)
  const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length

  const handleLogout = async () => {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="company-app">
      <aside className={`company-sidebar${sidebarOpen ? " company-sidebar--open" : ""}`}>
        <div className="sidebar-brand-row">
          <Brand compact />
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>

        <div className="company-profile">
          <span>{user.avatar}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.tenant}</small>
          </div>
        </div>

        <nav className="company-nav">
          <p>Navegación</p>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "company-nav__link company-nav__link--active" : "company-nav__link"
              }
              onClick={() => setSidebarOpen(false)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button className="sidebar-logout" onClick={() => void handleLogout()}>
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </aside>

      {sidebarOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(7,59,92,0.25)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="company-main">
        <header className="company-topbar">
          <button className="company-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
            <Menu size={20} />
          </button>
          <div className="company-topbar__title">
            <span>SLS Connect</span>
            <strong>{topbarTitle(user.role)}</strong>
          </div>
          <div className="company-topbar__actions">
            <Link to="/app/notificaciones" className="notification-button" aria-label={`${unreadCount} notificaciones`}>
              <Bell size={18} />
              {unreadCount > 0 && <span aria-hidden="true" />}
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="profile-avatar" style={{ width: 36, height: 36, fontSize: "0.68rem" }}>
                {user.avatar}
              </span>
            </div>
          </div>
        </header>

        <main className="company-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initializing } = useAuth()
  if (initializing) {
    return null
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
