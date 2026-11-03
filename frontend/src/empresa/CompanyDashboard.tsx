import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  MapPin,
  PackageCheck,
  PackagePlus,
  Truck,
  Warehouse,
} from "lucide-react"
import { Link } from "react-router"
import { PACKAGES, STATUS_COLOR, STATUS_LABELS } from "../mockData"
import { Metric, PanelHeading } from "../shared/ui/PortalShell"

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
