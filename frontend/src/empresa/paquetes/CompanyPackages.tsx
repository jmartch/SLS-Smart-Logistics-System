import { ChevronRight, MapPin, PackagePlus, Search } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"
import { PACKAGES, STATUS_COLOR, STATUS_LABELS } from "../../mockData"

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
