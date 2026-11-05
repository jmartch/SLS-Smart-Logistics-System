import { ArrowLeft, Boxes, Route } from "lucide-react"
import { Link, useParams } from "react-router"
import { PACKAGES, STATUS_COLOR, STATUS_LABELS } from "../../../mockData"
import { PanelHeading } from "../../../shared/ui/PortalShell"

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
