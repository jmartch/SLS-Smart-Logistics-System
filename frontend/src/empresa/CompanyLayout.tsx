import {
  Bell,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Truck,
  Users,
  X,
} from "lucide-react"
import { useState } from "react"
import { NavLink, Navigate, Outlet, useNavigate } from "react-router"
import { COMPANY_DEMO_SESSION_KEY } from "../mockData"
import { Brand } from "../shared/ui/PortalShell"

const companyNavigation = [
  { to: "/empresa", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/empresa/recursos", label: "Recursos", icon: Truck },
  { to: "/empresa/paquetes", label: "Paquetes", icon: Boxes },
  { to: "/empresa/paquetes/nuevo", label: "Registrar paquete", icon: PackagePlus },
  { to: "/empresa/trabajadores", label: "Trabajadores", icon: Users },
]

export function CompanyLayout() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  if (localStorage.getItem(COMPANY_DEMO_SESSION_KEY) !== "active") {
    return <Navigate to="/login/empresa" replace />
  }

  const handleLogout = () => {
    localStorage.removeItem(COMPANY_DEMO_SESSION_KEY)
    navigate("/login/empresa", { replace: true })
  }

  return (
    <div className={`company-app${sidebarCollapsed ? " company-app--collapsed" : ""}`}>
      <aside className={sidebarOpen ? "company-sidebar company-sidebar--open" : "company-sidebar"}>
        <div className="sidebar-brand-row">
          <Brand compact />
          <button
            className="sidebar-close"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
          <button
            className="sidebar-collapse"
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Desplegar panel" : "Contraer panel"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <div className="company-profile">
          <span>SL</span>
          <div>
            <strong>Soluciones Luna</strong>
            <small>Cuenta empresarial</small>
          </div>
        </div>
        <nav className="company-nav" aria-label="Panel empresarial">
          <p>Operación</p>
          {companyNavigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                isActive ? "company-nav__link company-nav__link--active" : "company-nav__link"
              }
            >
              <Icon size={19} />
              <span>{label}</span>
              <ChevronRight className="company-nav__arrow" size={16} />
            </NavLink>
          ))}
        </nav>
        <button
          className="sidebar-logout"
          type="button"
          onClick={handleLogout}
        >
          <LogOut size={18} /> <span>Cerrar sesión</span>
        </button>
      </aside>
      <div className="company-main">
        <header className="company-topbar">
          <button
            className="company-menu"
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={21} />
          </button>
          <div className="company-topbar__title">
            <span>Panel empresarial</span>
            <strong>SLS Business</strong>
          </div>
          <div className="company-topbar__actions">
            <button className="notification-button" type="button" aria-label="Notificaciones">
              <Bell size={19} />
              <span />
            </button>
            <span className="profile-avatar">AM</span>
            <button
              className="dashboard-logout"
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={17} />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
