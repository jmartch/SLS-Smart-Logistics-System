import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  Menu,
  PackageCheck,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
  Truck,
  X,
  Zap,
} from "lucide-react"
import { useState } from "react"

const benefits = [
  {
    icon: Route,
    title: "Rutas más inteligentes",
    description:
      "Optimiza cada recorrido con información clara y decisiones en tiempo real.",
  },
  {
    icon: Radio,
    title: "Visibilidad de punta a punta",
    description:
      "Sigue cada movimiento desde un único panel, sin hojas de cálculo ni llamadas.",
  },
  {
    icon: ShieldCheck,
    title: "Entregas bajo control",
    description:
      "Anticípate a incidencias y mantén a tu equipo y clientes siempre informados.",
  },
]

const shipments = [
  {
    code: "NX-2048",
    destination: "Madrid",
    status: "En ruta",
    tone: "active",
  },
  {
    code: "NX-2047",
    destination: "Valencia",
    status: "Entregado",
    tone: "success",
  },
  {
    code: "NX-2046",
    destination: "Bilbao",
    status: "Preparando",
    tone: "pending",
  },
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollToDemo = () => {
    document
      .querySelector("#operaciones")
      ?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="home-screen">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="SLS, inicio">
          <span className="brand-mark" aria-hidden="true">
            <Route size={22} strokeWidth={2.4} />
          </span>
          <span className="brand-name">SLS</span>
        </a>

        <nav
          className={menuOpen ? "nav-links nav-links--open" : "nav-links"}
          aria-label="Navegación principal"
        >
          <a href="#soluciones" onClick={() => setMenuOpen(false)}>
            Soluciones
          </a>
          <a href="#operaciones" onClick={() => setMenuOpen(false)}>
            Plataforma
          </a>
          <a href="#contacto" onClick={() => setMenuOpen(false)}>
            Contacto
          </a>
        </nav>

        <button className="nav-cta" type="button" onClick={scrollToDemo}>
          Solicitar demo
          <ArrowRight size={17} />
        </button>

        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      <main id="inicio">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Logística conectada en tiempo real
            </div>
            <h1 id="hero-title">
              Cada envío.
              <span> Siempre en movimiento.</span>
            </h1>
            <p className="home-copy">
              Convierte operaciones complejas en entregas simples. SLS conecta
              rutas, equipos y clientes en una plataforma diseñada para avanzar.
            </p>
            <div className="hero-actions">
              <button
                className="primary-action"
                type="button"
                onClick={scrollToDemo}
              >
                Descubrir SLS
                <ArrowRight size={19} />
              </button>
              <a className="secondary-action" href="#soluciones">
                Explorar soluciones
                <ChevronRight size={18} />
              </a>
            </div>
            <div className="trust-row" aria-label="Beneficios principales">
              <span>
                <CheckCircle2 size={17} />
                Sin instalaciones
              </span>
              <span>
                <CheckCircle2 size={17} />
                Datos en directo
              </span>
            </div>
          </div>

          <div
            className="dashboard-preview"
            aria-label="Vista previa del panel de operaciones"
          >
            <div className="preview-header">
              <div>
                <span className="preview-kicker">Centro de operaciones</span>
                <strong>Buenos días, Ana</strong>
              </div>
              <span className="live-pill">
                <span />
                En directo
              </span>
            </div>

            <div className="metric-grid">
              <article className="metric-card metric-card--primary">
                <div className="metric-icon">
                  <Truck size={21} />
                </div>
                <span>En ruta</span>
                <strong>128</strong>
                <small>
                  <Zap size={13} />
                  +12% esta semana
                </small>
              </article>
              <article className="metric-card">
                <div className="metric-icon metric-icon--soft">
                  <PackageCheck size={21} />
                </div>
                <span>Entregados</span>
                <strong>842</strong>
                <small>98,6% a tiempo</small>
              </article>
            </div>

            <div className="route-card">
              <div className="route-card__header">
                <div>
                  <span>Próxima entrega</span>
                  <strong>Ruta NX-2048</strong>
                </div>
                <span className="time-chip">
                  <Clock3 size={14} />
                  14 min
                </span>
              </div>
              <div className="route-line" aria-hidden="true">
                <span className="route-point route-point--start">
                  <Truck size={15} />
                </span>
                <span className="route-track">
                  <span />
                </span>
                <span className="route-point route-point--end">
                  <MapPin size={15} />
                </span>
              </div>
              <div className="route-labels">
                <span>Centro logístico</span>
                <span>Gran Vía, 42</span>
              </div>
            </div>

            <div className="floating-update">
              <span className="floating-update__icon">
                <CheckCircle2 size={18} />
              </span>
              <span>
                <strong>Entrega confirmada</strong>
                NX-2047 · hace 2 min
              </span>
            </div>
          </div>
        </section>

        <section
          className="benefits-section"
          id="soluciones"
          aria-labelledby="benefits-title"
        >
          <div className="section-heading">
            <span className="section-icon" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <p className="eyebrow">Todo conectado</p>
            <h2 id="benefits-title">Más control. Menos fricción.</h2>
            <p>
              Las herramientas que tu operación necesita, en una experiencia
              clara para todo el equipo.
            </p>
          </div>
          <div className="benefit-grid">
            {benefits.map(({ icon: Icon, title, description }, index) => (
              <article className="benefit-card" key={title}>
                <span className="benefit-number">0{index + 1}</span>
                <span className="benefit-icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2} />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="operations-section"
          id="operaciones"
          aria-labelledby="operations-title"
        >
          <div className="operations-copy">
            <span className="section-icon" aria-hidden="true">
              <Boxes size={19} />
            </span>
            <p className="eyebrow">Una vista para decidir</p>
            <h2 id="operations-title">Tu operación, sin puntos ciegos.</h2>
            <p>
              Prioriza lo importante con estados claros, alertas útiles y toda
              la información de cada envío en un solo lugar.
            </p>
            <ul>
              <li>
                <CheckCircle2 size={18} />
                Seguimiento unificado y automático
              </li>
              <li>
                <CheckCircle2 size={18} />
                Incidencias visibles antes de convertirse en retrasos
              </li>
              <li>
                <CheckCircle2 size={18} />
                Comunicación simple para todo el equipo
              </li>
            </ul>
          </div>

          <div className="shipments-card">
            <div className="shipments-header">
              <div>
                <span>Actividad reciente</span>
                <h3>Envíos activos</h3>
              </div>
              <span className="counter">1.248 este mes</span>
            </div>
            <div className="shipment-list">
              {shipments.map((shipment) => (
                <div className="shipment-row" key={shipment.code}>
                  <span className="shipment-icon" aria-hidden="true">
                    <Boxes size={18} />
                  </span>
                  <span className="shipment-main">
                    <strong>{shipment.code}</strong>
                    <small>
                      <MapPin size={12} />
                      {shipment.destination}
                    </small>
                  </span>
                  <span className={`status status--${shipment.tone}`}>
                    {shipment.status}
                  </span>
                  <ChevronRight
                    className="shipment-arrow"
                    size={18}
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer" id="contacto">
        <a
          className="brand brand--footer"
          href="#inicio"
          aria-label="Volver al inicio"
        >
          <span className="brand-mark" aria-hidden="true">
            <Route size={19} />
          </span>
          <span className="brand-name">SLS</span>
        </a>
        <p>La forma clara de mover tu negocio.</p>
        <span>© 2025 SLS</span>
      </footer>
    </div>
  )
}
