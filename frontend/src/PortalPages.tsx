import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Bike,
  Boxes,
  Building2,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  Image,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  PackageCheck,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  QrCode,
  Route,
  Search,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserPlus,
  Users,
  Warehouse,
  Upload,
  X,
} from "lucide-react"
import { ChangeEvent, FormEvent, ReactNode, useRef, useState } from "react"
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router"
import {
  decodeQrFromImageFile,
  generateRandomDemoQrJson,
  parsePackageQrPayload,
} from "./features/packages/qrPackageParser"
import {
  COMPANY_ACCOUNT,
  FLEET_RESOURCES,
  PACKAGES,
  STATUS_COLOR,
  STATUS_LABELS,
  WORKERS,
} from "./mockData"
import type { FleetResource } from "./mockData"

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand--compact" : "brand"} to="/" aria-label="SLS, inicio">
      <span className="brand-mark" aria-hidden="true">
        <Route size={compact ? 18 : 22} strokeWidth={2.4} />
      </span>
      <span className="brand-name">SLS</span>
    </Link>
  )
}

function AuthShell({
  title,
  description,
  eyebrow,
  icon,
  children,
  asideTitle,
  asideText,
}: {
  title: string
  description: string
  eyebrow: string
  icon: ReactNode
  children: ReactNode
  asideTitle: string
  asideText: string
}) {
  return (
    <main className="auth-page">
      <header className="auth-header">
        <Brand />
        <Link className="back-link" to="/">
          <ArrowLeft size={17} />
          Volver al inicio
        </Link>
      </header>
      <section className="auth-layout">
        <aside className="auth-aside">
          <div className="auth-aside__content">
            <span className="auth-aside__icon">{icon}</span>
            <p className="auth-aside__eyebrow">SLS Connect</p>
            <h2>{asideTitle}</h2>
            <p>{asideText}</p>
            <div className="auth-benefits">
              <span>
                <CheckCircle2 size={17} /> Información protegida
              </span>
              <span>
                <CheckCircle2 size={17} /> Configuración en minutos
              </span>
              <span>
                <CheckCircle2 size={17} /> Soporte cuando lo necesites
              </span>
            </div>
          </div>
          <div className="auth-route" aria-hidden="true">
            <span />
            <Truck size={24} />
            <span />
            <MapPin size={24} />
          </div>
        </aside>
        <div className="auth-form-panel">
          <div className="auth-form-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}

function PasswordField({ id }: { id: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>Contraseña</label>
      <div className="input-with-action">
        <input
          id={id}
          type={visible ? "text" : "password"}
          placeholder="Mínimo 8 caracteres"
          minLength={8}
          required
        />
        <button
          className="field-action"
          type="button"
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

function SuccessState({
  title,
  text,
  link,
  action,
}: {
  title: string
  text: string
  link: string
  action: string
}) {
  return (
    <div className="success-state">
      <span>
        <Check size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="form-submit" to={link}>
        {action}
        <ArrowRight size={18} />
      </Link>
    </div>
  )
}

export function UserRegistration() {
  const [submitted, setSubmitted] = useState(false)
  return (
    <AuthShell
      eyebrow="Cuenta personal"
      title="Crea tu cuenta"
      description="Regístrate para guardar y consultar todos tus envíos desde un solo lugar."
      icon={<CircleUserRound size={28} />}
      asideTitle="Tus paquetes, siempre a la vista."
      asideText="Recibe actualizaciones claras y consulta cada etapa de tus envíos sin complicaciones."
    >
      {submitted ? (
        <SuccessState
          title="¡Tu cuenta está lista!"
          text="Ya puedes comenzar a rastrear tus paquetes con SLS."
          link="/seguimiento"
          action="Ir a seguimiento"
        />
      ) : (
        <form
          className="portal-form"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
          }}
        >
          <div className="form-row">
            <div className="field">
              <label htmlFor="first-name">Nombre</label>
              <input id="first-name" placeholder="Tu nombre" required />
            </div>
            <div className="field">
              <label htmlFor="last-name">Apellido</label>
              <input id="last-name" placeholder="Tu apellido" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="user-email">Correo electrónico</label>
            <input id="user-email" type="email" placeholder="nombre@correo.com" required />
          </div>
          <div className="field">
            <label htmlFor="user-phone">Teléfono</label>
            <input id="user-phone" type="tel" placeholder="+34 600 000 000" required />
          </div>
          <PasswordField id="user-password" />
          <label className="check-field">
            <input type="checkbox" required />
            <span>Acepto los términos y la política de privacidad.</span>
          </label>
          <button className="form-submit" type="submit">
            Crear cuenta <ArrowRight size={18} />
          </button>
          <p className="form-switch">
            ¿Representas a una empresa? <Link to="/registro/empresa">Crear cuenta empresarial</Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}

export function CompanyLogin() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  return (
    <AuthShell
      eyebrow="SLS Business"
      title="Acceso de empresa"
      description="Ingresa al centro de control de tu operación logística."
      icon={<Building2 size={28} />}
      asideTitle="Todo tu movimiento, en un solo lugar."
      asideText="Controla recursos, paquetes y entregas desde una vista clara, rápida y segura."
    >
      <form
        className="portal-form company-login-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (
            email.toLowerCase().trim() !== COMPANY_ACCOUNT.email ||
            password !== COMPANY_ACCOUNT.password
          ) {
            setError("El correo o la contraseña no coinciden con la cuenta demo.")
            return
          }
          navigate("/empresa")
        }}
      >
        <div className="field">
          <label htmlFor="company-email">Correo corporativo</label>
          <input
            id="company-email"
            type="email"
            placeholder="operaciones@empresa.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="company-password">Contraseña</label>
          <div className="input-with-action">
            <input
              id="company-password"
              type={visible ? "text" : "password"}
              placeholder="Tu contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="field-action"
              type="button"
              onClick={() => setVisible(!visible)}
              aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="login-options">
          <label className="check-field">
            <input type="checkbox" />
            <span>Recordar sesión</span>
          </label>
          <button type="button">¿Olvidaste tu contraseña?</button>
        </div>
        {error && <div className="form-error"><AlertCircle size={17} /> {error}</div>}
        <button className="form-submit" type="submit">
          Entrar al panel <ArrowRight size={18} />
        </button>
        <button
          className="demo-access"
          type="button"
          onClick={() => {
            setEmail(COMPANY_ACCOUNT.email)
            setPassword(COMPANY_ACCOUNT.password)
            setError("")
          }}
        >
          Usar acceso demo: <strong>{COMPANY_ACCOUNT.email}</strong>
        </button>
        <p className="form-switch">
          ¿Tu empresa aún no usa SLS? <Link to="/registro/empresa">Registrar empresa</Link>
        </p>
      </form>
    </AuthShell>
  )
}

export function CompanyRegistration() {
  const [submitted, setSubmitted] = useState(false)

  return (
    <AuthShell
      eyebrow="Nueva cuenta"
      title="Registra tu empresa"
      description="Crea el espacio de trabajo desde el que organizarás toda tu operación."
      icon={<Building2 size={28} />}
      asideTitle="Tu operación empieza aquí."
      asideText="Configura la empresa, registra al equipo y comienza a controlar cada envío."
    >
      {submitted ? (
        <SuccessState
          title="Empresa registrada"
          text="Tu espacio de trabajo está listo para comenzar a configurar la operación."
          link="/empresa"
          action="Abrir panel empresarial"
        />
      ) : (
        <form className="portal-form" onSubmit={(event) => submitForm(event, setSubmitted)}>
          <div className="field">
            <label htmlFor="company-name">Nombre de la empresa</label>
            <input id="company-name" placeholder="Nombre comercial" required />
          </div>
          <div className="form-row">
            <Field id="company-tax-id" label="Identificación fiscal" placeholder="RNC / NIF / CIF" />
            <div className="field">
              <label htmlFor="company-sector">Sector</label>
              <select id="company-sector" defaultValue="" required>
                <option value="" disabled>Seleccionar</option>
                <option>Comercio electrónico</option>
                <option>Distribución</option>
                <option>Retail</option>
                <option>Servicios</option>
              </select>
            </div>
          </div>
          <Field id="company-admin-name" label="Nombre del administrador" placeholder="Nombre completo" />
          <Field id="company-register-email" label="Correo corporativo" placeholder="admin@empresa.com" type="email" />
          <PasswordField id="company-register-password" />
          <label className="check-field">
            <input type="checkbox" required />
            <span>Acepto los términos del servicio y la política de privacidad.</span>
          </label>
          <button className="form-submit" type="submit">
            Crear espacio empresarial <ArrowRight size={18} />
          </button>
          <p className="form-switch">
            ¿Ya tienes una cuenta? <Link to="/login/empresa">Iniciar sesión</Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}

export function TrackingPage() {
  const [tracking, setTracking] = useState("")
  const navigate = useNavigate()
  return (
    <main className="tracking-page">
      <header className="portal-topbar">
        <Brand />
        <nav aria-label="Acciones de usuario">
          <Link className="portal-login" to="/login/empresa">
            Acceso empresas <Building2 size={17} />
          </Link>
        </nav>
      </header>
      <section className="tracking-hero">
        <div className="tracking-heading">
          <h1>Rastrea tu paquete</h1>
        </div>
        <form
          className="tracking-search"
          onSubmit={(event) => {
            event.preventDefault()
            navigate(`/track?code=${encodeURIComponent(tracking)}`)
          }}
        >
          <Search size={21} aria-hidden="true" />
          <input
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            aria-label="Número de seguimiento"
            placeholder="Ej. SLS-2048-ES"
            required
          />
          <button type="submit">
            Rastrear <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  )
}

const companyNavigation = [
  { to: "/empresa", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/empresa/recursos", label: "Recursos", icon: Truck },
  { to: "/empresa/paquetes", label: "Paquetes", icon: Boxes },
  { to: "/empresa/paquetes/nuevo", label: "Registrar paquete", icon: PackagePlus },
  { to: "/empresa/trabajadores", label: "Trabajadores", icon: Users },
]

export function CompanyLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
        <Link className="sidebar-logout" to="/login/empresa">
          <LogOut size={18} /> <span>Cerrar sesión</span>
        </Link>
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
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  )
}

export function CompanyDashboard() {
  const inWarehouse = PACKAGES.filter((pkg) =>
    ["REGISTERED", "CLASSIFIED", "PENDING_ASSIGNMENT"].includes(pkg.status),
  ).length
  const inTransit = PACKAGES.filter((pkg) => pkg.status === "IN_TRANSIT").length
  const scheduled = PACKAGES.filter((pkg) => pkg.status === "ASSIGNED").length + 9

  return (
    <main className="company-content">
      <div className="company-page-heading">
        <div>
          <p className="eyebrow">Centro de control</p>
          <h1>Operación de hoy</h1>
          <p>Una lectura rápida de tus paquetes y próximos movimientos.</p>
        </div>
        <Link className="form-submit company-primary-action" to="/empresa/paquetes/nuevo">
          <PackagePlus size={18} /> Nuevo paquete
        </Link>
      </div>
      <div className="dashboard-metrics dashboard-metrics--three">
        <Metric icon={<Warehouse size={21} />} tone="soft" label="En bodega" value={String(inWarehouse)} note="Listos para procesar" />
        <Metric icon={<Truck size={21} />} tone="blue" label="En camino" value={String(inTransit)} note="En reparto ahora" />
        <Metric icon={<PackageCheck size={21} />} tone="green" label="Entrega programada" value={String(scheduled)} note="Próximas 24 horas" />
      </div>
      <div className="dashboard-grid">
        <article className="dashboard-panel chart-panel">
          <PanelHeading kicker="Ritmo semanal" title="Paquetes procesados" icon={<BarChart3 size={21} />} />
          <div className="chart">
            {[42, 65, 52, 76, 68, 88, 72].map((height, index) => (
              <div className="chart-column" key={index}>
                <span style={{ height: `${height}%` }} />
                <small>{["L", "M", "X", "J", "V", "S", "D"][index]}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="dashboard-panel distribution-panel">
          <PanelHeading kicker="Nivel de servicio" title="Entregas a tiempo" />
          <div className="donut-wrap">
            <div className="donut">
              <span>
                <strong>94%</strong> a tiempo
              </span>
            </div>
            <div className="donut-legend">
              <span>
                <i className="legend-dot legend-dot--green" /> A tiempo <strong>94%</strong>
              </span>
              <span>
                <i className="legend-dot legend-dot--blue" /> Con demora <strong>4%</strong>
              </span>
              <span>
                <i className="legend-dot legend-dot--pale" /> Incidencias <strong>2%</strong>
              </span>
            </div>
          </div>
        </article>
      </div>
      <article className="dashboard-panel recent-panel">
        <div className="panel-heading">
          <div>
            <span>Actualizado hace 2 minutos</span>
            <h2>Envíos recientes</h2>
          </div>
          <Link to="/empresa/paquetes/nuevo">
            Registrar nuevo <ArrowRight size={16} />
          </Link>
        </div>
        <div className="company-table">
          <div className="company-table__head">
            <span>Referencia</span>
            <span>Destino</span>
            <span>Estado</span>
            <span>Acción</span>
          </div>
          {PACKAGES.slice(0, 4).map((pkg) => (
            <div className="company-table__row" key={pkg.id}>
              <strong>{pkg.trackingCode}</strong>
              <span>
                <MapPin size={14} /> {pkg.sector}
              </span>
              <span>
                <i className={`status ${STATUS_COLOR[pkg.status]}`}>{STATUS_LABELS[pkg.status]}</i>
              </span>
              <Link to={`/empresa/paquetes/${pkg.id}`} aria-label={`Ver ${pkg.trackingCode}`}>
                <ChevronRight size={18} />
              </Link>
            </div>
          ))}
        </div>
      </article>
    </main>
  )
}

const resourceVisuals = {
  truck: { icon: Truck, tone: "navy" },
  car: { icon: Car, tone: "blue" },
  motorcycle: { icon: Route, tone: "green" },
  bike: { icon: Bike, tone: "soft" },
}

export function CompanyResources() {
  const [resourceItems] = useState<FleetResource[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("sls-company-resources") ?? "[]") as FleetResource[]
      return [...FLEET_RESOURCES, ...stored]
    } catch {
      return FLEET_RESOURCES
    }
  })

  return (
    <main className="company-content">
      <div className="company-page-heading">
        <div>
          <p className="eyebrow">Flota y movilidad</p>
          <h1>Recursos</h1>
          <p>Disponibilidad en tiempo real de los vehículos de la operación.</p>
        </div>
        <div className="heading-actions">
          <span className="live-resource"><i /> Actualizado ahora</span>
          <Link className="form-submit company-primary-action" to="/empresa/recursos/nuevo">
            <Plus size={18} /> Añadir recurso
          </Link>
        </div>
      </div>

      <div className="resource-grid">
        {resourceItems.map(({ id, kind, label, total, available, active, maintenance }) => {
          const { icon: Icon, tone } = resourceVisuals[kind]
          return (
          <article className="resource-card" key={id}>
            <div className="resource-card__top">
              <span className={`dashboard-metric-icon dashboard-metric-icon--${tone}`}>
                <Icon size={22} />
              </span>
              <span className="resource-availability">{available} disponibles</span>
            </div>
            <div>
              <small>{label}</small>
              <strong>{total}</strong>
            </div>
            <div className="resource-progress">
              <span style={{ width: `${(active / total) * 100}%` }} />
            </div>
            <footer>
              <span>{active} en ruta</span>
              <span>{maintenance > 0 ? `${maintenance} en taller` : "Sin incidencias"}</span>
            </footer>
          </article>
          )
        })}
      </div>

      <article className="dashboard-panel fleet-note">
        <div>
          <span className="dashboard-metric-icon dashboard-metric-icon--soft"><CheckCircle2 size={21} /></span>
          <div><strong>Flota operativa</strong><p>El 85% de los recursos está disponible o completando una ruta.</p></div>
        </div>
        <Link to="/empresa/paquetes">Ver paquetes <ArrowRight size={16} /></Link>
      </article>
    </main>
  )
}

export function CompanyResourceRegistration() {
  const [submitted, setSubmitted] = useState(false)

  const saveResource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const kind = String(data.get("resource-type")) as FleetResource["kind"]
    const status = String(data.get("resource-status"))
    const labels: Record<FleetResource["kind"], string> = {
      truck: "Camiones",
      car: "Carros",
      motorcycle: "Motos",
      bike: "Bicicletas",
    }
    const resource: FleetResource = {
      id: `fleet-${Date.now()}`,
      kind,
      label: labels[kind],
      total: 1,
      available: status === "available" ? 1 : 0,
      active: status === "active" ? 1 : 0,
      maintenance: status === "maintenance" ? 1 : 0,
    }
    const current = JSON.parse(localStorage.getItem("sls-company-resources") ?? "[]") as FleetResource[]
    localStorage.setItem("sls-company-resources", JSON.stringify([...current, resource]))
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main className="company-content company-content--form">
        <div className="company-form-card">
          <SuccessState
            title="Recurso añadido"
            text="El nuevo vehículo ya forma parte del inventario de la empresa."
            link="/empresa/recursos"
            action="Volver a recursos"
          />
        </div>
      </main>
    )
  }

  return (
    <main className="company-content company-content--form">
      <CompanyFormHeader
        eyebrow="Flota y movilidad"
        title="Añadir recurso"
        description="Registra un vehículo y define su disponibilidad inicial."
      />
      <form className="company-form-card portal-form" onSubmit={saveResource}>
        <FormSection icon={<Truck size={20} />} title="Información del recurso" text="Datos para identificarlo dentro de la flota." />
        <div className="form-row">
          <div className="field">
            <label htmlFor="resource-type">Tipo de recurso</label>
            <select id="resource-type" name="resource-type" defaultValue="" required>
              <option value="" disabled>Seleccionar</option>
              <option value="truck">Camión</option>
              <option value="car">Carro</option>
              <option value="motorcycle">Moto</option>
              <option value="bike">Bicicleta</option>
            </select>
          </div>
          <Field id="resource-code" label="Código interno" placeholder="Ej. CAM-014" />
        </div>
        <div className="form-row">
          <Field id="resource-brand" label="Marca" placeholder="Ej. Ford" />
          <Field id="resource-model" label="Modelo" placeholder="Ej. Transit" />
        </div>
        <div className="form-row">
          <Field id="resource-plate" label="Matrícula o placa" placeholder="A123456" />
          <Field id="resource-capacity" label="Capacidad (kg)" placeholder="1200" type="number" />
        </div>
        <div className="field">
          <label htmlFor="resource-status">Estado inicial</label>
          <select id="resource-status" name="resource-status" defaultValue="available">
            <option value="available">Disponible</option>
            <option value="active">En ruta</option>
            <option value="maintenance">En mantenimiento</option>
          </select>
        </div>
        <FormActions label="Guardar recurso" icon={<Plus size={18} />} cancelTo="/empresa/recursos" />
      </form>
    </main>
  )
}

export function CompanyPackages() {
  const [query, setQuery] = useState("")
  const filtered = PACKAGES.filter((pkg) =>
    [pkg.trackingCode, pkg.recipient, pkg.sender].some((value) =>
      value.toLowerCase().includes(query.toLowerCase()),
    ),
  )

  return (
    <main className="company-content">
      <div className="company-page-heading">
        <div>
          <p className="eyebrow">Gestión de envíos</p>
          <h1>Paquetes</h1>
          <p>Consulta, registra y revisa la información de cada envío.</p>
        </div>
        <Link className="form-submit company-primary-action" to="/empresa/paquetes/nuevo">
          <PackagePlus size={18} /> Registrar paquete
        </Link>
      </div>

      <div className="package-toolbar">
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por guía, remitente o destinatario"
          aria-label="Buscar paquetes"
        />
        <span>{filtered.length} resultados</span>
      </div>

      <article className="dashboard-panel recent-panel">
        <div className="company-table company-package-table">
          <div className="company-table__head">
            <span>Guía</span><span>Destinatario</span><span>Destino</span><span>Estado</span><span />
          </div>
          {filtered.map((pkg) => (
            <div className="company-table__row" key={pkg.id}>
              <strong>{pkg.trackingCode}</strong>
              <span>{pkg.recipient}</span>
              <span><MapPin size={14} /> {pkg.sector}</span>
              <span><i className={`status ${STATUS_COLOR[pkg.status]}`}>{STATUS_LABELS[pkg.status]}</i></span>
              <Link to={`/empresa/paquetes/${pkg.id}`} aria-label={`Ver ${pkg.trackingCode}`}>
                <ChevronRight size={18} />
              </Link>
            </div>
          ))}
        </div>
      </article>
    </main>
  )
}

export function CompanyPackageDetail() {
  const { packageId } = useParams()
  const pkg = PACKAGES.find((item) => item.id === packageId)

  if (!pkg) {
    return (
      <main className="company-content">
        <div className="company-form-card"><p>Este paquete no está disponible.</p></div>
      </main>
    )
  }

  const details = [
    ["Remitente", pkg.sender],
    ["Destinatario", pkg.recipient],
    ["Teléfono", pkg.recipientPhone],
    ["Dirección", pkg.recipientAddress],
    ["Zona", `${pkg.zone} · ${pkg.sector}`],
    ["Servicio", pkg.shipmentType],
    ["Peso", `${pkg.weight} kg`],
    ["Entrega estimada", new Date(pkg.estimatedDelivery).toLocaleDateString("es-ES", { day: "2-digit", month: "long" })],
  ]

  return (
    <main className="company-content">
      <Link className="detail-back" to="/empresa/paquetes"><ArrowLeft size={16} /> Volver a paquetes</Link>
      <div className="company-page-heading package-detail-heading">
        <div>
          <p className="eyebrow">Detalle del envío</p>
          <h1>{pkg.trackingCode}</h1>
          <p>Registrado por {pkg.sender}</p>
        </div>
        <span className={`status ${STATUS_COLOR[pkg.status]}`}>{STATUS_LABELS[pkg.status]}</span>
      </div>
      <div className="package-detail-grid">
        <article className="dashboard-panel">
          <PanelHeading kicker="Información" title="Datos del paquete" icon={<Boxes size={21} />} />
          <dl className="package-details">
            {details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </article>
        <article className="dashboard-panel">
          <PanelHeading kicker="Trazabilidad" title="Últimos movimientos" icon={<Route size={21} />} />
          <div className="package-history">
            {[...pkg.history].reverse().map((entry) => (
              <div key={`${entry.status}-${entry.at}`}>
                <i />
                <span><strong>{STATUS_LABELS[entry.status]}</strong><small>{entry.by} · {new Date(entry.at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
              </div>
            ))}
          </div>
        </article>
      </div>
    </main>
  )
}

function Metric({
  icon,
  tone,
  label,
  value,
  note,
  trend,
}: {
  icon: ReactNode
  tone: string
  label: string
  value: string
  note: string
  trend?: boolean
}) {
  return (
    <article>
      <span className={`dashboard-metric-icon dashboard-metric-icon--${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>
          {trend && <TrendingUp size={13} />} {note}
        </em>
      </div>
    </article>
  )
}

function PanelHeading({ kicker, title, icon }: { kicker: string; title: string; icon?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>
        <span>{kicker}</span>
        <h2>{title}</h2>
      </div>
      {icon}
    </div>
  )
}

function CompanyFormHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <div className="company-page-heading company-page-heading--form">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  )
}

export function CompanyPackageRegistration() {
  const [submitted, setSubmitted] = useState(false)
  const [importMessage, setImportMessage] = useState("")
  const importRef = useRef<HTMLInputElement>(null)
  const qrRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    reference: "",
    weight: "",
    content: "",
    recipient: "",
    phone: "",
    address: "",
    postalCode: "",
    city: "",
    service: "standard",
  })

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const applyParsedQrToCompanyForm = (rawText: string, sourceLabel: string) => {
    const parsed = parsePackageQrPayload(rawText)
    setForm((current) => ({
      ...current,
      reference: parsed.trackingCode || current.reference,
      weight: String(parsed.weightKg),
      content: parsed.notes || `${parsed.shipmentType} · ${parsed.zone}`,
      recipient: parsed.recipient || current.recipient,
      phone: parsed.recipientPhone || current.phone,
      address: parsed.recipientAddress || current.address,
      postalCode: parsed.municipalityCode || current.postalCode || "08001",
      city: "Barranquilla",
      service: parsed.shipmentType.toLowerCase() === "express" ? "express" : "standard",
    }))
    setImportMessage(
      parsed.isStructuredJson
        ? `${sourceLabel}: Guía ${parsed.trackingCode} (${parsed.recipient}) cargada automáticamente.`
        : `${sourceLabel}: Código ${parsed.trackingCode} leído correctamente.`,
    )
  }

  const handleDocumentImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.type === "application/json" || file.name.endsWith(".json")) {
      try {
        const rawText = await file.text()
        applyParsedQrToCompanyForm(rawText, `Archivo JSON (${file.name})`)
      } catch {
        setImportMessage("El archivo JSON no tiene un formato válido.")
      }
      return
    }

    if (file.type.startsWith("image/")) {
      try {
        const rawText = await decodeQrFromImageFile(file)
        applyParsedQrToCompanyForm(rawText, `Imagen QR (${file.name})`)
        return
      } catch {
        // continúa al fallback documental si la imagen no era un QR
      }
    }

    const randomJson = generateRandomDemoQrJson()
    applyParsedQrToCompanyForm(randomJson, `${file.name} procesado`)
  }

  const handleQrImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    try {
      const rawText = await decodeQrFromImageFile(file)
      applyParsedQrToCompanyForm(rawText, `Código QR (${file.name})`)
    } catch (err) {
      setImportMessage(
        err instanceof Error
          ? err.message
          : "No se encontró un código QR legible en la imagen seleccionada.",
      )
    }
  }

  const downloadTemplate = () => {
    const template = JSON.stringify(JSON.parse(generateRandomDemoQrJson()), null, 2)
    const url = URL.createObjectURL(new Blob([template], { type: "application/json" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "plantilla-paquete-sls.json"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (submitted) {
    return (
      <main className="company-content company-content--form">
        <div className="company-form-card">
          <SuccessState
            title="Paquete registrado"
            text="El código de seguimiento SLS-2842 ya está disponible."
            link="/empresa"
            action="Volver al dashboard"
          />
        </div>
      </main>
    )
  }
  return (
    <main className="company-content company-content--form">
      <CompanyFormHeader
        eyebrow="Gestión de envíos"
        title="Registrar paquete"
        description="Añade la información del envío para generar su seguimiento."
      />
      <form className="company-form-card portal-form" onSubmit={(event) => submitForm(event, setSubmitted)}>
        <section className="smart-capture">
          <div className="smart-capture__heading">
            <span><QrCode size={21} /></span>
            <div>
              <strong>Carga inteligente</strong>
              <p>Escanea un QR o importa un documento para completar el formulario.</p>
            </div>
          </div>
          <div className="smart-capture__actions">
            <button type="button" onClick={() => qrRef.current?.click()}>
              <QrCode size={18} /> Leer QR
            </button>
            <button type="button" onClick={() => importRef.current?.click()}>
              <Upload size={18} /> Importar archivo
            </button>
            <button type="button" onClick={downloadTemplate}>
              <FileJson size={18} /> Plantilla JSON
            </button>
          </div>
          <div className="accepted-files">
            <span><Image size={15} /> Imagen</span>
            <span><FileJson size={15} /> JSON</span>
            <span><FileText size={15} /> PDF</span>
          </div>
          <input ref={qrRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleQrImport} />
          <input ref={importRef} className="visually-hidden" type="file" accept="image/*,.json,application/json,.pdf,application/pdf" onChange={handleDocumentImport} />
          {importMessage && <div className="import-message"><CheckCircle2 size={17} /> {importMessage}</div>}
        </section>
        <FormSection icon={<Boxes size={20} />} title="Datos del paquete" text="Información para identificar el envío." />
        <div className="form-row">
          <Field id="package-reference" label="Referencia interna" placeholder="Ej. PED-2026-0042" value={form.reference} onChange={(value) => updateField("reference", value)} />
          <Field id="package-weight" label="Peso aproximado (kg)" placeholder="0,0" type="number" value={form.weight} onChange={(value) => updateField("weight", value)} />
        </div>
        <Field id="package-content" label="Contenido" placeholder="Descripción breve del contenido" value={form.content} onChange={(value) => updateField("content", value)} />
        <FormSection icon={<MapPin size={20} />} title="Datos de entrega" text="Destino y persona que lo recibirá." spaced />
        <div className="form-row">
          <Field id="recipient-name" label="Destinatario" placeholder="Nombre completo" value={form.recipient} onChange={(value) => updateField("recipient", value)} />
          <Field id="recipient-phone" label="Teléfono" placeholder="+34 600 000 000" type="tel" value={form.phone} onChange={(value) => updateField("phone", value)} />
        </div>
        <Field id="recipient-address" label="Dirección de entrega" placeholder="Calle, número, piso y puerta" value={form.address} onChange={(value) => updateField("address", value)} />
        <div className="form-row form-row--three">
          <Field id="postal-code" label="Código postal" placeholder="28001" value={form.postalCode} onChange={(value) => updateField("postalCode", value)} />
          <Field id="city" label="Ciudad" placeholder="Madrid" value={form.city} onChange={(value) => updateField("city", value)} />
          <div className="field">
            <label htmlFor="service">Servicio</label>
            <select id="service" value={form.service} onChange={(event) => updateField("service", event.target.value)}>
              <option value="standard">Estándar</option>
              <option value="express">Express</option>
            </select>
          </div>
        </div>
        <FormActions label="Registrar paquete" icon={<ArrowRight size={18} />} />
      </form>
    </main>
  )
}

export function CompanyWorkers() {
  return (
    <main className="company-content">
      <div className="company-page-heading">
        <div>
          <p className="eyebrow">Equipo empresarial</p>
          <h1>Trabajadores</h1>
          <p>Administra las personas que tienen acceso a la operación.</p>
        </div>
        <Link className="form-submit company-primary-action" to="/empresa/trabajadores/nuevo">
          <UserPlus size={18} /> Registrar trabajador
        </Link>
      </div>
      <div className="dashboard-metrics dashboard-metrics--three">
        <Metric icon={<Users size={21} />} tone="blue" label="Total del equipo" value={String(WORKERS.length)} note="Usuarios registrados" />
        <Metric icon={<CheckCircle2 size={21} />} tone="green" label="Activos" value={String(WORKERS.filter((worker) => worker.status === "Activo").length)} note="Con acceso habilitado" />
        <Metric icon={<Clock3 size={21} />} tone="soft" label="Invitaciones" value={String(WORKERS.filter((worker) => worker.status === "Invitado").length)} note="Pendientes de aceptar" />
      </div>
      <article className="dashboard-panel recent-panel">
        <div className="company-table worker-table">
          <div className="company-table__head">
            <span>Trabajador</span><span>Área</span><span>Rol</span><span>Estado</span>
          </div>
          {WORKERS.map((worker) => (
            <div className="company-table__row" key={worker.id}>
              <strong className="worker-identity">
                <i>{worker.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</i>
                <span>{worker.name}<small>{worker.email}</small></span>
              </strong>
              <span>{worker.area}</span>
              <span>{worker.role}</span>
              <span><i className={`status ${worker.status === "Activo" ? "status--success" : "status--pending"}`}>{worker.status}</i></span>
            </div>
          ))}
        </div>
      </article>
    </main>
  )
}

export function WorkerRegistration() {
  const [submitted, setSubmitted] = useState(false)
  if (submitted) {
    return (
      <main className="company-content company-content--form">
        <div className="company-form-card">
          <SuccessState
            title="Invitación enviada"
            text="El trabajador recibirá un correo para completar su acceso."
            link="/empresa/trabajadores"
            action="Volver a trabajadores"
          />
        </div>
      </main>
    )
  }
  return (
    <main className="company-content company-content--form">
      <CompanyFormHeader
        eyebrow="Equipo empresarial"
        title="Registrar trabajador"
        description="Invita a una persona y define su nivel de acceso al panel."
      />
      <form className="company-form-card portal-form" onSubmit={(event) => submitForm(event, setSubmitted)}>
        <FormSection
          icon={<UserPlus size={20} />}
          title="Información del trabajador"
          text="Usaremos estos datos para crear su perfil."
        />
        <div className="form-row">
          <Field id="worker-name" label="Nombre" placeholder="Nombre" />
          <Field id="worker-lastname" label="Apellido" placeholder="Apellido" />
        </div>
        <Field id="worker-email" label="Correo corporativo" placeholder="nombre@empresa.com" type="email" />
        <div className="form-row">
          <div className="field">
            <label htmlFor="worker-role">Rol</label>
            <select id="worker-role" defaultValue="" required>
              <option value="" disabled>
                Seleccionar rol
              </option>
              <option>Administrador</option>
              <option>Gestor de envíos</option>
              <option>Operador</option>
              <option>Solo lectura</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="worker-area">Área</label>
            <select id="worker-area" defaultValue="" required>
              <option value="" disabled>
                Seleccionar área
              </option>
              <option>Operaciones</option>
              <option>Logística</option>
              <option>Atención al cliente</option>
            </select>
          </div>
        </div>
        <div className="permission-box">
          <ShieldCheck size={20} />
          <div>
            <strong>Acceso seguro</strong>
            <p>El trabajador definirá su contraseña al aceptar la invitación.</p>
          </div>
        </div>
        <FormActions label="Enviar invitación" icon={<UserPlus size={18} />} />
      </form>
    </main>
  )
}

function submitForm(event: FormEvent<HTMLFormElement>, setter: (value: boolean) => void) {
  event.preventDefault()
  setter(true)
}

function Field({
  id,
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  type?: string
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        required
      />
    </div>
  )
}

function FormSection({
  icon,
  title,
  text,
  spaced,
}: {
  icon: ReactNode
  title: string
  text: string
  spaced?: boolean
}) {
  return (
    <div className={spaced ? "form-section-heading form-section-heading--spaced" : "form-section-heading"}>
      <span>{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  )
}

function FormActions({
  label,
  icon,
  cancelTo = "/empresa",
}: {
  label: string
  icon: ReactNode
  cancelTo?: string
}) {
  return (
    <div className="company-form-actions">
      <Link to={cancelTo}>Cancelar</Link>
      <button className="form-submit" type="submit">
        {label} {icon}
      </button>
    </div>
  )
}

export function NotFound() {
  return (
    <main className="not-found">
      <Brand />
      <span>404</span>
      <h1>Esta ruta no existe</h1>
      <p>Vuelve al inicio para continuar navegando por SLS.</p>
      <Link className="form-submit" to="/">
        Ir al inicio <ArrowRight size={18} />
      </Link>
    </main>
  )
}
