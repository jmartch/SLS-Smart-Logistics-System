import { ArrowRight, Bike, Car, CheckCircle2, Plus, Route, Truck } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { FLEET_RESOURCES, type FleetResource } from "../../mockData"

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
